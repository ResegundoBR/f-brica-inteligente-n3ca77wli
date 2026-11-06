import { useState, useEffect, useMemo } from 'react'
import {
  Bell,
  Play,
  Settings,
  History,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  RefreshCw,
  Sparkles,
  Sliders,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  pcpAlertsService,
  PcpAlertItem,
  PcpAlertConfig,
  PcpAlertRun,
  AlertCategory,
  AlertSeverity,
} from '@/services/pcp-alerts'

export default function PcpAlertsPage() {
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'ativos' | 'configuracoes' | 'historico'>('ativos')
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  // Dados principais
  const [configs, setConfigs] = useState<PcpAlertConfig[]>([])
  const [activeAlerts, setActiveAlerts] = useState<PcpAlertItem[]>([])
  const [runsHistory, setRunsHistory] = useState<PcpAlertRun[]>([])
  const [lastSummary, setLastSummary] = useState<string>('')
  const [agentSummary, setAgentSummary] = useState<string>('')
  const [lastFinished, setLastFinished] = useState<string>('')

  // Filtros da aba de alertas ativos
  const [selectedCategory, setSelectedCategory] = useState<string>('todas')
  const [selectedSeverity, setSelectedSeverity] = useState<string>('todas')
  const [searchQuery, setSearchQuery] = useState('')

  // Modal de edição de parâmetros de uma verificação
  const [editingConfig, setEditingConfig] = useState<PcpAlertConfig | null>(null)
  const [editingParams, setEditingParams] = useState<Record<string, unknown>>({})
  const [savingConfig, setSavingConfig] = useState(false)

  // Carregar dados iniciais
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [fetchedConfigs, fetchedRuns] = await Promise.all([
        pcpAlertsService.getConfigs(),
        pcpAlertsService.getRunsHistory(15),
      ])
      setConfigs(fetchedConfigs)
      setRunsHistory(fetchedRuns)

      if (fetchedRuns.length > 0) {
        const latest = fetchedRuns[0]
        setLastSummary(latest.summary || '')
        setLastFinished(latest.finished || latest.created || '')
        if (latest.results) {
          setActiveAlerts(latest.results.alerts || [])
          setAgentSummary(latest.results.agent_summary || '')
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados da Central de Alertas:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar as configurações e o histórico de alertas.',
        variant: 'destructive',
      })
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Disparar "Analisar agora"
  const handleRunAnalysis = async () => {
    setAnalyzing(true)
    try {
      const res = await pcpAlertsService.runAnalysis()
      setActiveAlerts(res.alerts || [])
      setLastSummary(res.summary || '')
      setAgentSummary(res.agent_summary || '')
      setLastFinished(res.finished || '')

      toast({
        title: 'Análise concluída com sucesso',
        description: res.summary || `${res.alerts.length} alertas identificados.`,
      })

      // Atualizar lista de execuções no histórico
      const updatedRuns = await pcpAlertsService.getRunsHistory(15)
      setRunsHistory(updatedRuns)
    } catch (err) {
      console.error('Erro ao executar análise de alertas:', err)
      toast({
        title: 'Falha na análise',
        description: 'Ocorreu um erro ao executar as verificações.',
        variant: 'destructive',
      })
    } finally {
      setAnalyzing(false)
    }
  }

  // Ligar / Desligar uma verificação no catálogo
  const handleToggleConfig = async (config: PcpAlertConfig, newEnabled: boolean) => {
    try {
      const updated = await pcpAlertsService.updateConfig(config.id, {
        enabled: newEnabled,
      })
      setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      toast({
        title: newEnabled ? 'Verificação ativada' : 'Verificação desativada',
        description: `"${config.title}" foi ${newEnabled ? 'ativada' : 'desativada'}.`,
      })
    } catch (err) {
      console.error('Erro ao alternar verificação:', err)
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível atualizar o status da verificação.',
        variant: 'destructive',
      })
    }
  }

  // Abrir modal de edição de parâmetros
  const handleOpenEditConfig = (config: PcpAlertConfig) => {
    setEditingConfig(config)
    setEditingParams({ ...(config.params || {}) })
  }

  // Salvar parâmetros de uma verificação
  const handleSaveConfigParams = async () => {
    if (!editingConfig) return
    setSavingConfig(true)
    try {
      const updated = await pcpAlertsService.updateConfig(editingConfig.id, {
        params: editingParams,
      })
      setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      toast({
        title: 'Parâmetros atualizados',
        description: `Configurações de "${editingConfig.title}" foram salvas.`,
      })
      setEditingConfig(null)
    } catch (err) {
      console.error('Erro ao salvar parâmetros:', err)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar os parâmetros da verificação.',
        variant: 'destructive',
      })
    } finally {
      setSavingConfig(false)
    }
  }

  // Alertas filtrados na tela
  const filteredAlerts = useMemo(() => {
    return activeAlerts.filter((item) => {
      if (selectedCategory !== 'todas' && item.category !== selectedCategory) {
        return false
      }
      if (selectedSeverity !== 'todas' && item.severity !== selectedSeverity) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchRef = item.entity_ref.toLowerCase().includes(q)
        const matchAction = item.action_suggestion.toLowerCase().includes(q)
        if (!matchTitle && !matchRef && !matchAction) return false
      }
      return true
    })
  }, [activeAlerts, selectedCategory, selectedSeverity, searchQuery])

  // Agrupamento por Categoria para renderização ordenada
  const categoryOrder: AlertCategory[] = [
    'Atrasado',
    'Parado',
    'Problema de Material',
    'Inconsistência',
    'Padrões Suspeitos',
  ]

  const alertsByCategory = useMemo(() => {
    const map = new Map<AlertCategory, PcpAlertItem[]>()
    for (const cat of categoryOrder) {
      map.set(cat, [])
    }

    for (const item of filteredAlerts) {
      const cat = item.category as AlertCategory
      if (map.has(cat)) {
        map.get(cat)!.push(item)
      } else {
        map.set('Inconsistência', [...(map.get('Inconsistência') || []), item])
      }
    }
    return map
  }, [filteredAlerts])

  // Contagens para os cards de resumo
  const totalAlerts = activeAlerts.length
  const criticalCount = activeAlerts.filter((a) => a.severity === 'Crítica').length
  const highCount = activeAlerts.filter((a) => a.severity === 'Alta').length
  const newCount = activeAlerts.filter((a) => a.status === 'novo').length

  const getSeverityBadgeClass = (sev: AlertSeverity) => {
    switch (sev) {
      case 'Crítica':
        return 'bg-red-500/15 text-red-600 border-red-500/30'
      case 'Alta':
        return 'bg-orange-500/15 text-orange-600 border-orange-500/30'
      case 'Média':
        return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30'
      case 'Baixa':
        return 'bg-slate-500/15 text-slate-600 border-slate-500/30'
      default:
        return 'bg-slate-500/15 text-slate-600 border-slate-500/30'
    }
  }

  const getCategoryColor = (cat: AlertCategory) => {
    switch (cat) {
      case 'Atrasado':
        return 'border-l-red-500'
      case 'Parado':
        return 'border-l-amber-500'
      case 'Problema de Material':
        return 'border-l-orange-500'
      case 'Inconsistência':
        return 'border-l-blue-500'
      case 'Padrões Suspeitos':
        return 'border-l-purple-500'
      default:
        return 'border-l-slate-400'
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Cabeçalho da Central de Alertas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Bell className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Central de Alertas</h1>
              <p className="text-sm text-muted-foreground">
                Monitoramento contínuo e inteligente da fábrica com Agente Supervisor de Produção.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading || analyzing}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            size="sm"
            onClick={handleRunAnalysis}
            disabled={analyzing}
            className="gap-2 bg-primary text-primary-foreground shadow"
          >
            {analyzing ? (
              <>
                <RefreshCw className="size-4 animate-spin" />
                Analisando fábrica...
              </>
            ) : (
              <>
                <Play className="size-4 fill-current" />
                Analisar agora
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Cards de Métricas Rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Alertas Ativos
              </p>
              <p className="text-2xl font-bold mt-1">{totalAlerts}</p>
            </div>
            <div className="p-2 bg-blue-500/10 text-blue-600 rounded-md">
              <Bell className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Críticos / Urgentes
              </p>
              <p className="text-2xl font-bold mt-1 text-red-600">{criticalCount}</p>
            </div>
            <div className="p-2 bg-red-500/10 text-red-600 rounded-md">
              <AlertTriangle className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Alta Gravidade
              </p>
              <p className="text-2xl font-bold mt-1 text-orange-600">{highCount}</p>
            </div>
            <div className="p-2 bg-orange-500/10 text-orange-600 rounded-md">
              <Clock className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Novos nesta Rodada
              </p>
              <p className="text-2xl font-bold mt-1 text-purple-600">{newCount}</p>
            </div>
            <div className="p-2 bg-purple-500/10 text-purple-600 rounded-md">
              <Sparkles className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Banner da última execução e parecer do Agente */}
      {lastSummary && (
        <Card className="bg-muted/40 border-border/60">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
            <div className="flex items-start gap-2">
              <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground">Última análise: </span>
                <span className="text-muted-foreground">{lastSummary}</span>
                {lastFinished && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({new Date(lastFinished).toLocaleString('pt-BR')})
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0">
              <Clock className="size-3.5" />
              Rotina automática diária às 04:05 UTC (01:05 BRT)
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs Principais */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'ativos' | 'configuracoes' | 'historico')}
        className="space-y-4"
      >
        <TabsList className="grid w-full sm:w-auto grid-cols-3">
          <TabsTrigger value="ativos" className="gap-2">
            <Bell className="size-4" />
            Alertas Ativos
            {totalAlerts > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {totalAlerts}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="configuracoes" className="gap-2">
            <Settings className="size-4" />
            Configurações
            <Badge variant="outline" className="ml-1 px-1.5 py-0 text-xs">
              {configs.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="size-4" />
            Histórico de Análises
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: ALERTAS ATIVOS */}
        <TabsContent value="ativos" className="space-y-6">
          {/* Barra de Filtros */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-card p-3 rounded-lg border border-border/60">
            <div className="flex flex-wrap gap-2 items-center flex-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mr-1">
                <Filter className="size-3.5" />
                Filtros:
              </div>

              {/* Filtro por Categoria */}
              <select
                className="h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="todas">Todas as categorias</option>
                {categoryOrder.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {/* Filtro por Gravidade */}
              <select
                className="h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                value={selectedSeverity}
                onChange={(e) => setSelectedSeverity(e.target.value)}
              >
                <option value="todas">Todas as gravidades</option>
                <option value="Crítica">Crítica</option>
                <option value="Alta">Alta</option>
                <option value="Média">Média</option>
                <option value="Baixa">Baixa</option>
              </select>

              {(selectedCategory !== 'todas' || selectedSeverity !== 'todas' || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => {
                    setSelectedCategory('todas')
                    setSelectedSeverity('todas')
                    setSearchQuery('')
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>

            <div className="w-full sm:w-64">
              <Input
                placeholder="Buscar por OP, item ou ação..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Parecer do Agente "O que estamos deixando passar" se existir */}
          {agentSummary && (
            <Card className="border-purple-500/30 bg-purple-500/5 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-purple-600" />
                  <CardTitle className="text-sm font-semibold text-purple-900 dark:text-purple-300">
                    O que estamos deixando passar — Parecer do Supervisor de Produção (IA)
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {agentSummary}
              </CardContent>
            </Card>
          )}

          {/* Listagem agrupada por categoria */}
          {totalAlerts === 0 ? (
            <Card className="border border-border/60">
              <CardContent className="p-12 text-center space-y-3">
                <CheckCircle2 className="size-12 text-emerald-500 mx-auto" />
                <h3 className="text-lg font-semibold">Tudo sob controle no chão de fábrica</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Nenhum alerta ativo no momento com as verificações habilitadas. Itens resolvidos
                  saem automaticamente da lista para manter o foco no que ainda pede atenção.
                </p>
                <Button variant="outline" size="sm" onClick={handleRunAnalysis} className="mt-2">
                  Rodar nova análise agora
                </Button>
              </CardContent>
            </Card>
          ) : filteredAlerts.length === 0 ? (
            <Card className="border border-border/60">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Nenhum alerta corresponde aos filtros selecionados.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {categoryOrder.map((cat) => {
                const itemsInCat = alertsByCategory.get(cat) || []
                if (itemsInCat.length === 0) return null

                return (
                  <div key={cat} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold">{cat}</h2>
                        <Badge variant="secondary" className="text-xs">
                          {itemsInCat.length}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {itemsInCat.map((alert) => (
                        <Card
                          key={alert.id}
                          className={`border border-border/60 border-l-4 ${getCategoryColor(
                            cat,
                          )} shadow-sm hover:shadow transition-shadow`}
                        >
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-xs font-semibold px-2 py-0.5"
                                  >
                                    {alert.entity_ref}
                                  </Badge>

                                  <Badge
                                    variant="outline"
                                    className={`text-xs px-2 py-0.5 border ${getSeverityBadgeClass(
                                      alert.severity,
                                    )}`}
                                  >
                                    {alert.severity}
                                  </Badge>

                                  {alert.status === 'novo' && (
                                    <Badge className="bg-purple-600 text-white text-[10px] px-1.5 py-0 h-4">
                                      Novo
                                    </Badge>
                                  )}

                                  {alert.status === 'persistente' && (
                                    <Badge
                                      variant="secondary"
                                      className="text-muted-foreground text-[10px] px-1.5 py-0 h-4"
                                    >
                                      Persistente
                                    </Badge>
                                  )}
                                </div>

                                <p className="text-sm font-medium text-foreground pt-1">
                                  {alert.title}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="size-3.5 shrink-0" />
                              <span>{alert.time_info}</span>
                            </div>

                            <div className="bg-muted/50 p-2.5 rounded-md border border-border/40 text-xs space-y-1">
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                <ArrowRight className="size-3 text-primary" />
                                Sugestão de ação concreta:
                              </div>
                              <p className="text-muted-foreground leading-relaxed pl-4">
                                {alert.action_suggestion}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ABA 2: CONFIGURAÇÕES DO CATÁLOGO DE VERIFICAÇÕES */}
        <TabsContent value="configuracoes" className="space-y-4">
          <Card className="border border-border/60">
            <CardHeader className="p-4 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold">
                    Catálogo de Verificações Extensível
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Cada verificação é um registro independente no banco (pcp_alert_configs), com
                    liga/desliga e parâmetros próprios. Novas verificações entram por acréscimo sem
                    alterar código.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="divide-y divide-border/40">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{config.title}</span>
                        <Badge variant="outline" className="text-xs">
                          {config.category}
                        </Badge>
                        <code className="text-[11px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                          {config.check_key}
                        </code>
                      </div>
                      <p className="text-xs text-muted-foreground">{config.description}</p>

                      {/* Exibição dos Parâmetros vigentes */}
                      {config.params && Object.keys(config.params).length > 0 && (
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                          <Sliders className="size-3" />
                          <span>Parâmetros:</span>
                          <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded">
                            {Object.entries(config.params)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' | ')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {config.params && Object.keys(config.params).length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5"
                          onClick={() => handleOpenEditConfig(config)}
                        >
                          <Sliders className="size-3.5" />
                          Editar parâmetros
                        </Button>
                      )}

                      <div className="flex items-center gap-2 pl-2 border-l border-border/40">
                        <span className="text-xs text-muted-foreground">
                          {config.enabled ? 'Ativo' : 'Inativo'}
                        </span>
                        <Switch
                          checked={config.enabled}
                          onCheckedChange={(checked) => handleToggleConfig(config, checked)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 3: HISTÓRICO DE ANÁLISES */}
        <TabsContent value="historico" className="space-y-4">
          <Card className="border border-border/60">
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base font-semibold">Histórico de Execuções</CardTitle>
              <CardDescription className="text-xs">
                Registro de todas as análises manuais e rotinas agendadas (04:05 UTC) gravadas em
                pcp_alert_runs.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {runsHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhuma análise registrada ainda. Clique em &quot;Analisar agora&quot; para
                  iniciar.
                </p>
              ) : (
                <div className="divide-y divide-border/40">
                  {runsHistory.map((run) => {
                    const runAlerts = run.results?.alerts || []
                    const resolvedCount = run.results?.resolved_count || 0
                    const counts = run.results?.categorized_counts || {}

                    return (
                      <div key={run.id} className="py-4 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={run.trigger_type === 'cron_0405' ? 'secondary' : 'outline'}
                            >
                              {run.trigger_type === 'cron_0405' ? 'Cron Diário' : 'Manual'}
                            </Badge>
                            <span className="font-semibold text-foreground">
                              {new Date(run.started || run.created).toLocaleString('pt-BR')}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span>
                              {runAlerts.length} alerta{runAlerts.length !== 1 ? 's' : ''} ativo
                              {runAlerts.length !== 1 ? 's' : ''}
                            </span>
                            {resolvedCount > 0 && (
                              <span className="text-emerald-600 font-medium">
                                ({resolvedCount} resolvido{resolvedCount !== 1 ? 's' : ''})
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">{run.summary}</p>

                        {/* Badges de contagem por categoria */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {Object.entries(counts).map(([cat, qtd]) => {
                            if (!qtd) return null
                            return (
                              <span
                                key={cat}
                                className="text-[11px] bg-muted px-2 py-0.5 rounded text-muted-foreground"
                              >
                                {cat}: <strong className="text-foreground">{qtd}</strong>
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal para Edição de Parâmetros da Verificação */}
      <Dialog open={!!editingConfig} onOpenChange={(open) => !open && setEditingConfig(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Parâmetros da Verificação</DialogTitle>
            <DialogDescription>
              {editingConfig?.title} ({editingConfig?.check_key})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {editingConfig?.params &&
              Object.entries(editingConfig.params).map(([key, defaultVal]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key} className="text-xs font-semibold capitalize">
                    {key.replace(/_/g, ' ')}
                  </Label>
                  <Input
                    id={key}
                    type="number"
                    value={
                      editingParams[key] !== undefined
                        ? String(editingParams[key])
                        : String(defaultVal)
                    }
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setEditingParams((prev) => ({
                        ...prev,
                        [key]: isNaN(val) ? e.target.value : val,
                      }))
                    }}
                    className="h-9 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Ajuste o valor numérico para calibrar a sensibilidade deste alerta.
                  </p>
                </div>
              ))}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingConfig(null)}
              disabled={savingConfig}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveConfigParams} disabled={savingConfig}>
              {savingConfig ? 'Salvando...' : 'Salvar Parâmetros'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
