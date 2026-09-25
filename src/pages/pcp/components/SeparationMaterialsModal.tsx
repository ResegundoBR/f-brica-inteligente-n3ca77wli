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
import { NoTranslate } from '@/components/NoTranslate'
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
  ArrowLeftRight,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { UserActionBadge } from '@/components/UserActionBadge'
import { useAuth } from '@/hooks/use-auth'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  getOrderMaterials,
  updateOrderMaterialStatus,
  createOrderMaterialsBatch,
} from '@/services/pcp-order-materials'
import { upsertMaterialShortage } from '@/services/material-shortages'
import { createMovement } from '@/services/inventory'
import {
  searchUnifiedComponentsWithStock,
  UnifiedComponentSearchResult,
} from '@/services/components'
import { logSeparationAction } from '@/services/pcp-separation-audit'
import { Label } from '@/components/ui/label'
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

  // Estado para Troca / Substituição na OP individual
  const [swapTarget, setSwapTarget] = useState<PcpOrderMaterial | null>(null)
  const [swapSearchTerm, setSwapSearchTerm] = useState('')
  const [swapSearching, setSwapSearching] = useState(false)
  const [swapResults, setSwapResults] = useState<UnifiedComponentSearchResult[]>([])
  const [selectedSubstitute, setSelectedSubstitute] = useState<UnifiedComponentSearchResult | null>(
    null,
  )
  const [substituteQtyInput, setSubstituteQtyInput] = useState('')
  const [swapSaving, setSwapSaving] = useState(false)

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

  /** Cria ou atualiza a solicitação com trava anti-duplicidade em `material_shortages`. */
  const createShortageRecord = async (mat: PcpOrderMaterial, qty: number, observation: string) => {
    await upsertMaterialShortage(
      {
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
      },
      user?.name || user?.email || 'Operador',
    )
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

    // Requisito 1: "Tem em estoque agora" pré-preenchido com o total.
    // "ao confirmar sem alterar vira falta total... se quantidade = 0 tratar como falta total de hoje"
    const isTotalShortage = found === 0 || found === total

    if (isTotalShortage) {
      setPartialTarget(null)
      await handleMarkFaltaFull(mat)
      return
    }

    const missing = Number((total - found).toFixed(4))
    setConfirmLoading(true)
    try {
      // 1. Baixa parcial no estoque (apenas o que foi encontrado)
      await registerStockExit(mat, found)

      // 2. Solicitação automática apenas para a quantidade faltante
      await createShortageRecord(
        mat,
        missing,
        `Falta parcial na Separação do Operador (Setor: ${mat.sector}) | Separado: ${found} de ${total} ${unit} | Faltam: ${missing} ${unit} | Pedido: ${op.order_number} | OP: ${op.op_number || '-'}`,
      )

      // 3. Item da OP atualizado com o estado parcial
      const updated = await pb.collection('pcp_order_materials').update<PcpOrderMaterial>(mat.id, {
        status: 'Separado',
        separated_at: new Date().toISOString(),
        separated_by: user?.id,
        notes: `Parcial: ${found} de ${total} ${unit} separados. Falta: ${missing} ${unit} — solicitação criada em Suprimentos.`,
      })
      markMaterialUpdated(updated)

      // 4. Auditoria pcp_order_logs
      try {
        await logSeparationAction({
          orderIds: [op.id],
          opNumbers: op.op_number ? [String(op.op_number)] : [],
          action: 'Separação - Falta Parcial',
          itemOriginal: {
            code: mat.code || '',
            description: mat.description,
            quantityRequested: total,
            unit: mat.unit,
            cutMeasurement: mat.measurements,
          },
          separatedQuantity: found,
          shortageQuantity: missing,
          operatorName: user?.name || user?.email,
          notes: `Setor: ${mat.sector}. Separado: ${found} ${unit}, Faltante enviado a Suprimentos: ${missing} ${unit}.`,
        })
      } catch (logErr) {
        console.error('Erro ao auditar falta parcial individual:', logErr)
      }

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

  // Abertura do diálogo de Troca na OP
  const openSwapDialog = (mat: PcpOrderMaterial) => {
    setSwapTarget(mat)
    setSwapSearchTerm('')
    setSwapResults([])
    setSelectedSubstitute(null)
    setSubstituteQtyInput(String(mat.quantity))
  }

  const handleSearchSubstitutes = async (term: string) => {
    setSwapSearchTerm(term)
    if (!term.trim() || term.trim().length < 2) {
      setSwapResults([])
      return
    }
    setSwapSearching(true)
    try {
      const results = await searchUnifiedComponentsWithStock(term, 25)
      setSwapResults(results)
    } catch (err) {
      console.error('Erro ao buscar substituto:', err)
      toast({
        title: 'Erro na busca',
        description: 'Não foi possível buscar componentes.',
        variant: 'destructive',
      })
    } finally {
      setSwapSearching(false)
    }
  }

  const handleConfirmSubstitution = async () => {
    if (!swapTarget || !selectedSubstitute || !op) return
    const substituteQty = Number(substituteQtyInput.replace(',', '.'))
    if (isNaN(substituteQty) || substituteQty <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade válida para o substituto.',
        variant: 'destructive',
      })
      return
    }

    setSwapSaving(true)
    try {
      const origCode = swapTarget.code || 's/ código'
      const origDesc = swapTarget.description
      const origQty = swapTarget.quantity
      const subCode = selectedSubstitute.code || 's/ código'
      const subDesc = selectedSubstitute.description
      const subUnit = selectedSubstitute.unit || swapTarget.unit || 'UN'

      // 1. Marca o item ORIGINAL como substituído (NÃO gera falta)
      const updatedOriginal = await pb
        .collection('pcp_order_materials')
        .update<PcpOrderMaterial>(swapTarget.id, {
          status: 'Separado', // liberado sem gerar falta
          notes: `Substituído por [${subCode}] ${subDesc}. Sem solicitação de compra.`,
        })
      markMaterialUpdated(updatedOriginal)

      // 2. Cria o novo item substituto em pcp_order_materials para esta OP
      const newMaterialRecord = await pb
        .collection('pcp_order_materials')
        .create<PcpOrderMaterial>({
          order_id: op.id,
          sector: swapTarget.sector || 'FABRICAÇÃO',
          code: subCode,
          description: `[Substituto de ${origCode}] ${subDesc}`,
          quantity: substituteQty,
          unit: subUnit,
          status: 'Pendente',
          notes: `Substituto oficial de [${origCode}] ${origDesc}`,
        })
      setMaterials((prev) => [...prev, newMaterialRecord])

      // 3. Auditoria pcp_order_logs
      try {
        await logSeparationAction({
          orderIds: [op.id],
          opNumbers: op.op_number ? [String(op.op_number)] : [],
          action: 'Separação - Substituição de Componente',
          itemOriginal: {
            code: origCode,
            description: origDesc,
            quantityRequested: origQty,
            unit: swapTarget.unit,
            cutMeasurement: swapTarget.measurements,
          },
          substitute: {
            code: subCode,
            description: subDesc,
            quantity: substituteQty,
            unit: subUnit,
          },
          operatorName: user?.name || user?.email,
          notes: `Substituição na OP ${op.op_number || op.order_number}: ${origDesc} substituído por [${subCode}] ${subDesc}. O item substituto foi inserido para conferência física normal.`,
        })
      } catch (logErr) {
        console.error('Erro ao auditar substituição de componente:', logErr)
      }

      toast({
        title: 'Componente Substituído!',
        description: `Substituto [${subCode}] adicionado à OP para conferência. Original marcado como substituído.`,
      })
      onMaterialsChanged?.()
      setSwapTarget(null)
      setSelectedSubstitute(null)
    } catch (err: any) {
      toast({
        title: 'Erro ao substituir componente',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSwapSaving(false)
    }
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
        <div className="flex flex-col items-center gap-0.5">
          <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5">
            <Check className="size-3 mr-0.5" /> Separado
          </Badge>
          <UserActionBadge
            user={item.expand?.separated_by}
            date={item.separated_at}
            prefix="Separado por"
            showTime={true}
            compact={true}
          />
        </div>
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
                                <NoTranslate
                                  as="span"
                                  className="font-mono font-bold text-primary text-sm"
                                >
                                  {item.code || '—'}
                                </NoTranslate>
                                <NoTranslate
                                  as="p"
                                  className="font-medium text-sm leading-snug break-words text-slate-900 dark:text-slate-100"
                                >
                                  {item.description}
                                </NoTranslate>
                                {item.measurements && (
                                  <span className="text-[11px] text-muted-foreground">
                                    Medida: <NoTranslate as="span">{item.measurements}</NoTranslate>
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <NoTranslate
                                  as={Badge as any}
                                  variant="secondary"
                                  className="font-bold text-xs px-2 py-0.5"
                                >
                                  {item.quantity} {item.unit || 'UN'}
                                </NoTranslate>
                                {renderStatusBadges(item)}
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 pt-1">
                              <Button
                                className={cn(
                                  'h-11 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
                                  item.status === 'Separado' && 'opacity-60',
                                )}
                                disabled={isActionLoading || item.status === 'Separado'}
                                onClick={() => handleMarkSeparated(item)}
                              >
                                {isActionLoading ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="size-3.5 mr-1" /> Separado
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="destructive"
                                className={cn(
                                  'h-11 font-bold text-xs shadow-sm',
                                  item.status === 'Falta' && 'opacity-60',
                                )}
                                disabled={isActionLoading || item.status === 'Falta'}
                                onClick={() => openPartialDialog(item)}
                              >
                                {isActionLoading ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <AlertOctagon className="size-3.5 mr-1" /> Falta
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                className="h-11 font-bold text-xs border-blue-500/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 shadow-sm"
                                disabled={isActionLoading || item.status === 'Separado'}
                                onClick={() => openSwapDialog(item)}
                              >
                                <ArrowLeftRight className="size-3.5 mr-1" /> Troca
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
                                <NoTranslate as="span">{item.code || '—'}</NoTranslate>
                              </TableCell>
                              <TableCell>
                                <NoTranslate
                                  as="div"
                                  className="font-medium text-slate-900 dark:text-slate-100 text-sm"
                                >
                                  {item.description}
                                </NoTranslate>
                                {item.measurements && (
                                  <span className="text-[11px] text-muted-foreground">
                                    Medida: <NoTranslate as="span">{item.measurements}</NoTranslate>
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-bold text-sm">
                                <NoTranslate as="span">
                                  {item.quantity} {item.unit || 'UN'}
                                </NoTranslate>
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
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 font-bold text-xs border-blue-500/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                    disabled={isActionLoading || item.status === 'Separado'}
                                    onClick={() => openSwapDialog(item)}
                                  >
                                    <ArrowLeftRight className="size-3.5 mr-1" /> Troca
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
          <DialogContent className="max-w-md w-[calc(100%-2rem)]">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <AlertOctagon className="size-5 text-red-600" />
                Registrar Falta de Material
              </DialogTitle>
              <DialogDescription>
                Confirme a quantidade disponível agora no estoque para este item.
              </DialogDescription>
            </DialogHeader>

            {partialTarget && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-slate-50/70 dark:bg-slate-900/70 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground font-medium">Código:</span>
                    <NoTranslate as="span" className="font-mono font-bold text-primary">
                      {partialTarget.code || '—'}
                    </NoTranslate>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Descrição:</span>
                    <NoTranslate
                      as="p"
                      className="font-semibold text-foreground text-xs mt-0.5 leading-snug break-words"
                    >
                      {partialTarget.description}
                    </NoTranslate>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-medium">Unidade:</span>
                    <span className="font-mono font-semibold">{partialTarget.unit || 'UN'}</span>
                  </div>
                  {partialTarget.measurements && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-medium">Medida de corte:</span>
                      <NoTranslate
                        as={Badge as any}
                        variant="secondary"
                        className="font-mono text-[10px]"
                      >
                        {partialTarget.measurements}
                      </NoTranslate>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="text-muted-foreground font-bold">
                      Quantidade solicitada total:
                    </span>
                    <span className="font-bold text-sm text-foreground">
                      {partialTarget.quantity} {partialTarget.unit || 'UN'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="found-qty-input"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between"
                  >
                    <span>Tem em estoque agora ({partialTarget.unit || 'UN'}):</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      0 ≤ quantidade ≤ {partialTarget.quantity}
                    </span>
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
                  <p className="text-[11px] text-muted-foreground">
                    • Se mantiver <strong>{partialTarget.quantity}</strong> (sem alterar) ou colocar{' '}
                    <strong>0</strong>: vira <strong>Falta Total</strong>.
                    <br />• Se colocar um valor menor: separa a quantidade informada e gera
                    solicitação em Suprimentos apenas pela diferença.
                  </p>

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
                    if (found === total || found === 0)
                      return (
                        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-xs">
                          <strong>Resultado: Falta Total.</strong> Solicitação de {total}{' '}
                          {partialTarget.unit || 'UN'} será enviada a Suprimentos.
                        </div>
                      )
                    return (
                      <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs space-y-0.5">
                        <div>
                          <strong>Resultado: Falta Parcial.</strong>
                        </div>
                        <div>
                          • Separar agora com baixa:{' '}
                          <strong>
                            {found} {partialTarget.unit || 'UN'}
                          </strong>
                        </div>
                        <div>
                          • Solicitação de compra para Suprimentos:{' '}
                          <strong>
                            {Number((total - found).toFixed(4))} {partialTarget.unit || 'UN'}
                          </strong>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={confirmLoading}
                    onClick={() => setPartialTarget(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="font-bold bg-rose-600 hover:bg-rose-700 text-white"
                    disabled={confirmLoading}
                    onClick={handleConfirmPartial}
                  >
                    {confirmLoading ? (
                      <Loader2 className="size-3.5 animate-spin mr-1" />
                    ) : (
                      'Confirmar Falta'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ---------- Modal de Troca / Substituição de Componente na OP ---------- */}
        <Dialog
          open={!!swapTarget}
          onOpenChange={(o) => {
            if (!o && !swapSaving) setSwapTarget(null)
          }}
        >
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center gap-2 text-blue-600">
                <ArrowLeftRight className="size-5" />
                <DialogTitle className="text-lg font-black">Substituir Componente</DialogTitle>
              </div>
              <DialogDescription className="text-xs">
                Selecione um componente substituto no cadastro oficial para esta OP.
              </DialogDescription>
            </DialogHeader>

            {swapTarget && (
              <div className="space-y-3 py-1 text-xs overflow-y-auto pr-1 flex-1">
                {/* Item Original */}
                <div className="p-2.5 rounded-lg bg-muted/60 border space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">
                    Item Original:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <NoTranslate as="span" className="font-mono font-bold text-foreground">
                      [{swapTarget.code || 's/ código'}]
                    </NoTranslate>
                    <NoTranslate as="span" className="text-foreground">
                      {swapTarget.description}
                    </NoTranslate>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Solicitado:{' '}
                    <strong>
                      {swapTarget.quantity} {swapTarget.unit || 'UN'}
                    </strong>
                    {swapTarget.measurements ? ` · Medida: ${swapTarget.measurements}` : ''}
                  </div>
                  <div className="text-[10px] text-amber-600 font-medium">
                    ℹ️ O item original ficará marcado como substituído e NÃO gerará solicitação de
                    compra.
                  </div>
                </div>

                {/* Busca no cadastro */}
                <div className="space-y-1.5">
                  <Label htmlFor="searchSubModal" className="text-xs font-semibold">
                    Buscar Substituto no Cadastro Oficial:
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      id="searchSubModal"
                      type="text"
                      value={swapSearchTerm}
                      onChange={(e) => handleSearchSubstitutes(e.target.value)}
                      placeholder="Digite código ou descrição (mínimo 2 letras)..."
                      className="pl-8 text-xs h-9"
                      autoFocus
                    />
                    {swapSearching && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Lista de resultados */}
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-1 bg-background">
                  {swapResults.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-xs">
                      {swapSearchTerm.trim().length < 2
                        ? 'Digite pelo menos 2 caracteres para buscar no cadastro oficial.'
                        : 'Nenhum componente encontrado no cadastro com esse termo.'}
                    </div>
                  ) : (
                    swapResults.map((comp) => {
                      const isSelected = selectedSubstitute?.id === comp.id
                      return (
                        <div
                          key={comp.id}
                          onClick={() => setSelectedSubstitute(comp)}
                          className={`p-2 rounded cursor-pointer transition-colors text-xs flex items-center justify-between gap-2 border ${
                            isSelected
                              ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-blue-200'
                              : 'hover:bg-muted border-transparent'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <NoTranslate as="span" className="font-mono font-bold">
                                {comp.code}
                              </NoTranslate>
                              <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">
                                {comp.unit || 'UN'}
                              </Badge>
                            </div>
                            <NoTranslate
                              as="div"
                              className="truncate text-foreground font-medium text-[11px] mt-0.5"
                            >
                              {comp.description}
                            </NoTranslate>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] text-muted-foreground block">Estoque</span>
                            <span className="font-mono font-bold text-xs text-foreground">
                              {comp.stock_quantity ?? 0}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Substituto selecionado */}
                {selectedSubstitute && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-blue-900 dark:text-blue-300">
                        Substituto Selecionado:
                      </span>
                      <Badge className="bg-blue-600 text-white text-[10px]">Confirmado</Badge>
                    </div>
                    <div>
                      <NoTranslate as="span" className="font-mono font-bold text-xs">
                        [{selectedSubstitute.code}]
                      </NoTranslate>{' '}
                      <NoTranslate as="span" className="text-xs">
                        {selectedSubstitute.description}
                      </NoTranslate>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Estoque cadastrado disponível:</span>
                      <span className="font-mono font-bold text-foreground">
                        {selectedSubstitute.stock_quantity ?? 0} {selectedSubstitute.unit || 'UN'}
                      </span>
                    </div>

                    <div className="pt-1 space-y-1">
                      <Label htmlFor="subQtyModal" className="text-xs font-semibold">
                        Quantidade a separar do substituto (
                        {selectedSubstitute.unit || swapTarget.unit || 'UN'}):
                      </Label>
                      <Input
                        id="subQtyModal"
                        type="number"
                        step="any"
                        min="0.001"
                        value={substituteQtyInput}
                        onChange={(e) => setSubstituteQtyInput(e.target.value)}
                        className="font-mono text-xs h-8 bg-background"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={swapSaving}
                    onClick={() => setSwapTarget(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
                    disabled={swapSaving || !selectedSubstitute}
                    onClick={handleConfirmSubstitution}
                  >
                    {swapSaving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <>
                        <ArrowLeftRight className="size-4" />
                        Confirmar Substituição
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
