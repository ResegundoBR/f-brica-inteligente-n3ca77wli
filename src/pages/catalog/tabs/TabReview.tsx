import { useState, useEffect } from 'react'
import { Product, ProductStatusModel } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Check, X, Send, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'

export function TabReview({
  product,
  setProduct,
}: {
  product: Product
  setProduct: (p: Product) => void
}) {
  const { user: currentUser } = useAuth()
  const { toast } = useToast()
  const [newPoint, setNewPoint] = useState('')
  const [statuses, setStatuses] = useState<ProductStatusModel[]>([])

  useEffect(() => {
    pb.collection('product_statuses')
      .getFullList<ProductStatusModel>()
      .then(setStatuses)
      .catch(console.error)
  }, [])

  const roleName = currentUser?.expand?.role?.name || currentUser?.role
  const isReviewer = roleName === 'reviewer' || roleName === 'admin'
  const isRegistrator = roleName === 'registrator' || roleName === 'admin'

  const reviewPoints = product.data?.reviewPoints || []

  const addPoint = () => {
    if (!newPoint.trim()) return
    setProduct({
      ...product,
      data: {
        ...product.data,
        reviewPoints: [
          ...reviewPoints,
          { id: Date.now().toString(), description: newPoint, resolved: null, observation: '' },
        ],
      },
    })
    setNewPoint('')
  }

  const resolvePoint = (id: string, resolved: boolean) => {
    const newPoints = reviewPoints.map((p: any) => (p.id === id ? { ...p, resolved } : p))
    setProduct({ ...product, data: { ...product.data, reviewPoints: newPoints } })
  }

  const updateObservation = (id: string, observation: string) => {
    const newPoints = reviewPoints.map((p: any) => (p.id === id ? { ...p, observation } : p))
    setProduct({ ...product, data: { ...product.data, reviewPoints: newPoints } })
  }

  const updateStatus = async (statusName: string, title: string, desc: string) => {
    const s = statuses.find((x) => x.name.toLowerCase() === statusName)
    if (!s) return toast({ title: 'Status não encontrado', variant: 'destructive' })

    try {
      const updated = { ...product, status: s.id }
      if (product.id) {
        await pb.collection('products').update(product.id, { status: s.id })
      }
      setProduct(updated)
      toast({ title, description: desc })
    } catch (err) {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {isReviewer && (
        <div className="bg-slate-50 dark:bg-muted/20 p-4 rounded-lg border space-y-4">
          <Label className="text-lg font-bold">Área do Revisador</Label>
          <div className="flex gap-2 max-w-xl">
            <Input
              placeholder="Apontar erro ou correção..."
              value={newPoint}
              onChange={(e) => setNewPoint(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPoint()}
            />
            <Button onClick={addPoint} variant="secondary">
              Adicionar Ponto
            </Button>
          </div>
          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={() =>
                updateStatus(
                  'pendencia',
                  'Enviado para Registrador',
                  'O status mudou para Pendência.',
                )
              }
              variant="outline"
              className="text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950"
            >
              <Send className="mr-2 h-4 w-4" /> Devolver p/ Ajustes (Pendência)
            </Button>
            <Button
              onClick={() =>
                updateStatus('validado', 'Produto Validado', 'O cadastro foi aprovado com sucesso.')
              }
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Aprovar / Validar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="font-medium text-lg">Pontos de Revisão ({reviewPoints.length})</h3>
        {reviewPoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum ponto de revisão apontado.</p>
        ) : (
          <div className="grid gap-4">
            {reviewPoints.map((point: any) => (
              <div
                key={point.id}
                className="border rounded-md p-4 bg-card flex flex-col sm:flex-row gap-4"
              >
                <div className="flex-1 space-y-2">
                  <p className="font-medium">{point.description}</p>
                  {isRegistrator && (
                    <Textarea
                      placeholder="Nota / Observação do ajuste..."
                      className="h-16 resize-none"
                      value={point.observation}
                      onChange={(e) => updateObservation(point.id, e.target.value)}
                    />
                  )}
                  {!isRegistrator && point.observation && (
                    <div className="text-sm bg-muted p-2 rounded">Resp: {point.observation}</div>
                  )}
                </div>
                {isRegistrator && (
                  <div className="flex sm:flex-col gap-2 justify-center border-t sm:border-t-0 sm:border-l pt-3 sm:pt-0 sm:pl-4">
                    <Button
                      size="sm"
                      variant={point.resolved === true ? 'default' : 'outline'}
                      className={point.resolved === true ? 'bg-emerald-600' : ''}
                      onClick={() => resolvePoint(point.id, true)}
                    >
                      <Check className="h-4 w-4 sm:mr-2" />{' '}
                      <span className="hidden sm:inline">Corrigido</span>
                    </Button>
                    <Button
                      size="sm"
                      variant={point.resolved === false ? 'destructive' : 'outline'}
                      onClick={() => resolvePoint(point.id, false)}
                    >
                      <X className="h-4 w-4 sm:mr-2" />{' '}
                      <span className="hidden sm:inline">Não Procede</span>
                    </Button>
                  </div>
                )}
                {!isRegistrator && (
                  <div className="flex items-center justify-center sm:border-l pl-4">
                    {point.resolved === true && <Badge className="bg-emerald-600">Corrigido</Badge>}
                    {point.resolved === false && <Badge variant="destructive">Rejeitado</Badge>}
                    {point.resolved === null && <Badge variant="outline">Aguardando</Badge>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
