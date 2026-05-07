import { useState } from 'react'
import { Product } from '@/types'
import { useApp } from '@/contexts/app-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Check, X, Send, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function TabReview({
  product,
  setProduct,
}: {
  product: Product
  setProduct: (p: Product) => void
}) {
  const { currentUser, updateProduct } = useApp()
  const { toast } = useToast()
  const [newPoint, setNewPoint] = useState('')

  const isReviewer = currentUser.role === 'Revisador' || currentUser.role === 'Admin'
  const isRegistrator = currentUser.role === 'Registrador' || currentUser.role === 'Admin'

  const addPoint = () => {
    if (!newPoint.trim()) return
    setProduct({
      ...product,
      reviewPoints: [
        ...(product.reviewPoints || []),
        { id: Date.now().toString(), description: newPoint, resolved: null, observation: '' },
      ],
    })
    setNewPoint('')
  }

  const resolvePoint = (id: string, resolved: boolean) => {
    const newPoints = (product.reviewPoints || []).map((p) =>
      p.id === id ? { ...p, resolved } : p,
    )
    setProduct({ ...product, reviewPoints: newPoints })
  }

  const updateObservation = (id: string, observation: string) => {
    const newPoints = (product.reviewPoints || []).map((p) =>
      p.id === id ? { ...p, observation } : p,
    )
    setProduct({ ...product, reviewPoints: newPoints })
  }

  const sendToRegistrator = () => {
    const updated = { ...product, status: 'Pendência' as const }
    setProduct(updated)
    updateProduct(updated)
    toast({ title: 'Enviado para Registrador', description: 'O status mudou para Pendência.' })
  }

  const validateProduct = () => {
    const updated = { ...product, status: 'Validado' as const }
    setProduct(updated)
    updateProduct(updated)
    toast({ title: 'Produto Validado', description: 'O cadastro foi aprovado com sucesso.' })
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
              onClick={sendToRegistrator}
              variant="outline"
              className="text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950"
            >
              <Send className="mr-2 h-4 w-4" /> Devolver p/ Ajustes (Pendência)
            </Button>
            <Button onClick={validateProduct} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Aprovar / Validar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="font-medium text-lg">
          Pontos de Revisão ({product.reviewPoints?.length ?? 0})
        </h3>
        {(product.reviewPoints?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum ponto de revisão apontado.</p>
        ) : (
          <div className="grid gap-4">
            {product.reviewPoints?.map((point) => (
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
