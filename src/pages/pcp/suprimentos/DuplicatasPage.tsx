import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  CopyCheck,
  Search,
  AlertTriangle,
  Trash2,
  EyeOff,
  Edit2,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  ShieldAlert,
  Info,
  Filter,
} from 'lucide-react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { UserActionBadge } from '@/components/UserActionBadge'
import { ProductDossierModal } from './components/ProductDossierModal'
import { InventoryItemDialog } from './components/InventoryItemDialog'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { MasterComponent, Inventory } from '@/types'
import {
  getMasterComponents,
  deactivateMasterComponent,
  checkComponentUsage,
  deleteMasterComponent,
  ComponentUsageCheckResult,
} from '@/services/components'
import { detectDuplicateGroups, DuplicateGroup, DuplicateItemMeta } from '@/lib/duplicate-detector'

export default function DuplicatasPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [components, setComponents] = useState<MasterComponent[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])

  // Filtros de UI
  const [searchTerm, setSearchTerm] = useState('')
  const [hideInactive, setHideInactive] = useState(false)

  // Diálogo "Marcar como Inativo"
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false)
  const [itemToDeactivate, setItemToDeactivate] = useState<DuplicateItemMeta | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)

  // Diálogo "Excluir" (com checagem e dupla confirmação)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<DuplicateItemMeta | null>(null)
  const [isCheckingUsage, setIsCheckingUsage] = useState(false)
  const [usageCheckResult, setUsageCheckResult] = useState<ComponentUsageCheckResult | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1) // Etapa 1: Vínculos ok -> Etapa 2: Confirmação definitiva
  const [isDeleting, setIsDeleting] = useState(false)

  // Modais de edição e dossiê
  const [dossierOpen, setDossierOpen] = useState(false)
  const [dossierItem, setDossierItem] = useState<any>(null)
  const [editInventoryItem, setEditInventoryItem] = useState<Inventory | null>(null)

  // Carrega todos os componentes (com includeInactive = true) e o estoque
  const loadData = useCallback(
    async (quiet = false) => {
      if (!quiet) setIsLoading(true)
      else setIsRefreshing(true)

      try {
        const [comps, inv] = await Promise.all([
          getMasterComponents('', { includeInactive: true, expand: 'deactivated_by' }),
          pb.collection('inventory').getFullList<Inventory>(),
        ])
        setComponents(comps)
        setInventory(inv)
      } catch (err: any) {
        toast({
          title: 'Erro ao carregar dados',
          description: err.message || 'Não foi possível carregar os materiais do cadastro mestre.',
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  // Subscrições realtime para atualizar se houver mudanças no mestre ou inventário
  useRealtime('components', () => loadData(true))
  useRealtime('inventory', () => loadData(true))

  // Detecção dos grupos de duplicatas
  const allGroups = useMemo(() => {
    return detectDuplicateGroups(components, inventory)
  }, [components, inventory])

  // Filtragem dos grupos de acordo com a busca e o checkbox de inativos
  const filteredGroups = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()

    return allGroups
      .map((group) => {
        // Filtrar itens inativos se o toggle estiver ativo
        const filteredItems = hideInactive
          ? group.items.filter((it) => !it.isInactive)
          : group.items

        return {
          ...group,
          items: filteredItems,
        }
      })
      .filter((group) => {
        // Se após filtrar inativos o grupo ficou com menos de 2 itens, não é mais um grupo visível com o filtro ativo
        if (group.items.length < 2) return false

        if (!term) return true

        // Busca por código, descrição ou detalhe do grupo
        const matchDetail = group.reasonDetail?.toLowerCase().includes(term)
        const matchLabel = group.reasonLabel.toLowerCase().includes(term)
        const matchItems = group.items.some(
          (it) =>
            (it.component.code && it.component.code.toLowerCase().includes(term)) ||
            (it.component.description && it.component.description.toLowerCase().includes(term)) ||
            (it.inventoryItem?.code && it.inventoryItem.code.toLowerCase().includes(term)),
        )

        return matchDetail || matchLabel || matchItems
      })
  }, [allGroups, searchTerm, hideInactive])

  // Total de itens potencialmente duplicados encontrados
  const totalDuplicateItems = useMemo(() => {
    const uniqueIds = new Set<string>()
    allGroups.forEach((g) => {
      g.items.forEach((it) => uniqueIds.add(it.component.id))
    })
    return uniqueIds.size
  }, [allGroups])

  // -------------------------------------------------------------------------
  // AÇÃO 1: Marcar como Inativo
  // -------------------------------------------------------------------------
  const handleOpenDeactivate = (item: DuplicateItemMeta) => {
    setItemToDeactivate(item)
    setDeactivateModalOpen(true)
  }

  const handleConfirmDeactivate = async () => {
    if (!itemToDeactivate) return
    if (!user?.id) {
      toast({
        title: 'Usuário não autenticado',
        description: 'Faça login novamente para realizar esta ação.',
        variant: 'destructive',
      })
      return
    }

    setIsDeactivating(true)
    try {
      await deactivateMasterComponent(itemToDeactivate.component.id, user.id)
      toast({
        title: 'Componente inativado',
        description: `O item "${itemToDeactivate.component.description}" foi marcado como inativo e não aparecerá nas buscas ativas do sistema.`,
      })
      setDeactivateModalOpen(false)
      setItemToDeactivate(null)
      loadData(true)
    } catch (err: any) {
      toast({
        title: 'Erro ao inativar componente',
        description: err.message || 'Ocorreu um erro durante a inativação.',
        variant: 'destructive',
      })
    } finally {
      setIsDeactivating(false)
    }
  }

  // -------------------------------------------------------------------------
  // AÇÃO 2: Excluir (apenas para itens sem vínculo, com revalidação estrita)
  // -------------------------------------------------------------------------
  const handleOpenDelete = async (item: DuplicateItemMeta) => {
    setItemToDelete(item)
    setDeleteModalOpen(true)
    setDeleteStep(1)
    setIsCheckingUsage(true)
    setUsageCheckResult(null)

    try {
      // Revalidação dinâmica no backend (não confiar em dados obsoletos da tela)
      const result = await checkComponentUsage(item.component)
      setUsageCheckResult(result)
    } catch (err: any) {
      toast({
        title: 'Erro ao validar vínculos',
        description: err.message || 'Não foi possível verificar os vínculos do componente.',
        variant: 'destructive',
      })
    } finally {
      setIsCheckingUsage(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return
    if (!user?.id) {
      toast({
        title: 'Usuário não autenticado',
        description: 'Faça login novamente para realizar esta ação.',
        variant: 'destructive',
      })
      return
    }

    setIsDeleting(true)
    try {
      await deleteMasterComponent(itemToDelete.component, {
        id: user.id,
        name: user.name,
        email: user.email,
      })
      toast({
        title: 'Item excluído com sucesso',
        description: `O registro "${itemToDelete.component.description}" foi removido do cadastro mestre.`,
      })
      setDeleteModalOpen(false)
      setItemToDelete(null)
      setDeleteStep(1)
      loadData(true)
    } catch (err: any) {
      toast({
        title: 'Exclusão bloqueada ou erro',
        description: err.message || 'Não foi possível concluir a exclusão.',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Duplicatas e Limpeza de Materiais"
        description="Identificação segura de cadastros redundantes ou códigos divergentes no cadastro mestre. Nenhuma mesclagem automática é feita."
        icon={CopyCheck}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={isLoading || isRefreshing}
              className="text-xs"
            >
              <RefreshCw className={cn('size-3.5 mr-1.5', isRefreshing && 'animate-spin')} />
              Atualizar Análise
            </Button>
          </div>
        }
      />

      {/* CARDS DE RESUMO */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Grupos Sugeridos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-blue-600">{allGroups.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Agrupamentos de potenciais duplicatas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Itens Envolvidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-slate-800 dark:text-slate-200">
              {totalDuplicateItems}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cadastros com alguma suspeita de redundância
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Itens Inativos no Mestre
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-amber-600">
              {components.filter((c) => c.active === false).length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Já inativados e preservados para histórico
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Política de Segurança
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
              <ShieldAlert className="size-4 shrink-0 text-emerald-600" />
              <span>Sem mesclagem cega</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Exclusão permitida apenas sem histórico; inativação recomendada.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* BARRA DE FILTROS E CONTADOR */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por código, descrição ou motivo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-md border">
            <Checkbox
              id="hideInactive"
              checked={hideInactive}
              onCheckedChange={(checked) => setHideInactive(!!checked)}
            />
            <Label
              htmlFor="hideInactive"
              className="text-xs font-medium cursor-pointer text-slate-700 dark:text-slate-300"
            >
              Ocultar itens já inativos
            </Label>
          </div>
        </div>

        <div className="text-xs text-muted-foreground flex items-center gap-1.5 self-center">
          <Filter className="size-3.5" />
          <span>
            Exibindo <strong>{filteredGroups.length}</strong> de <strong>{allGroups.length}</strong>{' '}
            grupo(s)
          </span>
        </div>
      </div>

      {/* LISTAGEM DOS GRUPOS */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="size-8 animate-spin mb-3 text-blue-600" />
          <p className="font-medium text-sm">Analisando o cadastro mestre e o inventário...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500">
          <CheckCircle2 className="size-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            {searchTerm || hideInactive
              ? 'Nenhuma duplicata encontrada com os filtros atuais'
              : 'Nenhuma duplicata detectada no momento!'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {searchTerm || hideInactive
              ? 'Tente ajustar o termo de pesquisa ou desmarcar a opção de ocultar inativos.'
              : 'O cadastro mestre não possui códigos idênticos nem descrições redundantes segundo as regras de similaridade.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group, groupIdx) => {
            const hasMultipleActives = group.items.filter((it) => !it.isInactive).length > 1

            return (
              <Card
                key={group.id}
                className={cn(
                  'border shadow-sm overflow-hidden transition-all',
                  hasMultipleActives
                    ? 'border-amber-300/80 dark:border-amber-900/60'
                    : 'border-slate-200 dark:border-slate-800',
                )}
              >
                <CardHeader className="bg-slate-50/80 dark:bg-slate-800/40 pb-3 pt-3 px-4 border-b">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-200">
                        Grupo #{groupIdx + 1}
                      </span>
                      <Badge
                        variant={
                          group.reason === 'code_match'
                            ? 'destructive'
                            : group.reason === 'embedded_code'
                              ? 'default'
                              : 'secondary'
                        }
                        className="text-[11px]"
                      >
                        {group.reasonLabel}
                      </Badge>
                      {group.similarityScore !== undefined && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-mono',
                            group.similarityScore >= 95
                              ? 'border-red-400 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
                              : 'border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30',
                          )}
                        >
                          Similaridade: {group.similarityScore}%
                        </Badge>
                      )}
                    </div>
                    {group.reasonDetail && (
                      <span className="text-xs text-muted-foreground italic">
                        {group.reasonDetail}
                      </span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-100/40 dark:bg-slate-800/20">
                      <TableRow>
                        <TableHead className="w-[140px] text-xs">Código</TableHead>
                        <TableHead className="text-xs">Descrição</TableHead>
                        <TableHead className="w-[110px] text-xs text-center">Origem</TableHead>
                        <TableHead className="w-[110px] text-xs text-right">
                          Saldo Estoque
                        </TableHead>
                        <TableHead className="w-[140px] text-xs text-center">Status</TableHead>
                        <TableHead className="w-[260px] text-xs text-center">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item) => {
                        const code = item.component.code || item.inventoryItem?.code || '-'
                        const isInactive = item.isInactive

                        return (
                          <TableRow
                            key={item.component.id}
                            className={cn(
                              'transition-colors',
                              isInactive
                                ? 'bg-slate-100/60 dark:bg-slate-900/40 text-muted-foreground opacity-85'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                            )}
                          >
                            <TableCell className="font-mono text-xs font-semibold">
                              <div className="flex flex-col">
                                <span
                                  className={cn(
                                    code.startsWith('REF-')
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-blue-600 dark:text-blue-400',
                                  )}
                                >
                                  {code}
                                </span>
                                {item.component.source === 'catalog' && (
                                  <span className="text-[10px] text-muted-foreground font-sans">
                                    catálogo
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="text-xs">
                              <div className="space-y-1 max-w-xl">
                                <p
                                  className={cn(
                                    'font-medium text-slate-900 dark:text-slate-100 leading-snug',
                                    isInactive && 'line-through text-slate-500',
                                  )}
                                >
                                  {item.component.description}
                                </p>
                                {isInactive && item.component.deactivated_at && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                                    <UserActionBadge
                                      user={item.component.expand?.deactivated_by}
                                      date={item.component.deactivated_at}
                                      prefix="inativado por"
                                      showTime={true}
                                      compact={true}
                                    />
                                  </div>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="text-center text-xs">
                              <Badge variant="outline" className="text-[10px] font-normal">
                                {item.sourceLabel}
                              </Badge>
                            </TableCell>

                            <TableCell className="text-right text-xs">
                              {item.stockQuantity > 0 ? (
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {item.stockQuantity} {item.unit}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">0 {item.unit}</span>
                              )}
                            </TableCell>

                            <TableCell className="text-center text-xs">
                              {isInactive ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium"
                                >
                                  <EyeOff className="size-3 mr-1" /> Inativo
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300"
                                >
                                  Ativo
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell className="text-center text-xs">
                              <div className="flex items-center justify-center gap-1">
                                {/* Dossiê / Ficha */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                                  onClick={() => {
                                    setDossierItem(item.component)
                                    setDossierOpen(true)
                                  }}
                                  title="Ver Ficha do Produto"
                                >
                                  <FileSpreadsheet className="size-3 mr-1" /> Ficha
                                </Button>

                                {/* Editar estoque (se tiver inventoryItem) */}
                                {item.inventoryItem && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => setEditInventoryItem(item.inventoryItem || null)}
                                    title="Editar item de estoque"
                                  >
                                    <Edit2 className="size-3 mr-1" /> Editar
                                  </Button>
                                )}

                                {/* Marcar como Inativo */}
                                {!isInactive && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                                    onClick={() => handleOpenDeactivate(item)}
                                    title="Marcar componente como inativo"
                                  >
                                    <EyeOff className="size-3 mr-1" /> Inativar
                                  </Button>
                                )}

                                {/* Excluir (somente sem vínculos) */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                  onClick={() => handleOpenDelete(item)}
                                  title="Excluir componente do cadastro mestre (revalida vínculos)"
                                >
                                  <Trash2 className="size-3 mr-1" /> Excluir
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* =========================================================================
          MODAL: Marcar como Inativo (Confirmação com Rastreabilidade)
         ========================================================================= */}
      <Dialog open={deactivateModalOpen} onOpenChange={setDeactivateModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <EyeOff className="size-5" /> Confirmar Inativação do Componente
            </DialogTitle>
            <DialogDescription>
              O item continuará registrado para manter a integridade de ordens de produção,
              movimentações e compras passadas, mas não aparecerá mais nos autocompletes e novas
              buscas ativas.
            </DialogDescription>
          </DialogHeader>

          {itemToDeactivate && (
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-md border space-y-2 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] block">Código</span>
                <span className="font-mono font-semibold text-blue-600">
                  {itemToDeactivate.component.code || '-'}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] block">
                  Descrição
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {itemToDeactivate.component.description}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground border-t">
                <span>Saldo em Estoque: {itemToDeactivate.stockQuantity} un</span>
                <span>Origem: {itemToDeactivate.sourceLabel}</span>
              </div>
              <div className="pt-1 text-[11px] text-slate-500 border-t">
                Ação será assinada por: <strong>{user?.name || user?.email}</strong>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeactivateModalOpen(false)}
              disabled={isDeactivating}
            >
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleConfirmDeactivate}
              disabled={isDeactivating}
            >
              {isDeactivating ? 'Inativando...' : 'Marcar como Inativo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAL: Excluir (com Revalidação Estrita e Bloqueio se Houver Vínculos)
         ========================================================================= */}
      <Dialog
        open={deleteModalOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setDeleteModalOpen(open)
            if (!open) {
              setItemToDelete(null)
              setUsageCheckResult(null)
              setDeleteStep(1)
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="size-5" /> Exclusão Segura de Componente
            </DialogTitle>
            <DialogDescription>
              Validação estrita de integridade referencial em tempo real no servidor.
            </DialogDescription>
          </DialogHeader>

          {itemToDelete && (
            <div className="space-y-4 text-xs">
              {/* Resumo do item */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-md border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-600">
                    {itemToDelete.component.code || 'SEM CÓDIGO'}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {itemToDelete.sourceLabel}
                  </Badge>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {itemToDelete.component.description}
                </p>
              </div>

              {/* Estado do check de vínculos */}
              {isCheckingUsage ? (
                <div className="flex items-center justify-center p-6 gap-2 text-muted-foreground">
                  <RefreshCw className="size-4 animate-spin text-blue-600" />
                  <span>Verificando vínculos (estoque, compras, OPs, catálogo)...</span>
                </div>
              ) : usageCheckResult ? (
                !usageCheckResult.canDelete ? (
                  // BLOQUEIO COM EXPLICAÇÃO COMPLETA
                  <div className="bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-md p-4 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-red-800 dark:text-red-300 text-sm">
                          Exclusão Bloqueada — Item possui vínculos ativos
                        </h4>
                        <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                          Para preservar a integridade dos dados, este item não pode ser excluído
                          pois está referenciado em outros módulos:
                        </p>
                      </div>
                    </div>

                    <ul className="list-disc pl-6 space-y-1 text-xs text-red-800 dark:text-red-300">
                      {usageCheckResult.reasons.map((reason, idx) => (
                        <li key={idx} className="leading-tight">
                          {reason}
                        </li>
                      ))}
                    </ul>

                    <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded border border-red-200 dark:border-red-900/50 text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Info className="size-4 text-blue-600 shrink-0" />
                      <span>
                        <strong>Recomendação:</strong> Utilize a ação{' '}
                        <strong>&ldquo;Marcar como Inativo&rdquo;</strong> para manter o histórico
                        sem poluir novas consultas.
                      </span>
                    </div>
                  </div>
                ) : (
                  // SEM VÍNCULOS: PERMITIR ETAPAS DE CONFIRMAÇÃO
                  <div className="space-y-3">
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-md p-3 text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <strong className="block font-semibold">Nenhum vínculo encontrado.</strong>
                        Este item não possui movimentações, compras, vínculos com OPs nem uso em
                        produtos do catálogo. A exclusão definitiva é segura.
                      </div>
                    </div>

                    {deleteStep === 2 ? (
                      <div className="bg-red-50 dark:bg-red-950/50 border border-red-400 rounded-md p-3 text-xs text-red-700 dark:text-red-300 space-y-2">
                        <p className="font-bold">Segunda Confirmação Obrigatória:</p>
                        <p>
                          Tem absoluta certeza de que deseja apagar definitivamente o registro do
                          cadastro mestre? Esta ação não pode ser desfeita.
                        </p>
                        <p className="text-[11px] text-muted-foreground pt-1 border-t border-red-200 dark:border-red-900">
                          Ação será registrada na auditoria do sistema em nome de:{' '}
                          <strong>{user?.name || user?.email}</strong>.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              Fechar
            </Button>

            {usageCheckResult && !usageCheckResult.canDelete && itemToDelete && (
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => {
                  setDeleteModalOpen(false)
                  handleOpenDeactivate(itemToDelete)
                }}
              >
                <EyeOff className="size-4 mr-1.5" /> Marcar como Inativo
              </Button>
            )}

            {usageCheckResult && usageCheckResult.canDelete && (
              <>
                {deleteStep === 1 ? (
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteStep(2)}
                    disabled={isCheckingUsage || isDeleting}
                  >
                    Avançar para Exclusão
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    className="bg-red-700 hover:bg-red-800"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Excluindo...' : 'Confirmar e Excluir Definitivamente'}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAIS AUXILIARES: Dossiê e Edição de Estoque
         ========================================================================= */}
      <ProductDossierModal
        open={dossierOpen}
        onOpenChange={setDossierOpen}
        initialProduct={dossierItem}
      />

      <InventoryItemDialog
        item={editInventoryItem}
        open={!!editInventoryItem}
        onOpenChange={(o) => {
          if (!o) setEditInventoryItem(null)
        }}
      />
    </div>
  )
}
