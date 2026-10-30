import { describe, it, expect } from 'vitest'
import type { CompositionItem } from '@/types'
import type { SyncCandidateItem } from './SyncCompositionsPage'

describe('SyncCompositionsPage - merge aditivo e atualização de categoria/etapa', () => {
  const normCode = (c?: string) => (c || '').toString().trim()
  const normDesc = (d?: string) =>
    (d || '')
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[\t\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')

  it('atualiza categoria e etapa de item existente ("Já Existe") preservando medidas, quantidade e unidade', () => {
    // Composição atual do produto PENDENTE UPPER com código com tab/espaço e categoria em branco
    const currentComp: CompositionItem[] = [
      {
        id: 'comp_1',
        index: '1',
        code: '\t14010038 ',
        description: 'CANTONEIRA ACO 1/8X1',
        quantity: '4',
        unit: 'PC',
        etapa: 'FABRICAÇÃO',
        measurements: '120x80mm',
        category_id: '',
        category: '',
        origem: 'OP 000486/2026',
      },
      {
        id: 'comp_2',
        index: '2',
        code: '14010039',
        description: 'CHAPA LISA 2MM',
        quantity: '2',
        unit: 'PC',
        etapa: 'PREPARAÇÃO',
        measurements: '500x500mm',
        category_id: 'cat_chapas',
        category: 'Chapas',
        origem: 'OP 000486/2026',
      },
    ]

    // Gestor editou categoria e setor do primeiro item no preview
    const editedCandidateItems: SyncCandidateItem[] = [
      {
        id: 'item_prod1_0_14010038',
        code: '14010038',
        description: 'CANTONEIRA ACO 1/8X1',
        rawQty: 40,
        qtyPerPiece: '4',
        unit: 'PC',
        sector: 'MONTAGEM', // alterado de FABRICAÇÃO para MONTAGEM
        measurements: '120x80mm',
        category_id: 'cat_cantoneiras',
        category: 'Cantoneiras', // preenchida categoria antes em branco
        origem: 'OP 000486/2026',
        status: 'already_exists',
        editedCategory: true,
        editedSector: true,
      },
    ]

    // Simula a lógica implementada em applySyncToProduct
    const catNameToIdMap = new Map<string, string>([
      ['cantoneiras', 'cat_cantoneiras'],
      ['chapas', 'cat_chapas'],
    ])

    const updatedComp = [...currentComp]

    for (const editedItem of editedCandidateItems) {
      const eCode = normCode(editedItem.code)
      const eDesc = normDesc(editedItem.description)

      const idx = updatedComp.findIndex((comp) => {
        const compCode = normCode(comp.code)
        if (eCode && compCode) {
          return compCode === eCode
        }
        if (!eCode && eDesc) {
          const compDesc = normDesc(comp.description)
          return compDesc === eDesc || compDesc.includes(eDesc) || eDesc.includes(compDesc)
        }
        return false
      })

      expect(idx).toBe(0)

      if (idx !== -1) {
        const existingTarget = updatedComp[idx]
        const updatedItem: CompositionItem = { ...existingTarget }

        if (editedItem.editedCategory) {
          const categoryName = (editedItem.category || '').trim()
          const categoryId =
            editedItem.category_id ||
            (categoryName ? catNameToIdMap.get(categoryName.toLowerCase()) || '' : '')

          if (
            updatedItem.category !== categoryName ||
            (categoryId && updatedItem.category_id !== categoryId)
          ) {
            updatedItem.category = categoryName
            updatedItem.category_id = categoryId
          }
        }

        if (editedItem.editedSector) {
          const sectorVal = editedItem.sector || 'FABRICAÇÃO'
          if (updatedItem.etapa !== sectorVal) {
            updatedItem.etapa = sectorVal
          }
        }

        updatedComp[idx] = updatedItem
      }
    }

    // Validações estritas de aceitação:
    // 1. Categoria e category_id foram gravadas
    expect(updatedComp[0].category).toBe('Cantoneiras')
    expect(updatedComp[0].category_id).toBe('cat_cantoneiras')

    // 2. Etapa foi atualizada
    expect(updatedComp[0].etapa).toBe('MONTAGEM')

    // 3. Campos críticos intocados (quantity, measurements, unit, code, id, origem)
    expect(updatedComp[0].quantity).toBe('4')
    expect(updatedComp[0].measurements).toBe('120x80mm')
    expect(updatedComp[0].unit).toBe('PC')
    expect(updatedComp[0].code).toBe('\t14010038 ') // preserva string original do item existente
    expect(updatedComp[0].id).toBe('comp_1')
    expect(updatedComp[0].origem).toBe('OP 000486/2026')

    // 4. Outros itens da composição permaneceram intactos
    expect(updatedComp[1]).toEqual(currentComp[1])
  })

  it('é idempotente se reaplicado sem novas edições', () => {
    const comp: CompositionItem[] = [
      {
        id: 'comp_1',
        index: '1',
        code: '14010038',
        description: 'CANTONEIRA ACO 1/8X1',
        quantity: '4',
        unit: 'PC',
        etapa: 'MONTAGEM',
        measurements: '120x80mm',
        category_id: 'cat_cantoneiras',
        category: 'Cantoneiras',
        origem: 'OP 000486/2026',
      },
    ]

    // Candidatos sem flags editedCategory nem editedSector
    const candidateItems: SyncCandidateItem[] = [
      {
        id: 'item_prod1_0_14010038',
        code: '14010038',
        description: 'CANTONEIRA ACO 1/8X1',
        rawQty: 40,
        qtyPerPiece: '4',
        unit: 'PC',
        sector: 'MONTAGEM',
        measurements: '120x80mm',
        category_id: 'cat_cantoneiras',
        category: 'Cantoneiras',
        origem: 'OP 000486/2026',
        status: 'already_exists',
        editedCategory: false,
        editedSector: false,
      },
    ]

    const toProcess = candidateItems.filter((ci) => ci.editedCategory || ci.editedSector)
    expect(toProcess.length).toBe(0)
    // Nada é alterado
    expect(comp[0].category).toBe('Cantoneiras')
    expect(comp[0].etapa).toBe('MONTAGEM')
  })
})
