import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MaterialShortage } from '@/types'
import { PackageCheck, Layers } from 'lucide-react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { SmartReceiveDialog } from './components/SmartReceiveDialog'
import { RecebimentoTable, buildRecebimentoDisplayItems } from './components/RecebimentoTable'
import { useToast } from '@/hooks/use-toast'

export default function RecebimentoPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({})
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

  const displayItems = useMemo(() => buildRecebimentoDisplayItems(shortages), [shortages])

  const summary = {
    total: displayItems.length,
    partial: displayItems.filter((d) => d.status === 'Recebido_Parcial').length,
    purchase: displayItems.filter((d) => d.status === 'Compra').length,
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
