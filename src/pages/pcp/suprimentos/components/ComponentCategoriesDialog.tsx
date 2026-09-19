import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { ComponentCategory } from '@/types'
import {
  createComponentCategory,
  updateComponentCategory,
  toggleComponentCategoryActive,
} from '@/services/component-categories'
import { Tags, Plus, Edit2, Check, X, Power, PowerOff, Loader2 } from 'lucide-react'

interface ComponentCategoriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: ComponentCategory[]
  onCategoriesChanged: () => void
}

export function ComponentCategoriesDialog({
  open,
  onOpenChange,
  categories,
  onCategoriesChanged,
}: ComponentCategoriesDialogProps) {
  const { toast } = useToast()
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newCategoryName.trim()
    if (!trimmed) return

    setIsCreating(true)
    try {
      await createComponentCategory(trimmed)
      toast({
        title: 'Categoria criada com sucesso',
        description: `A categoria "${trimmed}" agora está disponível.`,
      })
      setNewCategoryName('')
      onCategoriesChanged()
    } catch (err: any) {
      toast({
        title: 'Erro ao criar categoria',
        description: err.message || 'Não foi possível cadastrar a categoria.',
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleStartEdit = (cat: ComponentCategory) => {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleSaveEdit = async (id: string) => {
    const trimmed = editingName.trim()
    if (!trimmed) {
      toast({
        title: 'Nome inválido',
        description: 'O nome da categoria não pode ficar vazio.',
        variant: 'destructive',
      })
      return
    }

    setIsUpdating(true)
    try {
      await updateComponentCategory(id, trimmed)
      toast({
        title: 'Categoria renomeada',
        description: `Nome atualizado para "${trimmed}".`,
      })
      setEditingId(null)
      setEditingName('')
      onCategoriesChanged()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar categoria',
        description: err.message || 'Não foi possível renomear a categoria.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleToggleActive = async (cat: ComponentCategory) => {
    const nextActive = cat.active === false
    setActionLoadingId(cat.id)
    try {
      await toggleComponentCategoryActive(cat.id, nextActive)
      toast({
        title: nextActive ? 'Categoria reativada' : 'Categoria desativada',
        description: `A categoria "${cat.name}" foi ${nextActive ? 'ativada' : 'desativada'}.`,
      })
      onCategoriesChanged()
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar situação',
        description: err.message || 'Não foi possível atualizar a categoria.',
        variant: 'destructive',
      })
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b bg-slate-50/70 dark:bg-slate-900/70">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Tags className="size-5" />
            Gestão de Categorias de Componentes
          </DialogTitle>
          <DialogDescription className="text-xs">
            Crie, renomeie ou desative categorias. Estas categorias são utilizadas no compilado da
            Programação e no catálogo de materiais.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Formulário de criação de nova categoria */}
          <form onSubmit={handleCreate} className="flex gap-2 items-center">
            <Input
              placeholder="Nova categoria (ex: Usinagem, Elétrica...)"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="text-xs h-9 flex-1"
              disabled={isCreating}
            />
            <Button
              type="submit"
              size="sm"
              disabled={isCreating || !newCategoryName.trim()}
              className="h-9 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isCreating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Adicionar
            </Button>
          </form>

          {/* Tabela de categorias */}
          <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
            <Table>
              <TableHeader className="bg-slate-100/70 dark:bg-slate-800/60 text-xs">
                <TableRow>
                  <TableHead className="text-xs">Nome da Categoria</TableHead>
                  <TableHead className="w-[100px] text-center text-xs">Status</TableHead>
                  <TableHead className="w-[170px] text-center text-xs">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center py-6 text-xs text-muted-foreground"
                    >
                      Nenhuma categoria cadastrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map((cat) => {
                    const isEditing = editingId === cat.id
                    const isActive = cat.active !== false
                    const isLoading = actionLoadingId === cat.id

                    return (
                      <TableRow key={cat.id} className="text-xs">
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="text-xs h-7"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleSaveEdit(cat.id)
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit()
                                }
                              }}
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium ${
                                  !isActive
                                    ? 'line-through text-muted-foreground'
                                    : 'text-foreground'
                                }`}
                              >
                                {cat.name}
                              </span>
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {isActive ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                            >
                              Ativa
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            >
                              Inativa
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="default"
                                className="h-6 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => handleSaveEdit(cat.id)}
                                disabled={isUpdating}
                              >
                                <Check className="size-3 mr-1" /> Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={handleCancelEdit}
                                disabled={isUpdating}
                              >
                                <X className="size-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => handleStartEdit(cat)}
                                title="Renomear categoria"
                              >
                                <Edit2 className="size-3 mr-1 text-blue-600" /> Renomear
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className={`h-6 px-2 text-[11px] ${
                                  isActive
                                    ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950'
                                    : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950'
                                }`}
                                onClick={() => handleToggleActive(cat)}
                                disabled={isLoading}
                                title={isActive ? 'Desativar categoria' : 'Reativar categoria'}
                              >
                                {isLoading ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : isActive ? (
                                  <>
                                    <PowerOff className="size-3 mr-1" /> Desativar
                                  </>
                                ) : (
                                  <>
                                    <Power className="size-3 mr-1" /> Ativar
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="p-3 border-t bg-slate-50/50 dark:bg-slate-900/50">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
