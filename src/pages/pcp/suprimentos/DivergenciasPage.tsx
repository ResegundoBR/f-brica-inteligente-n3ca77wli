import { useState, useEffect, useMemo } from 'react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import {
  fetchSuprimentosIntegrityCheck,
  triggerAutoCancelClosedOps,
  type DivergenceItem,
  type IntegrityCheckResult,
} from '@/services/suprimentos-integrity'
import { CloseResidualDialog } from './components/CloseResidualDialog'
import { UnificacaoCadastralPanel } from './components/UnificacaoCadastralPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Layers,
  FileSpreadsheet,
} from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function DivergenciasPage() {
  const [data, setData] = useState<IntegrityCheckResult | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [cleaning, setCleaning] = useState<boolean>(false)
  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [closeResidualOpen, setCloseResidualOpen] = useState<boolean>(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('todos')
  const [categoryFilter, setCategoryFilter] = useState<string>('todos')

  const handleCleanClosedOps = async () => {
    setCleaning(true)
    setCleanFeedback(null)
    try {
      const res = await triggerAutoCancelClosedOps()
      setCleanFeedback(res.message || 'Limpeza executada com sucesso.')
      await loadIntegrityData()
    } catch (err) {
      console.error('Erro ao executar limpeza de OPs encerradas:', err)
      setCleanFeedback('Erro ao executar cancelamento automático.')
    } finally {
      setCleaning(false)
    }
  }

  const loadIntegrityData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchSuprimentosIntegrityCheck()
      setData(res)
    } catch (err: unknown) {
      console.error('Erro ao buscar dados do verificador de integridade:', err)
      setError('Não foi possível carregar as divergências de integridade.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadIntegrityData()
  }, [])

  const filteredDivergences = useMemo(() => {
    if (!data?.divergences) return []
    return data.divergences.filter((item: DivergenceItem) => {
      const matchesSearch =
        !searchTerm ||
        item.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.problem?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.suggestion?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesSeverity = severityFilter === 'todos' || item.severity === severityFilter

      const matchesCategory = categoryFilter === 'todos' || item.category === categoryFilter

      return matchesSearch && matchesSeverity && matchesCategory
    })
  }, [data, searchTerm, severityFilter, categoryFilter])

  const categories = useMemo(() => {
    if (!data?.divergences) return []
    const set = new Set<string>()
    data.divergences.forEach((d) => {
      if (d.category) set.add(d.category)
    })
    return Array.from(set)
  }, [data])

  const getSeverityBadge = (severity: DivergenceItem['severity']) => {
    switch (severity) {
      case 'alta':
        return (
          <Badge className="bg-red-500/15 text-red-700 border-red-300 dark:text-red-400 dark:border-red-900 font-semibold gap-1">
            <AlertTriangle className="size-3" /> Alta
          </Badge>
        )
      case 'media':
        return (
          <Badge className="bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-900 font-semibold gap-1">
            <Clock className="size-3" /> Média
          </Badge>
        )
      case 'baixa':
        return (
          <Badge className="bg-blue-500/15 text-blue-700 border-blue-300 dark:text-blue-400 dark:border-blue-900 font-semibold gap-1">
            <Info className="size-3" /> Informativa
          </Badge>
        )
      default:
        return <Badge variant="outline">{severity}</Badge>
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
      <SuprimentosHeader
        title="Divergências de Integridade"
        description="Verificador permanente de coerência dos dados de suprimentos, ordens de compra e estoque."
        icon={ShieldAlert}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCloseResidualOpen(true)}
              className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/40 font-semibold"
              title="Encerrar saldos parciais e solicitações inativas"
            >
              <AlertTriangle className="size-3.5" />
              Encerrar Saldo Residual
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCleanClosedOps}
              disabled={cleaning || loading}
              className="gap-2 bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 shadow-xs"
            >
              <RefreshCw className={`size-3.5 ${cleaning ? 'animate-spin' : ''}`} />
              Limpar OPs Encerradas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadIntegrityData}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              Verificar Agora
            </Button>
          </div>
        }
      />

      {cleanFeedback && (
        <div className="p-3 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 text-xs flex items-center justify-between">
          <span>{cleanFeedback}</span>
          <button
            onClick={() => setCleanFeedback(null)}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ETAPA 4: PAINEL DE UNIFICAÇÃO CADASTRAL */}
      <UnificacaoCadastralPanel onDataChanged={loadIntegrityData} />

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="py-4">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total de Divergências
            </CardDescription>
            <CardTitle className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Layers className="size-6 text-blue-500" />
              {data?.total_divergences ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="py-4">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Alta Gravidade
            </CardDescription>
            <CardTitle className="text-3xl font-black text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="size-6 text-red-500" />
              {data?.high_severity_count ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="py-4">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Última Verificação
            </CardDescription>
            <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2 mt-2">
              <Clock className="size-4 text-emerald-500" />
              {data?.verified_at
                ? format(new Date(data.verified_at), "dd/MM/yyyy 'às' HH:mm:ss", {
                    locale: ptBR,
                  })
                : 'Não executado'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Regras Validadas */}
      <Card className="bg-slate-50 dark:bg-slate-900/50 border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Regras de integridade verificadas automaticamente diariamente e sob demanda:
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>Recebido ≤ demanda real da OP de origem (sem inflação indevida)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>Saldo de cada inventário = soma cronológica dos movimentos</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>Cadeia de balance_after consistente sem saltos ou corrupção</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>Registros fantasmas em aberto ou vinculados a OPs concluídas</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>Códigos com erro de digitação (ex: letra 'l'/'o' no meio de números)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>Descrições de materiais livres de poluição ou tags temporárias</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>
                Unificação cadastral: vínculos entre inventário físico e componentes mestre
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>
                Bloqueio de texto livre: novas solicitações validadas contra cadastro unificado
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
          <Input
            placeholder="Buscar por código, material ou problema..."
            className="pl-9 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="size-3.5" /> Gravidade:
          </div>
          <select
            className="text-xs bg-white dark:bg-slate-900 border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="todos">Todas</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Informativa</option>
          </select>

          {categories.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 ml-2">
                Categoria:
              </div>
              <select
                className="text-xs bg-white dark:bg-slate-900 border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="todos">Todas ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Tabela de Divergências */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
          <RefreshCw className="size-8 animate-spin text-blue-500" />
          <p className="text-sm">
            Executando auditoria em tempo real nas coleções de suprimentos...
          </p>
        </div>
      ) : filteredDivergences.length === 0 ? (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-8" />
            </div>
            <div className="max-w-md">
              <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-100">
                Nenhuma divergência encontrada!
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                Todas as regras de integridade foram atendidas perfeitamente. Saldo de estoque,
                demandas de OPs, recebimentos e códigos estão íntegros e auditados.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs font-semibold border-b">
                <tr>
                  <th className="py-3 px-4">Gravidade</th>
                  <th className="py-3 px-4">Código / Item</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Problema Identificado</th>
                  <th className="py-3 px-4">Sugestão de Correção</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDivergences.map((div) => (
                  <tr
                    key={div.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getSeverityBadge(div.severity)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                      <NoTranslate text={div.code || 'S/ Código'} />
                    </td>
                    <td className="py-3.5 px-4 max-w-xs text-xs text-slate-700 dark:text-slate-300">
                      <NoTranslate text={div.description || '—'} />
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-red-700 dark:text-red-400 max-w-sm">
                      {div.problem}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400 max-w-sm bg-slate-50/50 dark:bg-slate-800/30">
                      {div.suggestion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DIÁLOGO: ENCERRAR SALDO RESIDUAL (ETAPA 5 PARTE 2) */}
      <CloseResidualDialog
        open={closeResidualOpen}
        onOpenChange={setCloseResidualOpen}
        onSuccess={loadIntegrityData}
      />
    </div>
  )
}
