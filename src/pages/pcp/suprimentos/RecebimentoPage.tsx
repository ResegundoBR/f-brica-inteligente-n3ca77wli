import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MaterialShortage, OrdemCompraItem } from '@/types'
import { PackageCheck, Layers, FileText, List } from 'lucide-react'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { SmartReceiveDialog } from './components/SmartReceiveDialog'
import { DirectInventoryReceiveDialog } from './components/DirectInventoryReceiveDialog'
import { RecebimentoTable, buildRecebimentoDisplayItems } from './components/RecebimentoTable'
import { getActiveOrdemCompraItens } from '@/services/ordens-compra'
import { useToast } from '@/hooks/use-toast'
import { OrdemCompra } from '@/types'
import { EntradaIntegralOcModal } from './components/EntradaIntegralOcModal'

export default function RecebimentoPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [activeOcItems, setActiveOcItems] = useState<OrdemCompraItem[]>([])
  const [inventoryMap, setInventoryMap] = useState<
    Map<string, { quantity: number; unit?: string }>
  >(new Map())
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({})
  const [smartReceiveItem, setSmartReceiveItem] = useState<MaterialShortage | null>(null)
  const [directReceiveOcItem, setDirectReceiveOcItem] = useState<OrdemCompraItem | null>(null)
  const [entradaIntegralOc, setEntradaIntegralOc] = useState<OrdemCompra | null>(null)
  const [viewMode, setViewMode] = useState<'oc' | 'supplier' | 'list'>('oc')
  const { toast } = useToast()

  const fetchShortages = async () => {
    try {
      const [res, ocItensRes, invRes] = await Promise.all([
        pb.collection('material_shortages').getFullList<MaterialShortage>({
          filter: 'status = "Compra" || status = "Recebido_Parcial"',
          sort: '-created',
          expand: 'order_id,requested_by',
        }),
        getActiveOrdemCompraItens(),
        pb
          .collection('inventory')
          .getFullList<{ code?: string; quantity?: number; unit?: string }>({
            fields: 'code,quantity,unit',
          })
          .catch(() => []),
      ])
      const activePending = res.filter((item) => {
        const total = Number(item.quantity) || 0
        const received = Number(item.received_quantity) || 0
        return total === 0 || received < total
      })
      setShortages(activePending)
      setActiveOcItems(ocItensRes)

      const invMap = new Map<string, { quantity: number; unit?: string }>()
      for (const inv of invRes) {
        if (inv.code) {
          invMap.set(inv.code.trim().toUpperCase(), {
            quantity: Number(inv.quantity) || 0,
            unit: inv.unit,
          })
        }
      }
      setInventoryMap(invMap)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchShortages()
  }, [])

  useRealtime('material_shortages', fetchShortages)
  useRealtime('ordens_de_compra', fetchShortages)
  useRealtime('ordem_compra_itens', fetchShortages)
  useRealtime('inventory', fetchShortages)

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
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'oc' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('oc')}
          >
            <FileText className="w-4 h-4" />
            Por Ordem de Compra
          </Button>
          <Button
            variant={viewMode === 'supplier' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('supplier')}
          >
            <Layers className="w-4 h-4" />
            Agrupar por Fornecedor
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="w-4 h-4" />
            Lista simples
          </Button>
        </div>
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
          viewMode={viewMode}
          activeOcItems={activeOcItems}
          inventoryMap={inventoryMap}
          codeInputs={codeInputs}
          onCodeChange={(id, value) => setCodeInputs((prev) => ({ ...prev, [id]: value }))}
          onDistribuir={setSmartReceiveItem}
          onDistribuirOcItem={setDirectReceiveOcItem}
          onEntradaIntegralOc={setEntradaIntegralOc}
        />
      )}

      {/* Modal de Entrada Integral da OC */}
      {entradaIntegralOc && (
        <EntradaIntegralOcModal
          open={!!entradaIntegralOc}
          onOpenChange={(o) => !o && setEntradaIntegralOc(null)}
          oc={entradaIntegralOc}
          items={activeOcItems.filter((it) => it.oc_id === entradaIntegralOc.id)}
          shortagesMap={new Map(shortages.map((s) => [s.id, s]))}
          inventoryMap={inventoryMap}
          onSuccess={fetchShortages}
        />
      )}

      <SmartReceiveDialog
        item={smartReceiveItem}
        open={!!smartReceiveItem}
        onOpenChange={(o) => !o && setSmartReceiveItem(null)}
        onUpdate={fetchShortages}
      />

      <DirectInventoryReceiveDialog
        ocItem={directReceiveOcItem}
        open={!!directReceiveOcItem}
        onOpenChange={(o) => !o && setDirectReceiveOcItem(null)}
        onUpdate={fetchShortages}
      />
    </div>
  )
}
