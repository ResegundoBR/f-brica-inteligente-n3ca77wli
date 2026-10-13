import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  TARGET_SEPARATIONS,
  generateSeparationBomAudit,
  type SeparationAuditReport,
  type SeparationAuditItem,
  type AuditClassification,
} from '@/services/pcp-separation-bom-audit'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Search,
  RefreshCw,
  Printer,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  ChevronDown,
  ChevronRight,
  PackageCheck,
  PackageX,
  Layers,
  Filter,
  Send,
  Sliders,
  ExternalLink,
} from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { SendToHubModal, type SendToHubTargetItem } from './SendToHubModal'
import { AdjustShortageQuantityModal } from './AdjustShortageQuantityModal'

export function SeparationBomAuditPanel() {
  const { toast } = useToast()
  const [selectedSepId, setSelectedSepId] = useState<string>('all')
  const [reports, setReports] = useState<SeparationAuditReport[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [classificationFilter, setClassificationFilter] = useState<string>('todos')
  const [sectorFilter, setSectorFilter] = useState<string>('todos')
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<boolean>(false)

  // Seleção múltipla para "Enviar ao Hub" em lote
  // Chave: `${report.separationId}:::${item.code}:::${item.sector}`
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set())

  // Modais de ação
  const [sendToHubModalOpen, setSendToHubModalOpen] = useState(false)
  const [sendToHubTargets, setSendToHubTargets] = useState<SendToHubTargetItem[]>([])

  const [adjustModalOpen, setAdjustModalOpen] = useState(false)
  const [adjustTargetItem, setAdjustTargetItem] = useState<{
    item: SeparationAuditItem
    separationSeq?: number
    separationTitle?: string
  } | null>(null)

  const loadAuditData = useCallback(async () => {
    setLoading(true)
    try {
      const results = await generateSeparationBomAudit(TARGET_SEPARATIONS.map((sep) => sep.id))
      setReports(results)
    } catch (err: any) {
      console.error('Erro ao executar auditoria BOM:', err)
      toast({
        title: 'Erro ao carregar auditoria BOM',
        description:
          err.message || 'Falha ao processar a auditoria das separações. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadAuditData()
  }, [loadAuditData])

  const toggleExpand = (rowKey: string) => {
    setExpandedRowKeys((prev) => {
      const next = new Set(prev)
      if (next.has(rowKey)) {
        next.delete(rowKey)
      } else {
        next.add(rowKey)
      }
      return next
    })
  }

  // Filtragem dos relatórios
  const displayedReports = useMemo(() => {
    if (selectedSepId === 'all') {
      return reports
    }
    return reports.filter((r) => r.separationId === selectedSepId)
  }, [reports, selectedSepId])

  // Filtragem dos itens de cada relatório
  const filteredReports = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()

    const processed = displayedReports.map((report) => {
      const filtered = report.items.filter((item) => {
        // Busca
        const matchesTerm =
          !term ||
          item.code.toLowerCase().includes(term) ||
          item.description.toLowerCase().includes(term) ||
          item.sector.toLowerCase().includes(term) ||
          item.involvedOps.some(
            (op) =>
              op.opNumber.toLowerCase().includes(term) ||
              (op.orderNumber && op.orderNumber.toLowerCase().includes(term)) ||
              (op.clientName && op.clientName.toLowerCase().includes(term)),
          )

        // Classificação
        const matchesClass =
          classificationFilter === 'todos' || item.classification === classificationFilter

        // Setor
        const matchesSector = sectorFilter === 'todos' || item.sector === sectorFilter

        return matchesTerm && matchesClass && matchesSector
      })

      // Garantir ordenação estrita por código conforme requisito (1):
      // "ordenar a tabela por código dentro de cada separação (e entre separações no modo 'Todas')"
      const filteredItems = [...filtered].sort((a, b) => a.code.localeCompare(b.code))

      // Recalcular totais visíveis
      const visibleTotals = {
        totalItems: filteredItems.length,
        totalExpected: filteredItems.reduce((acc, it) => acc + it.expectedQuantity, 0),
        totalSeparated: filteredItems.reduce((acc, it) => acc + it.separatedQuantity, 0),
        totalShortageRegistered: filteredItems.reduce(
          (acc, it) => acc + it.registeredShortageQuantity,
          0,
        ),
        totalDifference: filteredItems.reduce((acc, it) => acc + it.difference, 0),
        faltaEscondidaCount: filteredItems.filter((it) => it.classification === 'FALTA ESCONDIDA')
          .length,
        faltaAMenorCount: filteredItems.filter((it) => it.classification === 'FALTA A MENOR')
          .length,
        separadoAMenorCount: filteredItems.filter((it) => it.classification === 'SEPARADO A MENOR')
          .length,
        okCount: filteredItems.filter((it) => it.classification === 'OK').length,
      }

      return {
        ...report,
        filteredItems,
        visibleTotals,
      }
    })

    return processed
  }, [displayedReports, searchTerm, classificationFilter, sectorFilter])

  // Estatísticas agregadas de todos os relatórios carregados
  const aggregatedStats = useMemo(() => {
    let totalItems = 0
    let faltaEscondida = 0
    let faltaAMenor = 0
    let separadoAMenor = 0
    let ok = 0

    for (const r of reports) {
      totalItems += r.totals.totalItems
      faltaEscondida += r.totals.faltaEscondidaCount
      faltaAMenor += r.totals.faltaAMenorCount
      separadoAMenor += r.totals.separadoAMenorCount
      ok += r.totals.okCount
    }

    return { totalItems, faltaEscondida, faltaAMenor, separadoAMenor, ok }
  }, [reports])

  // Itens elegíveis para "Enviar ao Hub" (FALTA ESCONDIDA ou SEPARADO A MENOR com diferença > 0 e que ainda não foram enviados)
  const isEligibleForHub = useCallback((item: SeparationAuditItem) => {
    return (
      (item.classification === 'FALTA ESCONDIDA' || item.classification === 'SEPARADO A MENOR') &&
      item.difference > 0 &&
      !item.sentToHubAt
    )
  }, [])

  // Contagem global de itens selecionados para o Hub em todas as separações
  const totalSelectedCount = useMemo(() => {
    let count = 0
    for (const report of filteredReports) {
      for (const item of report.filteredItems) {
        const key = `${report.separationId}:::${item.code}:::${item.sector}`
        if (selectedRowKeys.has(key) && isEligibleForHub(item)) {
          count++
        }
      }
    }
    return count
  }, [filteredReports, selectedRowKeys, isEligibleForHub])

  const formatQty = (val: number, unit?: string) => {
    const formatted = val.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    })
    return unit ? `${formatted} ${unit}` : formatted
  }

  const getClassificationBadge = (item: SeparationAuditItem) => {
    // Se o item já foi enviado ao Hub, exibe selo verde "Enviada ao Hub · dd/MM HH:mm"
    if (item.sentToHubAt) {
      const formattedDate = format(new Date(item.sentToHubAt), 'dd/MM HH:mm', { locale: ptBR })
      return (
        <Badge
          className="bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs gap-1 shadow-xs border-0 whitespace-nowrap"
          title={`Enviada ao Hub em ${format(new Date(item.sentToHubAt), 'dd/MM/yyyy HH:mm')}`}
        >
          <CheckCircle2 className="size-3.5" /> Enviada ao Hub · {formattedDate}
        </Badge>
      )
    }

    switch (item.classification) {
      case 'FALTA ESCONDIDA':
        return (
          <Badge className="bg-red-600 text-white hover:bg-red-700 font-bold text-xs gap-1 shadow-xs border-0">
            <AlertCircle className="size-3.5" /> FALTA ESCONDIDA
          </Badge>
        )
      case 'FALTA A MENOR':
        return (
          <Badge className="bg-amber-600 text-white hover:bg-amber-700 font-bold text-xs gap-1 shadow-xs border-0">
            <AlertTriangle className="size-3.5" /> FALTA A MENOR
          </Badge>
        )
      case 'SEPARADO A MENOR':
        return (
          <Badge className="bg-orange-500 text-white hover:bg-orange-600 font-bold text-xs gap-1 shadow-xs border-0">
            <PackageX className="size-3.5" /> SEPARADO A MENOR
          </Badge>
        )
      case 'OK':
        return (
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 font-semibold text-xs gap-1 shadow-xs border-0">
            <CheckCircle2 className="size-3.5" /> OK
          </Badge>
        )
    }
  }

  const handleCopyReport = () => {
    let text = `RELATÓRIO DE AUDITORIA BOM - SEPARAÇÕES PCP\nGerado em: ${new Date().toLocaleString('pt-BR')}\n\n`

    filteredReports.forEach((rep) => {
      text += `========================================================\n`
      text += `${rep.separationTitle} (${rep.separationStatus})\n`
      text += `Total Itens: ${rep.visibleTotals.totalItems} | Falta Escondida: ${rep.visibleTotals.faltaEscondidaCount} | Falta a Menor: ${rep.visibleTotals.faltaAMenorCount} | Separado a Menor: ${rep.visibleTotals.separadoAMenorCount} | OK: ${rep.visibleTotals.okCount}\n`
      text += `========================================================\n`
      text += `CÓDIGO\tDESCRIÇÃO\tSETOR\tESPERADO\tSEPARADO\tFALTA REG.\tDIFERENÇA\tCLASSIFICAÇÃO\tOPS\n`

      rep.filteredItems.forEach((it) => {
        const ops = it.involvedOps
          .map((o) => `OP ${o.opNumber} (${o.itemQuantity} ${it.unit})`)
          .join(', ')
        text += `${it.code}\t${it.description}\t${it.sector}\t${it.expectedQuantity}\t${it.separatedQuantity}\t${it.registeredShortageQuantity}\t${it.difference}\t${it.classification}\t${ops}\n`
      })
      text += `\n`
    })

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      toast({
        title: 'Copiado para a área de transferência',
        description: 'Os dados da auditoria foram copiados em formato tabulado.',
      })
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const handlePrint = () => {
    window.print()
  }

  // Toggle de seleção de uma linha individual
  const toggleRowSelect = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedRowKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Toggle de todas as linhas elegíveis visíveis de uma separação
  const toggleAllEligibleInReport = (report: (typeof filteredReports)[0]) => {
    const eligibleKeys = report.filteredItems
      .filter(isEligibleForHub)
      .map((it) => `${report.separationId}:::${it.code}:::${it.sector}`)

    if (eligibleKeys.length === 0) return

    const allSelected = eligibleKeys.every((k) => selectedRowKeys.has(k))
    setSelectedRowKeys((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        eligibleKeys.forEach((k) => next.delete(k))
      } else {
        eligibleKeys.forEach((k) => next.add(k))
      }
      return next
    })
  }

  // Abrir envio individual ao Hub
  const handleOpenSendSingle = (report: (typeof filteredReports)[0], item: SeparationAuditItem) => {
    setSendToHubTargets([
      {
        separationId: report.separationId,
        separationTitle: report.separationTitle,
        separationSeq: report.programacaoSeq,
        item,
      },
    ])
    setSendToHubModalOpen(true)
  }

  // Abrir envio em lote para todos os selecionados
  const handleOpenSendBatch = () => {
    const targets: SendToHubTargetItem[] = []

    for (const report of filteredReports) {
      for (const item of report.filteredItems) {
        const key = `${report.separationId}:::${item.code}:::${item.sector}`
        if (selectedRowKeys.has(key) && isEligibleForHub(item)) {
          targets.push({
            separationId: report.separationId,
            separationTitle: report.separationTitle,
            separationSeq: report.programacaoSeq,
            item,
          })
        }
      }
    }

    if (targets.length === 0) {
      toast({
        title: 'Nenhum item selecionado',
        description: 'Selecione uma ou mais linhas elegíveis usando as caixas de seleção.',
      })
      return
    }

    setSendToHubTargets(targets)
    setSendToHubModalOpen(true)
  }

  // Abrir modal de Ajuste de Quantidade para FALTA A MENOR
  const handleOpenAdjust = (report: (typeof filteredReports)[0], item: SeparationAuditItem) => {
    setAdjustTargetItem({
      item,
      separationSeq: report.programacaoSeq,
      separationTitle: report.separationTitle,
    })
    setAdjustModalOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 w-full print:p-0">
      {/* Banner / Cabeçalho da Auditoria */}
      <Card className="border-l-4 border-l-indigo-600 bg-slate-50/70 dark:bg-slate-900/40">
        <CardHeader className="py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-indigo-700 border-indigo-300 font-semibold text-xs"
                >
                  Auditoria Pós-0.0.430
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Somente Leitura
                </Badge>
              </div>
              <CardTitle className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1 flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-indigo-600" />
                Auditoria de BOM das Separações #1, #2, #3 e #4
              </CardTitle>
              <CardDescription className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Conferência matemática precisa entre <strong>Demanda Esperada da Composição</strong>
                , <strong>Separado em Estoque</strong> e <strong>Faltas em Suprimentos</strong>.
                Permite antecipar correções de cotação/compra antes do impacto em fábrica.
              </CardDescription>
            </div>

            {/* Ações de exportação e Envio em Lote */}
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {totalSelectedCount > 0 && (
                <Button
                  size="sm"
                  onClick={handleOpenSendBatch}
                  className="gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                  title="Criar solicitações no Hub de Suprimentos para os itens selecionados"
                >
                  <Send className="size-3.5" />
                  Enviar ao Hub ({totalSelectedCount})
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyReport}
                disabled={loading}
                className="gap-1.5 text-xs font-semibold"
                title="Copiar dados da tabela para Excel ou Bloco de Notas"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied ? 'Copiado!' : 'Copiar'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={loading}
                className="gap-1.5 text-xs font-semibold"
                title="Imprimir relatório ou exportar como PDF"
              >
                <Printer className="size-3.5" />
                Imprimir
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={loadAuditData}
                disabled={loading}
                className="gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
      {/* Cards de Resumo Agregado */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 print:hidden">
        <Card className="border-l-4 border-l-slate-400">
          <CardHeader className="p-3">
            <CardDescription className="text-[11px] font-semibold uppercase text-slate-500">
              Total Itens
            </CardDescription>
            <CardTitle className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Layers className="size-5 text-slate-500" />
              {aggregatedStats.totalItems}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-red-600 bg-red-50/30 dark:bg-red-950/20">
          <CardHeader className="p-3">
            <CardDescription className="text-[11px] font-semibold uppercase text-red-700 dark:text-red-400">
              Falta Escondida
            </CardDescription>
            <CardTitle className="text-2xl font-black text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertCircle className="size-5 text-red-600" />
              {aggregatedStats.faltaEscondida}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/20">
          <CardHeader className="p-3">
            <CardDescription className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-400">
              Falta a Menor
            </CardDescription>
            <CardTitle className="text-2xl font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="size-5 text-amber-500" />
              {aggregatedStats.faltaAMenor}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-orange-500 bg-orange-50/30 dark:bg-orange-950/20">
          <CardHeader className="p-3">
            <CardDescription className="text-[11px] font-semibold uppercase text-orange-700 dark:text-orange-400">
              Separado a Menor
            </CardDescription>
            <CardTitle className="text-2xl font-black text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
              <PackageX className="size-5 text-orange-500" />
              {aggregatedStats.separadoAMenor}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/20">
          <CardHeader className="p-3">
            <CardDescription className="text-[11px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">
              Itens OK
            </CardDescription>
            <CardTitle className="text-2xl font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="size-5 text-emerald-600" />
              {aggregatedStats.ok}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      {/* Barra de Filtros e Seletor de Separação */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between print:hidden">
        {/* Seletor de Separação */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <PackageCheck className="size-4 text-indigo-600" /> Separação:
          </div>
          <div className="inline-flex rounded-lg border bg-slate-100 p-0.5 dark:bg-slate-800 text-xs">
            <button
              onClick={() => setSelectedSepId('all')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                selectedSepId === 'all'
                  ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              Todas (1, 2, 3 e 4)
            </button>
            {TARGET_SEPARATIONS.map((sep, idx) => (
              <button
                key={sep.id}
                onClick={() => setSelectedSepId(sep.id)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  selectedSepId === sep.id
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                #{idx + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Busca e Filtros de Classificação e Setor */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <Input
              placeholder="Buscar código, material ou OP..."
              className="pl-9 text-xs h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Filter className="size-3.5" />
          </div>

          <select
            className="text-xs bg-white dark:bg-slate-900 border rounded-md px-2.5 py-1.5 h-9 font-medium"
            value={classificationFilter}
            onChange={(e) => setClassificationFilter(e.target.value)}
          >
            <option value="todos">Classificação: Todas</option>
            <option value="FALTA ESCONDIDA">Falta Escondida</option>
            <option value="FALTA A MENOR">Falta a Menor</option>
            <option value="SEPARADO A MENOR">Separado a Menor</option>
            <option value="OK">OK</option>
          </select>

          <select
            className="text-xs bg-white dark:bg-slate-900 border rounded-md px-2.5 py-1.5 h-9 font-medium"
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
          >
            <option value="todos">Setor: Todos</option>
            <option value="FABRICAÇÃO">Fabricação</option>
            <option value="PREPARAÇÃO">Preparação</option>
            <option value="MONTAGEM">Montagem</option>
            <option value="EXPEDIÇÃO">Expedição</option>
          </select>
        </div>
      </div>
      {/* Conteúdo do Relatório */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 text-slate-400 gap-3 border rounded-lg bg-white dark:bg-slate-900">
          <RefreshCw className="size-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium">
            Calculando auditoria matemática das separações a partir das composições dos produtos...
          </p>
          <span className="text-xs text-slate-500">
            Recomputando OPs concluídas a partir do catálogo e cruzando com solicitações de
            Suprimentos.
          </span>
        </div>
      ) : filteredReports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            Nenhuma separação encontrada ou nenhum dado retornado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {filteredReports.map((report) => (
            <div
              key={report.separationId}
              className="border rounded-xl bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
            >
              {/* Cabeçalho da Separação */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 flex items-center justify-center font-bold text-sm shrink-0">
                    {report.programacaoSeq ? `#${report.programacaoSeq}` : 'SEP'}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                      {report.separationTitle}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span>
                        Status: <strong>{report.separationStatus}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Data:{' '}
                        {report.separationDate
                          ? format(new Date(report.separationDate), 'dd/MM/yyyy HH:mm', {
                              locale: ptBR,
                            })
                          : '—'}
                      </span>
                      <span>•</span>
                      <span>
                        Total de Itens: <strong>{report.visibleTotals.totalItems}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Badges de resumo desta separação e Botão de Ação em Lote */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {report.visibleTotals.faltaEscondidaCount > 0 && (
                      <Badge className="bg-red-600 text-white font-bold text-[11px]">
                        {report.visibleTotals.faltaEscondidaCount} Falta Escondida
                      </Badge>
                    )}
                    {report.visibleTotals.faltaAMenorCount > 0 && (
                      <Badge className="bg-amber-600 text-white font-bold text-[11px]">
                        {report.visibleTotals.faltaAMenorCount} Falta a Menor
                      </Badge>
                    )}
                    {report.visibleTotals.separadoAMenorCount > 0 && (
                      <Badge className="bg-orange-500 text-white font-bold text-[11px]">
                        {report.visibleTotals.separadoAMenorCount} Separado a Menor
                      </Badge>
                    )}
                    {report.visibleTotals.okCount > 0 && (
                      <Badge className="bg-emerald-600 text-white font-semibold text-[11px]">
                        {report.visibleTotals.okCount} OK
                      </Badge>
                    )}
                  </div>

                  {/* Botão de Envio em Lote se houver selecionados desta separação */}
                  {(() => {
                    const selectedInThisReport = report.filteredItems.filter((it) =>
                      selectedRowKeys.has(`${report.separationId}:::${it.code}:::${it.sector}`),
                    )
                    if (selectedInThisReport.length === 0) return null

                    return (
                      <Button
                        size="sm"
                        onClick={handleOpenSendBatch}
                        className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 shadow-xs"
                        title="Enviar todos os itens selecionados para a Fila de Triagem do Hub"
                      >
                        <Send className="size-3.5" />
                        Enviar Selecionados ao Hub ({selectedInThisReport.length})
                      </Button>
                    )
                  })()}
                </div>
              </div>

              {/* Tabela de Itens Auditados */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/70 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 font-semibold border-b">
                    <tr>
                      <th
                        className="py-2.5 px-3 w-8 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const eligible = report.filteredItems.filter(isEligibleForHub)
                          if (eligible.length === 0) return null
                          const allSelected = eligible.every((it) =>
                            selectedRowKeys.has(
                              `${report.separationId}:::${it.code}:::${it.sector}`,
                            ),
                          )
                          const someSelected =
                            !allSelected &&
                            eligible.some((it) =>
                              selectedRowKeys.has(
                                `${report.separationId}:::${it.code}:::${it.sector}`,
                              ),
                            )
                          return (
                            <Checkbox
                              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                              onCheckedChange={() => toggleAllEligibleInReport(report)}
                              title="Selecionar/Desmarcar todas as linhas elegíveis desta separação"
                            />
                          )
                        })()}
                      </th>
                      <th className="py-2.5 px-3 w-8"></th>
                      <th className="py-2.5 px-3 w-[110px]">Código</th>
                      <th className="py-2.5 px-3 min-w-[200px]">Descrição</th>
                      <th className="py-2.5 px-3 w-[100px]">Setor</th>
                      <th className="py-2.5 px-3 w-[110px] text-right">Esperado (BOM)</th>
                      <th className="py-2.5 px-3 w-[95px] text-right">Separado</th>
                      <th className="py-2.5 px-3 w-[105px] text-right">Falta Registrada</th>
                      <th className="py-2.5 px-3 w-[95px] text-right">Diferença</th>
                      <th className="py-2.5 px-3 w-[140px] text-center">Classificação</th>
                      <th className="py-2.5 px-3 w-[150px] text-center print:hidden">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-8 text-center text-slate-400">
                          Nenhum item corresponde aos filtros selecionados nesta separação.
                        </td>
                      </tr>
                    ) : (
                      report.filteredItems.map((item) => {
                        const rowKey = `${report.separationId}-${item.code}-${item.sector}`
                        const selectKey = `${report.separationId}:::${item.code}:::${item.sector}`
                        const isExpanded = expandedRowKeys.has(rowKey)
                        const isSelected = selectedRowKeys.has(selectKey)
                        const eligible = isEligibleForHub(item)

                        return (
                          <React.Fragment key={rowKey}>
                            <tr
                              onClick={() => toggleExpand(rowKey)}
                              className={`cursor-pointer transition-colors ${
                                item.classification === 'FALTA ESCONDIDA'
                                  ? 'bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/20 dark:hover:bg-red-950/40'
                                  : item.classification === 'FALTA A MENOR'
                                    ? 'bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/40'
                                    : item.classification === 'SEPARADO A MENOR'
                                      ? 'bg-orange-50/40 hover:bg-orange-50/70 dark:bg-orange-950/20 dark:hover:bg-orange-950/40'
                                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <td
                                className="py-2 px-3 text-center"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (eligible) {
                                    toggleRowSelect(selectKey, e)
                                  }
                                }}
                              >
                                {eligible ? (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleRowSelect(selectKey)}
                                    aria-label={`Selecionar ${item.code}`}
                                  />
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-700 text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center text-slate-400">
                                {item.involvedOps.length > 0 &&
                                  (isExpanded ? (
                                    <ChevronDown className="size-3.5 inline text-slate-600" />
                                  ) : (
                                    <ChevronRight className="size-3.5 inline text-slate-400" />
                                  ))}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100 notranslate whitespace-nowrap">
                                <NoTranslate text={item.code} />
                              </td>
                              <td className="py-2 px-3 text-slate-800 dark:text-slate-200 notranslate">
                                <div className="font-medium line-clamp-2">
                                  <NoTranslate text={item.description} />
                                </div>
                                <span className="text-[10px] text-slate-500 font-sans">
                                  {item.involvedOps.length}{' '}
                                  {item.involvedOps.length === 1
                                    ? 'OP vinculada'
                                    : 'OPs vinculadas'}
                                </span>
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                  {item.sector}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                {formatQty(item.expectedQuantity, item.unit)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                                {formatQty(item.separatedQuantity, item.unit)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-amber-700 dark:text-amber-400 font-semibold">
                                {formatQty(item.registeredShortageQuantity, item.unit)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold">
                                {item.difference > 0 ? (
                                  <span className="text-red-600 dark:text-red-400">
                                    +{formatQty(item.difference, item.unit)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">0</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                {getClassificationBadge(item)}
                              </td>
                              <td
                                className="py-2 px-3 text-center whitespace-nowrap print:hidden"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* AÇÃO 2: ENVIAR AO HUB (FALTA ESCONDIDA ou SEPARADO A MENOR) */}
                                {(item.classification === 'FALTA ESCONDIDA' ||
                                  item.classification === 'SEPARADO A MENOR') &&
                                  (item.sentToHubAt ? (
                                    <div className="inline-flex flex-col items-center gap-1">
                                      <Button
                                        size="sm"
                                        disabled
                                        className="h-7 px-2.5 text-[11px] opacity-60 cursor-not-allowed bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-medium"
                                        title="Esta solicitação já foi enviada ao Hub de Suprimentos"
                                      >
                                        <CheckCircle2 className="size-3 text-emerald-600 mr-1" />
                                        Enviada ao Hub
                                      </Button>
                                      {item.sentToHubShortageId && (
                                        <a
                                          href={`/pcp/suprimentos/hub?id=${item.sentToHubShortageId}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-[10px] text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline flex items-center gap-1 font-mono font-medium"
                                          title="Abrir solicitação criada no Hub de Suprimentos"
                                        >
                                          <span>
                                            Abrir no Hub #{item.sentToHubShortageId.slice(0, 6)}
                                          </span>
                                          <ExternalLink className="size-2.5" />
                                        </a>
                                      )}
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenSendSingle(report, item)}
                                      className="h-7 px-2.5 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1 shadow-xs"
                                      title="Criar solicitação de compra no Hub de Suprimentos (Fila de Entrada/Triagem)"
                                    >
                                      <Send className="size-3" />
                                      Enviar ao Hub
                                    </Button>
                                  ))}

                                {/* AÇÃO 3: AJUSTAR QUANTIDADE (FALTA A MENOR) */}
                                {item.classification === 'FALTA A MENOR' && (
                                  <div className="inline-flex flex-col items-center gap-1">
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenAdjust(report, item)}
                                      className="h-7 px-2.5 text-[11px] bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1 shadow-xs"
                                      title="Ajustar quantidade do registro de falta existente sem duplicar"
                                    >
                                      <Sliders className="size-3" />
                                      Ajustar quantidade
                                    </Button>
                                    {item.sentToHubShortageId && (
                                      <a
                                        href={`/pcp/suprimentos/hub?id=${item.sentToHubShortageId}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 hover:underline flex items-center gap-1 font-mono font-medium"
                                        title="Ver solicitação no Hub"
                                      >
                                        <span>No Hub #{item.sentToHubShortageId.slice(0, 6)}</span>
                                        <ExternalLink className="size-2.5" />
                                      </a>
                                    )}
                                  </div>
                                )}

                                {/* LINHA OK */}
                                {item.classification === 'OK' && (
                                  <div className="inline-flex flex-col items-center">
                                    <span className="text-[11px] text-slate-400 font-normal">
                                      Regular
                                    </span>
                                    {item.sentToHubShortageId && (
                                      <a
                                        href={`/pcp/suprimentos/hub?id=${item.sentToHubShortageId}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] text-slate-500 hover:underline flex items-center gap-0.5 mt-0.5 font-mono"
                                        title="Ver registro no Hub"
                                      >
                                        #{item.sentToHubShortageId.slice(0, 6)}
                                        <ExternalLink className="size-2.5" />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                            {/* Linha expansível com o detalhamento das OPs envolvidas */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80 dark:bg-slate-900/60 border-y border-dashed border-slate-200 dark:border-slate-800">
                                <td colSpan={11} className="p-3 pl-8">
                                  <div className="bg-white dark:bg-slate-950 p-3 rounded-lg border text-xs shadow-xs">
                                    <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                      <Info className="size-3.5 text-indigo-600" />
                                      Composição da Demanda por OP (Item: {item.code})
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-[11px]">
                                        <thead className="bg-slate-100/60 dark:bg-slate-900 text-slate-600 border-b">
                                          <tr>
                                            <th className="py-1.5 px-2">OP</th>
                                            <th className="py-1.5 px-2">Pedido</th>
                                            <th className="py-1.5 px-2">Cliente</th>
                                            <th className="py-1.5 px-2">Produto</th>
                                            <th className="py-1.5 px-2 text-center">Status OP</th>
                                            <th className="py-1.5 px-2 text-right">Qtd da OP</th>
                                            <th className="py-1.5 px-2 text-right">
                                              Demanda Esperada
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                          {item.involvedOps.map((op) => (
                                            <tr key={op.orderId} className="hover:bg-slate-50/50">
                                              <td className="py-1.5 px-2 font-mono font-bold text-indigo-700 dark:text-indigo-400">
                                                OP {op.opNumber}
                                              </td>
                                              <td className="py-1.5 px-2 font-mono">
                                                {op.orderNumber || '—'}
                                              </td>
                                              <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">
                                                {op.clientName || '—'}
                                              </td>
                                              <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">
                                                {op.productName || '—'}
                                              </td>
                                              <td className="py-1.5 px-2 text-center">
                                                {op.isConcluded ? (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 py-0"
                                                  >
                                                    Concluída (recalculado da BOM)
                                                  </Badge>
                                                ) : (
                                                  <Badge
                                                    variant="outline"
                                                    className="text-[10px] bg-blue-50 text-blue-700 border-blue-300 py-0"
                                                  >
                                                    Em Processo (pcp_order_materials)
                                                  </Badge>
                                                )}
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-mono">
                                                {op.opQuantity} un
                                              </td>
                                              <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                                {formatQty(op.itemQuantity, item.unit)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })
                    )}
                  </tbody>

                  {/* Rodapé com Totais */}
                  {report.filteredItems.length > 0 && (
                    <tfoot className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                      <tr>
                        <td
                          colSpan={5}
                          className="py-2.5 px-3 text-right uppercase tracking-wider text-[11px]"
                        >
                          Totais desta Separação ({report.visibleTotals.totalItems} itens):
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {formatQty(report.visibleTotals.totalExpected)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                          {formatQty(report.visibleTotals.totalSeparated)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-700 dark:text-amber-400">
                          {formatQty(report.visibleTotals.totalShortageRegistered)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-red-600 dark:text-red-400">
                          {report.visibleTotals.totalDifference > 0
                            ? `+${formatQty(report.visibleTotals.totalDifference)}`
                            : '0'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-[10px] font-normal text-slate-600 dark:text-slate-400">
                          {report.visibleTotals.faltaEscondidaCount > 0 && (
                            <span className="text-red-600 font-bold mr-1">
                              {report.visibleTotals.faltaEscondidaCount} escondidas
                            </span>
                          )}
                          {report.visibleTotals.faltaAMenorCount > 0 && (
                            <span className="text-amber-600 font-bold mr-1">
                              {report.visibleTotals.faltaAMenorCount} a menor
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 print:hidden"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Modal: Enviar ao Hub */}
      <SendToHubModal
        open={sendToHubModalOpen}
        onOpenChange={setSendToHubModalOpen}
        targetItems={sendToHubTargets}
        onSuccess={() => {
          setSelectedRowKeys(new Set())
          loadAuditData()
        }}
      />
      {/* Modal: Ajustar Quantidade (Falta a Menor) */}
      <AdjustShortageQuantityModal
        open={adjustModalOpen}
        onOpenChange={setAdjustModalOpen}
        item={adjustTargetItem?.item || null}
        separationSeq={adjustTargetItem?.separationSeq}
        separationTitle={adjustTargetItem?.separationTitle}
        onSuccess={() => {
          loadAuditData()
        }}
      />{' '}
    </div>
  )
}
