/**
 * Resumo de valores da NF de uma entrega (regra do gestor):
 * - Produtos = mercadoria (quantidade × preço unitário)
 * - Total da NF = Produtos + IPI + ST
 * - O frete NÃO soma no total da NF: normalmente é pago a um terceiro
 *   (transportadora/uber), por isso viaja em linha separada.
 */
export interface NfTotalsInput {
  quantity: number
  unit_price?: number | string
  ipi_value?: number | string
  st_value?: number | string
}

export interface NfTotals {
  products: number
  ipi: number
  st: number
  freight: number
  /** Total da NF = Produtos + IPI + ST (frete fora) */
  nfTotal: number
}

const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function computeNfTotals(items: NfTotalsInput[], freight = 0): NfTotals {
  let products = 0
  let ipi = 0
  let st = 0
  for (const it of items || []) {
    products += num(it.quantity) * num(it.unit_price)
    ipi += num(it.ipi_value)
    st += num(it.st_value)
  }
  return {
    products: round2(products),
    ipi: round2(ipi),
    st: round2(st),
    freight: round2(num(freight)),
    nfTotal: round2(products + ipi + st),
  }
}
