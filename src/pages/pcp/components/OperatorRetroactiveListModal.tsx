import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { NoTranslate } from '@/components/NoTranslate'
import { getOperatorRetroactiveWithdrawals } from '@/services/retroactive-withdrawals'
import { useRealtime } from '@/hooks/use-realtime'
import type { RetroactiveWithdrawal } from '@/types'
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Loader2,
  FileQuestion,
  AlertCircle,
} from 'lucide-react'

interface OperatorRetroactiveListModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenNewRequest?: () => void
}

export function OperatorRetroactiveListModal({
  open,
  onOpenChange,
  onOpenNewRequest,
}: OperatorRetroactiveListModalProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [requests, setRequests] = useState<RetroactiveWithdrawal[]>([])
  const [loading, setLoading] = useState(false)

  const loadRequests = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const data = await getOperatorRetroactiveWithdrawals(user.id)
      setRequests(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar solicitações',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [user?.id, toast])

  useEffect(() => {
    if (open) {
      loadRequests()
    }
  }, [open, loadRequests])

  useRealtime('pcp_retroactive_withdrawals', () => {
    if (open) {
      loadRequests()
    }
  })

  const renderStatusBadge = (status: RetroactiveWithdrawal['status']) => {
    switch (status) {
      case 'Aprovada':
        return (
          <Badge className="bg-emerald-600 text-white font-bold gap-1 text-[11px]">
            <CheckCircle2 className="size-3" /> Aprovada
          </Badge>
        )
      case 'Rejeitada':
        return (
          <Badge variant="destructive" className="font-bold gap-1 text-[11px]">
            <XCircle className="size-3" /> Rejeitada
          </Badge>
        )
      case 'Pendente':
      default:
        return (
          <Badge
            variant="secondary"
            className="bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 font-bold gap-1 text-[11px]"
          >
            <Clock className="size-3 text-amber-600" /> Pendente de Análise
          </Badge>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[calc(100%-1.5rem)] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-5 pb-3 border-b bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <History className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black">
                  Minhas Solicitações de Baixa Retroativa
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Acompanhe o status e as respostas do PCP para suas solicitações em OPs encerradas.
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadRequests}
              disabled={loading}
              className="gap-1.5 h-8 text-xs shrink-0"
            >
              <RotateCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && requests.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="size-7 animate-spin text-amber-600" />
              <span className="text-xs">Carregando histórico...</span>
            </div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 space-y-3">
              <FileQuestion className="size-10 mx-auto opacity-40 text-amber-600" />
              <div>
                <p className="font-semibold text-sm text-foreground">
                  Você ainda não possui solicitações de baixa retroativa.
                </p>
                <p className="text-xs text-muted-foreground">
                  Quando componentes forem utilizados em OPs que já saíram da linha, você pode
                  solicitar a baixa diretamente aqui.
                </p>
              </div>
              {onOpenNewRequest && (
                <Button
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    onOpenNewRequest()
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  Criar Nova Solicitação
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => {
                const createdDate = req.created
                  ? new Date(req.created).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '-'

                const reviewedDate = req.reviewed_at
                  ? new Date(req.reviewed_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : null

                const reviewerName =
                  (req.expand?.reviewed_by as any)?.name ||
                  (req.expand?.reviewed_by as any)?.email ||
                  'Gestor do PCP'

                return (
                  <div
                    key={req.id}
                    className="p-4 rounded-xl border bg-card shadow-xs space-y-3 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-foreground">
                          Pedido {req.order_number}
                        </span>
                        {(req.expand?.order_id as any)?.op_number && (
                          <Badge variant="outline" className="font-mono text-xs font-semibold">
                            OP {(req.expand?.order_id as any)?.op_number}
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">{createdDate}</span>
                      </div>
                      <div>{renderStatusBadge(req.status)}</div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                          Componente Solicitado
                        </span>
                        <p className="font-bold text-foreground">
                          {req.material_code && (
                            <span className="font-mono text-primary mr-1">
                              [{req.material_code}]
                            </span>
                          )}
                          <NoTranslate text={req.material_description} />
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                          Quantidade
                        </span>
                        <p className="font-mono font-bold text-sm text-foreground">
                          {req.quantity} {req.unit || 'un'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                        Motivo Informado
                      </span>
                      <p className="text-xs text-foreground bg-slate-50 dark:bg-slate-900/60 p-2 rounded-md border mt-0.5 whitespace-pre-wrap">
                        {req.reason}
                      </p>
                    </div>

                    {/* Feedback da Análise do PCP */}
                    {req.status === 'Rejeitada' && req.review_note && (
                      <div className="p-3 rounded-lg border border-red-300 bg-red-50/80 dark:bg-red-950/20 text-red-900 dark:text-red-200 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertCircle className="size-4 text-red-600 shrink-0" />
                          Motivo da Rejeição pelo PCP ({reviewerName} em {reviewedDate}):
                        </div>
                        <p className="text-red-950 dark:text-red-100 pl-5 whitespace-pre-wrap">
                          {req.review_note}
                        </p>
                      </div>
                    )}

                    {req.status === 'Aprovada' && (
                      <div className="p-2.5 rounded-lg border border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                          <span>
                            Baixa executada no estoque físico e vinculada à OP por{' '}
                            <strong>{reviewerName}</strong> em {reviewedDate}.
                          </span>
                        </div>
                        {req.review_note && (
                          <span className="italic text-[11px] text-emerald-800 dark:text-emerald-300">
                            Obs: {req.review_note}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
