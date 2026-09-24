import { useState, useEffect, useCallback, useMemo } from 'react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'
import { isPcpManager } from '@/lib/message-sector'
import { NoTranslate } from '@/components/NoTranslate'
import {
  getAllRetroactiveWithdrawals,
  approveRetroactiveWithdrawal,
  rejectRetroactiveWithdrawal,
  getOpBomWithWithdrawalComparison,
} from '@/services/retroactive-withdrawals'
import type { RetroactiveWithdrawal, RetroactiveBomItem } from '@/types'
import {
  PackageCheck,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCw,
  Loader2,
  Clock,
  ShieldAlert,
  Calendar,
  Check,
  X,
  User as UserIcon,
} from 'lucide-react'

export default function BaixasRetroativasPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const isManager = isPcpManager(user)

  const [requests, setRequests] = useState<RetroactiveWithdrawal[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Pendente' | 'Aprovada' | 'Rejeitada'>(
    'Pendente',
  )

  // Mapeamento de comparação com BOM por ID da OP
  // Armazena a lista de itens da BOM por order_id para checagem rápida de teto
  const [bomCache, setBomCache] = useState<Record<string, RetroactiveBomItem[]>>({})
  const [loadingBomForOrder, setLoadingBomForOrder] = useState<Record<string, boolean>>({})

  // Diálogo de Aprovação
  const [approvingItem, setApprovingItem] = useState<RetroactiveWithdrawal | null>(null)
  const [approvalNote, setApprovalNote] = useState('')
  const [isApproving, setIsApproving] = useState(false)

  // Diálogo de Rejeição
  const [rejectingItem, setRejectingItem] = useState<RetroactiveWithdrawal | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [isRejecting, setIsRejecting] = useState(false)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllRetroactiveWithdrawals()
      setRequests(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar baixas retroativas',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  useRealtime('pcp_retroactive_withdrawals', () => {
    loadRequests()
  })

  // Pré-carrega a BOM de cada OP presente nas solicitações pendentes para comparação de teto
  useEffect(() => {
    const orderIds = Array.from(
      new Set(
        requests
          .filter((r) => r.status === 'Pendente')
          .map((r) => r.order_id)
          .filter(Boolean),
      ),
    )

    for (const orderId of orderIds) {
      if (bomCache[orderId] || loadingBomForOrder[orderId]) continue

      setLoadingBomForOrder((prev) => ({ ...prev, [orderId]: true }))
      getOpBomWithWithdrawalComparison(orderId)
        .then((items) => {
          setBomCache((prev) => ({ ...prev, [orderId]: items }))
        })
        .catch((err) => {
          console.warn(`Erro ao carregar BOM da OP ${orderId}:`, err)
        })
        .finally(() => {
          setLoadingBomForOrder((prev) => ({ ...prev, [orderId]: false }))
        })
    }
  }, [requests, bomCache, loadingBomForOrder])

  /**
   * Obtém a métrica da BOM correspondente ao componente da solicitação.
   */
  const getBomComparison = (
    req: RetroactiveWithdrawal,
  ): {
    found: boolean
    engineeringQty: number
    alreadyWithdrawnQty: number
    ceiling: number
    exceedsCeiling: boolean
  } => {
    const items = bomCache[req.order_id]
    if (!items || items.length === 0) {
      return {
        found: false,
        engineeringQty: 0,
        alreadyWithdrawnQty: 0,
        ceiling: 0,
        exceedsCeiling: false,
      }
    }

    const code = (req.material_code || '').trim().toLowerCase()
    const desc = (req.material_description || '').trim().toLowerCase()

    const match = items.find((i) => {
      const itemCode = (i.code || '').trim().toLowerCase()
      const itemDesc = (i.description || '').trim().toLowerCase()
      if (code && itemCode && code === itemCode) return true
      return itemDesc === desc
    })

    if (!match) {
      return {
        found: false,
        engineeringQty: 0,
        alreadyWithdrawnQty: 0,
        ceiling: 0,
        exceedsCeiling: false,
      }
    }

    const ceiling = match.suggestedMaxQty
    const exceeds = req.quantity > ceiling

    return {
      found: true,
      engineeringQty: match.engineeringQty,
      alreadyWithdrawnQty: match.alreadyWithdrawnQty,
      ceiling,
      exceedsCeiling: exceeds,
    }
  }

  // Filtragem da tabela
  const filteredRequests = useMemo(() => {
    let result = requests

    if (statusFilter !== 'Todos') {
      result = result.filter((r) => r.status === statusFilter)
    }

    const q = searchTerm.trim().toLowerCase()
    if (q) {
      result = result.filter((r) => {
        const orderNum = (r.order_number || '').toLowerCase()
        const opNum = ((r.expand?.order_id as any)?.op_number || '').toLowerCase()
        const code = (r.material_code || '').toLowerCase()
        const desc = (r.material_description || '').toLowerCase()
        const reqBy = (
          (r.expand?.requested_by as any)?.name ||
          (r.expand?.requested_by as any)?.email ||
          ''
        ).toLowerCase()
        const reason = (r.reason || '').toLowerCase()

        return (
          orderNum.includes(q) ||
          opNum.includes(q) ||
          code.includes(q) ||
          desc.includes(q) ||
          reqBy.includes(q) ||
          reason.includes(q)
        )
      })
    }

    return result
  }, [requests, statusFilter, searchTerm])

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'Pendente').length,
    [requests],
  )

  // Manipulador de Aprovação
  const handleOpenApproveModal = (req: RetroactiveWithdrawal) => {
    setApprovingItem(req)
    setApprovalNote('')
  }

  const handleConfirmApproval = async () => {
    if (!approvingItem || !user) return

    if (!isManager) {
      toast({
        title: 'Acesso negado',
        description: 'Apenas gestores do PCP têm permissão para aprovar baixas retroativas.',
        variant: 'destructive',
      })
      return
    }

    setIsApproving(true)
    try {
      await approveRetroactiveWithdrawal({
        withdrawalId: approvingItem.id,
        reviewedByUserId: user.id,
        reviewerName: user.name || user.email,
        reviewNote: approvalNote.trim() || undefined,
      })

      toast({
        title: 'Baixa retroativa aprovada!',
        description: `Movimentação de saída registrada no estoque para a OP ${
          (approvingItem.expand?.order_id as any)?.op_number || approvingItem.order_number
        }.`,
      })

      setApprovingItem(null)
      loadRequests()
    } catch (err: any) {
      toast({
        title: 'Erro ao aprovar baixa retroativa',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsApproving(false)
    }
  }

  // Manipulador de Rejeição
  const handleOpenRejectModal = (req: RetroactiveWithdrawal) => {
    setRejectingItem(req)
    setRejectNote('')
  }

  const handleConfirmRejection = async () => {
    if (!rejectingItem || !user) return

    if (!isManager) {
      toast({
        title: 'Acesso negado',
        description: 'Apenas gestores do PCP têm permissão para rejeitar solicitações.',
        variant: 'destructive',
      })
      return
    }

    if (!rejectNote.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe o motivo da rejeição para que o operador possa compreender.',
        variant: 'destructive',
      })
      return
    }

    setIsRejecting(true)
    try {
      await rejectRetroactiveWithdrawal({
        withdrawalId: rejectingItem.id,
        reviewedByUserId: user.id,
        reviewNote: rejectNote.trim(),
      })

      toast({
        title: 'Solicitação rejeitada',
        description:
          'A solicitação foi marcada como Rejeitada e nenhuma baixa foi efetuada no estoque.',
      })

      setRejectingItem(null)
      loadRequests()
    } catch (err: any) {
      toast({
        title: 'Erro ao rejeitar solicitação',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Baixas Retroativas em OP Encerrada"
        description="Fila de aprovação de baixas manuais solicitadas por operadores para OPs concluídas nos últimos 30 dias."
        icon={PackageCheck}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadRequests}
              disabled={loading}
              className="gap-1.5 h-10 font-bold"
            >
              <RotateCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
        }
      />

      {/* Trava visual informativa para não gestores */}
      {!isManager && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-sm flex items-center gap-3">
          <ShieldAlert className="size-5 shrink-0 text-amber-600" />
          <span>
            <strong>Modo somente leitura:</strong> Apenas gestores do PCP têm autorização para
            aprovar ou rejeitar solicitações de baixa retroativa.
          </span>
        </div>
      )}

      {/* Controles de filtro */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={statusFilter === 'Pendente' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('Pendente')}
            className={`font-bold relative ${
              statusFilter === 'Pendente' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''
            }`}
          >
            Pendentes
            {pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-red-600 text-white font-bold">
                {pendingCount}
              </span>
            )}
          </Button>

          <Button
            size="sm"
            variant={statusFilter === 'Aprovada' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('Aprovada')}
            className={
              statusFilter === 'Aprovada'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold'
                : ''
            }
          >
            Aprovadas
          </Button>

          <Button
            size="sm"
            variant={statusFilter === 'Rejeitada' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('Rejeitada')}
            className={
              statusFilter === 'Rejeitada' ? 'bg-red-600 hover:bg-red-700 text-white font-bold' : ''
            }
          >
            Rejeitadas
          </Button>

          <Button
            size="sm"
            variant={statusFilter === 'Todos' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('Todos')}
          >
            Todas ({requests.length})
          </Button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            placeholder="Buscar OP, item, operador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 text-xs sm:text-sm"
          />
        </div>
      </div>

      {/* Tabela de Solicitações */}
      <div className="border rounded-xl bg-card shadow-xs overflow-hidden">
        {loading && requests.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="size-8 animate-spin text-amber-600" />
            <span className="text-sm">Carregando solicitações de baixa retroativa...</span>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground space-y-1">
            <p className="font-semibold text-base text-foreground">
              Nenhuma solicitação encontrada para o filtro atual.
            </p>
            <p className="text-xs">
              Quando operadores solicitarem baixas retroativas em OPs encerradas, elas aparecerão
              aqui para análise.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900">
                  <TableHead className="font-bold text-xs uppercase tracking-wider w-[140px]">
                    Ordem / OP
                  </TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider min-w-[200px]">
                    Item / Componente
                  </TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-center w-[120px]">
                    Qtd Solicitada
                  </TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider min-w-[190px]">
                    Comparação Teto (BOM − Baixado)
                  </TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider min-w-[220px]">
                    Motivo do Operador
                  </TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider w-[160px]">
                    Solicitante / Data
                  </TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-center w-[110px]">
                    Status
                  </TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-right w-[180px]">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((req) => {
                  const comparison = getBomComparison(req)
                  const requesterName =
                    (req.expand?.requested_by as any)?.name ||
                    (req.expand?.requested_by as any)?.email ||
                    'Operador'
                  const reviewerName =
                    (req.expand?.reviewed_by as any)?.name ||
                    (req.expand?.reviewed_by as any)?.email ||
                    'Gestor PCP'

                  const createdDate = req.created
                    ? new Date(req.created).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-'

                  const opNumber = (req.expand?.order_id as any)?.op_number || '-'

                  return (
                    <TableRow
                      key={req.id}
                      className={
                        comparison.exceedsCeiling && req.status === 'Pendente'
                          ? 'bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50/80 dark:hover:bg-red-950/30'
                          : undefined
                      }
                    >
                      {/* OP / Pedido */}
                      <TableCell className="align-top py-3">
                        <div className="font-mono font-bold text-xs text-foreground">
                          Pedido {req.order_number}
                        </div>
                        {opNumber !== '-' && (
                          <div className="font-mono text-[11px] text-muted-foreground">
                            OP {opNumber}
                          </div>
                        )}
                        {(req.expand?.order_id as any)?.client_name && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[130px]">
                            {(req.expand?.order_id as any)?.client_name}
                          </div>
                        )}
                      </TableCell>

                      {/* Componente */}
                      <TableCell className="align-top py-3">
                        <div className="space-y-0.5">
                          {req.material_code && (
                            <span className="font-mono text-xs font-bold text-primary mr-1.5">
                              [{req.material_code}]
                            </span>
                          )}
                          <NoTranslate
                            text={req.material_description}
                            className="font-semibold text-xs text-foreground"
                          />
                        </div>
                      </TableCell>

                      {/* Quantidade Solicitada */}
                      <TableCell className="align-top py-3 text-center">
                        <span className="font-mono font-black text-sm text-foreground">
                          {req.quantity}
                        </span>{' '}
                        <span className="text-xs text-muted-foreground">{req.unit || 'un'}</span>
                      </TableCell>

                      {/* Comparação com Teto BOM − Baixado (com AVISO VERMELHO quando excede) */}
                      <TableCell className="align-top py-3">
                        {comparison.found ? (
                          <div className="space-y-1">
                            <div className="text-xs flex items-center gap-1.5">
                              <span className="text-muted-foreground">Teto:</span>
                              <strong className="text-foreground">
                                {comparison.ceiling} {req.unit || 'un'}
                              </strong>
                              <span className="text-[10px] text-muted-foreground">
                                (Eng: {comparison.engineeringQty} | Baixado:{' '}
                                {comparison.alreadyWithdrawnQty})
                              </span>
                            </div>

                            {comparison.exceedsCeiling ? (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600 text-white text-[11px] font-bold shadow-xs animate-pulse">
                                <AlertTriangle className="size-3.5 shrink-0" />
                                <span>EXCEDE O TETO (+{req.quantity - comparison.ceiling})</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold">
                                <Check className="size-3" /> Dentro do teto da BOM
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Sem comparação direta na BOM
                          </span>
                        )}
                      </TableCell>

                      {/* Motivo do Operador */}
                      <TableCell className="align-top py-3">
                        <p className="text-xs text-foreground bg-slate-50 dark:bg-slate-900/60 p-2 rounded border whitespace-pre-wrap leading-relaxed max-w-sm">
                          {req.reason}
                        </p>
                      </TableCell>

                      {/* Solicitante / Data */}
                      <TableCell className="align-top py-3">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1">
                          <UserIcon className="size-3 text-muted-foreground" />
                          <span className="truncate max-w-[130px]">{requesterName}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="size-3 text-muted-foreground" />
                          {createdDate}
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="align-top py-3 text-center">
                        {req.status === 'Pendente' && (
                          <Badge
                            variant="secondary"
                            className="bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 font-bold text-[11px]"
                          >
                            <Clock className="size-3 mr-1 text-amber-600" /> Pendente
                          </Badge>
                        )}
                        {req.status === 'Aprovada' && (
                          <Badge className="bg-emerald-600 text-white font-bold text-[11px]">
                            <CheckCircle2 className="size-3 mr-1" /> Aprovada
                          </Badge>
                        )}
                        {req.status === 'Rejeitada' && (
                          <Badge variant="destructive" className="font-bold text-[11px]">
                            <XCircle className="size-3 mr-1" /> Rejeitada
                          </Badge>
                        )}
                      </TableCell>

                      {/* Ações (Apenas Gestor do PCP pode aprovar/rejeitar quando Pendente) */}
                      <TableCell className="align-top py-3 text-right">
                        {req.status === 'Pendente' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs font-bold gap-1"
                              disabled={!isManager}
                              title={
                                isManager
                                  ? 'Rejeitar solicitação (exige motivo)'
                                  : 'Apenas gestores do PCP podem rejeitar'
                              }
                              onClick={() => handleOpenRejectModal(req)}
                            >
                              <X className="size-3.5" /> Rejeitar
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              disabled={!isManager}
                              title={
                                isManager
                                  ? 'Aprovar e efetuar baixa de estoque imediata vinculada à OP'
                                  : 'Apenas gestores do PCP podem aprovar'
                              }
                              onClick={() => handleOpenApproveModal(req)}
                            >
                              <Check className="size-3.5" /> Aprovar
                            </Button>
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground space-y-0.5 text-right">
                            <p>
                              Por: <strong className="text-foreground">{reviewerName}</strong>
                            </p>
                            {req.review_note && (
                              <p
                                className="italic max-w-[180px] truncate ml-auto"
                                title={req.review_note}
                              >
                                &quot;{req.review_note}&quot;
                              </p>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* DIÁLOGO DE APROVAÇÃO */}
      <Dialog open={!!approvingItem} onOpenChange={(open) => !open && setApprovingItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-6" /> Aprovar Baixa Retroativa
            </DialogTitle>
            <DialogDescription className="text-xs">
              A aprovação registrará uma movimentação de saída no estoque com vínculo direto à OP e
              Pedido.
            </DialogDescription>
          </DialogHeader>

          {approvingItem && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900 space-y-1.5">
                <p>
                  <strong>OP:</strong> Pedido {approvingItem.order_number}{' '}
                  {(approvingItem.expand?.order_id as any)?.op_number
                    ? `| OP ${(approvingItem.expand?.order_id as any)?.op_number}`
                    : ''}
                </p>
                <p>
                  <strong>Componente:</strong>{' '}
                  {approvingItem.material_code ? `[${approvingItem.material_code}] ` : ''}
                  <NoTranslate text={approvingItem.material_description} />
                </p>
                <p>
                  <strong>Quantidade a Baixar:</strong>{' '}
                  <span className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-300">
                    {approvingItem.quantity} {approvingItem.unit || 'un'}
                  </span>
                </p>
                <p>
                  <strong>Solicitante:</strong>{' '}
                  {(approvingItem.expand?.requested_by as any)?.name ||
                    (approvingItem.expand?.requested_by as any)?.email}
                </p>
                <p>
                  <strong>Motivo do Operador:</strong> {approvingItem.reason}
                </p>
              </div>

              {/* Alerta de teto excedido se houver */}
              {getBomComparison(approvingItem).exceedsCeiling && (
                <div className="p-2.5 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <strong className="block">
                      Atenção: A quantidade excede o teto da engenharia!
                    </strong>
                    <span>
                      Você está aprovando uma retirada que ultrapassa a soma calculada (BOM − baixas
                      anteriores). A saída no estoque será registrada mesmo assim.
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="appr-note" className="text-xs font-semibold">
                  Observação do Gestor (Opcional)
                </Label>
                <Textarea
                  id="appr-note"
                  placeholder="Ex: Verificado no chão de fábrica e autorizado..."
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  className="min-h-[60px] text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isApproving}
              onClick={() => setApprovingItem(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              disabled={isApproving}
              onClick={handleConfirmApproval}
            >
              {isApproving ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" /> Registrando Baixa...
                </>
              ) : (
                <>
                  <Check className="size-4 mr-2" /> Confirmar Baixa no Estoque
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO DE REJEIÇÃO (EXIGE MOTIVO) */}
      <Dialog open={!!rejectingItem} onOpenChange={(open) => !open && setRejectingItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2 text-red-600">
              <XCircle className="size-6" /> Rejeitar Solicitação de Baixa
            </DialogTitle>
            <DialogDescription className="text-xs">
              Informe obrigatoriamente a justificativa da rejeição para que o operador saiba o
              motivo.
            </DialogDescription>
          </DialogHeader>

          {rejectingItem && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900 space-y-1">
                <p>
                  <strong>OP:</strong> Pedido {rejectingItem.order_number}{' '}
                  {(rejectingItem.expand?.order_id as any)?.op_number
                    ? `| OP ${(rejectingItem.expand?.order_id as any)?.op_number}`
                    : ''}
                </p>
                <p>
                  <strong>Componente:</strong>{' '}
                  <NoTranslate text={rejectingItem.material_description} /> (
                  {rejectingItem.quantity} {rejectingItem.unit || 'un'})
                </p>
                <p>
                  <strong>Motivo do Operador:</strong> {rejectingItem.reason}
                </p>
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="rej-note"
                  className="text-xs font-semibold text-red-700 dark:text-red-300"
                >
                  Motivo da Rejeição (Obrigatório) *
                </Label>
                <Textarea
                  id="rej-note"
                  placeholder="Ex: Quantidade incompatível, material já contabilizado em outra OP..."
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  className="min-h-[80px] text-xs border-red-300 focus-visible:ring-red-400"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isRejecting}
              onClick={() => setRejectingItem(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="font-bold"
              disabled={isRejecting || !rejectNote.trim()}
              onClick={handleConfirmRejection}
            >
              {isRejecting ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" /> Rejeitando...
                </>
              ) : (
                <>
                  <X className="size-4 mr-2" /> Confirmar Rejeição
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
