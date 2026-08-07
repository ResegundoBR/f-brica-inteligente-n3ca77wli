import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Inventory } from '@/types'
import { AlertTriangle, PackageX } from 'lucide-react'

interface CriticalStockPanelProps {
  inventory: Inventory[]
}

export function CriticalStockPanel({ inventory }: CriticalStockPanelProps) {
  const criticalItems = inventory.filter((i) => i.quantity <= (i.min_quantity || 0))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="size-4 text-red-500" />
          Estoque Crítico
        </CardTitle>
        <CardDescription>Itens com saldo menor ou igual ao estoque mínimo</CardDescription>
      </CardHeader>
      <CardContent>
        {criticalItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[120px] text-sm text-muted-foreground gap-2">
            <PackageX className="size-8 opacity-40" />
            Nenhum item em estoque crítico.
          </div>
        ) : (
          <div className="space-y-1 max-h-[220px] overflow-y-auto">
            {criticalItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 py-1.5 px-2 rounded bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{item.description}</p>
                  <p className="text-[10px] text-muted-foreground">Código: {item.code}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-red-600">
                    {item.quantity} {item.unit || ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Mín: {item.min_quantity || 0}</p>
                </div>
                <Badge variant="destructive" className="text-[9px] shrink-0">
                  Crítico
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
