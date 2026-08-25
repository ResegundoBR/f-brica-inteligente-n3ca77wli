import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Sparkles,
  Loader2,
  ChevronRight,
  RotateCcw,
  Save,
  History,
  Pencil,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  type Improvement,
  type ImprovementCategory,
  type ImprovementPriority,
  type ImprovementSector,
  type ImprovementStatus,
  type AiStep,
  SECTORS,
  SECTOR_COLORS,
  IMPROVEMENT_NEXT_STATUS,
  CATEGORY_COLORS,
  PRIORITY_COLORS,
  fetchAiSuggestions,
  updateImprovement,
  appendActionLog,
} from '@/services/improvements'

const CATEGORIES: ImprovementCategory[] = [
  'Operacional',
  'Processual',
  'Ferramental',
  'Infraestrutura',
  'Inovação',
]
const PRIORITIES: ImprovementPriority[] = ['Crítica', 'Alta', 'Média', 'Baixa']

const STATUS_TO_AI_STEP: Partial<Record<ImprovementStatus, AiStep>> = {
  Identificado: 'cause_analysis',
  'Em Análise': 'cause_analysis',
  Planejado: 'solution_ideas',
  'Em Execução': 'solution_ideas',
  Verificando: 'impact_validation',
  Concluído: 'impact_validation',
  Reaberto: 'cause_analysis',
}

interface DetailProps {
  improvement: Improvement | null
  open: boolean
  onOpenChange: (open: boolean) => void
  user: { id: string; name: string }
  onUpdated: (imp: Improvement) => void
}

export function ImprovementDetail({
  improvement,
  open,
  onOpenChange,
  user,
  onUpdated,
}: DetailProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Improvement | null>(null)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (open && improvement) {
      setDraft({ ...improvement })
      setEditing(false)
      setAiText('')
    }
  }, [open, improvement])

  if (!improvement || !draft) return null

  const update = (field: keyof Improvement, value: any) =>
    setDraft((d) => (d ? { ...d, [field]: value } : d))

  const handleAi = async () => {
    const aiStep = STATUS_TO_AI_STEP[improvement.status] || 'cause_analysis'
    setAiLoading(true)
    setAiText('')
    try {
      const text = await fetchAiSuggestions(aiStep, {
        title: improvement.title,
        description: improvement.description,
        root_cause: improvement.root_cause,
        solution_idea: improvement.solution_idea,
        category: improvement.category,
        priority: improvement.priority,
      })
      setAiText(text)
      // persist suggestion
      const updated = await updateImprovement(improvement.id, {
        ia_suggestions: {
          ...(improvement.ia_suggestions || {}),
          [aiStep]: text,
        },
      })
      onUpdated(updated)
    } catch (err: any) {
      setAiText(err?.message || 'Falha ao gerar sugestões.')
    } finally {
      setAiLoading(false)
    }
  }

  const nextStatus = IMPROVEMENT_NEXT_STATUS[improvement.status]

  const moveNext = async () => {
    if (!nextStatus) return
    setMoving(true)
    try {
      const updated = await appendActionLog(
        improvement,
        nextStatus,
        `Status avançou de "${improvement.status}" para "${nextStatus}".`,
        user,
      )
      const finalUpdated = await updateImprovement(improvement.id, { status: nextStatus })
      onUpdated({ ...finalUpdated, actions_log: updated.actions_log })
    } finally {
      setMoving(false)
    }
  }

  const reopen = async () => {
    setMoving(true)
    try {
      const updated = await appendActionLog(
        improvement,
        'Reaberto',
        'Apontamento reaberto, retornou para "Em Análise".',
        user,
      )
      const finalUpdated = await updateImprovement(improvement.id, { status: 'Reaberto' })
      onUpdated({ ...finalUpdated, actions_log: updated.actions_log })
    } finally {
      setMoving(false)
    }
  }

  const backToAnalysis = async () => {
    setMoving(true)
    try {
      const updated = await appendActionLog(
        improvement,
        'Em Análise',
        'Apontamento reaberto voltou para análise.',
        user,
      )
      const finalUpdated = await updateImprovement(improvement.id, { status: 'Em Análise' })
      onUpdated({ ...finalUpdated, actions_log: updated.actions_log })
    } finally {
      setMoving(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const updated = await updateImprovement(improvement.id, {
        title: draft.title,
        sector: draft.sector,
        category: draft.category,
        priority: draft.priority,
        description: draft.description,
        root_cause: draft.root_cause,
        solution_idea: draft.solution_idea,
        expected_impact: draft.expected_impact,
      } as any)
      const withLog = await appendActionLog(
        improvement,
        'Edição',
        'Campos editados manualmente.',
        user,
      )
      onUpdated({ ...updated, actions_log: withLog.actions_log })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const logs = Array.isArray(improvement.actions_log) ? [...improvement.actions_log].reverse() : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span className="truncate">{improvement.title}</span>
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {improvement.sector && (
              <Badge className={SECTOR_COLORS[improvement.sector]} variant="secondary">
                {improvement.sector}
              </Badge>
            )}
            <Badge className={CATEGORY_COLORS[improvement.category]} variant="secondary">
              {improvement.category}
            </Badge>
            <Badge className={PRIORITY_COLORS[improvement.priority]}>{improvement.priority}</Badge>
            <Badge variant="outline">{improvement.status}</Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              Criado em{' '}
              {format(new Date(improvement.created), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>
        </DialogHeader>

        <Tabs defaultValue="detalhes" className="flex-1 flex flex-col overflow-hidden min-h-0">
          <TabsList className="grid w-full grid-cols-2 shrink-0">
            <TabsTrigger value="detalhes" className="gap-1.5">
              <Pencil className="size-3.5" /> Detalhes
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-1.5">
              <History className="size-3.5" /> Histórico ({logs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes" className="flex-1 overflow-y-auto pt-3 space-y-3 min-h-0">
            <div className="flex items-center justify-end gap-2">
              {editing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraft({ ...improvement })
                      setEditing(false)
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Salvar
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Editar
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Setor</Label>
                {editing ? (
                  <Select
                    value={draft.sector || ''}
                    onValueChange={(v) => update('sector', v as ImprovementSector)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o setor" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTORS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    {improvement.sector ? (
                      <Badge className={SECTOR_COLORS[improvement.sector]} variant="secondary">
                        {improvement.sector}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Categoria</Label>
                {editing ? (
                  <Select
                    value={draft.category}
                    onValueChange={(v) => update('category', v as ImprovementCategory)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    <Badge className={CATEGORY_COLORS[improvement.category]} variant="secondary">
                      {improvement.category}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Prioridade</Label>
                {editing ? (
                  <Select
                    value={draft.priority}
                    onValueChange={(v) => update('priority', v as ImprovementPriority)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    <Badge className={PRIORITY_COLORS[improvement.priority]}>
                      {improvement.priority}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <Field
              label="Título"
              editing={editing}
              value={draft.title}
              onChange={(v) => update('title', v)}
              display={improvement.title}
            />
            <Field
              label="Descrição do problema"
              editing={editing}
              multiline
              value={draft.description}
              onChange={(v) => update('description', v)}
              display={improvement.description}
            />
            <Field
              label="Causa provável"
              editing={editing}
              multiline
              value={draft.root_cause}
              onChange={(v) => update('root_cause', v)}
              display={improvement.root_cause}
            />
            <Field
              label="Ideia de solução"
              editing={editing}
              multiline
              value={draft.solution_idea || ''}
              onChange={(v) => update('solution_idea', v)}
              display={improvement.solution_idea || '—'}
            />
            <Field
              label="Impacto esperado"
              editing={editing}
              multiline
              value={draft.expected_impact}
              onChange={(v) => update('expected_impact', v)}
              display={improvement.expected_impact}
            />

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
                  <Sparkles className="size-3.5" /> Ajuda da IA
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] gap-1"
                  onClick={handleAi}
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Sparkles className="size-3" />
                  )}
                  {aiLoading ? 'Gerando...' : 'Gerar sugestões'}
                </Button>
              </div>
              {(aiText || improvement.ia_suggestions) && (
                <pre className="text-xs whitespace-pre-wrap font-sans text-foreground/80 bg-background border rounded-md p-2 max-h-48 overflow-y-auto">
                  {aiText ||
                    improvement.ia_suggestions?.[
                      STATUS_TO_AI_STEP[improvement.status] || 'cause_analysis'
                    ] ||
                    ''}
                </pre>
              )}
              <p className="text-[10px] text-muted-foreground">
                Sugestões geradas para a etapa atual ({improvement.status}).
              </p>
            </div>
          </TabsContent>

          <TabsContent value="historico" className="flex-1 overflow-hidden pt-3 min-h-0">
            <ScrollArea className="h-full pr-3">
              <div className="space-y-2">
                {logs.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma ação registrada.
                  </p>
                )}
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className="flex gap-3 text-sm border-l-2 border-primary/30 pl-3 py-1"
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{log.action}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(log.date), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </span>
                      </div>
                      {log.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5">{log.detail}</p>
                      )}
                      <span className="text-[11px] text-muted-foreground">por {log.user}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between gap-2 pt-3 border-t">
          {improvement.status === 'Concluído' ? (
            <Button variant="outline" onClick={reopen} disabled={moving}>
              <RotateCcw className="size-4" /> Reabrir
            </Button>
          ) : improvement.status === 'Reaberto' ? (
            <Button variant="outline" onClick={backToAnalysis} disabled={moving}>
              <RotateCcw className="size-4" /> Voltar para Análise
            </Button>
          ) : (
            <Button variant="outline" onClick={handleAi} disabled={aiLoading}>
              <Sparkles className="size-4" /> Ajuda da IA
            </Button>
          )}
          {nextStatus &&
            improvement.status !== 'Concluído' &&
            improvement.status !== 'Reaberto' && (
              <Button onClick={moveNext} disabled={moving}>
                {moving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                Mover para {nextStatus}
              </Button>
            )}
          {improvement.status === 'Concluído' && (
            <Badge variant="outline" className="text-green-600 ml-auto">
              <CheckCircle2 className="size-3.5 mr-1" /> Concluído
            </Badge>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  editing,
  value,
  onChange,
  display,
  multiline,
}: {
  label: string
  editing: boolean
  value: string
  onChange: (v: string) => void
  display: string
  multiline?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        multiline ? (
          <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
        ) : (
          <Input value={value} onChange={(e) => onChange(e.target.value)} />
        )
      ) : (
        <p className={cn('text-sm whitespace-pre-wrap', multiline ? '' : 'font-medium')}>
          {display}
        </p>
      )}
    </div>
  )
}
