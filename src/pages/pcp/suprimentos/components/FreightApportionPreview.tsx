import { formatQuantity } from '@/lib/pcp-utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface FreightApportionRow {
  key: string
  label: string
  quantity: number
  unitPrice: number
  freightShare: number
  totalValue: number
}

interface FreightApportionPreviewProps {
  freight: number
  rows: FreightApportionRow[]
}

/**
 * Prévia do rateio de frete por VALOR: mostra, para cada item recebido,
 * o valor base, a parte do frete proporcional ao valor do item e o custo
 * unitário efetivo — apenas visual, não altera validações do modal.
 */
export function FreightApportionPreview({ freight, rows }: FreightApportionPreviewProps) {
  if (freight <= 0 || rows.length === 0) return null

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const sumBase = rows.reduce((s, r) => s + r.unitPrice * r.quantity, 0)
  const sumShare = rows.reduce((s, r) => s + r.freightShare, 0)

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-slate-50 dark:bg-slate-800/50 px-3 py-2 border-b text-xs font-semibold text-muted-foreground">
        Prévia do rateio de frete (proporcional ao valor dos itens){' '}
        <span className="notranslate" translate="no">
          — frete total: {fmtBRL(freight)}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Qtd</TableHead>
            <TableHead className="text-right">Valor base</TableHead>
            <TableHead className="text-right">Parte do frete</TableHead>
            <TableHead className="text-right">Custo unit. efetivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="text-xs notranslate" translate="no">
                {r.label}
              </TableCell>
              <TableCell className="text-right text-xs notranslate" translate="no">
                {formatQuantity(r.quantity)}
              </TableCell>
              <TableCell className="text-right text-xs notranslate" translate="no">
                {fmtBRL(r.unitPrice * r.quantity)}
              </TableCell>
              <TableCell className="text-right text-xs notranslate" translate="no">
                {fmtBRL(r.freightShare)}
              </TableCell>
              <TableCell className="text-right text-xs font-medium notranslate" translate="no">
                {r.quantity > 0
                  ? fmtBRL((r.unitPrice * r.quantity + r.freightShare) / r.quantity)
                  : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="px-3 py-2 border-t text-xs text-muted-foreground flex justify-between">
        <span>
          Mercadoria: <strong className="text-foreground">{fmtBRL(sumBase)}</strong>
        </span>
        <span>
          Frete rateado: <strong className="text-foreground">{fmtBRL(sumShare)}</strong>
        </span>
        <span>
          Total: <strong className="text-foreground">{fmtBRL(sumBase + sumShare)}</strong>
        </span>
      </div>
    </div>
  )
}
