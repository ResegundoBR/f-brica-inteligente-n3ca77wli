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
import { Inventory, MasterComponent, ComponentCategory } from '@/types'
import { getComponentCategories } from '@/services/component-categories'
import { createMasterComponent, checkDuplicateComponentCode } from '@/services/components'
import { Pencil, Lock, Sparkles, Check, Loader2, Tags } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface EditInventoryItemData {
  id?: string // inventory id ou component id se catálogo
  componentId?: string // id na coleção components
  code: string
  description: string
  category?: string | null // id da categoria de componente vinculada
  quantity?: number // somente leitura (saldo de estoque)
  min_quantity?: number
  unit?: string
  isCatalogOnly?: boolean
}

interface EditInventoryItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: EditInventoryItemData | null
  categories?: import('@/types').ComponentCategory[]
  showCreateComponentSuggestion?: boolean
  onSaved?: (updated: {
    code: string
    description: string
    min_quantity?: number
    unit: string
    category?: string | null
    inventory?: Inventory
    component?: MasterComponent
  }) => void
}

export function EditInventoryItemDialog({
  open,
  onOpenChange,
  item,
  categories: externalCategories,
  showCreateComponentSuggestion = false,
  onSaved,
}: EditInventoryItemDialogProps) {
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [minQuantity, setMinQuantity] = useState('0')
  const [unit, setUnit] = useState('un')
  const [category, setCategory] = useState<string>('__NONE__')
  const [availableCategories, setAvailableCategories] = useState<ComponentCategory[]>(
    externalCategories || [],
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingComponent, setIsCreatingComponent] = useState(false)
  const [componentCreated, setComponentCreated] = useState(false)
  const [linkedComponentId, setLinkedComponentId] = useState<string | undefined>(undefined)
  const { toast } = useToast()

  // Carregar categorias se não fornecidas externamente
  useEffect(() => {
    if (open) {
      if (externalCategories && externalCategories.length > 0) {
        setAvailableCategories(externalCategories)
      } else {
        getComponentCategories({ includeInactive: true })
          .then(setAvailableCategories)
          .catch(() => {})
      }
    }
  }, [open, externalCategories])

  // Inicializar estado ao abrir modal
  useEffect(() => {
    if (open && item) {
      setCode(item.code || '')
      setDescription(item.description || '')
      setMinQuantity(String(item.min_quantity ?? 0))
      setUnit(item.unit || 'un')
      setComponentCreated(false)
      setLinkedComponentId(item.componentId)

      // Se temos componentId, buscar dados do componente (especialmente categoria)
      if (item.componentId) {
        pb.collection('components')
          .getOne<MasterComponent>(item.componentId)
          .then((comp) => {
            if (comp.category) {
              setCategory(comp.category)
            } else {
              setCategory(item.category || '__NONE__')
            }
          })
          .catch(() => {
            setCategory(item.category || '__NONE__')
          })
      } else if (item.category) {
        setCategory(item.category)
      } else {
        // Tenta buscar componente no mestre por código ou id
        const targetId = item.id
        if (targetId && item.isCatalogOnly) {
          pb.collection('components')
            .getOne<MasterComponent>(targetId)
            .then((comp) => {
              if (comp.category) setCategory(comp.category)
              else setCategory('__NONE__')
            })
            .catch(() => setCategory('__NONE__'))
        } else if (item.code) {
          const cleanCode = item.code.trim().replace(/["'\\]/g, '')
          pb.collection('components')
            .getFullList<MasterComponent>({ filter: `code = "${cleanCode}"` })
            .then((list) => {
              if (list.length > 0) {
                setLinkedComponentId(list[0].id)
                if (list[0].category) setCategory(list[0].category)
                else setCategory('__NONE__')
              } else {
                setCategory('__NONE__')
              }
            })
            .catch(() => setCategory('__NONE__'))
        } else {
          setCategory('__NONE__')
        }
      }
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

    const selectedCat = category === '__NONE__' ? null : category

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
        const compId = linkedComponentId || item.componentId || (updatedInv as any)?.component_id
        if (compId) {
          try {
            updatedComp = await pb.collection('components').update<MasterComponent>(compId, {
              code: trimmedCode,
              description: trimmedDesc,
              min_quantity: parsedMin,
              unit: trimmedUnit,
              category: selectedCat,
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
                    min_quantity: parsedMin,
                    unit: trimmedUnit,
                    category: selectedCat,
                  })
                // Se o inventário não tinha component_id vinculado, vincula agora
                if (!(updatedInv as any)?.component_id && item.id) {
                  await pb.collection('inventory').update(item.id, {
                    component_id: matchedComps[0].id,
                  })
                }
              }
            }
          } catch (findErr) {
            console.warn('Não foi possível localizar componente mestre por código:', findErr)
          }
        }
      } else {
        // 2. Somente catálogo (sem estoque vinculado) ou edição direta no componente mestre
        const compId = linkedComponentId || item.componentId || item.id
        if (compId) {
          try {
            updatedComp = await pb.collection('components').update<MasterComponent>(compId, {
              code: trimmedCode,
              description: trimmedDesc,
              min_quantity: parsedMin,
              unit: trimmedUnit,
              category: selectedCat,
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
          category: selectedCat,
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
              className="h-9 font-mono text-xs sm:text-sm notranslate"
              translate="no"
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
              className="h-9 text-xs sm:text-sm notranslate"
              translate="no"
              disabled={isSaving}
              required
            />
          </div>

          {/* CATEGORIA DO COMPONENTE */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="edit-item-category"
                className="text-xs font-semibold flex items-center gap-1.5"
              >
                <Tags className="size-3.5 text-indigo-600" /> Categoria
              </Label>
              <span className="text-[10px] text-muted-foreground">Gravada no Cadastro Mestre</span>
            </div>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={isSaving || isCreatingComponent}
            >
              <SelectTrigger id="edit-item-category" className="h-9 text-xs">
                <SelectValue placeholder="Selecione a categoria..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__NONE__" className="text-xs text-muted-foreground">
                  Sem categoria
                </SelectItem>
                {availableCategories
                  .filter((c) => c.active !== false)
                  .map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} className="text-xs">
                      {cat.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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

            {/* Estoque Mínimo Desejado */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-item-min" className="text-xs font-semibold">
                Estoque Mínimo Desejado
              </Label>
              <Input
                id="edit-item-min"
                type="number"
                min="0"
                step="any"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                placeholder="0"
                className="h-9 text-xs sm:text-sm font-mono notranslate"
                translate="no"
                disabled={isSaving}
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

          {/* SUGESTÃO: CRIAR COMPONENTE PARA ESTE ITEM (se inventory_item não tiver component_id vinculado) */}
          {showCreateComponentSuggestion &&
            !isCatalogOnly &&
            !linkedComponentId &&
            !componentCreated && (
              <div className="bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="size-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-indigo-950 dark:text-indigo-200">
                    <strong className="block font-semibold">
                      Item sem componente mestre vinculado
                    </strong>
                    Este item de estoque existe fisicamente mas ainda não possui cadastro na coleção{' '}
                    <code className="font-mono text-[11px] bg-white dark:bg-slate-900 px-1 py-0.5 rounded border">
                      components
                    </code>
                    . Criar o componente permite definir categoria e utilizá-lo em compras/cotações.
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      const trimmedCode = code.trim()
                      const trimmedDesc = description.trim()
                      const trimmedUnit = unit.trim() || 'un'
                      const parsedMin = Math.max(0, Number(minQuantity) || 0)
                      const selectedCat = category === '__NONE__' ? null : category

                      if (!trimmedDesc) {
                        toast({
                          title: 'Descrição necessária',
                          description: 'Preencha a descrição antes de criar o componente.',
                          variant: 'destructive',
                        })
                        return
                      }

                      setIsCreatingComponent(true)
                      try {
                        // Valida duplicidade de código no mestre
                        if (trimmedCode) {
                          const check = await checkDuplicateComponentCode(trimmedCode)
                          if (check.exists && check.existingComponent) {
                            // Se já existe no mestre com o mesmo código, apenas vincula ao inv!
                            if (item.id) {
                              await pb.collection('inventory').update(item.id, {
                                component_id: check.existingComponent.id,
                              })
                              setLinkedComponentId(check.existingComponent.id)
                              setComponentCreated(true)
                              if (check.existingComponent.category) {
                                setCategory(check.existingComponent.category)
                              }
                              toast({
                                title: 'Componente vinculado',
                                description: `O item de estoque foi vinculado ao componente existente "${check.existingComponent.description}".`,
                              })
                              return
                            }
                          }
                        }

                        // Cria novo componente no mestre
                        const newComp = await createMasterComponent({
                          code: trimmedCode,
                          description: trimmedDesc,
                          unit: trimmedUnit,
                          category: selectedCat,
                          source: 'inventory',
                          active: true,
                          min_quantity: parsedMin,
                        })

                        // Vincula component_id no registro do estoque
                        if (item.id) {
                          await pb.collection('inventory').update(item.id, {
                            component_id: newComp.id,
                          })
                        }

                        setLinkedComponentId(newComp.id)
                        setComponentCreated(true)

                        toast({
                          title: 'Componente criado e vinculado',
                          description: `O componente "${trimmedDesc}" foi criado com sucesso no Cadastro Mestre e vinculado a este estoque.`,
                        })
                      } catch (createErr: any) {
                        toast({
                          title: 'Erro ao criar componente',
                          description: createErr.message || 'Não foi possível criar o componente.',
                          variant: 'destructive',
                        })
                      } finally {
                        setIsCreatingComponent(false)
                      }
                    }}
                    disabled={isCreatingComponent || isSaving}
                    className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                  >
                    {isCreatingComponent ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Criando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" /> Criar componente para este item
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

          {/* Banner de sucesso quando componente recém-criado/vinculado */}
          {componentCreated && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg p-2.5 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-200">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>
                Componente cadastrado e vinculado com sucesso na coleção{' '}
                <strong className="font-mono">components</strong>.
              </span>
            </div>
          )}

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
