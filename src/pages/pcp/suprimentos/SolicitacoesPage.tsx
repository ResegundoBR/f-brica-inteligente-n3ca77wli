import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaterialShortage } from '@/types'
import { ClipboardList, Plus, Copy, Tag } from 'lucide-react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import ShortageTable from '@/pages/pcp/components/ShortageTable'
import { NewShortageModal } from '@/pages/pcp/components/NewShortageModal'
import { useShortageStore } from '@/stores/useShortageStore'
import { useToast } from '@/hooks/use-toast'
import { extractFieldErrors } from '@/lib/pocketbase/errors'

export default function SolicitacoesPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [batchSupplierOpen, setBatchSupplierOpen] = useState(false)
  const [batchSupplierValue, setBatchSupplierValue] = useState('')
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([])
  const { toast } = useToast()
  const selectedIds = useShortageStore((s) => s.selectedIds)
  const clear = useShortageStore((s) => s.clear)

  const fetchShortages = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
        sort: '-created',
        expand: 'order_id,order_id.product_id,requested_by',
      })
      setShortages(res)
    } catch (err) {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchShortages()
    return () => clear()
  }, [clear])

  useRealtime('material_shortages', fetchShortages)

  const handleCopyQuotation = () => {
    const selectedItems = shortages.filter((s) => selectedIds.includes(s.id))
    if (selectedItems.length === 0) return
    const text = selectedItems.map((i) => `${i.quantity}x ${i.description}`).join('\n')
    navigator.clipboard.writeText(text)
    toast({ title: 'Copiado!', description: 'Lista de cotacao copiada.' })
    clear()
  }

  const fetchSupplierSuggestions = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList({ fields: 'supplier' })
      setSupplierSuggestions(
        Array.from(new Set(res.map((r: any) => r.supplier).filter(Boolean))) as string[],
      )
    } catch {
      /* ignored */
    }
  }

  const handleBatchSupplier = async () => {
    if (!batchSupplierValue.trim()) {
      toast({ title: 'Erro', description: 'Informe um fornecedor', variant: 'destructive' })
      return
    }
    try {
      for (const id of selectedIds) {
        await pb
          .collection('material_shortages')
          .update(id, { supplier: batchSupplierValue.trim() })
      }
      toast({
        title: 'Fornecedor atribuido',
        description: `${selectedIds.length} item(s) atualizado(s).`,
      })
      setBatchSupplierOpen(false)
      setBatchSupplierValue('')
      clear()
    } catch (err: any) {
      const errors = extractFieldErrors(err)
      const errorMsg =
        Object.values(errors).join(' ') || err.message || 'Falha ao atribuir fornecedor.'
      toast({ title: 'Erro', description: errorMsg, variant: 'destructive' })
    }
  }

  const triagemItems = shortages.filter((s) => s.status === 'Pendente')

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Solicitacoes"
        description="Triagem de solicitacoes da fabrica: usar estoque ou iniciar compra."
        icon={ClipboardList}
        action={
          <Button
            onClick={() => setModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="size-4 mr-2" /> Nova Solicitacao
          </Button>
        }
      />

      <NewShortageModal open={modalOpen} onOpenChange={setModalOpen} />

      {triagemItems.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhuma solicitacao pendente.
        </div>
      ) : (
        <ShortageTable items={triagemItems} allShortages={shortages} />
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="bg-primary text-primary-foreground shadow-lg rounded-full px-6 py-3 flex items-center gap-4">
            <span className="font-medium">{selectedIds.length} item(s) selecionado(s)</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                fetchSupplierSuggestions()
                setBatchSupplierOpen(true)
              }}
              className="rounded-full"
            >
              <Tag className="w-4 h-4 mr-2" /> Atribuir Fornecedor
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopyQuotation}
              className="rounded-full"
            >
              <Copy className="w-4 h-4 mr-2" /> Copiar Cotacao
            </Button>
          </div>
        </div>
      )}

      <Dialog open={batchSupplierOpen} onOpenChange={setBatchSupplierOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Atribuir Fornecedor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Input
                value={batchSupplierValue}
                onChange={(e) => setBatchSupplierValue(e.target.value)}
                placeholder="Nome do Fornecedor..."
                list="batch-sup-sug"
              />
              <datalist id="batch-sup-sug">
                {supplierSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Sera aplicado a {selectedIds.length} item(s).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchSupplierOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleBatchSupplier}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
