import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type Improvement,
  type ImprovementCategory,
  type ImprovementPriority,
  type ImprovementSector,
  type AiStep,
  SECTORS,
  fetchAiSuggestions,
  createImprovement,
} from '@/services/improvements'

const CATEGORIES: ImprovementCategory[] = [
  'Operacional',
  'Processual',
  'Ferramental',
  'Infraestrutura',
  'Inovação',
]
const PRIORITIES: ImprovementPriority[] = ['Crítica', 'Alta', 'Média', 'Baixa']

const STEPS = [
  { n: 1, label: 'O Problema' },
  { n: 2, label: 'A Causa' },
  { n: 3, label: 'A Solução' },
  { n: 4, label: 'O Impacto' },
]

interface WizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: string; name: string }
  onCreated: (imp: Improvement) => void
}

interface FormState {
  title: string
  sector: ImprovementSector | ''
  category: ImprovementCategory | ''
  priority: ImprovementPriority | ''
  description: string
  root_cause: string
  solution_idea: string
  expected_impact: string
}

const EMPTY: FormState = {
  title: '',
  sector: '',
  category: '',
  priority: '',
  description: '',
  root_cause: '',
  solution_idea: '',
  expected_impact: '',
}

export function ImprovementWizard({ open, onOpenChange, user, onCreated }: WizardProps) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fetchedForStep = useRef<number>(0)

  useEffect(() => {
    if (!open) {
      setStep(1)
      setForm(EMPTY)
      setAiText('')
      setAiError('')
      fetchedForStep.current = 0
    }
  }, [open])

  const update = (field: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const buildContext = () => ({
    title: form.title,
    description: form.description,
    root_cause: form.root_cause,
    solution_idea: form.solution_idea,
    category: form.category,
    priority: form.priority,
  })

  const loadAi = async (aiStep: AiStep) => {
    setAiLoading(true)
    setAiError('')
    setAiText('')
    try {
      const text = await fetchAiSuggestions(aiStep, buildContext())
      setAiText(text)
    } catch (err: any) {
      setAiError(err?.message || 'Falha ao carregar sugestões da IA.')
    } finally {
      setAiLoading(false)
    }
  }

  // when entering step 2/3/4 auto-load AI once
  useEffect(() => {
    if (!open) return
    if (step === 2 && fetchedForStep.current < 2) {
      fetchedForStep.current = 2
      loadAi('cause_analysis')
    } else if (step === 3 && fetchedForStep.current < 3) {
      fetchedForStep.current = 3
      loadAi('solution_ideas')
    } else if (step === 4 && fetchedForStep.current < 4) {
      fetchedForStep.current = 4
      loadAi('impact_validation')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, open])

  const canNext = () => {
    if (step === 1)
      return (
        !!form.title.trim() &&
        !!form.sector &&
        !!form.category &&
        !!form.priority &&
        !!form.description.trim()
      )
    if (step === 2) return !!form.root_cause.trim()
    if (step === 3) return true // opcional
    if (step === 4) return !!form.expected_impact.trim()
    return false
  }

  const next = () => setStep((s) => Math.min(4, s + 1))
  const back = () => setStep((s) => Math.max(1, s - 1))

  const submit = async () => {
    setSubmitting(true)
    try {
      const created = await createImprovement(
        {
          title: form.title.trim(),
          sector: form.sector as ImprovementSector,
          category: form.category as ImprovementCategory,
          priority: form.priority as ImprovementPriority,
          description: form.description.trim(),
          root_cause: form.root_cause.trim(),
          solution_idea: form.solution_idea.trim(),
          expected_impact: form.expected_impact.trim(),
        },
        user,
      )
      onCreated(created)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const progressValue = (step / 4) * 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Novo Apontamento de Melhoria
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Etapa {step} de 4 — {STEPS[step - 1].label}
            </span>
            <span>{Math.round(progressValue)}%</span>
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-4 py-2">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="imp-title">
                  Título <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="imp-title"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="Ex.: Retrabalho excessivo na solda de estrutura"
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>
                    Setor <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.sector} onValueChange={(v) => update('sector', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTORS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Categoria <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.category} onValueChange={(v) => update('category', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Prioridade <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.priority} onValueChange={(v) => update('priority', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-desc">
                  Descrição detalhada <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="imp-desc"
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Descreva o problema observado no chão de fábrica..."
                  rows={5}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="imp-cause">
                  Possível causa <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="imp-cause"
                  value={form.root_cause}
                  onChange={(e) => update('root_cause', e.target.value)}
                  placeholder="Por que você acha que isso acontece? Qual a causa provável?"
                  rows={4}
                />
              </div>
              <AiSuggestions
                loading={aiLoading}
                error={aiError}
                text={aiText}
                onPick={(line) => update('root_cause', line)}
                onReload={() => loadAi('cause_analysis')}
                title="Sugestões de causas (IA)"
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="imp-solution">Ideia de melhoria (opcional)</Label>
                <Textarea
                  id="imp-solution"
                  value={form.solution_idea}
                  onChange={(e) => update('solution_idea', e.target.value)}
                  placeholder="Se tiver alguma ideia de como resolver, compartilhe aqui."
                  rows={4}
                />
              </div>
              <AiSuggestions
                loading={aiLoading}
                error={aiError}
                text={aiText}
                onPick={(line) => update('solution_idea', line)}
                onReload={() => loadAi('solution_ideas')}
                title="Ações de melhoria sugeridas (IA)"
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="imp-impact">
                  O que vai melhorar <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="imp-impact"
                  value={form.expected_impact}
                  onChange={(e) => update('expected_impact', e.target.value)}
                  placeholder="Se esse problema for resolvido, o que muda na prática?"
                  rows={4}
                />
              </div>
              <AiSuggestions
                loading={aiLoading}
                error={aiError}
                text={aiText}
                onPick={(line) => update('expected_impact', line)}
                onReload={() => loadAi('impact_validation')}
                title="Validação de impacto e métricas (IA)"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={back} disabled={step === 1}>
            <ArrowLeft className="size-4" /> Voltar
          </Button>
          <div className="flex items-center gap-2">
            {STEPS.map((s) => (
              <span
                key={s.n}
                className={cn(
                  'size-2 rounded-full transition-colors',
                  s.n === step
                    ? 'bg-primary'
                    : s.n < step
                      ? 'bg-primary/60'
                      : 'bg-muted-foreground/30',
                )}
              />
            ))}
          </div>
          {step < 4 ? (
            <Button onClick={next} disabled={!canNext()}>
              Próximo <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={!canNext() || submitting}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Registrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AiSuggestions({
  loading,
  error,
  text,
  onPick,
  onReload,
  title,
}: {
  loading: boolean
  error: string
  text: string
  onPick: (line: string) => void
  onReload: () => void
  title: string
}) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^\s*\d+[)..-]\s*/, '').trim())
    .filter((l) => l.length > 3)
    .slice(0, 6)

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
          <Sparkles className="size-3.5" /> {title}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] gap-1"
          onClick={onReload}
          disabled={loading}
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          {loading ? 'Gerando...' : 'Regerar'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!loading && !error && lines.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma sugestão disponível.</p>
      )}
      <div className="space-y-1.5">
        {lines.map((l, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(l)}
            className="w-full text-left text-xs rounded-md bg-background border px-2.5 py-1.5 hover:border-primary/40 hover:bg-primary/5 transition-colors"
          >
            {l}
          </button>
        ))}
      </div>
      {lines.length > 0 && (
        <Badge variant="outline" className="text-[10px] font-normal">
          Clique para preencher o campo
        </Badge>
      )}
    </div>
  )
}
