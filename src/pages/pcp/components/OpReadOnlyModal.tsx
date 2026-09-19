import { useState, useMemo, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  Calendar,
  Layers,
  User,
  Package,
  Hash,
  Boxes,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import type { PcpOrder, PcpOrderMaterial, PcpOrderMaterialSector } from '@/types'

const SECTOR_COLORS: Record<PcpOrderMaterialSector, { bg: string; text: string; badge: string }> = {
  FABRICAÇÃO: {
    bg: 'bg-blue-50/70 dark:bg-blue-950/20',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200',
  },
  PREPARAÇÃO: {
    bg: 'bg-yellow-50/70 dark:bg-yellow-950/20',
    text: 'text-yellow-700 dark:text-yellow-300',
    badge:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200',
  },
  MONTAGEM: {
    bg: 'bg-green-50/70 dark:bg-green-950/20',
    text: 'text-green-700 dark:text-green-300',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200',
  },
  EXPEDIÇÃO: {
    bg: 'bg-purple-50/70 dark:bg-purple-950/20',
    text: 'text-purple-700 dark:text-purple-300',
    badge:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200',
  },
}

const SECTORS: PcpOrderMaterialSector[] = ['FABRICAÇÃO', 'PREPARAÇÃO', 'MONTAGEM', 'EXPEDIÇÃO']

interface OpReadOnlyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  opIdentifier: string | null
  existingOrders?: PcpOrder[]
}

export function OpReadOnlyModal({
  open,
  onOpenChange,
  opIdentifier,
  existingOrders = [],
}: OpReadOnlyModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<PcpOrder | null>(null)
  const [materials, setMaterials] = useState<PcpOrderMaterial[]>([])
  const [activeSectorTab, setActiveSectorTab] = useState<string>('ALL')

  useEffect(() => {
    if (!open || !opIdentifier) {
      setOrder(null)
      setMaterials([])
      setError(null)
      setActiveSectorTab('ALL')
      return
    }

    let isMounted = true

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const raw = opIdentifier!.trim()
        const cleanDigits = raw.replace(/\D/g, '')

        // 1. Tentar encontrar a OP na lista em memória (existingOrders)
        let foundOrder: PcpOrder | null = null

        foundOrder =
          existingOrders.find((o) => {
            if (o.id === raw) return true
            if (o.op_number && (o.op_number === raw || o.op_number.trim() === raw)) return true
            if (o.order_number && (o.order_number === raw || o.order_number.trim() === raw))
              return true
            const opDigits = (o.op_number || '').replace(/\D/g, '')
            const orderDigits = (o.order_number || '').replace(/\D/g, '')
            if (cleanDigits && (opDigits === cleanDigits || orderDigits === cleanDigits))
              return true
            return false
          }) || null

        // 2. Se não encontrou em memória ou falta expansão do produto, buscar no PocketBase
        if (!foundOrder || !foundOrder.expand?.product_id) {
          const filterQueries = [`id = "${raw}"`, `op_number = "${raw}"`, `order_number = "${raw}"`]
          if (cleanDigits && cleanDigits !== raw) {
            filterQueries.push(`op_number ~ "${cleanDigits}"`)
            filterQueries.push(`order_number = "${cleanDigits}"`)
          }

          try {
            const fetched = await pb
              .collection('pcp_orders')
              .getFirstListItem<PcpOrder>(filterQueries.join(' || '), {
                expand: 'product_id,client_id',
              })
            if (fetched) {
              foundOrder = fetched
            }
          } catch (fetchErr) {
            // Se já tínhamos em memória mas sem expand, mantemos o da memória
            if (!foundOrder) {
              throw fetchErr
            }
          }
        }

        if (!isMounted) return

        if (!foundOrder) {
          setError(`Ordem de Produção "${opIdentifier}" não foi localizada.`)
          setLoading(false)
          return
        }

        setOrder(foundOrder)

        // 3. Carregar os materiais da OP em pcp_order_materials
        const loadedMaterials = await pb
          .collection('pcp_order_materials')
          .getFullList<PcpOrderMaterial>({
            filter: `order_id = "${foundOrder.id}"`,
            sort: 'sector,description',
          })

        if (!isMounted) return
        setMaterials(loadedMaterials)
      } catch (err: any) {
        console.error('Erro ao carregar OP para leitura:', err)
        if (isMounted) {
          setError(
            err.message?.includes('404')
              ? `Ordem de Produção "${opIdentifier}" não encontrada.`
              : 'Não foi possível carregar os dados da OP.',
          )
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [open, opIdentifier, existingOrders])

  // Formatação de data no padrão DD/MM/AAAA
  const formattedDeliveryDate = useMemo(() => {
    if (!order?.delivery_date) return '—'
    const dateStr = order.delivery_date
    // Caso venha no formato YYYY-MM-DD ou ISO
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.slice(0, 10)
    const parts = cleanDate.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return dateStr
  }, [order?.delivery_date])

  // Agrupamento e estatísticas dos materiais por setor
  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {
      FABRICAÇÃO: 0,
      PREPARAÇÃO: 0,
      MONTAGEM: 0,
      EXPEDIÇÃO: 0,
    }
    materials.forEach((m) => {
      if (counts[m.sector] !== undefined) {
        counts[m.sector]++
      }
    })
    return counts
  }, [materials])

  const filteredMaterials = useMemo(() => {
    if (activeSectorTab === 'ALL') return materials
    return materials.filter((m) => m.sector === activeSectorTab)
  }, [materials, activeSectorTab])

  // Agrupamento ordenado pelos 4 setores padrão para exibição
  const materialsBySector = useMemo(() => {
    const map: Record<PcpOrderMaterialSector, PcpOrderMaterial[]> = {
      FABRICAÇÃO: [],
      PREPARAÇÃO: [],
      MONTAGEM: [],
      EXPEDIÇÃO: [],
    }
    filteredMaterials.forEach((m) => {
      if (map[m.sector]) {
        map[m.sector].push(m)
      } else {
        // Fallback para FABRICAÇÃO se setor desconhecido
        map.FABRICAÇÃO.push(m)
      }
    })
    return map
  }, [filteredMaterials])

  const productName =
    order?.expand?.product_id?.name || order?.manual_product_name || 'Produto não especificado'

  const productCode = order?.expand?.product_id?.code || ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 shadow-2xl">
        {/* CABEÇALHO DO MODAL */}
        <DialogHeader className="p-5 pb-3 border-b bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="size-5 text-blue-600 dark:text-blue-400" />
                <span>Visualização da OP (Importada do PDF)</span>
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-300 font-semibold text-xs ml-2"
                >
                  <Eye className="size-3 mr-1" /> Somente Leitura
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Exibição fiel dos dados e dos componentes extraídos do PDF conforme registrado no
                sistema. Nenhuma alteração é permitida.
              </DialogDescription>
            </div>

            {order && (
              <Badge className="px-3 py-1 font-mono font-bold text-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 self-start sm:self-auto">
                OP: {order.op_number || order.order_number}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* CORPO DO MODAL */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-blue-600" />
              <p className="text-sm">Carregando detalhes e componentes da OP...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-sm flex items-center gap-2">
              <AlertCircle className="size-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          ) : !order ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhuma OP selecionada.
            </div>
          ) : (
            <>
              {/* CARTÃO DO CABEÇALHO DA OP (METADADOS IMPORTADOS) */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/60 dark:to-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Layers className="size-3.5 text-blue-600" />
                  <span>Cabeçalho da Ordem de Produção</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                  {/* Número da OP */}
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border space-y-0.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Hash className="size-3" /> Nº da OP
                    </span>
                    <span className="text-sm font-bold font-mono text-blue-700 dark:text-blue-400 block truncate">
                      {order.op_number || '—'}
                    </span>
                  </div>

                  {/* Número do Pedido */}
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border space-y-0.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <FileText className="size-3" /> Pedido
                    </span>
                    <span className="text-sm font-bold font-mono text-foreground block truncate">
                      {order.order_number || '—'}
                    </span>
                  </div>

                  {/* Cliente */}
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border space-y-0.5 col-span-2 sm:col-span-1 lg:col-span-2">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <User className="size-3" /> Cliente
                    </span>
                    <span
                      className="text-sm font-semibold text-foreground block truncate"
                      title={order.client_name || ''}
                    >
                      {order.client_name || '—'}
                    </span>
                  </div>

                  {/* Quantidade */}
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border space-y-0.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Package className="size-3" /> Quantidade
                    </span>
                    <span className="text-sm font-bold text-foreground block">
                      {order.quantity}{' '}
                      <span className="text-xs font-normal text-muted-foreground">peça(s)</span>
                    </span>
                  </div>

                  {/* Data de Entrega */}
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border space-y-0.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="size-3" /> Entrega
                    </span>
                    <span className="text-sm font-bold text-foreground block font-mono">
                      {formattedDeliveryDate}
                    </span>
                  </div>
                </div>

                {/* Produto */}
                <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">Produto:</span>
                    <span className="font-bold text-foreground text-sm">{productName}</span>
                    {productCode && (
                      <Badge variant="outline" className="font-mono text-[11px] px-1.5 py-0">
                        {productCode}
                      </Badge>
                    )}
                  </div>

                  {order.op_type && (
                    <Badge
                      variant="secondary"
                      className="text-[11px] self-start sm:self-auto font-medium"
                    >
                      Tipo: {order.op_type}
                    </Badge>
                  )}
                </div>
              </div>

              {/* FILTROS POR SETOR (TABS) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <Tabs
                  value={activeSectorTab}
                  onValueChange={setActiveSectorTab}
                  className="w-full sm:w-auto"
                >
                  <TabsList className="grid grid-cols-5 h-9 text-xs">
                    <TabsTrigger value="ALL" className="text-xs">
                      Todos ({materials.length})
                    </TabsTrigger>
                    {SECTORS.map((sec) => (
                      <TabsTrigger key={sec} value={sec} className="text-xs">
                        {sec} ({sectorCounts[sec] || 0})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Boxes className="size-3.5" />
                  <span>
                    Total: <strong className="text-foreground">{materials.length}</strong>{' '}
                    componente(s) extraído(s)
                  </span>
                </div>
              </div>

              {/* TABELAS DE COMPONENTES POR SETOR */}
              {materials.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
                  Nenhum componente vinculado a esta Ordem de Produção no sistema.
                </div>
              ) : (
                <div className="space-y-4">
                  {SECTORS.map((sector) => {
                    const sectorItems = materialsBySector[sector]
                    if (!sectorItems || sectorItems.length === 0) return null

                    const style = SECTOR_COLORS[sector]

                    return (
                      <div
                        key={sector}
                        className="border rounded-lg overflow-hidden bg-card shadow-sm"
                      >
                        {/* CABEÇALHO DO BLOCO DE SETOR */}
                        <div
                          className={cn(
                            'px-4 py-2.5 border-b flex items-center justify-between',
                            style.bg,
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn('font-bold text-xs px-2.5 py-0.5', style.badge)}
                            >
                              {sector}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {sectorItems.length} componente(s)
                            </span>
                          </div>
                        </div>

                        {/* TABELA DE COMPONENTES */}
                        <Table>
                          <TableHeader className="bg-slate-50/60 dark:bg-slate-900/40 text-xs">
                            <TableRow>
                              <TableHead className="w-[130px] font-semibold">Código</TableHead>
                              <TableHead className="font-semibold">Descrição do Material</TableHead>
                              <TableHead className="w-[120px] text-right font-semibold">
                                Quantidade
                              </TableHead>
                              <TableHead className="w-[90px] text-center font-semibold">
                                Unidade
                              </TableHead>
                              <TableHead className="w-[150px] text-center font-semibold">
                                Medida de Corte
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sectorItems.map((mat) => {
                              const cut = mat.measurements?.trim() || '—'
                              const hasCut = cut !== '—' && cut !== ''

                              return (
                                <TableRow
                                  key={mat.id}
                                  className="text-xs hover:bg-muted/40 transition-colors"
                                >
                                  {/* Código */}
                                  <TableCell className="font-mono font-semibold">
                                    {mat.code ? (
                                      <span className="text-blue-600 dark:text-blue-400">
                                        {mat.code}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground italic text-[11px]">
                                        S/ Cód
                                      </span>
                                    )}
                                  </TableCell>

                                  {/* Descrição */}
                                  <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                                    {mat.description}
                                  </TableCell>

                                  {/* Quantidade */}
                                  <TableCell className="text-right font-mono font-bold text-sm">
                                    {mat.quantity}
                                  </TableCell>

                                  {/* Unidade */}
                                  <TableCell className="text-center font-mono">
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 font-medium"
                                    >
                                      {mat.unit || 'UN'}
                                    </Badge>
                                  </TableCell>

                                  {/* Medida de Corte */}
                                  <TableCell className="text-center font-mono text-xs">
                                    {hasCut ? (
                                      <span className="font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                        {cut}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* RODAPÉ DO MODAL */}
        <DialogFooter className="p-4 border-t bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            <span>Modo de leitura ativo: nenhuma alteração pode ser gravada neste formulário.</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs font-semibold px-4"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
