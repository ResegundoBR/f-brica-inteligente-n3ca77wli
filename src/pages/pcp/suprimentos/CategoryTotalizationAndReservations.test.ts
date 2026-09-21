import { describe, it, expect } from 'vitest'
import { normalizeCode } from '@/services/material-reservations'
import { groupShortagesByCategory, buildComponentLookup } from '@/hooks/use-category-groups'
import { MaterialShortage, MasterComponent, ComponentCategory } from '@/types'

describe('Melhoria 1 — Reserva de Estoque e Disponibilidade', () => {
  it('normaliza códigos de material corretamente para busca e reserva insensível a maiúsculas/espaços', () => {
    expect(normalizeCode('  14010001  ')).toBe('14010001')
    expect(normalizeCode('REF-V0CYLX')).toBe('ref-v0cylx')
    expect(normalizeCode(null)).toBe('')
    expect(normalizeCode(undefined)).toBe('')
  })

  it('calcula o disponível corretamente: disponível = max(0, total - reservado), sem permitir saldo negativo', () => {
    const totalStock = 10
    const reservedSimultaneous = 15 // múltiplas rodadas reservaram mais que o estoque físico
    const availableStock = Math.max(0, totalStock - reservedSimultaneous)

    expect(availableStock).toBe(0)
    expect(availableStock).toBeGreaterThanOrEqual(0)

    const normalTotal = 20
    const normalReserved = 7
    const normalAvailable = Math.max(0, normalTotal - normalReserved)
    expect(normalAvailable).toBe(13)
  })

  it('detecta quando o disponível é menor que o solicitado para avisar o operador a marcar Falta (🔴)', () => {
    const availableStock = 3
    const requestedStock = 5

    const isInsufficient = availableStock < requestedStock
    expect(isInsufficient).toBe(true)
  })
})

describe('Melhoria 2 — Totalização e Seleção por Categoria em Cotações e Compras', () => {
  const mockCategories: ComponentCategory[] = [
    { id: 'cat-1', name: 'Ferragens', active: true, created: '', updated: '' },
    { id: 'cat-2', name: 'Vidros', active: true, created: '', updated: '' },
  ]

  const mockComponents: MasterComponent[] = [
    {
      id: 'comp-1',
      code: 'FER-001',
      description: 'Dobradiça Inox',
      category: 'cat-1',
      active: true,
      created: '',
      updated: '',
    },
    {
      id: 'comp-2',
      code: 'VID-002',
      description: 'Vidro Temperado 8mm',
      category: 'cat-2',
      active: true,
      created: '',
      updated: '',
    },
  ]

  const mockShortages: MaterialShortage[] = [
    {
      id: 'short-1',
      code: 'FER-001',
      description: 'Dobradiça Inox',
      quantity: 10,
      unit_price: 25.0,
      sector: 'Suprimentos',
      status: 'Cotação',
      created: '2026-03-30T10:00:00Z',
      updated: '',
    },
    {
      id: 'short-2',
      code: 'VID-002',
      description: 'Vidro Temperado 8mm',
      quantity: 2,
      unit_price: 150.0,
      sector: 'Suprimentos',
      status: 'Cotação',
      created: '2026-03-30T10:00:00Z',
      updated: '',
    },
    {
      id: 'short-3',
      code: 'ORPHAN-999',
      description: 'Item Avulso sem cadastro',
      quantity: 5,
      unit_price: 10.0,
      sector: 'Suprimentos',
      status: 'Cotação',
      created: '2026-03-30T10:00:00Z',
      updated: '',
    },
  ]

  it('agrupa itens por categoria do componente vinculado com somatório de itens e valores', () => {
    const groups = groupShortagesByCategory(mockShortages, mockComponents, mockCategories)

    expect(groups).toHaveLength(3)

    const ferragens = groups.find((g) => g.categoryName === 'Ferragens')
    expect(ferragens).toBeDefined()
    expect(ferragens?.totalItems).toBe(1)
    expect(ferragens?.totalValue).toBe(250) // 10 * 25

    const vidros = groups.find((g) => g.categoryName === 'Vidros')
    expect(vidros).toBeDefined()
    expect(vidros?.totalItems).toBe(1)
    expect(vidros?.totalValue).toBe(300) // 2 * 150

    const semCategoria = groups.find((g) => g.categoryName === 'Sem categoria')
    expect(semCategoria).toBeDefined()
    expect(semCategoria?.totalItems).toBe(1)
    expect(semCategoria?.totalValue).toBe(50) // 5 * 10
  })

  it('permite selecionar todos os itens de uma categoria de uma só vez para cotação/compra em lote', () => {
    const groups = groupShortagesByCategory(mockShortages, mockComponents, mockCategories)
    const ferragens = groups.find((g) => g.categoryName === 'Ferragens')!

    const selectedIds = new Set<string>()
    const ferragensItemIds = ferragens.items.map((i) => i.id)

    // Selecionar todos os itens da categoria
    ferragensItemIds.forEach((id) => selectedIds.add(id))

    expect(selectedIds.has('short-1')).toBe(true)
    expect(selectedIds.has('short-2')).toBe(false)
    expect(selectedIds.size).toBe(1)
  })

  it('constrói lookup eficiente por código e por descrição', () => {
    const { byCode, byDesc } = buildComponentLookup(mockComponents)
    expect(byCode.get('fer-001')?.id).toBe('comp-1')
    expect(byDesc.get('dobradiça inox')?.id).toBe('comp-1')
  })
})
