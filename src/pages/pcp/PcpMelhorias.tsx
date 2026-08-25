import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Lightbulb, CalendarDays, GripVertical, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import {
  type Improvement,
  type ImprovementStatus,
  type ImprovementSector,
  type ImprovementCategory,
  type ImprovementPriority,
  SECTORS,
  SECTOR_COLORS,
  IMPROVEMENT_COLUMNS,
  CATEGORY_COLORS,
  PRIORITY_COLORS,
  PRIORITY_BORDER,
  listImprovements,
  updateImprovement,
  appendActionLog,
} from '@/services/improvements'
import { ImprovementWizard } from './components/ImprovementWizard'
import { ImprovementDetail } from './components/ImprovementDetail'

const CATEGORIES: ImprovementCategory[] = [
  'Operacional',
  'Processual',
  'Ferramental',
  'Infraestrutura',
  'Inovação',
]

const PRIORITIES: ImprovementPriority[] = ['Crítica', 'Alta', 'Média', 'Baixa']

export default function PcpMelhorias() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [items, setItems] = useState<Improvement[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [selected, setSelected] = useState<Improvement | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Filters state
  const [search, setSearch] = useState('')
  const [selectedSector, setSelectedSector] = useState<string>('all')
  const [selectedPriority, setSelectedPriority] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const simpleUser = useMemo(() => ({ id: user?.id || '', name: user?.name || 'Sistema' }), [user])

  const fetch = async () => {
    try {
      const res = await listImprovements()
      setItems(res)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch()
  }, [])

  useRealtime('improvements', () => {
    fetch()
  })

  const onCreated = (imp: Improvement) => {
    setItems((prev) => [imp, ...prev])
    toast({ title: 'Apontamento criado', description: imp.title })
  }

  const onUpdated = (imp: Improvement) => {
    setItems((prev) => prev.map((i) => (i.id === imp.id ? imp : i)))
    setSelected(imp)
  }

  const openDetail = (imp: Improvement) => {
    setSelected(imp)
    setDetailOpen(true)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('improvementId', id)
  }

  const handleDrop = async (e: React.DragEvent, status: ImprovementStatus) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('improvementId')
    if (!id) return
    const item = items.find((i) => i.id === id)
    if (!item || item.status === status) return
    try {
      const updated = await appendActionLog(
        item,
        status,
        `Status alterado de "${item.status}" para "${status}" via Kanban.`,
        simpleUser,
      )
      const finalUpdated = await updateImprovement(item.id, { status })
      onUpdated({ ...finalUpdated, actions_log: updated.actions_log })
      toast({ title: 'Status atualizado', description: `${item.title} → ${status}` })
    } catch (err: any) {
      toast({
        title: 'Erro ao mover',
        description: err?.message || 'Falha ao atualizar status.',
        variant: 'destructive',
      })
    }
  }

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((imp) => {
      if (term && !imp.title.toLowerCase().includes(term)) {
        return false
      }
      if (selectedSector !== 'all' && (imp.sector as string) !== selectedSector) {
        return false
      }
      if (selectedPriority !== 'all' && (imp.priority as string) !== selectedPriority) {
        return false
      }
      if (selectedCategory !== 'all' && (imp.category as string) !== selectedCategory) {
        return false
      }
      if (selectedStatus !== 'all' && (imp.status as string) !== selectedStatus) {
        return false
      }
      return true
    })
  }, [items, search, selectedSector, selectedPriority, selectedCategory, selectedStatus])

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedSector !== 'all' ||
    selectedPriority !== 'all' ||
    selectedCategory !== 'all' ||
    selectedStatus !== 'all'

  const clearFilters = () => {
    setSearch('')
    setSelectedSector('all')
    setSelectedPriority('all')
    setSelectedCategory('all')
    setSelectedStatus('all')
  }

  const grouped = useMemo(() => {
    const map: Record<ImprovementStatus, Improvement[]> = {
      Identificado: [],
      'Em Análise': [],
      Planejado: [],
      'Em Execução': [],
      Verificando: [],
      Concluído: [],
      Reaberto: [],
    }
    filteredItems.forEach((i) => {
      if (map[i.status]) map[i.status].push(i)
    })
    return map
  }, [filteredItems])

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)] p-3 md:p-4 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 shrink-0 gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Lightbulb className="size-8 text-amber-500" />
            Central de Melhorias
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            PDCA + Kaizen — gerencie apontamentos de melhoria contínua no chão de fábrica.
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)} className="gap-2">
          <Plus className="size-4" /> Novo Apontamento
        </Button>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-card border rounded-lg p-2.5 mb-3 shrink-0 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Busca textual */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título..."
              className="pl-8 h-9 text-sm"
            />
          </div>

          {/* Filtro Setor */}
          <div className="w-full sm:w-auto min-w-[140px]">
            <Select value={selectedSector} onValueChange={setSelectedSector}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Setor: Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Setores</SelectItem>
                {SECTORS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Prioridade */}
          <div className="w-full sm:w-auto min-w-[140px]">
            <Select value={selectedPriority} onValueChange={setSelectedPriority}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Prioridade: Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Prioridades</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Categoria */}
          <div className="w-full sm:w-auto min-w-[140px]">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Categoria: Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Categorias</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Status */}
          <div className="w-full sm:w-auto min-w-[140px]">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Status: Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {IMPROVEMENT_COLUMNS.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Limpar filtros */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <X className="size-3.5" /> Limpar filtros
            </Button>
          )}

          <div className="text-xs text-muted-foreground ml-auto hidden md:block">
            {filteredItems.length} de {items.length} apontamentos
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-3 overflow-x-auto pb-3">
        {IMPROVEMENT_COLUMNS.map((status) => {
          const colItems = grouped[status] || []
          return (
            <div
              key={status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, status)}
              className={cn(
                'w-72 shrink-0 flex flex-col max-h-full rounded-xl border bg-slate-100/50 dark:bg-slate-900/50 p-2',
                status === 'Concluído' && 'bg-green-50/40 dark:bg-green-950/10',
                status === 'Reaberto' && 'bg-red-50/40 dark:bg-red-950/10',
              )}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="font-semibold text-sm">{status}</span>
                <Badge variant="outline" className="px-1.5 font-normal bg-background">
                  {colItems.length}
                </Badge>
              </div>

              {status === 'Identificado' && (
                <button
                  onClick={() => setWizardOpen(true)}
                  className="text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-md py-1.5 mb-2 flex items-center justify-center gap-1 transition-colors hover:bg-background"
                >
                  <Plus className="size-3.5" /> Adicionar
                </button>
              )}

              <ScrollArea className="flex-1 -mx-1 px-1">
                <div className="flex flex-col gap-2 pb-2">
                  {loading && (
                    <div className="text-center text-xs text-muted-foreground py-6">
                      Carregando...
                    </div>
                  )}
                  {!loading && colItems.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-6 border-2 border-dashed rounded-lg">
                      Vazio
                    </div>
                  )}
                  {colItems.map((imp) => (
                    <Card
                      key={imp.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, imp.id)}
                      onClick={() => openDetail(imp)}
                      className={cn(
                        'cursor-grab active:cursor-grabbing hover:shadow-md transition-all border-l-4 group',
                        PRIORITY_BORDER[imp.priority],
                      )}
                    >
                      <CardContent className="p-3 flex flex-col gap-1.5">
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="size-3.5 text-muted-foreground/40 mt-0.5 shrink-0 group-hover:text-muted-foreground" />
                          <span className="font-medium text-sm line-clamp-2 flex-1">
                            {imp.title}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pl-5">
                          {imp.sector && (
                            <Badge
                              variant="secondary"
                              className={cn('text-[10px]', SECTOR_COLORS[imp.sector])}
                            >
                              {imp.sector}
                            </Badge>
                          )}
                          <Badge
                            variant="secondary"
                            className={cn('text-[10px]', CATEGORY_COLORS[imp.category])}
                          >
                            {imp.category}
                          </Badge>
                          <Badge className={cn('text-[10px]', PRIORITY_COLORS[imp.priority])}>
                            {imp.priority}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground pl-5">
                          <CalendarDays className="size-3" />
                          {format(new Date(imp.created), 'dd/MM/yyyy', { locale: ptBR })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )
        })}
      </div>

      <ImprovementWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        user={simpleUser}
        onCreated={onCreated}
      />

      <ImprovementDetail
        improvement={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        user={simpleUser}
        onUpdated={onUpdated}
      />
    </div>
  )
}
