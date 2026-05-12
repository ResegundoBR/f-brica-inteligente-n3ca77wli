import { useState, useEffect } from 'react'
import { Product } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckSquare, Plus, X } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'

export function TabChecklist({
  product,
  setProduct,
}: {
  product: Product
  setProduct: (p: Product) => void
}) {
  const [newItem, setNewItem] = useState('')
  const [points, setPoints] = useState<any[]>([])
  const { user } = useAuth()
  const { toast } = useToast()

  useEffect(() => {
    if (product.id && product.id !== 'novo') {
      pb.collection('revision_points')
        .getFullList({
          filter: `product_id = "${product.id}"`,
          sort: 'created',
        })
        .then(setPoints)
        .catch(console.error)
    } else {
      setPoints(
        (product.data?.checklist || []).map((desc: string, i: number) => ({
          id: `new-${i}`,
          description: desc,
          isNew: true,
        })),
      )
    }
  }, [product.id, product.data?.checklist])

  const addItem = async () => {
    if (!newItem.trim()) return

    if (product.id && product.id !== 'novo') {
      try {
        const record = await pb.collection('revision_points').create({
          product_id: product.id,
          user_id: user?.id,
          description: newItem.trim(),
          resolved: false,
        })
        setPoints([...points, record])
        setNewItem('')
        toast({ title: 'Ponto de verificação adicionado' })
      } catch (err) {
        console.error(err)
        toast({ title: 'Erro ao adicionar', variant: 'destructive' })
      }
    } else {
      setProduct({
        ...product,
        data: { ...product.data, checklist: [...(product.data?.checklist || []), newItem.trim()] },
      })
      setNewItem('')
    }
  }

  const removeItem = async (point: any, idx: number) => {
    if (point.isNew) {
      const newChecklist = [...(product.data?.checklist || [])]
      newChecklist.splice(idx, 1)
      setProduct({ ...product, data: { ...product.data, checklist: newChecklist } })
    } else {
      try {
        await pb.collection('revision_points').delete(point.id)
        setPoints(points.filter((p) => p.id !== point.id))
        toast({ title: 'Ponto de verificação removido' })
      } catch (err) {
        console.error(err)
        toast({ title: 'Erro ao remover', variant: 'destructive' })
      }
    }
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
        {points.length === 0 ? (
          <div className="text-center p-6 border border-dashed rounded-lg text-muted-foreground">
            <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhum tópico adicionado.
          </div>
        ) : (
          points.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 border rounded bg-card"
            >
              <div className="flex items-center gap-3">
                <CheckSquare className="h-5 w-5 text-primary opacity-70" />
                <span>{item.description}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeItem(item, idx)}
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
