import { PcpOrder, PcpOrderObservation } from '@/types'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { format, parseISO, isBefore, startOfDay, isValid } from 'date-fns'
import { Paperclip, AlertCircle, Clock, Pencil, Trash2, Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'
import { OutsourcingPanel } from './OutsourcingPanel'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import { PcpOrderDelivery } from '@/types'

export function PcpOrderDetails({
  op,
  observations,
  onClose,
  onEdit,
  onDelete,
  isAdmin,
}: {
  op: PcpOrder | null
  observations: PcpOrderObservation[]
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  isAdmin: boolean
}) {
  const [logs, setLogs] = useState<any[]>([])
  const [deliveries, setDeliveries] = useState<PcpOrderDelivery[]>([])

  useEffect(() => {
    if (op) {
      pb.collection('pcp_order_logs')
        .getFullList({
          filter: `order_id="${op.id}"`,
          sort: '-created',
          expand: 'user_id',
        })
        .then(setLogs)
        .catch(console.error)

      pb.collection('pcp_order_deliveries')
        .getFullList<PcpOrderDelivery>({
          filter: `order_id="${op.id}"`,
          sort: '-created',
          expand: 'created_by',
        })
        .then(setDeliveries)
        .catch(console.error)
    } else {
      setLogs([])
      setDeliveries([])
    }
  }, [op])

  const today = startOfDay(new Date())
  const deliveryDateObj = op?.delivery_date ? parseISO(op.delivery_date) : null
  const isValidDeliveryDate = deliveryDateObj && isValid(deliveryDateObj)

  const isDelayed =
    op && isValidDeliveryDate
      ? op.status !== 'Concluído' && isBefore(startOfDay(deliveryDateObj), today)
      : false

  const obsBySector = observations.reduce(
    (acc, obs) => {
      if (!acc[obs.sector]) acc[obs.sector] = []
      acc[obs.sector].push(obs)
      return acc
    },
    {} as Record<string, PcpOrderObservation[]>,
  )

  return (
    <Sheet open={!!op} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes da OP</SheetTitle>
        </SheetHeader>
        {isAdmin && op && (
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
              <Pencil className="size-4 mr-2" />
              Editar OP
            </Button>
            <Button variant="destructive" size="sm" className="flex-1" onClick={onDelete}>
              <Trash2 className="size-4 mr-2" />
              Excluir OP
            </Button>
          </div>
        )}
        {op && (
          <div className="mt-6 space-y-6">
            {op.manual_priority === 2 && (
              <div className="bg-lime-400 text-black p-4 rounded-md border border-lime-600 flex items-center gap-2 font-bold">
                <span className="text-xl">⚡</span>
                <span>⚠️ Prazo Especial – Atenção de Todos os Setores</span>
              </div>
            )}
            {op.status === 'Parado' && (
              <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-md border border-red-200 dark:border-red-900">
                <h3 className="font-semibold text-red-800 dark:text-red-400 mb-2 flex items-center">
                  <AlertCircle className="size-4 mr-2" /> Gargalo de Produção
                </h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      Motivo:{' '}
                    </span>
                    <span className="text-sm text-red-600 dark:text-red-200">
                      {op.bottleneck_reason}
                    </span>
                  </div>
                  {op.bottleneck_details && (
                    <div>
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">
                        Detalhes:{' '}
                      </span>
                      <span className="text-sm text-red-600 dark:text-red-200 whitespace-pre-wrap">
                        {op.bottleneck_details}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Número do Pedido</Label>
                <p className="font-medium text-sm mt-1">{op.order_number || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Número da OP</Label>
                <p className="font-medium text-sm mt-1">{op.op_number || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Cliente</Label>
                <p className="font-medium text-sm mt-1">
                  {op.expand?.client_id?.name || op.client_name}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Produto</Label>
                <p className="font-medium text-sm mt-1">
                  {op.op_type === 'Assistência'
                    ? op.manual_product_name
                    : op.op_type === 'Especial'
                      ? op.manual_product_name || 'Produto Especial'
                      : op.expand?.product_id?.name || '-'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Quantidade</Label>
                <p className="font-medium text-sm mt-1">{op.quantity} un</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                  Expedido {op.delivered_quantity || 0}/{op.quantity} — pendente{' '}
                  {Math.max(0, op.quantity - (op.delivered_quantity || 0))}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Data de Entrega</Label>
                <p className="font-medium text-sm mt-1 flex items-center gap-2">
                  {isValidDeliveryDate ? format(deliveryDateObj, 'dd/MM/yyyy') : '-'}
                  {isDelayed && <span className="text-red-500 text-xs font-bold">(Atrasado)</span>}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <p className="font-medium text-sm mt-1">{op.status}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Etapa Atual</Label>
                <p className="font-medium text-sm mt-1">{op.stage}</p>
              </div>

              <div className="col-span-2 mt-2 flex items-center justify-between p-3 border rounded-md bg-red-50/50 dark:bg-red-950/20">
                <div>
                  <Label className="text-red-600 dark:text-red-400 font-bold">Urgência</Label>
                  <p className="text-xs text-muted-foreground">
                    Sinaliza esta OP como emergência no painel de operadores
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-xs font-bold',
                      op.manual_priority === 1 ? 'text-red-600' : 'text-slate-400',
                    )}
                  >
                    {op.manual_priority === 1 ? 'EMERGÊNCIA' : 'NORMAL'}
                  </span>
                  <Switch
                    checked={op.manual_priority === 1}
                    onCheckedChange={async (checked) => {
                      const newVal = checked ? 1 : 0
                      await pb.collection('pcp_orders').update(op.id, { manual_priority: newVal })
                    }}
                  />
                </div>
              </div>

              <div className="col-span-2 mt-2">
                <Label className="text-muted-foreground">Observações</Label>
                <div className="mt-2 space-y-4">
                  {observations.length > 0 ? (
                    Object.entries(obsBySector).map(([sector, obsList]) => (
                      <div key={sector}>
                        <h4 className="font-semibold text-sm mb-2 opacity-80">{sector}</h4>
                        <div className="space-y-2">
                          {obsList.map((obs) => {
                            return (
                              <div
                                key={obs.id}
                                className="p-3 rounded-md text-sm border whitespace-pre-wrap bg-yellow-200 border-yellow-400 text-yellow-950 shadow-sm flex flex-col gap-1"
                              >
                                <span className="text-[10px] opacity-70 font-semibold uppercase tracking-wider">
                                  {obs.created && isValid(new Date(obs.created))
                                    ? format(new Date(obs.created), 'dd/MM/yyyy HH:mm')
                                    : '-'}
                                </span>
                                <span>{obs.content}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma observação cadastrada.</p>
                  )}
                </div>

                <div className="mt-8 space-y-4">
                  <Label className="text-muted-foreground">Histórico de Movimentação</Label>
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="text-sm p-3 border rounded-md bg-slate-50 dark:bg-slate-900/50"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-semibold">{log.action}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                            {log.created && isValid(new Date(log.created))
                              ? format(new Date(log.created), 'dd/MM/yyyy HH:mm')
                              : '-'}
                          </span>
                        </div>
                        {log.stage && (
                          <div className="text-xs text-muted-foreground">Etapa: {log.stage}</div>
                        )}
                        {log.expand?.user_id && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Por: {log.expand.user_id.name || log.expand.user_id.email}
                          </div>
                        )}
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <p className="text-sm text-muted-foreground">Nenhum histórico registrado.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Seção de Entregas / Expedição Parcial */}
              <div className="col-span-2 mt-2 space-y-3 p-3 border rounded-lg bg-slate-50/70 dark:bg-slate-900/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="size-4 text-teal-600" />
                    <Label className="font-semibold text-foreground">Expedição e Entregas</Label>
                  </div>
                  <Badge
                    variant={(op.delivered_quantity || 0) >= op.quantity ? 'default' : 'outline'}
                    className={cn(
                      'text-xs',
                      (op.delivered_quantity || 0) >= op.quantity
                        ? 'bg-green-600 text-white'
                        : (op.delivered_quantity || 0) > 0
                          ? 'border-blue-500 text-blue-600'
                          : 'text-muted-foreground',
                    )}
                  >
                    Expedido {op.delivered_quantity || 0}/{op.quantity} — pendente{' '}
                    {Math.max(0, op.quantity - (op.delivered_quantity || 0))}
                  </Badge>
                </div>

                {deliveries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma entrega ou expedição registrada ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {deliveries.map((deliv) => (
                      <div
                        key={deliv.id}
                        className="p-2.5 rounded border bg-background text-xs space-y-1 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {deliv.quantity} un expedida(s)
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            {deliv.data_saida
                              ? format(new Date(deliv.data_saida), 'dd/MM/yyyy')
                              : format(new Date(deliv.created), 'dd/MM/yyyy HH:mm')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1 border-t text-[11px]">
                          <div>
                            <span className="font-medium text-foreground">NF: </span>
                            {deliv.nf || '-'}
                          </div>
                          <div>
                            <span className="font-medium text-foreground">Transportadora: </span>
                            {deliv.transportadora || '-'}
                          </div>
                          {deliv.notes && (
                            <div className="col-span-2">
                              <span className="font-medium text-foreground">Obs: </span>
                              {deliv.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <OutsourcingPanel op={op} />

              {op.annex && (
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Anexo</Label>
                  <div>
                    <a
                      href={pb.files.getURL(op, op.annex)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-500 hover:underline flex items-center mt-1 text-sm font-medium"
                    >
                      <Paperclip className="mr-1 size-4" /> Visualizar Documento
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
