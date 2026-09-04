import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CheckCircle2,
  AlertOctagon,
  Boxes,
  Loader2,
  Check,
  PackageCheck,
  PackageOpen,
  MessageSquareWarning,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  getOrderMaterials,
  updateOrderMaterialStatus,
  createOrderMaterialsBatch,
} from '@/services/pcp-order-materials'
import { createMovement } from '@/services/inventory'
import type { PcpOrder, PcpOrderMaterial, PcpOrderMaterialSector, Product } from '@/types'

const SECTORS: PcpOrderMaterialSector[] = ['FABRICAÇÃO', 'PREPARAÇÃO', 'MONTAGEM', 'EXPEDIÇÃO']

const SECTOR_HEADER_STYLES: Record<PcpOrderMaterialSector, { bg: string; text: string }> = {
  FABRICAÇÃO: {
    bg: 'bg-blue-100/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    text: 'text-blue-900 dark:text-blue-200',
  },
  PREPARAÇÃO: {
    bg: 'bg-yellow-100/70 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800',
    text: 'text-yellow-900 dark:text-yellow-200',
  },
  MONTAGEM: {
    bg: 'bg-green-100/70 dark:bg-green-950/40 border-green-200 dark:border-green-800',
    text: 'text-green-900 dark:text-green-200',
  },
  EXPEDIÇÃO: {
    bg: 'bg-purple-100/70 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
    text: 'text-purple-900 dark:text-purple-200',
  },
}

/** Lê a anotação de separação parcial gravada no campo `notes` do item. */
const getPartialInfo = (item: PcpOrderMaterial) => {
  const match = item.notes?.match(/Parcial:\s*([\d.,]+)\s+de\s+([\d.,]+)/)
  if (!match) return null
  return { found: match[1], total: match[2] }
}

interface SeparationMaterialsModalProps {
  op: PcpOrder | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onMaterialsChanged?: () => void
}

export function SeparationMaterialsModal({
  op,
  open,
  onOpenChange,
  onMaterialsChanged,
}: SeparationMaterialsModalProps) {
  const [materials, setMaterials] = useState<PcpOrderMaterial[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [partialTarget, setPartialTarget] = useState<PcpOrderMaterial | null>(null)
  const [foundQtyInput, setFoundQtyInput] = useState('')
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [sectorObservations, setSectorObservations] = useState<
    Array<{ id: string; sector: string; content: string }>
  >([])
  const { user } = useAuth()
  const { toast } = useToast()
  const isMobile = useIsMobile()

  const loadMaterials = async () => {
    if (!op) return
    setLoading(true)
    try {
      let list = await getOrderMaterials(op.id)

      // Fallback: If this OP doesn't have pcp_order_materials yet (e.g., created before or from catalog),
      // populate from product catalog composition if available
      if (list.length === 0 && op.product_id) {
        try {
          const prod = await pb.collection('products').getOne<Product>(op.product_id)
          const comp = prod.data?.composition || []
          if (comp.length > 0) {
            const initialInputs = comp.map((c) => {
              let sec: PcpOrderMaterialSector = 'FABRICAÇÃO'
              const etapa = (c.etapa || '').toUpperCase()
              if (etapa.includes('PREPAR') || etapa.includes('ACABAM')) sec = 'PREPARAÇÃO'
              else if (etapa.includes('MONTAG')) sec = 'MONTAGEM'
              else if (etapa.includes('EXPED') || etapa.includes('EMBAL')) sec = 'EXPEDIÇÃO'

              const opQty = Number(op.quantity) || 1
              const compQty = Number(c.quantity) || 1
              return {
                order_id: op.id,
                sector: sec,
                code: c.code || '',
                description: c.description,
                quantity: compQty * opQty,
                unit: 'UN',
                measurements: c.measurements || '',
                status: 'Pendente' as const,
              }
            })
            list = await createOrderMaterialsBatch(initialInputs)
          }
        } catch {
          /* intentionally ignored */
        }
      }

      setMaterials(list)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar materiais',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && op) {
      loadMaterials()
      pb.collection('pcp_order_observations')
        .getFullList<{ id: string; sector: string; content: string }>({
          filter: `order_id = "${op.id}"`,
          sort: 'created',
        })
        .then((records) => setSectorObservations(records || []))
        .catch(() => setSectorObservations([]))
    } else {
      setSectorObservations([])
    }
  }, [open, op])

  const groupedMaterials = useMemo(() => {
    const groups: Record<PcpOrderMaterialSector, PcpOrderMaterial[]> = {
      FABRICAÇÃO: [],
      PREPARAÇÃO: [],
      MONTAGEM: [],
      EXPEDIÇÃO: [],
    }

    materials.forEach((mat) => {
      const sec = mat.sector || 'FABRICAÇÃO'
      if (groups[sec]) {
        groups[sec].push(mat)
      } else {
        groups.FABRICAÇÃO.push(mat)
      }
    })

    return groups
  }, [materials])

  const stats = useMemo(() => {
    const total = materials.length
    const separated = materials.filter((m) => m.status === 'Separado').length
    const falta = materials.filter((m) => m.status === 'Falta').length
    const pendente = materials.filter((m) => m.status === 'Pendente').length
    const parcial = materials.filter((m) => getPartialInfo(m) !== null).length
    return { total, separated, falta, pendente, parcial }
  }, [materials])

  /**
   * Consolida observações da OP: tanto as observações gerais de `pcp_orders` (campos observations /
   * observation_sector) quanto as observações por setor de `pcp_order_observations` vinculadas a esta OP.
   */
  const opObservationsList = useMemo(() => {
    const list: Array<{ id: string; sector?: string; content: string }> = []

    if (op?.observations && op.observations.trim()) {
      list.push({
        id: `op-main-${op.id}`,
        sector: op.observation_sector || undefined,
        content: op.observations.trim(),
      })
    }

    sectorObservations.forEach((obs) => {
      if (obs.content && obs.content.trim()) {
        list.push({
          id: obs.id,
          sector: obs.sector,
          content: obs.content.trim(),
        })
      }
    })

    return list
  }, [op, sectorObservations])

  /** Localiza o item no estoque por código ou descrição (sem lançar erro). */
  const findInventoryItem = async (mat: PcpOrderMaterial) => {
    let inventoryItem: any = null
    if (mat.code) {
      try {
        inventoryItem = await pb
          .collection('inventory')
          .getFirstListItem(`code = "${mat.code.trim()}"`)
      } catch {
        /* intentionally ignored */
      }
    }
    if (!inventoryItem && mat.description) {
      try {
        inventoryItem = await pb
          .collection('inventory')
          .getFirstListItem(`description ~ "${mat.description.trim()}"`)
      } catch {
        /* intentionally ignored */
      }
    }
    return inventoryItem
  }

  /** Registra movimentação de saída (baixa) no estoque para a quantidade informada. */
  const registerStockExit = async (mat: PcpOrderMaterial, qty: number) => {
    const inventoryItem = await findInventoryItem(mat)
    if (!inventoryItem) return
    try {
      await createMovement({
        inventory_id: inventoryItem.id,
        quantity: qty,
        type: 'Saída',
        reason: `Separação para Pedido ${op?.order_number} / OP ${op?.op_number || '-'} (${mat.sector})`,
        order_id: op?.id,
        exit_date: new Date().toISOString(),
      })
    } catch (movErr) {
      console.warn('Inventory movement error:', movErr)
    }
  }

  /** Cria a solicitação automática em `material_shortages` (página Solicitações). */
  const createShortageRecord = async (mat: PcpOrderMaterial, qty: number, observation: string) => {
    await pb.collection('material_shortages').create({
      code: mat.code || '',
      description: mat.description,
      quantity: qty,
      order_id: op?.id,
      sector: 'Suprimentos',
      status: 'Pendente',
      request_type: 'Materiais',
      priority: 'Urgente',
      requested_by: user?.id,
      observation,
    })
  }

  const markMaterialUpdated = (updated: PcpOrderMaterial) => {
    setMaterials((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
  }

  /**
   * Action "Separado" (Green) — clique direto = separação total:
   * 1. Register inventory movement of type 'Saída' and decrement stock balance WITHOUT blocking by stock
   * 2. Mark item status as 'Separado'
   */
  const handleMarkSeparated = async (mat: PcpOrderMaterial) => {
    if (!op) return
    setActionLoadingId(mat.id)
    try {
      // 1. Baixa total no estoque
      await registerStockExit(mat, mat.quantity)

      // 2. Update status in pcp_order_materials
      const updated = await updateOrderMaterialStatus(mat.id, 'Separado', user?.id)
      markMaterialUpdated(updated)

      toast({
        title: 'Material Separado',
        description: `${mat.description} marcado como separado e baixa registrada no estoque.`,
      })
      onMaterialsChanged?.()
    } catch (err: any) {
      toast({
        title: 'Erro ao separar material',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  /** Falta TOTAL (quantidade encontrada = 0): cria solicitação com a quantidade completa. */
  const handleMarkFaltaFull = async (mat: PcpOrderMaterial) => {
    if (!op) return
    setActionLoadingId(mat.id)
    try {
      await createShortageRecord(
        mat,
        mat.quantity,
        `Falta acusada na Separação do Operador (Setor: ${mat.sector}) | Pedido: ${op.order_number} | OP: ${op.op_number || '-'}`,
      )

      const updated = await updateOrderMaterialStatus(mat.id, 'Falta')
      markMaterialUpdated(updated)

      toast({
        title: 'Falta Registrada!',
        description: `Solicitação criada automaticamente em Suprimentos para ${mat.description}.`,
      })
      onMaterialsChanged?.()
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar falta',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  /**
   * Falta PARCIAL: o operador encontrou parte da quantidade.
   * 1. Quantidade encontrada -> baixa no estoque (movimentação de saída)
   * 2. Quantidade faltante   -> solicitação automática em material_shortages
   * 3. Item da OP marcado como 'Separado' com anotação estruturada "Parcial: X de Y"
   */
  const handleConfirmPartial = async () => {
    const mat = partialTarget
    if (!mat || !op) return

    const total = Number(mat.quantity) || 0
    const found = Number(foundQtyInput.replace(',', '.'))
    const unit = mat.unit || 'UN'

    if (Number.isNaN(found) || found < 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade encontrada válida.',
        variant: 'destructive',
      })
      return
    }
    if (found > total) {
      toast({
        title: 'Quantidade acima do solicitado',
        description: `A OP pede ${total} ${unit}. A quantidade encontrada não pode ser maior.`,
        variant: 'destructive',
      })
      return
    }

    // Quantidade total encontrada -> separação total (mesma regra do botão verde)
    if (found === total) {
      setPartialTarget(null)
      await handleMarkSeparated(mat)
      return
    }

    // Nada encontrado -> falta total (mesma regra anterior do botão vermelho)
    if (found === 0) {
      setPartialTarget(null)
      await handleMarkFaltaFull(mat)
      return
    }

    const missing = total - found
    setConfirmLoading(true)
    try {
      // 1. Baixa parcial no estoque (apenas o que foi encontrado)
      await registerStockExit(mat, found)

      // 2. Solicitação automática apenas para a quantidade faltante
      await createShortageRecord(
        mat,
        missing,
        `Falta parcial na Separação do Operador (Setor: ${mat.sector}) | Encontrado: ${found} de ${total} ${unit} | Pedido: ${op.order_number} | OP: ${op.op_number || '-'}`,
      )

      // 3. Item da OP atualizado com o estado parcial
      const updated = await pb.collection('pcp_order_materials').update<PcpOrderMaterial>(mat.id, {
        status: 'Separado',
        separated_at: new Date().toISOString(),
        separated_by: user?.id,
        notes: `Parcial: ${found} de ${total} ${unit} separados. Falta: ${missing} ${unit} — solicitação criada em Suprimentos.`,
      })
      markMaterialUpdated(updated)

      toast({
        title: 'Separação parcial registrada!',
        description: `${found} ${unit} de ${mat.description} separados com baixa no estoque. Solicitação criada em Suprimentos para ${missing} ${unit}.`,
      })
      onMaterialsChanged?.()
      setPartialTarget(null)
    } catch (err: any) {
      toast({
        title: 'Erro ao registrar separação parcial',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setConfirmLoading(false)
    }
  }

  const openPartialDialog = (mat: PcpOrderMaterial) => {
    setPartialTarget(mat)
    setFoundQtyInput(String(mat.quantity))
  }

  const handleMarkAllSectorSeparated = async (sector: PcpOrderMaterialSector) => {
    const sectorMats = groupedMaterials[sector].filter((m) => m.status !== 'Separado')
    if (sectorMats.length === 0) return

    for (const mat of sectorMats) {
      await handleMarkSeparated(mat)
    }
  }

  const statusTint = (item: PcpOrderMaterial) =>
    cn(
      item.status === 'Separado' &&
        !getPartialInfo(item) &&
        'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900',
      getPartialInfo(item) &&
        'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900',
      item.status === 'Falta' &&
        'bg-red-50/40 dark:bg-red-950/20 border-red-200 dark:border-red-900',
    )

  const renderStatusBadges = (item: PcpOrderMaterial) => (
    <>
      {item.status === 'Separado' && (
        <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5">
          <Check className="size-3 mr-0.5" /> Separado
        </Badge>
      )}
      {item.status === 'Falta' && (
        <Badge variant="destructive" className="font-bold text-[10px] px-2 py-0.5">
          <AlertOctagon className="size-3 mr-0.5" /> Falta
        </Badge>
      )}
      {item.status === 'Pendente' && (
        <Badge variant="outline" className="text-slate-500 font-semibold text-[10px] px-2 py-0.5">
          Pendente
        </Badge>
      )}
      {getPartialInfo(item) && (
        <Badge className="bg-amber-500 text-white font-bold text-[10px] px-2 py-0.5">
          <PackageOpen className="size-3 mr-0.5" /> Parcial {getPartialInfo(item)!.found}/
          {getPartialInfo(item)!.total}
        </Badge>
      )}
    </>
  )

  if (!op) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100%-1.5rem)] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-2xl font-black flex items-center gap-2">
                <Boxes className="size-6 text-primary" />
                Separar Materiais da OP
              </DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Pedido: <strong>{op.order_number}</strong>{' '}
                {op.op_number ? `| OP: ${op.op_number}` : ''} | Cliente:{' '}
                <strong>{op.client_name}</strong>
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 border-emerald-300 font-bold"
              >
                {stats.separated}/{stats.total} Separados
              </Badge>
              {stats.falta > 0 && (
                <Badge
                  variant="destructive"
                  className="text-xs px-2.5 py-1 font-bold animate-pulse"
                >
                  {stats.falta} com Falta
                </Badge>
              )}
              {stats.parcial > 0 && (
                <Badge className="bg-amber-500 text-white text-xs px-2.5 py-1 font-bold">
                  {stats.parcial} Parciais
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* ---------- Bloco de destaque para Observações da OP ---------- */}
        {opObservationsList.length > 0 && (
          <div className="px-4 pt-3 pb-0 sm:px-6">
            <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/30 p-3 shadow-xs">
              <div className="flex items-start gap-2.5">
                <div className="p-1 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 shrink-0 mt-0.5">
                  <MessageSquareWarning className="size-4.5" />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                      Observações da OP
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-300 font-semibold"
                    >
                      Importante na separação
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {opObservationsList.map((obs) => (
                      <div
                        key={obs.id}
                        className="text-xs sm:text-sm text-amber-950 dark:text-amber-100 leading-relaxed break-words whitespace-pre-wrap font-medium"
                      >
                        {obs.sector && (
                          <span className="inline-block font-bold text-amber-900 dark:text-amber-300 mr-1.5 bg-amber-200/70 dark:bg-amber-900/60 px-1.5 py-0.2 rounded text-[11px] align-baseline">
                            [{obs.sector}]
                          </span>
                        )}
                        <span>{obs.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="size-8 animate-spin text-primary" />
              <span>Carregando componentes da OP...</span>
            </div>
          ) : materials.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium space-y-2">
              <Boxes className="size-10 mx-auto opacity-40" />
              <p>Nenhum componente vinculado a esta Ordem de Produção.</p>
              <p className="text-xs">
                Importe o PDF da OP na criação ou certifique-se que o produto possui catálogo
                cadastrado.
              </p>
            </div>
          ) : (
            SECTORS.map((sector) => {
              const sectorItems = groupedMaterials[sector]
              if (sectorItems.length === 0) return null
              const style = SECTOR_HEADER_STYLES[sector]
              const allSeparated = sectorItems.every((i) => i.status === 'Separado')

              return (
                <div
                  key={sector}
                  className="border rounded-xl overflow-hidden bg-card shadow-sm space-y-0"
                >
                  <div
                    className={cn(
                      'px-3 sm:px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-y-1 font-bold text-sm',
                      style.bg,
                      style.text,
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="tracking-wide uppercase font-black">{sector}</span>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0">
                        {sectorItems.length} {sectorItems.length === 1 ? 'item' : 'itens'}
                      </Badge>
                    </div>

                    {!allSeparated && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs font-semibold hover:bg-black/10 dark:hover:bg-white/10"
                        onClick={() => handleMarkAllSectorSeparated(sector)}
                      >
                        <PackageCheck className="size-3.5 mr-1 text-emerald-600" /> Marcar todos
                        Separados
                      </Button>
                    )}
                  </div>

                  {isMobile ? (
                    /* ---------- Visualização MOBILE: cards verticais, sem scroll lateral ---------- */
                    <div className="p-2 space-y-2">
                      {sectorItems.map((item) => {
                        const isActionLoading = actionLoadingId === item.id
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'rounded-xl border p-3 space-y-3 shadow-sm',
                              statusTint(item),
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="font-mono font-bold text-primary text-sm">
                                  {item.code || '—'}
                                </span>
                                <p className="font-medium text-sm leading-snug break-words text-slate-900 dark:text-slate-100">
                                  {item.description}
                                </p>
                                {item.measurements && (
                                  <span className="text-[11px] text-muted-foreground">
                                    Medida: {item.measurements}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <Badge
                                  variant="secondary"
                                  className="font-bold text-xs px-2 py-0.5"
                                >
                                  {item.quantity} {item.unit || 'UN'}
                                </Badge>
                                {renderStatusBadges(item)}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <Button
                                className={cn(
                                  'h-12 font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
                                  item.status === 'Separado' && 'opacity-60',
                                )}
                                disabled={isActionLoading || item.status === 'Separado'}
                                onClick={() => handleMarkSeparated(item)}
                              >
                                {isActionLoading ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="size-4 mr-1.5" /> Separado
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="destructive"
                                className={cn(
                                  'h-12 font-bold text-sm shadow-sm',
                                  item.status === 'Falta' && 'opacity-60',
                                )}
                                disabled={isActionLoading || item.status === 'Falta'}
                                onClick={() => openPartialDialog(item)}
                              >
                                {isActionLoading ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <>
                                    <AlertOctagon className="size-4 mr-1.5" /> Falta
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    /* ---------- Visualização DESKTOP: tabela ---------- */
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs bg-slate-50/50 dark:bg-slate-900/50">
                          <TableHead className="w-[110px]">Código</TableHead>
                          <TableHead>Descrição do Material</TableHead>
                          <TableHead className="w-[90px] text-center">Quantidade</TableHead>
                          <TableHead className="w-[100px] text-center">Status</TableHead>
                          <TableHead className="w-[200px] text-right">Ação do Operador</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sectorItems.map((item) => {
                          const isActionLoading = actionLoadingId === item.id

                          return (
                            <TableRow
                              key={item.id}
                              className={cn(
                                'text-xs transition-colors',
                                item.status === 'Separado' &&
                                  !getPartialInfo(item) &&
                                  'bg-emerald-50/30 dark:bg-emerald-950/10',
                                getPartialInfo(item) && 'bg-amber-50/40 dark:bg-amber-950/10',
                                item.status === 'Falta' && 'bg-red-50/40 dark:bg-red-950/20',
                              )}
                            >
                              <TableCell className="font-mono font-bold text-primary">
                                {item.code || '—'}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                                  {item.description}
                                </div>
                                {item.measurements && (
                                  <span className="text-[11px] text-muted-foreground">
                                    Medida: {item.measurements}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-bold text-sm">
                                {item.quantity} {item.unit || 'UN'}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex flex-col items-center gap-1">
                                  {renderStatusBadges(item)}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    className={cn(
                                      'h-8 px-3 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
                                      item.status === 'Separado' && 'opacity-60',
                                    )}
                                    disabled={isActionLoading || item.status === 'Separado'}
                                    onClick={() => handleMarkSeparated(item)}
                                  >
                                    {isActionLoading ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <>
                                        <CheckCircle2 className="size-3.5 mr-1" /> Separado
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className={cn(
                                      'h-8 px-3 font-bold text-xs shadow-sm',
                                      item.status === 'Falta' && 'opacity-60',
                                    )}
                                    disabled={isActionLoading || item.status === 'Falta'}
                                    onClick={() => openPartialDialog(item)}
                                  >
                                    {isActionLoading ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <>
                                        <AlertOctagon className="size-3.5 mr-1" /> Falta
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ---------- Modal de quantidade para Falta (total ou parcial) ---------- */}
        <Dialog
          open={!!partialTarget}
          onOpenChange={(o) => {
            if (!o && !confirmLoading) setPartialTarget(null)
          }}
        >
          <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <AlertOctagon className="size-5 text-red-600" />
                Registrar Falta
              </DialogTitle>
              <DialogDescription>
                Informe a quantidade encontrada no estoque. O que faltar será automaticamente
                solicitado em Suprimentos.
              </DialogDescription>
            </DialogHeader>

            {partialTarget && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-slate-50/70 dark:bg-slate-900/70 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-primary">
                      {partialTarget.code || '—'}
                    </span>
                    <Badge variant="secondary" className="font-bold">
                      Pedido: {partialTarget.quantity} {partialTarget.unit || 'UN'}
                    </Badge>
                  </div>
                  <p className="font-medium leading-snug break-words">
                    {partialTarget.description}
                  </p>
                  {partialTarget.measurements && (
                    <p className="text-[11px] text-muted-foreground">
                      Medida: {partialTarget.measurements}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="found-qty-input"
                    className="text-sm font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Quantidade encontrada
                  </label>
                  <Input
                    id="found-qty-input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={partialTarget.quantity}
                    step="any"
                    value={foundQtyInput}
                    onChange={(e) => setFoundQtyInput(e.target.value)}
                    autoFocus
                  />
                  {(() => {
                    const total = Number(partialTarget.quantity) || 0
                    const found = Number(foundQtyInput.replace(',', '.'))
                    if (Number.isNaN(found) || found < 0) return null
                    if (found > total)
                      return (
                        <p className="text-xs font-semibold text-red-600">
                          Não pode exceder a quantidade solicitada ({total}{' '}
                          {partialTarget.unit || 'UN'}).
                        </p>
                      )
                    if (found === total)
                      return (
                        <p className="text-xs font-semibold text-emerald-600">
                          Separação total: será dada baixa no estoque em {total}{' '}
                          {partialTarget.unit || 'UN'}.
                        </p>
                      )
                    if (found === 0)
                      return (
                        <p className="text-xs font-semibold text-red-600">
                          Falta total: será criada solicitação em Suprimentos para {total}{' '}
                          {partialTarget.unit || 'UN'}.
                        </p>
                      )
                    return (
                      <p className="text-xs font-semibold text-amber-600">
                        Separação parcial: {found} {partialTarget.unit || 'UN'} com baixa no estoque
                        + solicitação em Suprimentos para {total - found}{' '}
                        {partialTarget.unit || 'UN'}.
                      </p>
                    )
                  })()}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    disabled={confirmLoading}
                    onClick={() => setPartialTarget(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="font-bold"
                    disabled={confirmLoading}
                    onClick={handleConfirmPartial}
                  >
                    {confirmLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="size-4 mr-1.5" /> Confirmar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
