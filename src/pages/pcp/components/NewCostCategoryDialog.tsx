import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { PcpCostCategory } from '@/types'
import { findOrCreateCostCategory } from '@/services/order-costs'
import { Loader2, Plus, Tag } from 'lucide-react'

interface NewCostCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCategorySelected: (category: PcpCostCategory) => void
}

export function NewCostCategoryDialog({
  open,
  onOpenChange,
  onCategorySelected,
}: NewCostCategoryDialogProps) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast({
        title: 'Nome obrigatório',
        description: 'Digite o nome da nova categoria.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const { category, existed } = await findOrCreateCostCategory(trimmed)
      if (existed) {
        toast({
          title: 'Categoria já existe',
          description: `A categoria "${category.name}" já estava cadastrada e foi selecionada.`,
        })
      } else {
        toast({
          title: 'Categoria criada com sucesso!',
          description: `A categoria "${category.name}" foi adicionada ao cadastro.`,
        })
      }

      onCategorySelected(category)
      setName('')
      onOpenChange(false)
    } catch (err) {
      console.error('Erro ao criar categoria de custo:', err)
      toast({
        title: 'Erro ao criar categoria',
        description: err instanceof Error ? err.message : 'Não foi possível cadastrar a categoria.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Tag className="size-4 text-emerald-600" />
            Nova Categoria de Custo
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Cadastre uma nova categoria para classificar os custos das OPs e pedidos. Ela ficará
            disponível imediatamente no seletor.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="category-name-input" className="text-xs font-semibold">
              Nome da Categoria
            </Label>
            <Input
              id="category-name-input"
              className="h-9 text-xs"
              placeholder="Ex.: Embalagem, Ferramental, Ensaios..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
            <p className="text-[11px] text-muted-foreground">
              A verificação de duplicidade é automática (ignora maiúsculas/minúsculas e acentos).
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={submitting || !name.trim()}
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Criar e Selecionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
