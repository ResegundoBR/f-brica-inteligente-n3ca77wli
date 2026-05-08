import { useState, useEffect } from 'react'
import { Product, ProductProcessModel } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { Trash, X, GripVertical, Paperclip } from 'lucide-react'
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

interface PendingProcess {
  id: string
  name: string
  order: number
  description: string
  imageFiles?: File[]
  imagePreviews?: string[]
}

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

  const isNew = !product.id
  const displayList = isNew ? pendingProcesses : processes

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

    if (isNew && setPendingProcesses) {
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
    if (isNew && setPendingProcesses) {
      const newOrder =
        pendingProcesses.length > 0 ? Math.max(...pendingProcesses.map((p) => p.order)) + 1 : 1
      const newProc: PendingProcess = {
        id: 'temp_' + Date.now(),
        name,
        order: newOrder,
        description: '',
      }
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
    if (isNew && setPendingProcesses) {
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

  const updateProcessImage = async (id: string, files: FileList) => {
    if (isNew && setPendingProcesses) {
      const newFiles = Array.from(files)
      const newPreviews = newFiles.map((f) => URL.createObjectURL(f))
      setPendingProcesses(
        pendingProcesses.map((p) => {
          if (p.id === id) {
            return {
              ...p,
              imageFiles: [...(p.imageFiles || []), ...newFiles],
              imagePreviews: [...(p.imagePreviews || []), ...newPreviews],
            }
          }
          return p
        }),
      )
      toast({ title: 'Imagens adicionadas' })
      return
    }

    try {
      const formData = new FormData()
      Array.from(files).forEach((file) => {
        formData.append('image', file)
      })

      const updated = await pb
        .collection('product_processes')
        .update<ProductProcessModel>(id, formData)
      setProcesses((prev) => prev.map((p) => (p.id === id ? updated : p)))
      toast({ title: 'Imagens adicionadas' })
    } catch (err) {
      toast({ title: 'Erro ao adicionar imagens', variant: 'destructive' })
    }
  }

  const removeProcessImage = async (id: string, filenameOrIndex: string | number) => {
    if (isNew && setPendingProcesses) {
      setPendingProcesses(
        pendingProcesses.map((p) => {
          if (p.id === id) {
            const nf = [...(p.imageFiles || [])]
            const np = [...(p.imagePreviews || [])]
            nf.splice(filenameOrIndex as number, 1)
            np.splice(filenameOrIndex as number, 1)
            return { ...p, imageFiles: nf, imagePreviews: np }
          }
          return p
        }),
      )
      toast({ title: 'Imagem removida' })
      return
    }

    try {
      const updated = await pb.collection('product_processes').update<ProductProcessModel>(id, {
        'image-': filenameOrIndex,
      })
      setProcesses((prev) => prev.map((p) => (p.id === id ? updated : p)))
      toast({ title: 'Imagem removida' })
    } catch (err) {
      toast({ title: 'Erro ao remover imagem', variant: 'destructive' })
    }
  }

  const removeProcess = async (id: string) => {
    if (isNew && setPendingProcesses) {
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

  const getImages = (proc: any): string[] => {
    if (!proc.image) return []
    if (Array.isArray(proc.image)) return proc.image
    return [proc.image]
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
          <div className="flex flex-col gap-3">
            {displayList.map((proc, idx) => {
              const images = isNew ? proc.imagePreviews || [] : getImages(proc)

              return (
                <div
                  key={proc.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, idx)}
                  className={cn(
                    'border rounded-md bg-card shadow-sm overflow-hidden group transition-all',
                    draggedIndex === idx ? 'opacity-50 border-primary border-dashed' : '',
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-2 sm:p-3 hover:bg-accent/10 transition-colors">
                    <div className="flex items-center gap-3 sm:w-[220px] shrink-0">
                      <div
                        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 -ml-1 rounded hover:bg-muted"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <div className="font-semibold text-sm truncate">{proc.name}</div>
                    </div>

                    <div className="flex-1 w-full min-w-[200px]">
                      <Input
                        defaultValue={proc.description}
                        onBlur={(e) => updateProcessDesc(proc.id, e.target.value)}
                        placeholder="Detalhes para o processo..."
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        id={`file-upload-${proc.id}`}
                        onChange={(e) => {
                          if (e.target.files) updateProcessImage(proc.id, e.target.files)
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => document.getElementById(`file-upload-${proc.id}`)?.click()}
                      >
                        <Paperclip className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Anexar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeProcess(proc.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {images.length > 0 && (
                    <div className="px-3 py-2 border-t bg-muted/20 flex flex-wrap gap-2 items-center">
                      {images.map((img: string, i: number) => (
                        <div
                          key={i}
                          className="relative w-14 h-14 rounded-md border bg-background group/img overflow-hidden shadow-sm"
                        >
                          <img
                            src={isNew ? img : pb.files.getUrl(proc, img)}
                            alt={`Anexo ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-all duration-200">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-white hover:text-white hover:bg-white/20 rounded-full"
                              onClick={() => removeProcessImage(proc.id, isNew ? i : img)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
