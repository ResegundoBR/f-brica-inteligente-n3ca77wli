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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CheckCircle2, AlertOctagon, Boxes, Loader2, Check, PackageCheck, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
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
  const { user } = useAuth()
  const { toast } = useToast()

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
    return { total, separated, falta, pendente }
  }, [materials])

  /**
   * Action "Separado" (Green):
   * 1. Register inventory movement of type 'Saída' and decrement stock balance WITHOUT blocking by stock
   * 2. Mark item status as 'Separado'
   */
  const handleMarkSeparated = async (mat: PcpOrderMaterial) => {
    if (!op) return
    setActionLoadingId(mat.id)
    try {
      // 1. Check or find item in inventory by code or description
      let inventoryItem = null
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

      // If item exists in inventory, create movement of exit (Saída)
      if (inventoryItem) {
        try {
          await createMovement({
            inventory_id: inventoryItem.id,
            quantity: mat.quantity,
            type: 'Saída',
            reason: `Separação para Pedido ${op.order_number} / OP ${op.op_number || '-'} (${mat.sector})`,
            order_id: op.id,
            exit_date: new Date().toISOString(),
          })
        } catch (movErr) {
          console.warn('Inventory movement error:', movErr)
        }
      }

      // 2. Update status in pcp_order_materials
      const updated = await updateOrderMaterialStatus(mat.id, 'Separado', user?.id)
      setMaterials((prev) => prev.map((m) => (m.id === mat.id ? updated : m)))

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

  /**
   * Action "Falta" (Red):
   * Manual operator decision when physical stock is smaller than requested.
   * 1. Automatically create request in material_shortages ('Solicitações')
   *    with product code, quantity, description, OP number and Pedido number.
   * 2. Mark item as 'Falta'
   */
  const handleMarkFalta = async (mat: PcpOrderMaterial) => {
    if (!op) return
    setActionLoadingId(mat.id)
    try {
      // 1. Create automatic shortage request in 'material_shortages'
      await pb.collection('material_shortages').create({
        code: mat.code || '',
        description: mat.description,
        quantity: mat.quantity,
        order_id: op.id,
        sector: 'Suprimentos',
        status: 'Pendente',
        request_type: 'Materiais',
        priority: 'Urgente',
        requested_by: user?.id,
        observation: `Falta acusada na Separação do Operador (Setor: ${mat.sector}) | Pedido: ${op.order_number} | OP: ${op.op_number || '-'}`,
      })

      // 2. Update status in pcp_order_materials
      const updated = await updateOrderMaterialStatus(mat.id, 'Falta')
      setMaterials((prev) => prev.map((m) => (m.id === mat.id ? updated : m)))

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

  const handleMarkAllSectorSeparated = async (sector: PcpOrderMaterialSector) => {
    const sectorMats = groupedMaterials[sector].filter((m) => m.status !== 'Separado')
    if (sectorMats.length === 0) return

    for (const mat of sectorMats) {
      await handleMarkSeparated(mat)
    }
  }

  if (!op) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
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
            <div className="flex items-center gap-2">
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
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                      'px-4 py-2.5 border-b flex items-center justify-between font-bold text-sm',
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
                                'bg-emerald-50/30 dark:bg-emerald-950/10',
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
                              {item.status === 'Separado' && (
                                <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5">
                                  <Check className="size-3 mr-0.5" /> Separado
                                </Badge>
                              )}
                              {item.status === 'Falta' && (
                                <Badge
                                  variant="destructive"
                                  className="font-bold text-[10px] px-2 py-0.5"
                                >
                                  <AlertOctagon className="size-3 mr-0.5" /> Falta
                                </Badge>
                              )}
                              {item.status === 'Pendente' && (
                                <Badge
                                  variant="outline"
                                  className="text-slate-500 font-semibold text-[10px] px-2 py-0.5"
                                >
                                  Pendente
                                </Badge>
                              )}
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
                                  onClick={() => handleMarkFalta(item)}
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
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
