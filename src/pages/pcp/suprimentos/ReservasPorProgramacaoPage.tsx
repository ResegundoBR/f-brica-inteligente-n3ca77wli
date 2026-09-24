import { useState, useEffect, useMemo } from 'react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import {
  CalendarClock,
  Search,
  Download,
  Printer,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Filter,
  Calendar,
  Layers,
  Box,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { NoTranslate } from '@/components/NoTranslate'
import { useRealtime } from '@/hooks/use-realtime'
import {
  getProgrammedReservationsOverview,
  ComponentProgrammedReservationSummary,
} from '@/services/pcp-reservas-programacao'

export default function ReservasPorProgramacaoPage() {
  const [data, setData] = useState<ComponentProgrammedReservationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  const loadData = async () => {
    setLoading(true)
    try {
      const result = await getProgrammedReservationsOverview({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        searchTerm: searchTerm || undefined,
      })
      setData(result)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar dados',
        description: err.message || 'Falha na consolidação de reservas por programação.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [startDate, endDate])

  useRealtime('material_reservations', loadData)
  useRealtime('pcp_order_materials', loadData)
  useRealtime('material_separations', loadData)
  useRealtime('pcp_orders', loadData)
  useRealtime('inventory', loadData)

  const toggleExpand = (code: string) => {
    setExpandedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedCodes(new Set(data.map((d) => d.code)))
  }

  const collapseAll = () => {
    setExpandedCodes(new Set())
  }

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data
    const q = searchTerm.toLowerCase().trim()
    return data.filter((item) => {
      const matchCode = item.code.toLowerCase().includes(q)
      const matchDesc = item.description.toLowerCase().includes(q)
      const matchOp = item.ops.some(
        (o) =>
          o.opNumber.toLowerCase().includes(q) ||
          o.orderNumber.toLowerCase().includes(q) ||
          o.clientName.toLowerCase().includes(q) ||
          o.productName.toLowerCase().includes(q),
      )
      return matchCode || matchDesc || matchOp
    })
  }, [data, searchTerm])

  // KPIs de resumo
  const totalComponents = filteredData.length
  const coveredCount = filteredData.filter((i) => i.isCovered).length
  const deficitCount = filteredData.filter((i) => !i.isCovered).length
  const totalDeficitQty = filteredData.reduce((acc, i) => acc + i.deficit, 0)
  const totalDemandedQty = filteredData.reduce((acc, i) => acc + i.totalDemanded, 0)

  // Exportar para CSV
  const handleExportCsv = () => {
    if (filteredData.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum dado para exportar.' })
      return
    }

    const rows: string[][] = [
      [
        'Código',
        'Descrição',
        'Unidade',
        'Estoque Total',
        'Reservado',
        'Disponível',
        'Total Demandado (OPs)',
        'Saldo/Resultado',
        'Déficit a Comprar',
        'Qtd de OPs Vinculadas',
      ],
    ]

    for (const item of filteredData) {
      rows.push([
        `"${item.code.replace(/"/g, '""')}"`,
        `"${item.description.replace(/"/g, '""')}"`,
        `"${item.unit}"`,
        String(item.totalStock),
        String(item.reservedStock),
        String(item.availableStock),
        String(item.totalDemanded),
        item.isCovered ? 'COBERTO' : 'DÉFICIT',
        String(item.deficit),
        String(item.ops.length),
      ])
    }

    const csvContent = '\uFEFF' + rows.map((r) => r.join(';')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `reservas-por-programacao-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast({ title: 'Exportado com sucesso!', description: 'Arquivo CSV gerado.' })
  }

  // Impressão limpa
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950 print:p-0 print:bg-white">
      {/* Cabeçalho */}
      <div className="print:hidden">
        <SuprimentosHeader
          title="Reservas por Programação"
          description="Consolidação de tudo o que o estoque já prometeu e necessidades das OPs em andamento, organizadas por componente."
          icon={CalendarClock}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="gap-1.5 h-9 font-semibold"
              >
                <RotateCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-1.5 h-9 font-semibold"
              >
                <Printer className="size-3.5" /> Imprimir
              </Button>
              <Button
                size="sm"
                onClick={handleExportCsv}
                className="gap-1.5 h-9 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Download className="size-3.5" /> Exportar CSV
              </Button>
            </div>
          }
        />
      </div>

      {/* Cabeçalho exclusivo para impressão */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold text-slate-900">
          Relatório de Reservas por Programação (PCP / Suprimentos)
        </h1>
        <p className="text-xs text-slate-500">
          Emitido em: {new Date().toLocaleString('pt-BR')} — Filtro: {searchTerm || 'Geral'}
        </p>
      </div>

      {/* Cards de KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4 print:gap-2">
        <Card className="shadow-xs">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Componentes Ativos
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-black text-slate-800 dark:text-slate-100">
              {totalComponents}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Demanda somada: {totalDemandedQty} un
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-emerald-200/80 bg-emerald-50/40 dark:bg-emerald-950/20">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="size-3.5 text-emerald-600" /> Cobertos pelo Estoque
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
              {coveredCount}
            </div>
            <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
              Saldo disponível suficiente
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-red-200/80 bg-red-50/40 dark:bg-red-950/20">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-red-800 dark:text-red-300 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="size-3.5 text-red-600" /> Em Déficit (Falta Cobrir)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-black text-red-600 dark:text-red-400">{deficitCount}</div>
            <p className="text-[11px] text-red-800/80 dark:text-red-300/80 mt-0.5">
              Itens que exigem compra
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/20">
          <CardHeader className="pb-1.5 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
              Total Faltante a Comprar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-2xl font-black text-amber-700 dark:text-amber-400">
              {totalDeficitQty}
            </div>
            <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Unidades em falta acumulada
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 sm:p-4 rounded-xl border shadow-xs print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              placeholder="Buscar código, descrição, OP, pedido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs sm:text-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="size-3.5" />
            <span>Vencimento da OP:</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-32 text-xs"
              title="Data inicial de vencimento da OP"
            />
            <span>até</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-32 text-xs"
              title="Data final de vencimento da OP"
            />
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                }}
                className="h-8 px-2 text-xs"
              >
                Limpar datas
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <Button variant="outline" size="sm" onClick={expandAll} className="h-8 text-xs">
            Expandir todos
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll} className="h-8 text-xs">
            Recolher todos
          </Button>
        </div>
      </div>

      {/* Conteúdo: Tabela Agrupada por Componente */}
      {loading && filteredData.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          <RotateCw className="size-8 animate-spin mx-auto text-blue-600 mb-2" />
          <span>Consolidando reservas e demandas por programação...</span>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum componente com reserva ou demanda ativa encontrado para os filtros selecionados.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredData.map((item) => {
            const isExpanded = expandedCodes.has(item.code)
            return (
              <div
                key={item.code}
                className={cn(
                  'rounded-xl border bg-card shadow-xs overflow-hidden transition-colors',
                  item.isCovered
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-red-300 bg-red-50/15 dark:border-red-900/60 dark:bg-red-950/10',
                )}
              >
                {/* Linha Resumo do Componente */}
                <div
                  onClick={() => toggleExpand(item.code)}
                  className="p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-900/40 select-none"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      type="button"
                      className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0 print:hidden"
                      aria-label="Expandir/Recolher"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="font-mono font-bold text-xs sm:text-sm px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 notranslate"
                          translate="no"
                        >
                          {item.code}
                        </span>
                        <NoTranslate
                          as="h3"
                          className="font-bold text-sm sm:text-base text-foreground truncate max-w-xl"
                        >
                          {item.description || 'Material sem descrição'}
                        </NoTranslate>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {item.unit}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Layers className="size-3" />
                          <strong>{item.ops.length}</strong> OP(s) demandando
                        </span>
                        <span>•</span>
                        <span>
                          Total necessário nas OPs: <strong>{item.totalDemanded}</strong>{' '}
                          {item.unit}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Saldos de Estoque e Resultado */}
                  <div className="flex items-center gap-4 sm:gap-6 shrink-0 flex-wrap justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0">
                    {/* Estoque Total */}
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                        Estoque Total
                      </div>
                      <div className="font-mono font-bold text-xs sm:text-sm text-foreground notranslate">
                        {item.totalStock}
                      </div>
                    </div>

                    {/* Reservado */}
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-semibold text-amber-700 dark:text-amber-400">
                        Reservado
                      </div>
                      <div className="font-mono font-bold text-xs sm:text-sm text-amber-600 dark:text-amber-400 notranslate">
                        {item.reservedStock}
                      </div>
                    </div>

                    {/* Disponível */}
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-semibold text-emerald-700 dark:text-emerald-400">
                        Disponível
                      </div>
                      <div className="font-mono font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 notranslate">
                        {item.availableStock}
                      </div>
                    </div>

                    {/* Coluna de Resultado: Coberto vs Déficit */}
                    <div className="min-w-[140px] text-right">
                      {item.isCovered ? (
                        <div className="inline-flex flex-col items-end">
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1">
                            <CheckCircle2 className="size-3" /> Coberto
                          </Badge>
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                            Sobra: +{item.surplus} {item.unit}
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex flex-col items-end">
                          <Badge variant="destructive" className="font-bold text-xs gap-1">
                            <AlertTriangle className="size-3" /> Déficit: -{item.deficit}{' '}
                            {item.unit}
                          </Badge>
                          <span className="text-[10px] text-red-600 dark:text-red-400 font-bold mt-0.5">
                            Necessário comprar
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detalhe das OPs vinculadas (expansível ou sempre visível na impressão) */}
                <div
                  className={cn(
                    !isExpanded && 'hidden print:block',
                    'border-t bg-slate-50/50 dark:bg-slate-900/30',
                  )}
                >
                  <Table>
                    <TableHeader className="bg-slate-100/60 dark:bg-slate-900/60 text-[11px]">
                      <TableRow>
                        <TableHead className="w-[110px] font-bold">Nº da OP</TableHead>
                        <TableHead className="w-[110px] font-bold">Pedido</TableHead>
                        <TableHead className="font-bold">Cliente</TableHead>
                        <TableHead className="font-bold">Produto</TableHead>
                        <TableHead className="w-[110px] font-bold text-right">
                          Qtd Necessária
                        </TableHead>
                        <TableHead className="w-[130px] font-bold">Etapa / Status OP</TableHead>
                        <TableHead className="w-[120px] font-bold">Data Vencimento</TableHead>
                        <TableHead className="w-[100px] font-bold text-center">Reserva</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {item.ops.map((op) => {
                        const dateFormatted = op.deliveryDate
                          ? op.deliveryDate.slice(0, 10).split('-').reverse().join('/')
                          : '-'
                        return (
                          <TableRow
                            key={`${item.code}-${op.orderId}`}
                            className="hover:bg-slate-100/50 dark:hover:bg-slate-800/40"
                          >
                            <TableCell className="font-mono font-bold text-primary notranslate">
                              {op.opNumber && op.opNumber !== '-' ? `OP ${op.opNumber}` : '—'}
                            </TableCell>
                            <TableCell className="font-mono font-medium text-slate-700 dark:text-slate-300 notranslate">
                              {op.orderNumber}
                            </TableCell>
                            <TableCell className="text-muted-foreground notranslate">
                              <span className="truncate max-w-[180px] block" title={op.clientName}>
                                {op.clientName}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium text-foreground notranslate">
                              <span className="truncate max-w-[220px] block" title={op.productName}>
                                {op.productName}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-foreground notranslate">
                              {op.quantity} {item.unit}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                <Badge variant="outline" className="text-[10px] px-1 py-0">
                                  {op.stage}
                                </Badge>
                                {op.programacaoName && (
                                  <span
                                    className="text-[9px] text-muted-foreground truncate max-w-[120px]"
                                    title={op.programacaoName}
                                  >
                                    {op.programacaoName}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono">
                              {dateFormatted}
                            </TableCell>
                            <TableCell className="text-center">
                              {op.isReserved ? (
                                <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] px-1.5 py-0 font-bold">
                                  Separado
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 text-slate-500 font-medium"
                                >
                                  Aguardando
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          })}{' '}
        </div>
      )}
    </div>
  )
}
