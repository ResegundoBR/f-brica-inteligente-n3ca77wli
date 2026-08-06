import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, FileText, XCircle } from 'lucide-react'
import { MaterialShortage } from '@/types'
import { format, parseISO } from 'date-fns'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'

interface TriageDetailDialogProps {
  item: MaterialShortage | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onAction: () => void
}

export function TriageDetailDialog({
  item,
  open,
  onOpenChange,
  onAction,
}: TriageDetailDialogProps) {
  const { toast } = useToast()
  if (!item) return null

  const handleTriage = async (status: 'Cotação' | 'Cancelado') => {
    try {
      await pb.collection('material_shortages').update(item.id, { status })
      toast({
        title: status === 'Cotação' ? 'Enviado para cotação' : 'Solicitação reprovada',
      })
      onOpenChange(false)
      onAction()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-blue-600" />
            Triagem — {item.description}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Código:</span>{' '}
              <span className="font-medium">{item.code || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Quantidade:</span>{' '}
              <span className="font-medium">{item.quantity}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Setor:</span>{' '}
              <span className="font-medium">{item.sector || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Data:</span>{' '}
              <span className="font-medium">{format(parseISO(item.created), 'dd/MM/yyyy')}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo:</span>{' '}
              <span className="font-medium">{item.request_type || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Prioridade:</span>{' '}
              {item.priority && (
                <Badge variant="outline" className="text-xs">
                  {item.priority}
                </Badge>
              )}
            </div>
          </div>
          {item.observation && (
            <div className="text-sm">
              <span className="text-muted-foreground">Observação:</span>
              <p className="mt-1 p-2 bg-slate-50 dark:bg-slate-800 rounded text-sm">
                {item.observation}
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => handleTriage('Cotação')}
          >
            <ShoppingCart className="size-4 mr-2" /> Para Cotação
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => handleTriage('Cancelado')}
          >
            <XCircle className="size-4 mr-2" /> Reprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
