import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { updateInventoryItem } from '@/services/inventory'
import { Inventory, MasterComponent } from '@/types'
import { Pencil, Lock } from 'lucide-react'

export interface EditInventoryItemData {
  id?: string // inventory id ou component id se catálogo
  componentId?: string // id na coleção components
  code: string
  description: string
  quantity?: number // somente leitura (saldo de estoque)
  min_quantity?: number
  unit?: string
  isCatalogOnly?: boolean
}

interface EditInventoryItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: EditInventoryItemData | null
  onSaved?: (updated: {
    code: string
    description: string
    min_quantity?: number
    unit: string
    inventory?: Inventory
    component?: MasterComponent
  }) => void
}

export function EditInventoryItemDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: EditInventoryItemDialogProps) {
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [minQuantity, setMinQuantity] = useState('0')
  const [unit, setUnit] = useState('un')
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && item) {
      setCode(item.code || '')
      setDescription(item.description || '')
      setMinQuantity(String(item.min_quantity ?? 0))
      setUnit(item.unit || 'un')
    }
  }, [open, item])

  if (!item) return null

  const isCatalogOnly = !!item.isCatalogOnly

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedCode = code.trim()
    const trimmedDesc = description.trim()
    const parsedMin = Math.max(0, Number(minQuantity) || 0)
    const trimmedUnit = unit.trim() || 'un'

    if (!trimmedDesc) {
      toast({
        title: 'Descrição obrigatória',
        description: 'Informe a descrição do produto para salvar.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)

    try {
      let updatedInv: Inventory | undefined
      let updatedComp: MasterComponent | undefined

      // 1. Se tem ID de inventário (ou não é somente catálogo com id)
      if (!isCatalogOnly && item.id) {
        // Atualiza no estoque
        try {
          updatedInv = (await updateInventoryItem(item.id, {
            code: trimmedCode,
            description: trimmedDesc,
            min_quantity: parsedMin,
            unit: trimmedUnit,
          })) as unknown as Inventory
        } catch (invErr: any) {
          console.error('Erro ao atualizar inventory:', invErr)
          throw new Error(invErr?.message || 'Falha ao atualizar dados no estoque.')
        }

        // Tentar sincronizar o componente do mestre correspondente
        const compId = item.componentId || (updatedInv as any)?.component_id
        if (compId) {
          try {
            updatedComp = await pb.collection('components').update<MasterComponent>(compId, {
              code: trimmedCode,
              description: trimmedDesc,
              unit: trimmedUnit,
            })
          } catch (compErr) {
            console.warn('Falha ao sincronizar componente do mestre vinculado:', compErr)
          }
        } else {
          // Tentar encontrar por código antigo ou descrição
          try {
            const oldCode = item.code?.trim()
            if (oldCode) {
              const matchedComps = await pb.collection('components').getFullList<MasterComponent>({
                filter: `code = "${oldCode.replace(/["'\\]/g, '')}"`,
              })
              if (matchedComps.length > 0) {
                updatedComp = await pb
                  .collection('components')
                  .update<MasterComponent>(matchedComps[0].id, {
                    code: trimmedCode,
                    description: trimmedDesc,
                    unit: trimmedUnit,
                  })
              }
            }
          } catch (findErr) {
            console.warn('Não foi possível localizar componente mestre por código:', findErr)
          }
        }
      } else {
        // 2. Somente catálogo (sem estoque vinculado)
        const compId = item.componentId || item.id
        if (compId) {
          try {
            updatedComp = await pb.collection('components').update<MasterComponent>(compId, {
              code: trimmedCode,
              description: trimmedDesc,
              unit: trimmedUnit,
            })
          } catch (compErr: any) {
            console.error('Erro ao atualizar componente catálogo:', compErr)
            throw new Error(compErr?.message || 'Falha ao atualizar dados do componente.')
          }
        }
      }

      toast({
        title: 'Item atualizado com sucesso',
        description: `As alterações em "${trimmedDesc}" foram salvas.`,
      })

      if (onSaved) {
        onSaved({
          code: trimmedCode,
          description: trimmedDesc,
          min_quantity: parsedMin,
          unit: trimmedUnit,
          inventory: updatedInv,
          component: updatedComp,
        })
      }

      onOpenChange(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Ocorreu um erro ao tentar salvar as alterações.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Pencil className="size-4 text-blue-600" /> Editar Item
          </DialogTitle>
          <DialogDescription className="text-xs">
            Altere os dados cadastrais do item. O saldo de estoque permanece inalterado para manter
            a auditoria e histórico de movimentações.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          {/* Código do item */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-item-code" className="text-xs font-semibold">
              Código
            </Label>
            <Input
              id="edit-item-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex: 05100188"
              className="h-9 font-mono text-xs sm:text-sm"
              disabled={isSaving}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-item-desc" className="text-xs font-semibold">
              Descrição <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-item-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição completa do material"
              className="h-9 text-xs sm:text-sm"
              disabled={isSaving}
              required
            />
          </div>

          {/* Saldo Atual (Apenas Leitura) + Estoque Mínimo + Unidade */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            {/* Saldo Atual (SOMENTE LEITURA) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  Saldo Atual <Lock className="size-3 text-slate-400" />
                </Label>
              </div>
              <div className="h-9 px-3 py-1.5 bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-md flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 select-none">
                <span>{item.quantity ?? 0}</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {item.unit || 'un'}
                </span>
              </div>
            </div>

            {/* Estoque Mínimo */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-item-min" className="text-xs font-semibold">
                Estoque Mín.
              </Label>
              <Input
                id="edit-item-min"
                type="number"
                min="0"
                step="1"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                className="h-9 text-xs sm:text-sm"
                disabled={isSaving || isCatalogOnly}
                title={
                  isCatalogOnly ? 'Item somente catálogo não possui estoque mínimo' : undefined
                }
              />
            </div>

            {/* Unidade */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-item-unit" className="text-xs font-semibold">
                Unidade
              </Label>
              <Input
                id="edit-item-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="un, kg, m..."
                className="h-9 text-xs sm:text-sm uppercase"
                disabled={isSaving}
              />
            </div>
          </div>

          {isCatalogOnly && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-md p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
              <span className="font-semibold block mb-0.5">Item Somente Catálogo</span>
              As alterações serão gravadas diretamente no cadastro mestre de componentes.
            </div>
          )}

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isSaving}
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
