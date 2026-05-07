import { useState } from 'react'
import { Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckSquare, Plus, X } from 'lucide-react'

export function TabChecklist({
  product,
  setProduct,
}: {
  product: Product
  setProduct: (p: Product) => void
}) {
  const [newItem, setNewItem] = useState('')

  const addItem = () => {
    if (!newItem.trim()) return
    setProduct({ ...product, checklist: [...(product.checklist || []), newItem] })
    setNewItem('')
  }

  const removeItem = (idx: number) => {
    const newChecklist = [...(product.checklist || [])]
    newChecklist.splice(idx, 1)
    setProduct({ ...product, checklist: newChecklist })
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="space-y-2">
        <Label>Pontos de Verificação (Qualidade)</Label>
        <p className="text-sm text-muted-foreground">
          Defina os tópicos que devem ser verificados para a validação final deste produto.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Ex: Verificar tolerância dimensional..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
        />
        <Button onClick={addItem}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar Tópico
        </Button>
      </div>

      <div className="space-y-3 pt-4">
        {(product.checklist?.length ?? 0) === 0 ? (
          <div className="text-center p-6 border border-dashed rounded-lg text-muted-foreground">
            <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhum tópico adicionado.
          </div>
        ) : (
          product.checklist?.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 border rounded bg-card">
              <div className="flex items-center gap-3">
                <CheckSquare className="h-5 w-5 text-primary opacity-70" />
                <span>{item}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeItem(idx)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
