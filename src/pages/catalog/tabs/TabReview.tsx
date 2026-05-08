import { useState, useEffect, useRef } from 'react'
import { Product, ProductStatusModel, RevisionPointModel, RevisionNoteModel } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, CheckCircle2, Paperclip, X, Clock, MessageSquareText, Search } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
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
  const [descError, setDescError] = useState('')
  const [newPointFiles, setNewPointFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statuses, setStatuses] = useState<ProductStatusModel[]>([])
  const [revisionPoints, setRevisionPoints] = useState<RevisionPointModel[]>([])
  const [revisionNotes, setRevisionNotes] = useState<RevisionNoteModel[]>([])
  const [openNotesId, setOpenNotesId] = useState<string | null>(null)

  const [newNoteText, setNewNoteText] = useState<Record<string, string>>({})
  const [isSubmittingNote, setIsSubmittingNote] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

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

  const loadNotes = async () => {
    if (!product.id || product.id === 'novo') return
    try {
      const res = await pb.collection('revision_notes').getFullList<RevisionNoteModel>({
        filter: `revision_point_id.product_id = "${product.id}"`,
        sort: '-created',
        expand: 'user_id',
      })
      setRevisionNotes(res)
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
    loadNotes()
  }, [product.id])

  useRealtime('revision_points', (e) => {
    if (e.record.product_id === product.id) {
      loadPoints()
    }
  })

  useRealtime('revision_notes', (e) => {
    const belongsToProduct = revisionPoints.some((p) => p.id === e.record.revision_point_id)
    if (belongsToProduct || e.record.revision_point_id) {
      loadNotes()
    }
  })

  const roleName = currentUser?.expand?.role?.name || currentUser?.role
  const isReviewer = roleName === 'reviewer' || roleName === 'admin' || roleName === 'Administrador'

  const addPoint = async () => {
    if (!newPointDesc.trim()) {
      setDescError('A descrição é obrigatória')
      toast({ title: 'A descrição é obrigatória', variant: 'destructive' })
      return
    }
    setDescError('')

    if (!product.id || product.id === 'novo') {
      toast({
        title: 'Atenção',
        description: 'Salve o produto primeiro antes de adicionar pontos de revisão.',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsSubmitting(true)
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
    } finally {
      setIsSubmitting(false)
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

  const toggleResolved = async (point: RevisionPointModel, checked: boolean) => {
    try {
      await pb.collection('revision_points').update(point.id, { resolved: checked })
    } catch (err) {
      toast({ title: 'Erro ao atualizar status do ponto', variant: 'destructive' })
    }
  }

  const handleOpenNotes = (point: RevisionPointModel) => {
    setOpenNotesId(openNotesId === point.id ? null : point.id)
  }

  const saveNote = async (pointId: string) => {
    const text = newNoteText[pointId]
    if (!text?.trim()) return
    try {
      setIsSubmittingNote(pointId)
      await pb.collection('revision_notes').create({
        revision_point_id: pointId,
        user_id: currentUser?.id,
        content: text.trim(),
      })
      setNewNoteText((prev) => ({ ...prev, [pointId]: '' }))
      toast({ title: 'Nota enviada com sucesso' })
      loadNotes()
    } catch (e) {
      toast({ title: 'Erro ao enviar nota', variant: 'destructive' })
    } finally {
      setIsSubmittingNote(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-slate-50 dark:bg-muted/20 p-4 rounded-lg border space-y-4">
        <Label className="text-lg font-bold">Adicionar Ponto de Revisão</Label>
        <div className="flex flex-col gap-3 max-w-xl">
          <div className="space-y-1.5">
            <Input
              placeholder="Apontar erro, correção ou feedback..."
              value={newPointDesc}
              onChange={(e) => {
                setNewPointDesc(e.target.value)
                setDescError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && addPoint()}
              className={descError ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {descError && <p className="text-sm font-bold text-destructive mt-1.5">{descError}</p>}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={addPoint} variant="default" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Adicionando...' : 'Adicionar Ponto'}
            </Button>

            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="mr-2 h-4 w-4" /> Anexar Evidência
            </Button>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files)
                  setNewPointFiles([...newPointFiles, ...Array.from(e.target.files)])
              }}
            />
          </div>

          {newPointFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {newPointFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs border border-border"
                >
                  <span className="truncate max-w-[150px] font-medium">{file.name}</span>
                  <button
                    onClick={() => {
                      const nf = [...newPointFiles]
                      nf.splice(idx, 1)
                      setNewPointFiles(nf)
                    }}
                    className="text-destructive hover:underline ml-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-medium text-lg">Pontos de Revisão ({revisionPoints.length})</h3>
          {revisionPoints.length > 0 && (
            <div className="relative w-full sm:w-72 shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar em pontos e histórico..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          )}
        </div>
        {revisionPoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum ponto de revisão apontado.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {revisionPoints
              .filter((point) => {
                if (!searchTerm) return true
                const term = searchTerm.toLowerCase()
                const pMatch =
                  point.description.toLowerCase().includes(term) ||
                  (point.expand?.user_id?.name || point.expand?.user_id?.email || '')
                    .toLowerCase()
                    .includes(term)
                if (pMatch) return true
                const nMatch = revisionNotes
                  .filter((n) => n.revision_point_id === point.id)
                  .some(
                    (n) =>
                      n.content.toLowerCase().includes(term) ||
                      (n.expand?.user_id?.name || n.expand?.user_id?.email || '')
                        .toLowerCase()
                        .includes(term),
                  )
                return nMatch
              })
              .map((point) => {
                const allNotes = revisionNotes.filter((n) => n.revision_point_id === point.id)
                let displayNotes = allNotes

                if (searchTerm) {
                  const term = searchTerm.toLowerCase()
                  const pMatch =
                    point.description.toLowerCase().includes(term) ||
                    (point.expand?.user_id?.name || point.expand?.user_id?.email || '')
                      .toLowerCase()
                      .includes(term)
                  if (!pMatch) {
                    displayNotes = allNotes.filter(
                      (n) =>
                        n.content.toLowerCase().includes(term) ||
                        (n.expand?.user_id?.name || n.expand?.user_id?.email || '')
                          .toLowerCase()
                          .includes(term),
                    )
                  }
                }

                return (
                  <div
                    key={point.id}
                    className={`flex flex-col group shadow-sm rounded-md border-l-4 ${point.resolved ? 'border-l-blue-500' : 'border-l-red-500'}`}
                  >
                    <div
                      className="border border-l-0 rounded-tr-md px-3 py-2 bg-card flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-accent/10 transition-colors h-auto sm:h-12 border-b-0 data-[state=closed]:border-b data-[state=closed]:rounded-br-md"
                      data-state={openNotesId === point.id ? 'open' : 'closed'}
                    >
                      <div className="flex items-center gap-2 flex-1 overflow-hidden">
                        <span className="text-[10px] font-semibold bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {point.expand?.user_id?.name || point.expand?.user_id?.email || 'Usuário'}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                          {new Date(point.created).toLocaleDateString()}
                        </span>
                        <p className="font-medium text-sm truncate" title={point.description}>
                          {point.description}
                        </p>

                        {point.files && point.files.length > 0 && (
                          <div className="flex gap-1 shrink-0 ml-1">
                            {point.files.map((fileStr, i) => {
                              const fileUrl = pb.files.getUrl(point, fileStr) + '?download=1'
                              return (
                                <a
                                  key={i}
                                  href={fileUrl}
                                  download={fileStr}
                                  onClick={(e) => e.stopPropagation()}
                                  title={`Baixar Anexo ${i + 1}`}
                                >
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1 py-0 hover:bg-secondary/80 cursor-pointer"
                                  >
                                    <Paperclip className="h-3 w-3" />
                                  </Badge>
                                </a>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs relative"
                          onClick={() => handleOpenNotes(point)}
                        >
                          <MessageSquareText className="h-3 w-3 mr-1.5" />
                          Histórico
                          {allNotes.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] w-4 h-4 flex items-center justify-center rounded-full">
                              {allNotes.length}
                            </span>
                          )}
                        </Button>
                        <div className="flex items-center space-x-2 bg-background border px-2 py-1 rounded-md h-8">
                          <Switch
                            id={`resolved-${point.id}`}
                            checked={point.resolved}
                            onCheckedChange={(checked) => toggleResolved(point, checked)}
                          />
                          <Label
                            htmlFor={`resolved-${point.id}`}
                            className="text-xs cursor-pointer min-w-[70px]"
                          >
                            {point.resolved ? (
                              <span className="flex items-center text-emerald-600 font-medium">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Resolvido
                              </span>
                            ) : (
                              <span className="flex items-center text-amber-600 font-medium">
                                <Clock className="h-3 w-3 mr-1" /> Pendente
                              </span>
                            )}
                          </Label>
                        </div>
                      </div>
                    </div>

                    {openNotesId === point.id && (
                      <div className="flex flex-col bg-muted/10 border-t border-x border-b border-l-0 rounded-br-md shadow-inner animate-fade-in-down">
                        <div className="p-3 border-b bg-background/50 flex gap-2 items-center">
                          <Input
                            placeholder="Adicionar comentário ao histórico..."
                            value={newNoteText[point.id] || ''}
                            onChange={(e) =>
                              setNewNoteText({ ...newNoteText, [point.id]: e.target.value })
                            }
                            onKeyDown={(e) => e.key === 'Enter' && saveNote(point.id)}
                            className="h-9 bg-background"
                          />
                          <Button
                            size="sm"
                            className="h-9 px-4 shrink-0"
                            onClick={() => saveNote(point.id)}
                            disabled={isSubmittingNote === point.id}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                        <ScrollArea className="max-h-[300px] w-full p-3">
                          <div className="flex flex-col gap-3">
                            {displayNotes.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-2">
                                {searchTerm
                                  ? 'Nenhum histórico corresponde à busca.'
                                  : 'Nenhum histórico ainda. Inicie a conversa acima.'}
                              </p>
                            ) : (
                              displayNotes.map((note) => (
                                <div key={note.id} className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-xs text-primary">
                                      {note.expand?.user_id?.name ||
                                        note.expand?.user_id?.email ||
                                        'Usuário'}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {new Date(note.created).toLocaleString('pt-BR', {
                                        dateStyle: 'short',
                                        timeStyle: 'short',
                                      })}
                                    </span>
                                  </div>
                                  <p className="text-sm bg-background border rounded px-3 py-2 text-foreground whitespace-pre-wrap">
                                    {note.content}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
