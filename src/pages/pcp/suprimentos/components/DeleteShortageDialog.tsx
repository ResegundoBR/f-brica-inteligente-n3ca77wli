import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { MaterialShortage, OrdemCompra, OrdemCompraItem } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, Trash2, Ban, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface DeleteShortageDialogProps {
  item: MaterialShortage | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface LinkedOcInfo {
  item: OrdemCompraItem
  oc?: OrdemCompra
}

export function DeleteShortageDialog({
  item,
  open,
  onOpenChange,
  onSuccess,
}: DeleteShortageDialogProps) {
  const [checking, setChecking] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [linkedOcs, setLinkedOcs] = useState<LinkedOcInfo[]>([])

  useEffect(() => {
    if (!open || !item) {
      setLinkedOcs([])
      return
    }

    let isMounted = true
    setChecking(true)

    pb.collection('ordem_compra_itens')
      .getFullList<OrdemCompraItem>({
        filter: `material_shortage_id = "${item.id}"`,
        expand: 'oc_id',
      })
      .then((records) => {
        if (!isMounted) return
        const linked: LinkedOcInfo[] = records.map((r) => ({
          item: r,
          oc: r.expand?.oc_id,
        }))
        setLinkedOcs(linked)
      })
      .catch((err) => {
        console.error('Erro ao verificar itens de OC vinculados:', err)
      })
      .finally(() => {
        if (isMounted) setChecking(false)
      })

    return () => {
      isMounted = false
    }
  }, [open, item])

  if (!item) return null

  const handleCancelShortage = async () => {
    setCancelling(true)
    try {
      await pb.collection('material_shortages').update(item.id, {
        status: 'Cancelado',
      })
      toast.success('Solicitação cancelada com sucesso. Histórico preservado.')
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error(`Erro ao cancelar solicitação: ${getErrorMessage(err)}`)
    } finally {
      setCancelling(false)
    }
  }

  const handleDeletePermanent = async () => {
    setDeleting(true)
    try {
      await pb.collection('material_shortages').delete(item.id)
      toast.success('Registro excluído definitivamente com sucesso.')
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error(`Erro ao excluir definitivamente: ${getErrorMessage(err)}`)
    } finally {
      setDeleting(false)
    }
  }

  const isBusy = cancelling || deleting || checking

  return (
    <Dialog open={open} onOpenChange={(v) => !isBusy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Trash2 className="w-5 h-5 text-red-500" />
            Remover solicitação de compra
          </DialogTitle>
          <DialogDescription>
            Escolha como deseja remover este item da lista de compras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Item details */}
          <div className="bg-slate-50 dark:bg-slate-900 border rounded-lg p-3 text-sm space-y-1">
            <p className="font-semibold text-foreground">{item.description}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {item.code && (
                <span>
                  Código: <strong className="text-foreground">{item.code}</strong>
                </span>
              )}
              <span>
                Quantidade: <strong className="text-foreground">{item.quantity}</strong>
              </span>
              {item.supplier && (
                <span>
                  Fornecedor: <strong className="text-foreground">{item.supplier}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Warning if linked to Ordem de Compra */}
          {checking ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Verificando vínculos com Ordens de Compra...</span>
            </div>
          ) : (
            linkedOcs.length > 0 && (
              <Alert
                variant="destructive"
                className="border-amber-400/50 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertTitle className="text-amber-900 dark:text-amber-200 font-semibold">
                  Aviso: este item está dentro de uma Ordem de Compra (OC)
                </AlertTitle>
                <AlertDescription className="text-amber-800 dark:text-amber-300 text-xs mt-1">
                  Este item está vinculado a {linkedOcs.length} registro(s) de Ordem de Compra:
                  <ul className="list-disc pl-5 mt-1 space-y-0.5">
                    {linkedOcs.map((l) => (
                      <li key={l.item.id}>
                        {l.oc?.oc_number ? `OC Nº ${l.oc.oc_number}` : `OC ID ${l.item.oc_id}`}
                        {l.oc?.supplier ? ` (${l.oc.supplier})` : ''} — {l.item.quantity} un
                        {l.oc?.status ? ` [${l.oc.status}]` : ''}
                      </li>
                    ))}
                  </ul>
                  Excluir definitivamente pode causar inconsistências na OC correspondente.
                </AlertDescription>
              </Alert>
            )
          )}

          {/* Options explanation */}
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <span className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                <Ban className="w-3.5 h-3.5 text-amber-500" />
                Cancelar solicitação (Recomendado)
              </span>
              Muda o status do item para <strong className="text-foreground">"Cancelado"</strong>. O
              item deixa de aparecer na página de Compras, mas seu histórico fica preservado no
              sistema para rastreabilidade.
            </div>

            <div className="p-2.5 rounded-md border border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/20">
              <span className="font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5 mb-1">
                <Trash2 className="w-3.5 h-3.5" />
                Excluir definitivamente
              </span>
              Apaga permanentemente o registro do banco de dados. Esta ação é irreversível.
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() => onOpenChange(false)}
            className="sm:mr-auto"
          >
            Fechar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isBusy}
            onClick={handleDeletePermanent}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Excluir definitivamente
          </Button>
          <Button
            type="button"
            disabled={isBusy}
            onClick={handleCancelShortage}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {cancelling && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Cancelar solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
