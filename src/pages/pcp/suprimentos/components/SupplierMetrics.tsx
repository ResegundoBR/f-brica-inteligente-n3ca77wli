import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  Clock,
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
  Truck,
  FileText,
  Mail,
  Phone,
  User as UserIcon,
  MessageCircle,
  MapPin,
  Calendar,
  Inbox,
  Loader2,
} from 'lucide-react'
import { format, parseISO, differenceInDays, isValid, isBefore, startOfDay } from 'date-fns'
import type { Supplier, Quotation, MaterialShortage, OrdemCompra, OrdemCompraItem } from '@/types'
import pb from '@/lib/pocketbase/client'

const formatCurrency = (val: number | undefined | null) => {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00'
  return `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface SupplierMetricsProps {
  supplier: Supplier | null
  quotations: Quotation[]
  shortages: MaterialShortage[]
  ocs?: OrdemCompra[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SupplierMetrics({
  supplier,
  quotations,
  shortages,
  ocs = [],
  open,
  onOpenChange,
}: SupplierMetricsProps) {
  const [activeTab, setActiveTab] = useState<string>('visao-geral')
  const [ocItemsMap, setOcItemsMap] = useState<Record<string, OrdemCompraItem[]>>({})
  const [loadingItems, setLoadingItems] = useState(false)

  // Reset tab when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('visao-geral')
    }
  }, [open, supplier?.id])

  // Overview metrics
  const metrics = useMemo(() => {
    const purchases = shortages.filter(
      (s) => s.status === 'Recebido' || s.status === 'Recebido_Parcial' || s.status === 'Compra',
    )
    const delivered = shortages.filter(
      (s) => s.status === 'Recebido' || s.status === 'Recebido_Parcial',
    )
    const leadTimes = delivered
      .filter((s) => s.purchase_date && (s.updated || s.expected_date))
      .map((s) => {
        const endDate = s.updated ? parseISO(s.updated) : parseISO(s.expected_date!)
        const startDate = parseISO(s.purchase_date!)
        return isValid(endDate) && isValid(startDate)
          ? Math.max(0, differenceInDays(endDate, startDate))
          : 0
      })
    const avgDelivery =
      leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null
    return { purchases, delivered, avgDelivery }
  }, [shortages])

  // Filter OCs for this supplier
  const supplierOCs = useMemo(() => {
    if (!supplier) return []
    return ocs
      .filter((o) => o.supplier === supplier.name || (supplier.id && o.supplier_id === supplier.id))
      .sort((a, b) => (b.created > a.created ? 1 : -1))
  }, [ocs, supplier])

  const ocMetrics = useMemo(() => {
    const today = startOfDay(new Date())
    const received = supplierOCs.filter((o) => o.status === 'Recebida')
    const delayed = supplierOCs.filter((o) => {
      if (o.status === 'Recebida' || o.status === 'Cancelada' || !o.expected_date) return false
      const d = parseISO(o.expected_date)
      return isValid(d) && isBefore(startOfDay(d), today)
    })
    return {
      total: supplierOCs.length,
      onTime: received.length,
      delayed: delayed.length,
      received: received.length,
    }
  }, [supplierOCs])

  // Fetch items for supplier OCs
  useEffect(() => {
    if (!open || supplierOCs.length === 0) return

    let isMounted = true
    const fetchAllItems = async () => {
      setLoadingItems(true)
      try {
        const ocIds = supplierOCs.map((o) => o.id)
        const filterStr = ocIds.map((id) => `oc_id = "${id}"`).join(' || ')
        const allItems = await pb.collection('ordem_compra_itens').getFullList<OrdemCompraItem>({
          filter: filterStr,
          sort: 'created',
        })

        if (!isMounted) return

        const mapping: Record<string, OrdemCompraItem[]> = {}
        for (const it of allItems) {
          if (!mapping[it.oc_id]) {
            mapping[it.oc_id] = []
          }
          mapping[it.oc_id].push(it)
        }
        setOcItemsMap(mapping)
      } catch (err) {
        console.error('Erro ao buscar itens de OC:', err)
      } finally {
        if (isMounted) setLoadingItems(false)
      }
    }

    fetchAllItems()
    return () => {
      isMounted = false
    }
  }, [open, supplierOCs])

  // Delivery history for Tab 4
  interface DeliveryEntry {
    id: string
    title: string
    ocNumber?: string
    purchaseDate?: string
    receivedDate?: string
    daysRealized: number | null
    items: Array<{
      description: string
      quantity: number
      unitPrice?: number
      total?: number
    }>
    totalAmount: number
  }

  const deliveryHistory = useMemo<DeliveryEntry[]>(() => {
    const entries: DeliveryEntry[] = []

    // 1. From OCs that are "Recebida"
    const receivedOCs = supplierOCs.filter((o) => o.status === 'Recebida')
    for (const oc of receivedOCs) {
      const ocItems = ocItemsMap[oc.id] || []
      const purchaseD = oc.created ? parseISO(oc.created) : null
      const receiveD = oc.updated ? parseISO(oc.updated) : null
      let diffDays: number | null = null
      if (purchaseD && receiveD && isValid(purchaseD) && isValid(receiveD)) {
        diffDays = Math.max(0, differenceInDays(receiveD, purchaseD))
      }

      entries.push({
        id: `oc-${oc.id}`,
        title: `OC nº ${oc.oc_number}`,
        ocNumber: oc.oc_number,
        purchaseDate: oc.created,
        receivedDate: oc.updated,
        daysRealized: diffDays,
        items: ocItems.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unit_price,
          total: it.total ?? (it.unit_price ? it.unit_price * it.quantity : 0),
        })),
        totalAmount: Number(oc.total) || 0,
      })
    }

    // 2. From delivered shortages that aren't already linked to an OC item
    const deliveredShortages = shortages.filter(
      (s) => s.status === 'Recebido' || s.status === 'Recebido_Parcial',
    )

    const shortageIdsInOCs = new Set<string>()
    for (const items of Object.values(ocItemsMap)) {
      for (const it of items) {
        if (it.material_shortage_id) {
          shortageIdsInOCs.add(it.material_shortage_id)
        }
      }
    }

    for (const s of deliveredShortages) {
      if (shortageIdsInOCs.has(s.id)) continue

      const purchaseD = s.purchase_date ? parseISO(s.purchase_date) : parseISO(s.created)
      const receiveD = s.updated ? parseISO(s.updated) : null
      let diffDays: number | null = null
      if (isValid(purchaseD) && receiveD && isValid(receiveD)) {
        diffDays = Math.max(0, differenceInDays(receiveD, purchaseD))
      }

      const qty = Number(s.received_quantity) || Number(s.quantity) || 1
      const unitP = Number(s.unit_price) || 0
      const totalP = unitP * qty

      entries.push({
        id: `shortage-${s.id}`,
        title: s.description,
        purchaseDate: s.purchase_date || s.created,
        receivedDate: s.updated,
        daysRealized: diffDays,
        items: [
          {
            description: s.description,
            quantity: qty,
            unitPrice: unitP > 0 ? unitP : undefined,
            total: totalP > 0 ? totalP : undefined,
          },
        ],
        totalAmount: totalP,
      })
    }

    return entries
  }, [supplierOCs, ocItemsMap, shortages])

  if (!supplier) return null

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'Recebida':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[11px]">
            Recebida
          </Badge>
        )
      case 'Enviada':
        return (
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-[11px]">
            Enviada
          </Badge>
        )
      case 'Cancelada':
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-800 text-[11px]">
            Cancelada
          </Badge>
        )
      case 'Pendente':
      default:
        return (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[11px]">
            Pendente
          </Badge>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/50">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {supplier.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Painel de gestão, histórico e métricas operacionais
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs navigation & body */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <div className="px-6 border-b bg-slate-50/70 dark:bg-slate-900/40 shrink-0">
            <TabsList className="bg-transparent h-11 p-0 gap-1 w-full justify-start overflow-x-auto">
              <TabsTrigger
                value="visao-geral"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm border-b-2 data-[state=active]:border-blue-600 rounded-t-md rounded-b-none text-xs sm:text-sm px-3.5 py-2 font-medium"
              >
                <TrendingUp className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger
                value="cotacoes"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm border-b-2 data-[state=active]:border-blue-600 rounded-t-md rounded-b-none text-xs sm:text-sm px-3.5 py-2 font-medium"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
                Histórico de Cotações
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">
                  {quotations.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="compras"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm border-b-2 data-[state=active]:border-blue-600 rounded-t-md rounded-b-none text-xs sm:text-sm px-3.5 py-2 font-medium"
              >
                <ShoppingCart className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                Histórico de Compras
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">
                  {supplierOCs.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="entregas"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm border-b-2 data-[state=active]:border-blue-600 rounded-t-md rounded-b-none text-xs sm:text-sm px-3.5 py-2 font-medium"
              >
                <Truck className="w-3.5 h-3.5 mr-1.5 text-purple-600" />
                Histórico de Entregas
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">
                  {deliveryHistory.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* ABA 1: VISÃO GERAL */}
            <TabsContent value="visao-geral" className="m-0 space-y-4 focus-visible:outline-none">
              {/* Contato Compacto */}
              <div className="rounded-lg border bg-slate-50/50 dark:bg-slate-800/30 p-3.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-blue-500" />
                  Dados de Contato
                </h4>
                {supplier.contact_name ||
                supplier.email ||
                supplier.phone ||
                supplier.whatsapp ||
                supplier.address ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                    {supplier.contact_name && (
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <UserIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          <span className="text-muted-foreground">Contato:</span>{' '}
                          <strong className="font-medium">{supplier.contact_name}</strong>
                        </span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          <span className="text-muted-foreground">E-mail:</span>{' '}
                          <a
                            href={`mailto:${supplier.email}`}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {supplier.email}
                          </a>
                        </span>
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          <span className="text-muted-foreground">Telefone:</span>{' '}
                          <span className="font-medium">{supplier.phone}</span>
                        </span>
                      </div>
                    )}
                    {supplier.whatsapp && (
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">
                          <span className="text-muted-foreground">WhatsApp:</span>{' '}
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">
                            {supplier.whatsapp}
                          </span>
                        </span>
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 sm:col-span-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          <span className="text-muted-foreground">Endereço:</span>{' '}
                          {supplier.address}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Nenhum dado de contato cadastrado para este fornecedor.
                  </p>
                )}
              </div>

              {/* Performance de Ordens de Compra */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Performance de Ordens de Compra
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border p-3 text-center">
                    <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                      {ocMetrics.total}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                      Total de OCs
                    </p>
                  </div>
                  <div className="rounded-lg bg-green-50/70 dark:bg-green-950/30 border border-green-200/60 dark:border-green-800/50 p-3 text-center">
                    <CheckCircle className="w-4 h-4 mx-auto text-green-600 mb-1" />
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                      {ocMetrics.onTime}
                    </p>
                    <p className="text-[11px] text-green-700 dark:text-green-400 font-medium mt-0.5">
                      No Prazo
                    </p>
                  </div>
                  <div className="rounded-lg bg-red-50/70 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/50 p-3 text-center">
                    <AlertTriangle className="w-4 h-4 mx-auto text-red-600 mb-1" />
                    <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                      {ocMetrics.delayed}
                    </p>
                    <p className="text-[11px] text-red-700 dark:text-red-400 font-medium mt-0.5">
                      Atrasadas
                    </p>
                  </div>
                  <div className="rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/50 p-3 text-center">
                    <Truck className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                      {ocMetrics.received}
                    </p>
                    <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium mt-0.5">
                      Recebidas
                    </p>
                  </div>
                </div>
              </div>

              {/* Três Quadros de Métricas */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                  <TrendingUp className="w-4 h-4 text-slate-600" />
                  Métricas Gerais
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 border rounded-lg bg-white dark:bg-slate-900 shadow-sm text-center">
                    <TrendingUp className="w-4 h-4 mx-auto text-blue-500 mb-1" />
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {quotations.length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">Cotações</p>
                  </div>
                  <div className="p-3.5 border rounded-lg bg-white dark:bg-slate-900 shadow-sm text-center">
                    <ShoppingCart className="w-4 h-4 mx-auto text-green-500 mb-1" />
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {metrics.purchases.length}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">Compras</p>
                  </div>
                  <div className="p-3.5 border rounded-lg bg-white dark:bg-slate-900 shadow-sm text-center">
                    <Clock className="w-4 h-4 mx-auto text-orange-500 mb-1" />
                    <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {metrics.avgDelivery !== null ? `${metrics.avgDelivery.toFixed(0)}d` : '-'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">Prazo Médio</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ABA 2: HISTÓRICO DE COTAÇÕES */}
            <TabsContent value="cotacoes" className="m-0 space-y-3 focus-visible:outline-none">
              {quotations.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800">
                  <Inbox className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Nenhuma cotação registrada para este fornecedor.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cotações vinculadas ao fornecedor aparecerão aqui com preço, prazo e status.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span>Total de {quotations.length} cotação(ões) registrada(s)</span>
                    <span>{quotations.filter((q) => q.selected).length} selecionada(s)</span>
                  </div>
                  <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 border-b text-muted-foreground">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold">Data</th>
                          <th className="py-2.5 px-3 font-semibold">Preço Cotado</th>
                          <th className="py-2.5 px-3 font-semibold">Prazo de Entrega</th>
                          <th className="py-2.5 px-3 text-right font-semibold">Decisão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {quotations.map((q) => (
                          <tr
                            key={q.id}
                            className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                              q.selected ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                {format(parseISO(q.created), 'dd/MM/yyyy')}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                              {formatCurrency(q.price)}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                {q.delivery_days ? `${q.delivery_days} dias` : 'Não informado'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {q.selected ? (
                                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] gap-1 py-0.5">
                                  <CheckCircle className="w-3 h-3" /> Selecionado
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-muted-foreground"
                                >
                                  Não selecionado
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ABA 3: HISTÓRICO DE COMPRAS */}
            <TabsContent value="compras" className="m-0 space-y-3 focus-visible:outline-none">
              {loadingItems && (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  Carregando itens das ordens de compra...
                </div>
              )}

              {supplierOCs.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800">
                  <ShoppingCart className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Nenhuma compra registrada para este fornecedor.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ordens de compra emitidas para este fornecedor aparecerão aqui com itens, preços
                    e status.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {supplierOCs.map((oc) => {
                    const items = ocItemsMap[oc.id] || []
                    const itemsTotal = items.reduce(
                      (acc, it) =>
                        acc + (it.total ?? (it.unit_price ? it.unit_price * it.quantity : 0)),
                      0,
                    )
                    const displayTotal =
                      oc.total && Number(oc.total) > 0 ? Number(oc.total) : itemsTotal

                    return (
                      <div
                        key={oc.id}
                        className="rounded-lg border bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
                      >
                        {/* OC Header */}
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-blue-600" />
                              OC nº {oc.oc_number}
                            </span>
                            {getStatusBadge(oc.status)}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {format(parseISO(oc.created), 'dd/MM/yyyy')}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700">|</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                              Total OC: {formatCurrency(displayTotal)}
                            </span>
                          </div>
                        </div>

                        {/* Items list */}
                        <div className="p-3">
                          {items.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-1">
                              Nenhum item detalhado nesta ordem de compra.
                            </p>
                          ) : (
                            <div className="border rounded-md overflow-hidden">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50/70 dark:bg-slate-800/40 border-b text-[11px] text-muted-foreground">
                                  <tr>
                                    <th className="py-2 px-3 font-semibold">Item / Descrição</th>
                                    <th className="py-2 px-3 text-center font-semibold w-16">
                                      Qtd
                                    </th>
                                    <th className="py-2 px-3 text-right font-semibold w-24">
                                      Valor Unit.
                                    </th>
                                    <th className="py-2 px-3 text-right font-semibold w-24">
                                      Valor Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {items.map((it) => {
                                    const itTotal =
                                      it.total ??
                                      (it.unit_price !== undefined
                                        ? it.unit_price * it.quantity
                                        : 0)
                                    return (
                                      <tr
                                        key={it.id}
                                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                                      >
                                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200">
                                          <div className="font-medium">{it.description}</div>
                                          {it.code && (
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                              Cód: {it.code}
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-center font-medium">
                                          {it.quantity}
                                        </td>
                                        <td className="py-2 px-3 text-right text-muted-foreground">
                                          {it.unit_price !== undefined
                                            ? formatCurrency(it.unit_price)
                                            : '-'}
                                        </td>
                                        <td className="py-2 px-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                                          {formatCurrency(itTotal)}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            {/* ABA 4: HISTÓRICO DE ENTREGAS */}
            <TabsContent value="entregas" className="m-0 space-y-3 focus-visible:outline-none">
              {deliveryHistory.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800">
                  <Truck className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Nenhuma entrega registrada para este fornecedor.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Compras recebidas aparecerão aqui com data da compra, recebimento e prazo
                    realizado.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {deliveryHistory.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
                    >
                      {/* Delivery Card Header */}
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                            {d.title}
                          </span>
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 text-[10px]">
                            Recebido
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {d.daysRealized !== null && (
                            <Badge variant="outline" className="text-xs font-semibold gap-1">
                              <Clock className="w-3 h-3 text-orange-500" />
                              Prazo realizado: {d.daysRealized} dia(s)
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Dates summary */}
                      <div className="px-3 py-2 bg-slate-50/40 dark:bg-slate-800/20 border-b grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Data da Compra: </span>
                          <strong className="text-slate-800 dark:text-slate-200">
                            {d.purchaseDate ? format(parseISO(d.purchaseDate), 'dd/MM/yyyy') : '-'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Data do Recebimento: </span>
                          <strong className="text-emerald-700 dark:text-emerald-400">
                            {d.receivedDate ? format(parseISO(d.receivedDate), 'dd/MM/yyyy') : '-'}
                          </strong>
                        </div>
                        {d.totalAmount > 0 && (
                          <div className="sm:text-right">
                            <span className="text-muted-foreground">Valor Total: </span>
                            <strong className="text-slate-900 dark:text-slate-100">
                              {formatCurrency(d.totalAmount)}
                            </strong>
                          </div>
                        )}
                      </div>

                      {/* Delivery Items */}
                      <div className="p-3">
                        <div className="border rounded-md overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50/70 dark:bg-slate-800/40 border-b text-[11px] text-muted-foreground">
                              <tr>
                                <th className="py-1.5 px-3 font-semibold">Item Entregue</th>
                                <th className="py-1.5 px-3 text-center font-semibold w-16">Qtd</th>
                                <th className="py-1.5 px-3 text-right font-semibold w-24">
                                  Valor Unit.
                                </th>
                                <th className="py-1.5 px-3 text-right font-semibold w-24">
                                  Valor Total
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {d.items.map((it, idx) => (
                                <tr
                                  key={idx}
                                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                                >
                                  <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium">
                                    {it.description}
                                  </td>
                                  <td className="py-2 px-3 text-center">{it.quantity}</td>
                                  <td className="py-2 px-3 text-right text-muted-foreground">
                                    {it.unitPrice !== undefined
                                      ? formatCurrency(it.unitPrice)
                                      : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                                    {it.total !== undefined ? formatCurrency(it.total) : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
