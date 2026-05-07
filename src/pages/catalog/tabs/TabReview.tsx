import { useState, useEffect, useRef } from 'react'
import { Product, ProductStatusModel, RevisionPointModel } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Send, CheckCircle2, Paperclip } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'

export function TabReview({
  product,
  setProduct,
}: {
  product: Product
  setProduct: (p: Product) => void
}) {
  const { user: currentUser } = useAuth()
  const { toast } = useToast()
  const [newPointDesc, setNewPointDesc] = useState('')
  const [newPointFiles, setNewPointFiles] = useState<File[]>([])
  const [statuses, setStatuses] = useState<ProductStatusModel[]>([])
  const [revisionPoints, setRevisionPoints] = useState<RevisionPointModel[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadPoints = async () => {
    if (!product.id || product.id === 'novo') return
    try {
      const res = await pb.collection('revision_points').getFullList<RevisionPointModel>({
        filter: `product_id = "${product.id}"`,
        sort: '-created',
        expand: 'user_id',
      })
      setRevisionPoints(res)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    pb.collection('product_statuses')
      .getFullList<ProductStatusModel>()
      .then(setStatuses)
      .catch(console.error)

    loadPoints()
  }, [product.id])

  useRealtime('revision_points', (e) => {
    if (e.record.product_id === product.id) {
      loadPoints()
    }
  })

  const roleName = currentUser?.expand?.role?.name || currentUser?.role
  const isReviewer = roleName === 'reviewer' || roleName === 'admin' || roleName === 'Administrador'

  const addPoint = async () => {
    if (!newPointDesc.trim() && newPointFiles.length === 0) return
    if (!product.id || product.id === 'novo') {
      toast({
        title: 'Atenção',
        description: 'Salve o produto primeiro antes de adicionar pontos de revisão.',
        variant: 'destructive',
      })
      return
    }

    try {
      const formData = new FormData()
      formData.append('product_id', product.id)
      formData.append('user_id', currentUser?.id || '')
      formData.append('description', newPointDesc)

      newPointFiles.forEach((file) => {
        formData.append('files', file)
      })

      await pb.collection('revision_points').create(formData)
      setNewPointDesc('')
      setNewPointFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      toast({ title: 'Ponto adicionado com sucesso!' })
    } catch (err) {
      toast({ title: 'Erro ao adicionar ponto', variant: 'destructive' })
    }
  }

  const updateStatus = async (statusName: string, title: string, desc: string) => {
    const s = statuses.find((x) => x.name.toLowerCase() === statusName)
    if (!s) return toast({ title: 'Status não encontrado', variant: 'destructive' })

    try {
      const updated = { ...product, status: s.id }
      if (product.id && product.id !== 'novo') {
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
      <div className="bg-slate-50 dark:bg-muted/20 p-4 rounded-lg border space-y-4">
        <Label className="text-lg font-bold">Adicionar Ponto de Revisão</Label>
        <div className="flex flex-col gap-2 max-w-xl">
          <Input
            placeholder="Apontar erro, correção ou feedback..."
            value={newPointDesc}
            onChange={(e) => setNewPointDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPoint()}
          />
          <div className="flex items-center gap-2 mt-1">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="mr-2 h-4 w-4" /> Anexar Evidência
            </Button>
            <input
              type="file"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files)
                  setNewPointFiles([...newPointFiles, ...Array.from(e.target.files)])
              }}
            />
            <span className="text-xs text-muted-foreground">
              {newPointFiles.length} arquivo(s) anexado(s)
            </span>
          </div>
          <Button onClick={addPoint} variant="secondary" className="w-fit mt-2">
            Adicionar Ponto
          </Button>
        </div>

        {isReviewer && (
          <div className="flex flex-wrap gap-3 pt-4 border-t mt-4">
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
              <Send className="mr-2 h-4 w-4" /> Devolver p/ Ajustes
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
        )}
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-lg">Pontos de Revisão ({revisionPoints.length})</h3>
        {revisionPoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum ponto de revisão apontado.</p>
        ) : (
          <div className="grid gap-4">
            {revisionPoints.map((point) => (
              <div key={point.id} className="border rounded-md p-4 bg-card flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold bg-muted px-2 py-1 rounded">
                    {point.expand?.user_id?.name || point.expand?.user_id?.email || 'Usuário'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(point.created).toLocaleString()}
                  </span>
                </div>
                <p className="font-medium mt-1 text-sm sm:text-base">{point.description}</p>
                {point.files && point.files.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {point.files.map((fileStr, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        Anexo {i + 1}
                      </Badge>
                    ))}
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
