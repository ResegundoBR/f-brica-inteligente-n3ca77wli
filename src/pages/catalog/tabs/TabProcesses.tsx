import { useState, useEffect } from 'react'
import { Product, ProductProcessModel } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { ChevronDown, ChevronUp, Trash, X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

const defaultProcessTypes = [
  'Corte',
  'Desbaste',
  'Dobra',
  'Calandra',
  'Solda',
  'Acabamento Solda',
  'Furo',
  'Rosca',
]

export function TabProcesses({
  product,
  setProduct,
  pendingProcesses = [],
  setPendingProcesses,
}: {
  product: Product
  setProduct: (p: Product) => void
  pendingProcesses?: any[]
  setPendingProcesses?: (p: any[]) => void
}) {
  const { toast } = useToast()
  const [processes, setProcesses] = useState<ProductProcessModel[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showOtherInput, setShowOtherInput] = useState(false)
  const [newProcessName, setNewProcessName] = useState('')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (product.id && product.id !== 'novo') {
      loadProcesses()
    }
  }, [product.id])

  const loadProcesses = async () => {
    try {
      const records = await pb.collection('product_processes').getFullList<ProductProcessModel>({
        filter: `product_id="${product.id}"`,
        sort: 'order',
      })
      setProcesses(records)
    } catch (err) {
      console.error('Error loading processes:', err)
    }
  }

  const displayList = product.id === 'novo' ? pendingProcesses : processes

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) return

    const newList = [...displayList]
    const [draggedItem] = newList.splice(draggedIndex, 1)
    newList.splice(dropIndex, 0, draggedItem)

    const updatedList = newList.map((item, idx) => ({ ...item, order: idx + 1 }))

    if (product.id === 'novo' && setPendingProcesses) {
      setPendingProcesses(updatedList)
    } else {
      setProcesses(updatedList)
      try {
        await Promise.all(
          updatedList.map((p) =>
            pb.collection('product_processes').update(p.id, { order: p.order }),
          ),
        )
        toast({ title: 'Ordem dos processos atualizada' })
      } catch (err) {
        toast({ title: 'Erro ao salvar nova ordem', variant: 'destructive' })
        loadProcesses()
      }
    }
    setDraggedIndex(null)
  }

  const handleAddProcess = async (name: string) => {
    if (product.id === 'novo' && setPendingProcesses) {
      const newOrder =
        pendingProcesses.length > 0 ? Math.max(...pendingProcesses.map((p) => p.order)) + 1 : 1
      const newProc = { id: 'temp_' + Date.now(), name, order: newOrder, description: '' }
      setPendingProcesses([...pendingProcesses, newProc])
      toast({ title: 'Processo adicionado' })
      return
    }

    try {
      const newOrder = processes.length > 0 ? Math.max(...processes.map((p) => p.order)) + 1 : 1
      const created = await pb.collection('product_processes').create<ProductProcessModel>({
        product_id: product.id,
        name,
        order: newOrder,
        description: '',
      })
      setProcesses([...processes, created])
      toast({ title: 'Processo adicionado' })
    } catch (err) {
      toast({ title: 'Erro ao adicionar processo', variant: 'destructive' })
    }
  }

  const addOtherProcess = () => {
    if (!newProcessName.trim()) return
    handleAddProcess(newProcessName.trim())
    setNewProcessName('')
    setShowOtherInput(false)
  }

  const updateProcessDesc = async (id: string, desc: string) => {
    if (product.id === 'novo' && setPendingProcesses) {
      setPendingProcesses(
        pendingProcesses.map((p) => (p.id === id ? { ...p, description: desc } : p)),
      )
      return
    }

    try {
      const updated = await pb.collection('product_processes').update<ProductProcessModel>(id, {
        description: desc,
      })
      setProcesses((prev) => prev.map((p) => (p.id === id ? updated : p)))
    } catch (err) {
      toast({ title: 'Erro ao salvar descrição', variant: 'destructive' })
    }
  }

  const updateProcessImage = async (id: string, file: File) => {
    if (product.id === 'novo' && setPendingProcesses) {
      const preview = URL.createObjectURL(file)
      setPendingProcesses(
        pendingProcesses.map((p) =>
          p.id === id ? { ...p, imageFile: file, imagePreview: preview } : p,
        ),
      )
      toast({ title: 'Imagem atualizada' })
      return
    }

    try {
      const formData = new FormData()
      formData.append('image', file)
      const updated = await pb
        .collection('product_processes')
        .update<ProductProcessModel>(id, formData)
      setProcesses((prev) => prev.map((p) => (p.id === id ? updated : p)))
      toast({ title: 'Imagem atualizada' })
    } catch (err) {
      toast({ title: 'Erro ao salvar imagem', variant: 'destructive' })
    }
  }

  const removeProcessImage = async (id: string) => {
    if (product.id === 'novo' && setPendingProcesses) {
      setPendingProcesses(
        pendingProcesses.map((p) =>
          p.id === id ? { ...p, imageFile: null, imagePreview: null } : p,
        ),
      )
      toast({ title: 'Imagem removida' })
      return
    }

    try {
      const updated = await pb.collection('product_processes').update<ProductProcessModel>(id, {
        image: null,
      })
      setProcesses((prev) => prev.map((p) => (p.id === id ? updated : p)))
      toast({ title: 'Imagem removida' })
    } catch (err) {
      toast({ title: 'Erro ao remover imagem', variant: 'destructive' })
    }
  }

  const removeProcess = async (id: string) => {
    if (product.id === 'novo' && setPendingProcesses) {
      setPendingProcesses(pendingProcesses.filter((p) => p.id !== id))
      toast({ title: 'Processo removido' })
      return
    }

    try {
      await pb.collection('product_processes').delete(id)
      setProcesses((prev) => prev.filter((p) => p.id !== id))
      toast({ title: 'Processo removido' })
    } catch (err) {
      toast({ title: 'Erro ao remover processo', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <Label>Adicionar Etapa de Processo</Label>
        <div className="flex flex-wrap gap-2">
          {defaultProcessTypes.map((pt) => {
            const isAdded = displayList.some((p) => p.name.toLowerCase() === pt.toLowerCase())
            return (
              <Button
                key={pt}
                variant={isAdded ? 'default' : 'outline'}
                className={
                  isAdded
                    ? 'bg-blue-600 text-white hover:bg-blue-600/90 disabled:opacity-80 disabled:bg-blue-600 disabled:text-white'
                    : ''
                }
                disabled={isAdded}
                onClick={() => handleAddProcess(pt)}
              >
                {pt}
              </Button>
            )
          })}
          <Button variant="secondary" onClick={() => setShowOtherInput(!showOtherInput)}>
            Outros...
          </Button>
        </div>
        {showOtherInput && (
          <div className="flex gap-2 max-w-sm mt-2 animate-fade-in-down">
            <Input
              placeholder="Nome do novo processo..."
              value={newProcessName}
              onChange={(e) => setNewProcessName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addOtherProcess()}
            />
            <Button onClick={addOtherProcess}>Adicionar</Button>
          </div>
        )}
      </div>

      {displayList.length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <Label className="text-base">Fluxo de Processos de Fabricação</Label>
          <div className="flex flex-col gap-2">
            {displayList.map((proc, idx) => (
              <div
                key={proc.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, idx)}
                className={cn(
                  "border rounded-md bg-card shadow-sm overflow-hidden group transition-all",
                  draggedIndex === idx ? "opacity-50 border-primary border-dashed" : ""
                )}
              >
                <div className="flex items-center justify-between p-2 sm:p-3 hover:bg-accent/10 transition-colors">
                  <div
                    className="flex flex-1 items-center gap-3 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === proc.id ? null : proc.id)}
                  >
                    <div
                      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 -ml-1 rounded hover:bg-muted"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
                      {idx + 1}
                    </div>
                    <div className="font-semibold text-sm">{proc.name}</div>
                    <div className="text-xs text-muted-foreground truncate hidden sm:block max-w-[200px] lg:max-w-[400px]">
                      {proc.description || 'Sem descrição'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setExpandedId(expandedId === proc.id ? null : proc.id)}
                    >
                      {expandedId === proc.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeProcess(proc.id)}
                    >
                      <Trash className="text-destructive h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {expandedId === proc.id && (
                  <div className="p-3 border-t bg-muted/10 grid grid-cols-1 md:grid-cols-[1fr,200px] gap-4 animate-fade-in-down">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        Descrição / Instruções
                      </Label>
                      <Textarea
                        defaultValue={proc.description}
                        onBlur={(e) => updateProcessDesc(proc.id, e.target.value)}
                        placeholder={`Detalhes para o processo de ${proc.name}...`}
                        className="min-h-[100px] resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Imagem de Referência</Label>
                      {proc.imagePreview || proc.image ? (
                        <div className="relative w-full aspect-square border rounded-md group/img overflow-hidden bg-background">
                          <img
                            src={proc.imagePreview || pb.files.getUrl(proc, proc.image)}
                            alt={proc.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <Button
                              size="icon"
                              variant="destructive"
                              onClick={() => removeProcessImage(proc.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="relative w-full aspect-square border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors bg-background">
                          <input
                            type="file"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                updateProcessImage(proc.id, e.target.files[0])
                              }
                            }}
                          />
                          <span className="text-xs font-medium">Adicionar Imagem</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
