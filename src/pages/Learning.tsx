import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/use-auth'
import { Save, Loader2, Image as ImageIcon } from 'lucide-react'
import { LearningRecord } from '@/types'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { toast } from 'sonner'

export default function Learning() {
  const { user: currentUser } = useAuth()
  const [learningRecords, setLearningRecords] = useState<LearningRecord[]>([])
  const [loading, setLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadRecords = async () => {
    try {
      const records = await pb.collection('learning_evolution').getFullList<LearningRecord>({
        sort: '-created',
        expand: 'user_id',
      })
      setLearningRecords(records)
    } catch (err) {
      console.error('Error fetching learning records', err)
    }
  }

  useEffect(() => {
    if (currentUser) {
      loadRecords()
    }
  }, [currentUser])

  useRealtime('learning_evolution', () => {
    loadRecords()
  })

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0])
    }
  }

  const handleSubmit = async () => {
    if (!title) {
      toast.error('O título/atividade é obrigatório')
      return
    }

    try {
      setLoading(true)
      const formData = new FormData()
      formData.append('user_id', currentUser?.id || '')
      formData.append('title', title)
      formData.append('description', description)
      if (file) {
        formData.append('evidence', file)
      }

      await pb.collection('learning_evolution').create(formData)
      toast.success('Aprendizado salvo com sucesso!')

      setTitle('')
      setDescription('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao salvar o registro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in-up max-w-6xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Evolução do Aprendizado</h1>
        <p className="text-muted-foreground">
          Documente o conhecimento adquirido e acompanhe o histórico de capacitação.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-8 items-start">
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle className="text-xl">Novo Registro</CardTitle>
            <p className="text-sm text-muted-foreground">
              Documente uma nova habilidade ou processo aprendido.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Produto Relacionado</Label>
              <Input
                placeholder="Digite o nome ou código do produto..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">O que foi aprendido?</Label>
              <Textarea
                placeholder="Detalhe os processos realizados, passo a passo..."
                className="min-h-[120px] resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Anexar Fotos</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-8 w-8 text-muted-foreground mb-3" />
                <span className="text-sm text-muted-foreground font-medium px-2">
                  {file ? file.name : 'Clique ou arraste para selecionar fotos'}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setFile(e.target.files[0])
                    }
                  }}
                />
              </div>
            </div>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 mt-2"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar Aprendizado
            </Button>
          </CardContent>
        </Card>

        <div className="bg-muted/30 rounded-xl p-6 border shadow-sm h-full min-h-[500px]">
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-primary">Histórico de Capacitação</h2>
            <p className="text-sm text-muted-foreground">
              Todos os aprendizados documentados da equipe.
            </p>
          </div>

          <div className="relative border-l-2 border-border ml-4 md:ml-6 space-y-8 pb-8">
            {!learningRecords || learningRecords.length === 0 ? (
              <div className="text-muted-foreground pl-8 text-sm py-4">
                Nenhum registro encontrado.
              </div>
            ) : (
              learningRecords.map((record) => (
                <div key={record.id} className="relative pl-8 md:pl-10">
                  <div className="absolute -left-[11px] top-1.5 h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center ring-4 ring-background">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <Card className="shadow-sm border-border/60">
                    <CardContent className="p-0 flex flex-col md:flex-row overflow-hidden">
                      <div className="p-5 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-lg leading-tight">{record.title}</h3>
                          <Badge variant="secondary" className="text-xs font-normal">
                            {new Date(record.created).toLocaleDateString()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {record.description}
                        </p>
                        <div className="pt-3 flex items-center text-xs text-muted-foreground border-t border-border/40 mt-3">
                          <span className="font-medium text-foreground">
                            Por: {record.expand?.user_id?.name || 'Usuário'}
                          </span>
                        </div>
                      </div>
                      {record.evidence && (
                        <div className="w-full md:w-64 h-48 md:h-auto bg-muted/50 flex items-center justify-center border-t md:border-t-0 md:border-l border-border/60 shrink-0 overflow-hidden">
                          {record.evidence.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null ? (
                            <img
                              src={pb.files.getUrl(record, record.evidence)}
                              alt="Evidência"
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                              onClick={() =>
                                window.open(pb.files.getUrl(record, record.evidence), '_blank')
                              }
                            />
                          ) : (
                            <div
                              className="flex flex-col items-center justify-center text-muted-foreground p-4 cursor-pointer hover:bg-muted/80 transition-colors w-full h-full"
                              onClick={() =>
                                window.open(pb.files.getUrl(record, record.evidence), '_blank')
                              }
                            >
                              <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                              <span className="text-xs text-center break-all">Ver anexo</span>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
