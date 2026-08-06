import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { OrdemCompra, OrdemCompraItem } from '@/types'
import { format, parseISO } from 'date-fns'
import { Printer } from 'lucide-react'

interface OrdemCompraDocumentProps {
  oc: OrdemCompra | null
  items: OrdemCompraItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrdemCompraDocument({ oc, items, open, onOpenChange }: OrdemCompraDocumentProps) {
  if (!oc) return null

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const grandTotal = items.reduce(
    (sum, it) => sum + (it.total || (it.quantity || 0) * (it.unit_price || 0)),
    0,
  )

  const handlePrint = () => {
    const rows = items
      .map(
        (it) =>
          `<tr><td>${it.description}</td><td class="r">${it.quantity}</td><td class="r">${formatCurrency(it.unit_price || 0)}</td><td class="r">${formatCurrency(it.total || (it.quantity || 0) * (it.unit_price || 0))}</td></tr>`,
      )
      .join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${oc.oc_number}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:40px;color:#1a1a1a;}
      h1{font-size:22px;margin:0 0 4px;}
      .hdr{display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:20px;}
      .info p{margin:2px 0;font-size:13px;}
      table{width:100%;border-collapse:collapse;margin:16px 0;}
      th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left;}
      th{background:#f5f5f5;font-weight:bold;}
      .r{text-align:right;}
      .total{font-size:16px;font-weight:bold;text-align:right;margin-top:12px;}
      .terms{margin-top:20px;font-size:12px;padding:12px;background:#f9f9f9;border-radius:4px;}
    </style></head><body>
    <div class="hdr"><div><h1>Ordem de Compra</h1><p>${oc.oc_number}</p></div><div style="text-align:right"><p>Data: ${format(new Date(), 'dd/MM/yyyy')}</p></div></div>
    <div class="info">
      <p><strong>Fornecedor:</strong> ${oc.supplier}</p>
      ${oc.expected_date ? `<p><strong>Previsão de Entrega:</strong> ${format(parseISO(oc.expected_date), 'dd/MM/yyyy')}</p>` : ''}
    </div>
    <table><thead><tr><th>Descrição</th><th class="r">Qtde</th><th class="r">Vl. Unit.</th><th class="r">Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="total">Total Geral: ${formatCurrency(grandTotal)}</div>
    ${oc.delivery_terms ? `<div class="terms"><strong>Condições de Entrega:</strong><br/>${oc.delivery_terms}</div>` : ''}
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ordem de Compra — {oc.oc_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-between items-start border-b pb-3">
            <div>
              <h3 className="font-bold text-lg">Ordem de Compra</h3>
              <p className="text-sm text-muted-foreground">{oc.oc_number}</p>
            </div>
            <p className="text-sm text-muted-foreground">{format(new Date(), 'dd/MM/yyyy')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm">
              <strong>Fornecedor:</strong> {oc.supplier}
            </p>
            {oc.expected_date && (
              <p className="text-sm">
                <strong>Previsão de Entrega:</strong>{' '}
                {format(parseISO(oc.expected_date), 'dd/MM/yyyy')}
              </p>
            )}
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-sm">Descrição</th>
                <th className="text-right py-2 text-sm">Qtde</th>
                <th className="text-right py-2 text-sm">Vl. Unit.</th>
                <th className="text-right py-2 text-sm">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b">
                  <td className="py-2 text-sm">{it.description}</td>
                  <td className="text-right py-2 text-sm">{it.quantity}</td>
                  <td className="text-right py-2 text-sm">{formatCurrency(it.unit_price || 0)}</td>
                  <td className="text-right py-2 text-sm font-semibold">
                    {formatCurrency(it.total || (it.quantity || 0) * (it.unit_price || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-right">
            <span className="text-lg font-bold">Total Geral: {formatCurrency(grandTotal)}</span>
          </div>
          {oc.delivery_terms && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <p className="text-sm font-medium">Condições de Entrega</p>
              <p className="text-sm text-muted-foreground mt-1">{oc.delivery_terms}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4" /> Imprimir / Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
