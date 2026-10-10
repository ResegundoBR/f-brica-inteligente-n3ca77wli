import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  fetchResidualShortages,
  closeResidualShortage,
  ResidualItem,
  ResidualReportResponse,
} from '@/services/suprimentos-integrity'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle2, Clock, AlertTriangle, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { formatQuantity } from '@/lib/utils'

interface CloseResidualDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function CloseResidualDialog({ open, onOpenChange, onSuccess }: CloseResidualDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ResidualReportResponse | null>(null)
  const [activeTab, setActiveTab] = useState<'partials' | 'stale'>('partials')
  const [thresholdDays, setThresholdDays] = useState(30)

  // Item selecionado para confirmação de encerramento
  const [selectedItem, setSelectedItem] = useState<ResidualItem | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = async (days = thresholdDays) => {
    setLoading(true)
    try {
      const res = await fetchResidualShortages(days)
      setData(res)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar itens residuais',
        description: err.message || 'Falha ao buscar pendências do servidor.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadData(thresholdDays)
    }
  }, [open, thresholdDays])

  const handleOpenConfirm = (item: ResidualItem) => {
    setSelectedItem(item)
    setReason('')
    setConfirmOpen(true)
  }

  const handleConfirmClose = async () => {
    if (!selectedItem) return
    setSubmitting(true)
    try {
      const res = await closeResidualShortage(selectedItem.id, reason)
      toast({
        title: 'Saldo residual encerrado',
        description:
          selectedItem.type === 'recebido_parcial'
            ? `Saldo restante cancelado. Registro marcado como Recebido com auditoria.`
            : `Solicitação cancelada e retirada do fluxo com auditoria gravada.`,
      })
      setConfirmOpen(false)
      setSelectedItem(null)
      loadData(thresholdDays)
      onSuccess?.()
    } catch (err: any) {
      toast({
        title: 'Erro ao encerrar saldo residual',
        description: err.message || 'Falha na comunicação com o servidor.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const partialsCount = data?.partials_count || 0
  const staleCount = data?.stale_count || 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-indigo-600 dark:text-indigo-400" />
                <DialogTitle className="text-lg font-bold">
                  Encerrar Saldo Residual de Suprimentos
                </DialogTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadData(thresholdDays)}
                disabled={loading}
                className="h-8 text-xs gap-1"
              >
                <RotateCcw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Encerre saldos remanescentes de entregas parciais que não serão completadas, ou
              solicitações paradas em cotação/compra há mais de {thresholdDays} dias. Toda ação é
              individual e grava auditoria permanente.
            </p>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'partials' | 'stale')}
            className="flex-1 flex flex-col min-h-0 pt-2"
          >
            <div className="flex items-center justify-between gap-4 pb-2">
              <TabsList className="grid grid-cols-2 w-[380px]">
                <TabsTrigger value="partials" className="text-xs">
                  Recebido Parcial ({partialsCount})
                </TabsTrigger>
                <TabsTrigger value="stale" className="text-xs">
                  Paradas em Cotação/Compra ({staleCount})
                </TabsTrigger>
              </TabsList>

              {activeTab === 'stale' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Inativas há mais de:</span>
                  <select
                    className="h-7 text-xs rounded border bg-background px-2"
                    value={thresholdDays}
                    onChange={(e) => setThresholdDays(Number(e.target.value) || 30)}
                  >
                    <option value={15}>15 dias</option>
                    <option value={30}>30 dias</option>
                    <option value={60}>60 dias</option>
                    <option value={90}>90 dias</option>
                  </select>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="size-6 animate-spin mb-2" />
                <span className="text-xs">Carregando itens residuais...</span>
              </div>
            ) : (
              <>
                <TabsContent
                  value="partials"
                  className="flex-1 overflow-auto border rounded-md mt-0 min-h-[300px]"
                >
                  {!data?.partials || data.partials.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                      <CheckCircle2 className="size-8 text-emerald-500 mb-2" />
                      <p className="text-sm font-medium">Nenhum saldo parcial pendente</p>
                      <p className="text-xs mt-1">
                        Todas as entregas parciais foram resolvidas ou não há resíduos em aberto.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0">
                        <TableRow>
                          <TableHead className="w-[90px]">OP / Pedido</TableHead>
                          <TableHead className="w-[100px]">Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-[120px] text-center">Progresso</TableHead>
                          <TableHead className="w-[110px] text-center">Saldo Residual</TableHead>
                          <TableHead className="w-[110px] text-center">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.partials.map((item) => (
                          <TableRow key={item.id} className="text-xs">
                            <TableCell className="font-medium">
                              {item.op_number ? `OP ${item.op_number}` : '-'}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {item.code || '-'}
                            </TableCell>
                            <TableCell className="max-w-[280px] truncate" title={item.description}>
                              {item.description}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-[11px] font-mono">
                                {formatQuantity(item.received_quantity)} /{' '}
                                {formatQuantity(item.quantity)} un
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-bold text-amber-700 dark:text-amber-400">
                              {formatQuantity(item.remaining_quantity)} un faltante
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] text-amber-700 border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/40 font-semibold"
                                onClick={() => handleOpenConfirm(item)}
                              >
                                Encerrar Saldo
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent
                  value="stale"
                  className="flex-1 overflow-auto border rounded-md mt-0 min-h-[300px]"
                >
                  {!data?.stale || data.stale.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                      <CheckCircle2 className="size-8 text-emerald-500 mb-2" />
                      <p className="text-sm font-medium">
                        Nenhuma solicitação parada há mais de {thresholdDays} dias
                      </p>
                      <p className="text-xs mt-1">
                        O fluxo de cotações e compras está fluindo sem solicitações esquecidas.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0">
                        <TableRow>
                          <TableHead className="w-[90px]">OP / Pedido</TableHead>
                          <TableHead className="w-[100px]">Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-[90px] text-center">Status</TableHead>
                          <TableHead className="w-[90px] text-center">Qtd</TableHead>
                          <TableHead className="w-[110px] text-center">Inatividade</TableHead>
                          <TableHead className="w-[110px] text-center">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.stale.map((item) => (
                          <TableRow key={item.id} className="text-xs">
                            <TableCell className="font-medium">
                              {item.op_number ? `OP ${item.op_number}` : '-'}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {item.code || '-'}
                            </TableCell>
                            <TableCell className="max-w-[260px] truncate" title={item.description}>
                              {item.description}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-[10px]">
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-medium">
                              {formatQuantity(item.quantity)} un
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="flex items-center justify-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                                <Clock className="size-3" />
                                {item.days_inactive} dias
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] text-red-600 border-red-300 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/40 font-semibold"
                                onClick={() => handleOpenConfirm(item)}
                              >
                                Cancelar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </>
            )}
          </Tabs>

          <DialogFooter className="pt-3 border-t">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO DE CONFIRMAÇÃO INDIVIDUAL COM AUDITORIA */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600" />
              <span>
                {selectedItem?.type === 'recebido_parcial'
                  ? 'Confirmar Encerramento de Saldo Residual'
                  : 'Confirmar Cancelamento de Solicitação Parada'}
              </span>
            </DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg border space-y-1 font-mono">
                <div>
                  <strong>Item:</strong> [{selectedItem.code}] {selectedItem.description}
                </div>
                <div>
                  <strong>Destino:</strong>{' '}
                  {selectedItem.op_number ? `OP ${selectedItem.op_number}` : 'Geral'}
                </div>
                {selectedItem.type === 'recebido_parcial' ? (
                  <>
                    <div>
                      <strong>Recebido até agora:</strong>{' '}
                      {formatQuantity(selectedItem.received_quantity)} de{' '}
                      {formatQuantity(selectedItem.quantity)} un
                    </div>
                    <div className="text-amber-700 dark:text-amber-400 font-semibold">
                      <strong>Saldo a descartar:</strong>{' '}
                      {formatQuantity(selectedItem.remaining_quantity)} un
                    </div>
                  </>
                ) : (
                  <div>
                    <strong>Status atual:</strong> {selectedItem.status} (parado há{' '}
                    {selectedItem.days_inactive} dias)
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Motivo do encerramento (opcional):
                </label>
                <Input
                  placeholder="Ex: Fornecedor não entregará o saldo restante / Pedido cancelado..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                {selectedItem.type === 'recebido_parcial'
                  ? 'O registro será marcado como Recebido e receberá a nota de auditoria permanente no histórico.'
                  : 'A solicitação será cancelada com justificativa de inatividade gravada em auditoria.'}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Voltar
            </Button>
            <Button
              size="sm"
              className={
                selectedItem?.type === 'recebido_parcial'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold'
                  : 'bg-red-600 hover:bg-red-700 text-white font-semibold'
              }
              onClick={handleConfirmClose}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4 mr-2" />
              )}
              {selectedItem?.type === 'recebido_parcial'
                ? 'Encerrar Saldo'
                : 'Cancelar Solicitação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
