import { useEffect, useState, useRef, useMemo } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/use-auth'
import {
  Save,
  Loader2,
  Image as ImageIcon,
  CheckCircle,
  ShieldCheck,
  TrendingUp,
  Trash2,
  Plus,
  Printer,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { LearningRecord } from '@/types'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { PrintManual } from '@/components/learning/PrintManual'
import { LearningStepCard } from '@/components/learning/LearningStepCard'

interface StepForm {
  id: string
  description: string
  file: File | null
}

export default function Learning() {
  const { user: currentUser } = useAuth()
  const [learningRecords, setLearningRecords] = useState<LearningRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [isAdminOrRevisor, setIsAdminOrRevisor] = useState(false)
  const [titleError, setTitleError] = useState('')
  const [printingId, setPrintingId] = useState<string | null>(null)

  useEffect(() => {
    if (currentUser?.role) {
      pb.collection('roles')
        .getOne(currentUser.role)
        .then((role) => {
          const name = role.name.toLowerCase()
          setIsAdminOrRevisor(name.includes('admin') || name.includes('revisador'))
        })
        .catch(console.error)
    }
  }, [currentUser])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [steps, setSteps] = useState<StepForm[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadRecords = async () => {
    try {
      const records = await pb.collection('learning_evolution').getFullList<LearningRecord>({
        sort: '-created',
        expand:
          'user_id,learning_steps_via_learning_id,learning_steps_via_learning_id.learning_step_comments_via_step_id.user_id',
      })
      setLearningRecords(records)
    } catch (err) {
      console.error('Error fetching learning records', err)
    }
  }

  useEffect(() => {
    if (currentUser) loadRecords()
  }, [currentUser])

  useRealtime('learning_evolution', () => loadRecords())
  useRealtime('learning_steps', () => loadRecords())
  useRealtime('learning_step_comments', () => loadRecords())

  useEffect(() => {
    if (printingId) {
      setTimeout(() => window.print(), 100)
      const handler = () => setPrintingId(null)
      window.addEventListener('afterprint', handler)
      return () => window.removeEventListener('afterprint', handler)
    }
  }, [printingId])

  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0])
    }
  }

  const addStep = () => {
    setSteps([
      ...steps,
      { id: Math.random().toString(36).substring(7), description: '', file: null },
    ])
  }

  const removeStep = (id: string) => setSteps(steps.filter((s) => s.id !== id))
  const updateStep = (id: string, field: keyof StepForm, value: any) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  const deleteLearningRecord = async (id: string) => {
    try {
      await pb.collection('learning_evolution').delete(id)
      toast.success('Registro excluído com sucesso!')
    } catch (err: any) {
      toast.error('Erro ao excluir o registro.')
    }
  }

  const toggleValidation = async (id: string, currentStatus: boolean) => {
    try {
      await pb.collection('learning_evolution').update(id, { validated: !currentStatus })
      toast.success(`Aprendizado ${!currentStatus ? 'validado' : 'invalidado'} com sucesso!`)
    } catch (err: any) {
      toast.error('Erro ao alterar status de validação. Verifique suas permissões.')
    }
  }

  const moveStep = async (recordId: string, stepId: string, direction: 'up' | 'down') => {
    const record = learningRecords.find((r) => r.id === recordId)
    if (!record) return
    const recordSteps = [...(record.expand?.learning_steps_via_learning_id || [])].sort(
      (a, b) => a.order - b.order,
    )
    const index = recordSteps.findIndex((s) => s.id === stepId)
    if (index === -1) return

    try {
      if (direction === 'up' && index > 0) {
        const prev = recordSteps[index - 1]
        const current = recordSteps[index]
        await Promise.all([
          pb.collection('learning_steps').update(current.id, { order: prev.order }),
          pb.collection('learning_steps').update(prev.id, { order: current.order }),
        ])
      } else if (direction === 'down' && index < recordSteps.length - 1) {
        const next = recordSteps[index + 1]
        const current = recordSteps[index]
        await Promise.all([
          pb.collection('learning_steps').update(current.id, { order: next.order }),
          pb.collection('learning_steps').update(next.id, { order: current.order }),
        ])
      }
    } catch (e) {
      toast.error('Erro ao reordenar etapa')
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setTitleError('O título/atividade é obrigatório')
      toast.error('O título/atividade é obrigatório')
      return
    }

    if (steps.some((s) => !s.description.trim())) {
      toast.error('Todas as etapas precisam ter uma descrição preenchida.')
      return
    }

    setTitleError('')

    try {
      setLoading(true)
      const formData = new FormData()
      formData.append('user_id', currentUser?.id || '')
      formData.append('title', title)
      formData.append('description', description)
      if (file) formData.append('evidence', file)

      const parentRecord = await pb.collection('learning_evolution').create(formData)

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        const stepData = new FormData()
        stepData.append('learning_id', parentRecord.id)
        stepData.append('description', step.description)
        stepData.append('order', String(i + 1))
        if (step.file) stepData.append('image', step.file)
        await pb.collection('learning_steps').create(stepData)
      }

      toast.success('Aprendizado salvo com sucesso!')
      setTitle('')
      setDescription('')
      setFile(null)
      setSteps([])
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar o registro')
    } finally {
      setLoading(false)
    }
  }

  const chartData = useMemo(() => {
    const months = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        year: d.getFullYear(),
        month: d.getMonth(),
        registros: 0,
        validados: 0,
      })
    }

    learningRecords.forEach((record) => {
      const d = new Date(record.created)
      const target = months.find((m) => m.year === d.getFullYear() && m.month === d.getMonth())
      if (target) {
        target.registros++
        if (record.validated) target.validados++
      }
    })

    return months.map((m) => ({
      month: m.label.charAt(0).toUpperCase() + m.label.slice(1),
      registros: m.registros,
      validados: m.validados,
    }))
  }, [learningRecords])

  const chartConfig = {
    registros: { label: 'Total de Registros', color: 'hsl(var(--primary))' },
    validados: { label: 'Validados', color: 'hsl(var(--chart-2))' },
  }

  return (
    <>
      {printingId && <PrintManual record={learningRecords.find((r) => r.id === printingId)!} />}
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
                  onChange={(e) => {
                    setTitle(e.target.value)
                    setTitleError('')
                  }}
                  className={titleError ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {titleError && (
                  <p className="text-sm font-bold text-destructive mt-1.5">{titleError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">O que foi aprendido?</Label>
                <Textarea
                  placeholder="Resumo geral do aprendizado..."
                  className="min-h-[100px] resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Capa / Anexo Principal (Opcional)</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="h-8 w-8 text-muted-foreground mb-3" />
                  <span className="text-sm text-muted-foreground font-medium px-2">
                    {file ? file.name : 'Clique ou arraste para selecionar a capa'}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setFile(e.target.files[0])
                      }
                    }}
                  />
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Passo a Passo</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addStep}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Etapa
                  </Button>
                </div>

                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="relative border rounded-lg p-4 space-y-3 bg-muted/20"
                  >
                    <div className="absolute top-2 right-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => removeStep(step.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Label className="text-xs font-semibold">Etapa {index + 1}</Label>
                    <Textarea
                      placeholder="Descreva o que foi feito nesta etapa..."
                      className="min-h-[80px] resize-none text-sm"
                      value={step.description}
                      onChange={(e) => updateStep(step.id, 'description', e.target.value)}
                    />

                    <div
                      className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => document.getElementById(`step-file-${step.id}`)?.click()}
                    >
                      <ImageIcon className="h-6 w-6 text-muted-foreground mb-2" />
                      <span className="text-xs text-muted-foreground font-medium px-2">
                        {step.file ? step.file.name : 'Adicionar foto desta etapa'}
                      </span>
                      <input
                        id={`step-file-${step.id}`}
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            updateStep(step.id, 'file', e.target.files[0])
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 mt-4"
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

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Produtividade da Equipe</CardTitle>
                <CardDescription>
                  Evolução de aprendizados documentados nos últimos 6 meses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[250px] w-full">
                  <LineChart
                    accessibilityLayer
                    data={chartData}
                    margin={{
                      left: 12,
                      right: 12,
                      top: 12,
                      bottom: 12,
                    }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Line
                      dataKey="registros"
                      type="monotone"
                      stroke="var(--color-registros)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      dataKey="validados"
                      type="monotone"
                      stroke="var(--color-validados)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
              <CardFooter>
                <div className="flex w-full items-start gap-2 text-sm">
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2 font-medium leading-none">
                      Tendência de crescimento <TrendingUp className="h-4 w-4" />
                    </div>
                    <div className="flex items-center gap-2 leading-none text-muted-foreground">
                      Comparativo entre registros totais e validados
                    </div>
                  </div>
                </div>
              </CardFooter>
            </Card>

            <div className="bg-muted/30 rounded-xl p-6 border shadow-sm min-h-[500px]">
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
                  learningRecords.map((record) => {
                    const recordSteps =
                      record.expand?.learning_steps_via_learning_id
                        ?.slice()
                        .sort((a, b) => a.order - b.order) || []

                    return (
                      <div
                        key={record.id}
                        className={cn(
                          'relative pl-8 md:pl-10 transition-opacity',
                          !record.validated && 'opacity-60',
                        )}
                      >
                        <div
                          className={cn(
                            'absolute -left-[11px] top-1.5 h-5 w-5 rounded-full flex items-center justify-center ring-4 ring-background',
                            record.validated ? 'bg-green-500/20' : 'bg-primary/20',
                          )}
                        >
                          <div
                            className={cn(
                              'h-2 w-2 rounded-full',
                              record.validated ? 'bg-green-600' : 'bg-primary',
                            )}
                          />
                        </div>
                        <Card
                          className={cn(
                            'shadow-sm border-border/60 overflow-hidden',
                            record.validated && 'border-green-500/30',
                          )}
                        >
                          <CardContent className="p-0 flex flex-col">
                            <div className="flex flex-col md:flex-row overflow-hidden">
                              <div className="p-5 flex-1 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-lg leading-tight">
                                      {record.title}
                                    </h3>
                                    {record.validated && (
                                      <Badge
                                        variant="outline"
                                        className="bg-green-50 text-green-700 border-green-200 gap-1 px-1.5"
                                      >
                                        <CheckCircle className="w-3 h-3" />
                                        Validado
                                      </Badge>
                                    )}
                                  </div>
                                  <Badge variant="secondary" className="text-xs font-normal">
                                    {new Date(record.created).toLocaleDateString()}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {record.description}
                                </p>
                              </div>
                              {record.evidence && (
                                <div className="w-full md:w-64 h-48 md:h-auto bg-muted/50 flex items-center justify-center border-t md:border-t-0 md:border-l border-border/60 shrink-0 overflow-hidden">
                                  {record.evidence.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null ? (
                                    <img
                                      src={pb.files.getUrl(record, record.evidence)}
                                      alt="Evidência"
                                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                                      onClick={() =>
                                        window.open(
                                          pb.files.getUrl(record, record.evidence),
                                          '_blank',
                                        )
                                      }
                                    />
                                  ) : (
                                    <div
                                      className="flex flex-col items-center justify-center text-muted-foreground p-4 cursor-pointer hover:bg-muted/80 transition-colors w-full h-full"
                                      onClick={() =>
                                        window.open(
                                          pb.files.getUrl(record, record.evidence),
                                          '_blank',
                                        )
                                      }
                                    >
                                      <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                                      <span className="text-xs text-center break-all">
                                        Ver anexo
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="p-5 pt-0">
                              {recordSteps.length > 0 && (
                                <div className="mt-2 pt-4 border-t border-border/40 relative">
                                  <h4 className="text-sm font-semibold mb-4 text-muted-foreground">
                                    Passo a Passo
                                  </h4>
                                  <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[15px] before:h-full before:w-0.5 before:bg-border/60">
                                    {recordSteps.map((step, idx) => (
                                      <LearningStepCard
                                        key={step.id}
                                        step={step}
                                        idx={idx}
                                        isFirst={idx === 0}
                                        isLast={idx === recordSteps.length - 1}
                                        onMove={(stepId, direction) =>
                                          moveStep(record.id, stepId, direction)
                                        }
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="pt-3 flex items-center justify-between border-t border-border/40 mt-4">
                                <span className="text-[10px] text-muted-foreground/50">
                                  Por: {record.expand?.user_id?.name || 'Usuário'}
                                </span>

                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => setPrintingId(record.id)}
                                  >
                                    <Printer className="w-4 h-4 mr-1" />
                                    Gerar Manual
                                  </Button>

                                  {(currentUser?.id === record.user_id || isAdminOrRevisor) && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Esta ação não pode ser desfeita. Isso excluirá
                                            permanentemente o registro de aprendizado e todas as
                                            suas etapas.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => deleteLearningRecord(record.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >
                                            Excluir
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}

                                  {isAdminOrRevisor && (
                                    <Button
                                      variant={record.validated ? 'outline' : 'default'}
                                      size="sm"
                                      className={cn(
                                        'h-8',
                                        record.validated
                                          ? 'text-muted-foreground'
                                          : 'bg-blue-600 hover:bg-blue-700 text-white',
                                      )}
                                      onClick={() =>
                                        toggleValidation(record.id, !!record.validated)
                                      }
                                    >
                                      <ShieldCheck className="w-4 h-4 mr-1" />
                                      {record.validated ? 'Desfazer' : 'Validar'}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
