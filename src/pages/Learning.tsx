import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { Plus, UploadCloud, Calendar, Loader2, Image as ImageIcon } from 'lucide-react'
import { LearningRecord } from '@/types'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { toast } from 'sonner'

export default function Learning() {
  const { user: currentUser } = useAuth()
  const [showForm, setShowForm] = useState(false)
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

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

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
      formData.append('user_id', currentUser.id)
      formData.append('title', title)
      formData.append('description', description)
      if (file) {
        formData.append('evidence', file)
      }

      await pb.collection('learning_evolution').create(formData)
      toast.success('Registro salvo com sucesso!')

      setTitle('')
      setDescription('')
      setFile(null)
      setShowForm(false)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar o registro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-fade-in-up max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Evolução do Aprendizado</h1>
          <p className="text-muted-foreground">
            Registre e acompanhe novas habilidades adquiridas.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" /> Novo Registro
        </Button>
      </div>

      {showForm && (
        <Card className="animate-slide-down border-primary/50 shadow-md">
          <CardHeader>
            <CardTitle className="text-xl">O que você aprendeu?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Atividade / Produto *</Label>
              <Input
                placeholder="Ex: Operação de Calandra"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>O que foi aprendido (passo a passo)</Label>
              <Textarea
                placeholder="Descreva os processos realizados..."
                className="min-h-[100px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Evidências (Fotos)</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm font-medium">
                  {file ? file.name : 'Clique ou arraste fotos do processo e produto final'}
                </span>
                {!file && (
                  <span className="text-xs text-muted-foreground mt-1">
                    Imagens PNG, JPG ou WEBP até 5MB
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setFile(e.target.files[0])
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Registro
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative border-l-2 border-muted ml-4 md:ml-6 space-y-8 pb-8">
        {learningRecords?.length === 0 ? (
          <div className="text-muted-foreground pl-8 text-sm">Nenhum aprendizado registrado.</div>
        ) : (
          learningRecords?.map((record) => (
            <div key={record.id} className="relative pl-8 md:pl-10">
              <div className="absolute -left-[11px] top-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center ring-4 ring-background">
                <div className="h-2 w-2 rounded-full bg-primary-foreground" />
              </div>
              <Card>
                <CardContent className="p-0 flex flex-col md:flex-row">
                  <div className="p-4 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-lg">{record.title}</h3>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="mr-2 h-4 w-4" />
                      {new Date(record.created).toLocaleDateString()}
                      <span className="mx-2">•</span>
                      <span>Por: {record.expand?.user_id?.name || 'Usuário'}</span>
                    </div>
                    <p className="text-sm">{record.description}</p>
                  </div>
                  {record.evidence && (
                    <div className="w-full md:w-48 h-48 md:h-auto bg-muted flex items-center justify-center border-t md:border-t-0 md:border-l">
                      {record.evidence.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null ? (
                        <img
                          src={pb.files.getUrl(record, record.evidence)}
                          alt="Evidência"
                          className="w-full h-full object-cover rounded-b-lg md:rounded-r-lg md:rounded-bl-none"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground p-4">
                          <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                          <span className="text-xs text-center break-all">{record.evidence}</span>
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
  )
}
