import { Truck } from 'lucide-react'

export interface NfSummaryValues {
  /** Mercadoria: soma de (quantidade × unit_price) dos itens da NF */
  products: number
  /** IPI total dos itens (individual, não rateia) */
  ipi: number
  /** ST total dos itens (individual, não rateia) */
  st: number
  /** Frete pago a terceiro (transportadora/uber) — NÃO soma no total da NF */
  freight?: number
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Resumo de valores da NF no rodapé dos diálogos de recebimento.
 * REGRA DO GESTOR: o frete NÃO soma no total da NF — normalmente é pago
 * separado a um terceiro (transportadora/uber). Vlr Total da NF =
 * Produtos + IPI + ST. O frete aparece em linha separada e destacada,
 * pois compõe o CUSTO do material (rateado), mas não o valor da nota.
 */
export function NfSummary({ products, ipi, st, freight = 0 }: NfSummaryValues) {
  const nfTotal = products + ipi + st
  const hasTaxes = ipi > 0.0001 || st > 0.0001

  return (
    <div className="rounded-lg border bg-slate-50/80 dark:bg-slate-900/80 border-slate-300 dark:border-slate-800 px-3 py-2 space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Produtos (R$)</span>
        <span className="notranslate font-medium" translate="no">
          {fmtBRL(products)}
        </span>
      </div>
      {ipi > 0.0001 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">IPI (R$)</span>
          <span className="notranslate font-medium" translate="no">
            {fmtBRL(ipi)}
          </span>
        </div>
      )}
      {st > 0.0001 && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">ST (R$)</span>
          <span className="notranslate font-medium" translate="no">
            {fmtBRL(st)}
          </span>
        </div>
      )}
      {freight > 0.0001 && (
        <div className="flex justify-between text-xs text-amber-800 dark:text-amber-300">
          <span className="flex items-center gap-1">
            <Truck className="size-3 shrink-0" />
            Frete — pago a terceiro, não soma na NF
          </span>
          <span className="notranslate font-medium" translate="no">
            {fmtBRL(freight)}
          </span>
        </div>
      )}
      <div className="flex justify-between border-t pt-1 text-xs font-semibold">
        <span>
          Vlr Total da NF (R$)
          {hasTaxes && freight > 0.0001 ? ' (mercadoria + IPI/ST)' : ''}
        </span>
        <span className="notranslate text-sm" translate="no">
          {fmtBRL(nfTotal)}
        </span>
      </div>
    </div>
  )
}
