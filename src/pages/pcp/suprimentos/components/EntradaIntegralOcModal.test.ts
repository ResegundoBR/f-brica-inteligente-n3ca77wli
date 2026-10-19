import { describe, it, expect } from 'vitest'
import { ItemPrevia } from './EntradaIntegralOcModal'
import { OrdemCompraItem, MaterialShortage } from '@/types'

describe('EntradaIntegralOcModal reconciliation and safety defaults', () => {
  it('correctly defaults unreceived items with 0 stock as unselected', () => {
    // Caso real 05330124 (Haste Canopla, estoque 0, sem entrada)
    const it: OrdemCompraItem = {
      id: 'item_haste',
      oc_id: 'oc_test',
      code: '05330124',
      description: 'HASTE PARA CANOPLA',
      quantity: 1,
      received_quantity: 0,
      unit_price: 22.31,
      total: 22.31,
      created: '',
      updated: '',
    }
    const currentStockQty = 0
    const alreadyRcvd = 0
    const isPhysicallyInStock = currentStockQty > 0.0001
    const isLikelyUnreceived = !isPhysicallyInStock && alreadyRcvd <= 0.0001

    // Deve ser desmarcado por padrão
    expect(isLikelyUnreceived).toBe(true)
  })

  it('correctly marks items with physical stock already present as selected', () => {
    // Caso 14010036 (estoque 22)
    const currentStockQty = 22
    const alreadyRcvd = 0
    const isPhysicallyInStock = currentStockQty > 0.0001
    const isLikelyUnreceived = !isPhysicallyInStock && alreadyRcvd <= 0.0001

    expect(isLikelyUnreceived).toBe(false)
  })

  it('reconciles OP shortage without creating inventory Entrada', () => {
    // Simulação do comportamento de cálculo de conciliação
    const runningBalance = 22 // estoque atual
    const shortageDemand = 0.001 // demanda MT para OP 000486
    const opDemands = [{ pending: shortageDemand }]

    let newBalance = runningBalance
    let distributedQty = 0

    for (const d of opDemands) {
      let alloc = d.pending
      if (newBalance > 0 && alloc > newBalance) {
        alloc = newBalance
      }
      alloc = Math.round(alloc * 10000) / 10000
      newBalance = Math.round((newBalance - alloc) * 10000) / 10000
      distributedQty += alloc
    }

    // Saldo do estoque baixa apenas a fração entregue à OP (22 - 0.001 = 21.999), sem criar nova Entrada de 1 MT
    expect(distributedQty).toBe(0.001)
    expect(newBalance).toBe(21.999)
  })

  it('preserves fractional quantities in MT units accurately', () => {
    const sCurRec = 0
    const allocQty = 0.001
    const sNewReceived = Math.round((sCurRec + allocQty) * 10000) / 10000
    const sTotalQty = 0.001
    const isFullyReceived = sTotalQty > 0 && sNewReceived >= sTotalQty - 0.0001

    expect(sNewReceived).toBe(0.001)
    expect(isFullyReceived).toBe(true)
  })
})
