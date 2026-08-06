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

const KLAXON_ADDRESS = 'Rua Salgado Filho, 570 - Pineville, Pinhais - PR - CEP 83.330-110'
const KLAXON_PHONE = '(41) 3091-8300'
const KLAXON_WHATSAPP = '41 8746 2093'
const KLAXON_INSTAGRAM = '@klaxonbrasil'

function formatOcNumber(num: string) {
  if (/^\d+$/.test(num)) return Number(num).toLocaleString('pt-BR')
  return num
}

export function OrdemCompraDocument({ oc, items, open, onOpenChange }: OrdemCompraDocumentProps) {
  if (!oc) return null

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const grandTotal = items.reduce(
    (sum, it) => sum + (it.total || (it.quantity || 0) * (it.unit_price || 0)),
    0,
  )

  const logoUrl = window.location.origin + '/klaxon-logo.svg'

  const deliveryInfo =
    oc.delivery_type === 'Retira' ? 'Retirada no fornecedor' : `Entrega: ${KLAXON_ADDRESS}`

  const handlePrint = () => {
    const rows = items
      .map(
        (it) =>
          `<tr><td>${it.code || '-'}</td><td>${it.description}</td><td class="r">${it.quantity}</td><td class="r">${formatCurrency(it.unit_price || 0)}</td><td class="r">${formatCurrency(it.total || (it.quantity || 0) * (it.unit_price || 0))}</td></tr>`,
      )
      .join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OC ${formatOcNumber(oc.oc_number)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:40px;color:#1a1a1a;}
      .header{display:flex;align-items:center;gap:20px;border-bottom:3px solid #0d1b4a;padding-bottom:16px;margin-bottom:20px;}
      .header img{height:70px;}
      .header-info h1{font-size:20px;margin:0;color:#0d1b4a;}
      .header-info p{margin:2px 0;font-size:11px;color:#555;}
      .oc-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
      .oc-title h2{font-size:18px;margin:0;}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin-bottom:12px;}
      .info-grid p{margin:3px 0;font-size:13px;}
      .delivery-box{font-size:13px;padding:10px;background:#e8eaf6;border-radius:4px;margin-bottom:12px;font-weight:500;}
      table{width:100%;border-collapse:collapse;margin:12px 0;}
      th,td{border:1px solid #ddd;padding:8px;font-size:12px;text-align:left;}
      th{background:#0d1b4a;color:#fff;font-weight:bold;}
      .r{text-align:right;}
      .total{font-size:16px;font-weight:bold;text-align:right;margin-top:12px;}
      .terms{margin-top:16px;font-size:12px;padding:12px;background:#f5f5f5;border-radius:4px;}
    </style></head><body>
    <div class="header">
      <img src="${logoUrl}" alt="Klaxon Brasil" />
      <div class="header-info">
        <h1>Klaxon Brasil</h1>
        <p><strong>Endereço:</strong> ${KLAXON_ADDRESS}</p>
        <p><strong>Telefone:</strong> ${KLAXON_PHONE} &nbsp;|&nbsp; <strong>WhatsApp:</strong> ${KLAXON_WHATSAPP} &nbsp;|&nbsp; <strong>Instagram:</strong> ${KLAXON_INSTAGRAM}</p>
      </div>
    </div>
    <div class="oc-title">
      <h2>Ordem de Compra Nº ${formatOcNumber(oc.oc_number)}</h2>
      <p>Data: ${format(new Date(), 'dd/MM/yyyy')}</p>
    </div>
    <div class="info-grid">
      <p><strong>Fornecedor:</strong> ${oc.supplier}</p>
      ${oc.expected_date ? `<p><strong>Previsão de Entrega:</strong> ${format(parseISO(oc.expected_date), 'dd/MM/yyyy')}</p>` : ''}
      <p><strong>Entrega / Retira:</strong> ${oc.delivery_type || '-'}</p>
      ${oc.payment_terms ? `<p><strong>Condições de Pagamento:</strong> ${oc.payment_terms}</p>` : ''}
    </div>
    <div class="delivery-box">${deliveryInfo}</div>
    <table><thead><tr><th>Código</th><th>Descrição</th><th class="r">Qtde</th><th class="r">Vl. Unit.</th><th class="r">Total</th></tr></thead>
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
          <DialogTitle>Ordem de Compra — {formatOcNumber(oc.oc_number)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4 border-b pb-4">
            <img src={logoUrl} alt="Klaxon Brasil" className="h-16" />
            <div className="text-sm">
              <h3 className="font-bold text-lg text-blue-900 dark:text-blue-400">Klaxon Brasil</h3>
              <p className="text-xs text-muted-foreground">{KLAXON_ADDRESS}</p>
              <p className="text-xs text-muted-foreground">
                Tel: {KLAXON_PHONE} | WhatsApp: {KLAXON_WHATSAPP} | Instagram: {KLAXON_INSTAGRAM}
              </p>
            </div>
          </div>
          <div className="flex justify-between items-start border-b pb-3">
            <h3 className="font-bold text-lg">Ordem de Compra Nº {formatOcNumber(oc.oc_number)}</h3>
            <p className="text-sm text-muted-foreground">{format(new Date(), 'dd/MM/yyyy')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <p className="text-sm">
              <strong>Fornecedor:</strong> {oc.supplier}
            </p>
            {oc.expected_date && (
              <p className="text-sm">
                <strong>Previsão de Entrega:</strong>{' '}
                {format(parseISO(oc.expected_date), 'dd/MM/yyyy')}
              </p>
            )}
            <p className="text-sm">
              <strong>Entrega / Retira:</strong> {oc.delivery_type || '-'}
            </p>
            {oc.payment_terms && (
              <p className="text-sm">
                <strong>Condições de Pagamento:</strong> {oc.payment_terms}
              </p>
            )}
          </div>
          <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-sm font-medium">
            {deliveryInfo}
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-sm">Código</th>
                <th className="text-left py-2 text-sm">Descrição</th>
                <th className="text-right py-2 text-sm">Qtde</th>
                <th className="text-right py-2 text-sm">Vl. Unit.</th>
                <th className="text-right py-2 text-sm">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b">
                  <td className="py-2 text-sm">{it.code || '-'}</td>
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
