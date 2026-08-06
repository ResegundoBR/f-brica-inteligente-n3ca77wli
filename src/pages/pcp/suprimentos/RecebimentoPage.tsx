import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MaterialShortage } from '@/types'
import { PackageCheck, Layers } from 'lucide-react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { SmartReceiveDialog } from './components/SmartReceiveDialog'
import { RecebimentoTable } from './components/RecebimentoTable'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function RecebimentoPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [receiveInputs, setReceiveInputs] = useState<Record<string, string>>({})
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [smartReceiveItem, setSmartReceiveItem] = useState<MaterialShortage | null>(null)
  const [grouped, setGrouped] = useState(false)
  const { toast } = useToast()

  const fetchShortages = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
        filter: 'status = "Compra" || status = "Recebido_Parcial"',
        sort: '-created',
        expand: 'order_id,requested_by',
      })
      const activePending = res.filter((item) => {
        const total = Number(item.quantity) || 0
        const received = Number(item.received_quantity) || 0
        return total === 0 || received < total
      })
      setShortages(activePending)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchShortages()
  }, [])

  useRealtime('material_shortages', fetchShortages)

  const handleReceive = async (item: MaterialShortage) => {
    const inputVal = receiveInputs[item.id]
    if (!inputVal) {
      toast({
        title: 'Erro',
        description: 'Informe a quantidade recebida.',
        variant: 'destructive',
      })
      return
    }
    const numQty = Number(inputVal)
    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast({ title: 'Erro', description: 'Quantidade inválida.', variant: 'destructive' })
      return
    }

    const currentReceived = Number(item.received_quantity) || 0
    const total = Number(item.quantity) || 0
    const newReceivedQty = currentReceived + numQty

    if (total > 0 && newReceivedQty > total) {
      toast({
        title: 'Erro',
        description: `A quantidade recebida (${newReceivedQty}) excede o total solicitado (${total}).`,
        variant: 'destructive',
      })
      return
    }

    const newStatus = total > 0 && newReceivedQty >= total ? 'Recebido' : 'Recebido_Parcial'
    const enteredCode = (codeInputs[item.id] ?? item.code ?? '').trim()
    const resolvedCode = enteredCode || `REF-${item.id.slice(-6).toUpperCase()}`

    setLoading((prev) => ({ ...prev, [item.id]: true }))
    try {
      await pb.collection('material_shortages').update(item.id, {
        received_quantity: newReceivedQty,
        status: newStatus,
        code: resolvedCode,
      })

      toast({
        title: 'Recebimento confirmado',
        description: `${numQty} unidade(s) recebidas. Total: ${newReceivedQty}/${total}.`,
      })

      setReceiveInputs((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      setCodeInputs((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      fetchShortages()
    } catch (err: unknown) {
      toast({ title: 'Erro', description: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  const summary = {
    total: shortages.length,
    partial: shortages.filter((s) => s.status === 'Recebido_Parcial').length,
    purchase: shortages.filter((s) => s.status === 'Compra').length,
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <SuprimentosHeader
          title="Recebimento"
          description="Confira o recebimento físico de materiais e atualize o estoque automaticamente."
          icon={PackageCheck}
        />
        <Button variant="outline" size="sm" onClick={() => setGrouped((g) => !g)}>
          <Layers className="w-4 h-4" />
          {grouped ? 'Lista' : 'Agrupar por fornecedor'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Aguardando Recebimento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Em Compra</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{summary.purchase}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recebimento Parcial</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{summary.partial}</p>
          </CardContent>
        </Card>
      </div>

      {shortages.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum item aguardando recebimento no momento.
        </div>
      ) : (
        <RecebimentoTable
          items={shortages}
          grouped={grouped}
          codeInputs={codeInputs}
          onCodeChange={(id, value) => setCodeInputs((prev) => ({ ...prev, [id]: value }))}
          onDistribuir={setSmartReceiveItem}
        />
      )}

      <SmartReceiveDialog
        item={smartReceiveItem}
        open={!!smartReceiveItem}
        onOpenChange={(o) => !o && setSmartReceiveItem(null)}
        onUpdate={fetchShortages}
      />
    </div>
  )
}
