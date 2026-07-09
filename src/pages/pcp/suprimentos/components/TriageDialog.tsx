import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Package, Tags, Loader2 } from 'lucide-react'
import { MaterialShortage } from '@/types'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { EnhancedQuotationForm } from './EnhancedQuotationForm'

interface TriageDialogProps {
  item: MaterialShortage | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: () => void
}

export function TriageDialog({ item, open, onOpenChange, onUpdate }: TriageDialogProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [phase, setPhase] = useState<'triage' | 'quotation'>('triage')
  const [triagedItem, setTriagedItem] = useState<MaterialShortage | null>(null)

  const handleTriage = async (action: 'estoque' | 'cotacao') => {
    if (!item) return
    setLoading(action)
    try {
      if (action === 'estoque') {
        await pb.collection('material_shortages').update(item.id, {
          status: 'Liberado_Estoque',
        })
        toast.success('Item liberado do estoque')
        onUpdate()
        onOpenChange(false)
      } else {
        const today = new Date().toISOString().split('T')[0]
        await pb.collection('material_shortages').update(item.id, {
          quotation_date: today,
        })
        toast.success('Item enviado para cotação')
        onUpdate()
        setTriagedItem({ ...item, quotation_date: today })
        setPhase('quotation')
      }
    } catch {
      toast.error('Erro ao processar triagem')
    } finally {
      setLoading(null)
    }
  }

  const handleClose = (o: boolean) => {
    if (!o) {
      setPhase('triage')
      setTriagedItem(null)
    }
    onOpenChange(o)
  }

  if (!item && !triagedItem) return null
  const currentItem = triagedItem || item

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={phase === 'quotation' ? 'max-w-2xl' : 'max-w-md'}>
        {phase === 'triage' ? (
          <>
            <DialogHeader>
              <DialogTitle>Triagem de Solicitação</DialogTitle>
              <DialogDescription>Escolha o destino do item.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Código</span>
                  <span className="text-xs font-medium">{item?.code || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Descrição</span>
                  <span className="text-xs font-medium text-right max-w-[200px]">
                    {item?.description}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Quantidade</span>
                  <span className="text-xs font-bold">{item?.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Setor</span>
                  <span className="text-xs font-medium">{item?.sector}</span>
                </div>
                {item?.priority && (
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Prioridade</span>
                    <Badge variant="outline" className="text-[10px]">
                      {item.priority}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={() => handleTriage('estoque')}
                  disabled={!!loading}
                >
                  {loading === 'estoque' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Package className="w-4 h-4" />
                  )}
                  No Estoque
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => handleTriage('cotacao')}
                  disabled={!!loading}
                >
                  {loading === 'cotacao' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Tags className="w-4 h-4" />
                  )}
                  Para Cotação
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EnhancedQuotationForm
            item={currentItem!}
            onUpdate={onUpdate}
            onClose={() => handleClose(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
