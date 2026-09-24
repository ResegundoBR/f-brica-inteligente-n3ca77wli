import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { ShoppingCart, FileText, XCircle, Loader2, Layers } from 'lucide-react'
import { ShortageGroup } from '@/lib/shortage-grouping'
import { format, parseISO } from 'date-fns'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { NoTranslate } from '@/components/NoTranslate'
import { UserActionBadge } from '@/components/UserActionBadge'

interface TriageGroupDetailDialogProps {
  group: ShortageGroup | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onAction: () => void
}

export function TriageGroupDetailDialog({
  group,
  open,
  onOpenChange,
  onAction,
}: TriageGroupDetailDialogProps) {
  const { toast } = useToast()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  if (!group) return null

  const handleGroupAction = async (status: 'Cotação' | 'Cancelado') => {
    setLoadingAction(status)
    try {
      for (const item of group.items) {
        await pb.collection('material_shortages').update(item.id, {
          status,
          ...(status === 'Cotação' && {
            quotation_date: new Date().toISOString().split('T')[0],
          }),
        })
      }
      toast({
        title:
          status === 'Cotação' ? 'Lote enviado para cotação' : 'Solicitações do lote reprovadas',
        description: `${group.items.length} registro(s) de ${group.description} atualizado(s).`,
      })
      onOpenChange(false)
      onAction()
    } catch (err: any) {
      toast({
        title: 'Erro ao processar lote',
        description: err.message || 'Falha ao atualizar registros.',
        variant: 'destructive',
      })
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-blue-600" />
            <span>
              Decisão em Lote — <NoTranslate as="span">{group.description}</NoTranslate>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Resumo do lote consolidado */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">Código:</span>
              <span className="font-semibold notranslate" translate="no">
                {group.code || '-'}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Quantidade Total:</span>
              <span
                className="font-bold text-blue-700 dark:text-blue-300 notranslate"
                translate="no"
              >
                {group.totalQuantity} un
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">OPs Atendidas:</span>
              <span className="font-semibold flex items-center gap-1">
                <Layers className="size-3.5 text-blue-600" /> {group.items.length} registro(s) (
                {group.opCount} OP(s))
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Prioridade Geral:</span>
              {group.highestPriority ? (
                <Badge
                  variant="outline"
                  className={
                    group.highestPriority === 'Urgente'
                      ? 'border-red-500 text-red-600'
                      : 'border-yellow-500 text-yellow-600'
                  }
                >
                  {group.highestPriority}
                </Badge>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Registros individuais deste código ({group.items.length} OPs/solicitações)
            </h4>
            <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-800/60 text-[11px]">
                  <TableRow>
                    <TableHead className="w-[80px]">Data</TableHead>
                    <TableHead className="text-right w-[60px]">Qtde</TableHead>
                    <TableHead className="w-[100px]">Setor</TableHead>
                    <TableHead className="w-[110px]">Solicitante</TableHead>
                    <TableHead className="w-[90px]">Nº Pedido</TableHead>
                    <TableHead className="w-[90px]">Nº OP</TableHead>
                    <TableHead className="w-[100px]">Necessidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {group.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-muted-foreground">
                        {it.created ? format(parseISO(it.created), 'dd/MM/yy') : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold notranslate" translate="no">
                        {it.quantity}
                      </TableCell>
                      <TableCell>{it.sector || '-'}</TableCell>
                      <TableCell>
                        <UserActionBadge
                          user={it.expand?.requested_by}
                          date={it.created}
                          prefix="por"
                          compact={true}
                          fallbackText="-"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground notranslate" translate="no">
                        {it.expand?.order_id?.order_number || '-'}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground font-medium notranslate"
                        translate="no"
                      >
                        {it.expand?.order_id?.op_number || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {it.expected_date ? format(parseISO(it.expected_date), 'dd/MM/yy') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic">
            * A decisão abaixo será aplicada a todos os {group.items.length} registros acima
            simultaneamente.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => handleGroupAction('Cotação')}
            disabled={!!loadingAction}
          >
            {loadingAction === 'Cotação' ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="size-4 mr-2" />
            )}
            Autorizar e Enviar Grupo para Cotação
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => handleGroupAction('Cancelado')}
            disabled={!!loadingAction}
          >
            {loadingAction === 'Cancelado' ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="size-4 mr-2" />
            )}
            Reprovar Todos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
