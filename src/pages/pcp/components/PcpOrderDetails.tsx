import { PcpOrder, PcpOrderObservation } from '@/types'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { Paperclip, AlertCircle } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'
import { isSectorActiveForStage } from '@/lib/pcp-utils'

export function PcpOrderDetails({
  op,
  observations,
  onClose,
}: {
  op: PcpOrder | null
  observations: PcpOrderObservation[]
  onClose: () => void
}) {
  const today = startOfDay(new Date())
  const isDelayed = op
    ? op.status !== 'Concluído' && isBefore(parseISO(op.delivery_date), today)
    : false

  return (
    <Sheet open={!!op} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes da OP</SheetTitle>
          <SheetDescription>Pedido: {op?.order_number}</SheetDescription>
        </SheetHeader>
        {op && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">OP</Label>
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
                      ? 'Produto Especial'
                      : op.expand?.product_id?.name || '-'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Quantidade</Label>
                <p className="font-medium text-sm mt-1">{op.quantity}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Data de Entrega</Label>
                <p className="font-medium text-sm mt-1 flex items-center gap-2">
                  {format(parseISO(op.delivery_date), 'dd/MM/yyyy')}
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

              <div className="col-span-2 mt-2">
                <Label className="text-muted-foreground">Observações</Label>
                <div className="mt-2 space-y-3">
                  {observations.length > 0 ? (
                    observations.map((obs) => {
                      const highlighted = isSectorActiveForStage(obs.sector, op.stage)
                      return (
                        <div
                          key={obs.id}
                          className={cn(
                            'p-3 rounded-md text-sm border whitespace-pre-wrap',
                            highlighted
                              ? 'bg-yellow-100 border-yellow-400 text-yellow-900 dark:bg-yellow-900/40 dark:border-yellow-600 dark:text-yellow-200 font-medium'
                              : 'bg-muted text-foreground border-transparent',
                          )}
                        >
                          <span className="font-semibold block mb-1 opacity-80">{obs.sector}</span>
                          {obs.content}
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma observação cadastrada.</p>
                  )}
                </div>
              </div>

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
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
