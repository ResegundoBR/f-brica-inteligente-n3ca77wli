import { describe, it, expect } from 'vitest'
import {
  normalizeBomSector,
  buildSectorGroups,
  SECTOR_ORDER,
  NO_SECTOR_LABEL,
} from './pcp-separation-sectors'
import type { SeparationItem } from './material-separations'
import type { PcpOrderMaterial, PcpOrder } from '@/types'

describe('pcp-separation-sectors', () => {
  describe('normalizeBomSector', () => {
    it('normaliza corretamente os setores reais do banco', () => {
      expect(normalizeBomSector('FABRICAÇÃO')).toBe('Fabricação')
      expect(normalizeBomSector('Fabricacao')).toBe('Fabricação')
      expect(normalizeBomSector('PREPARAÇÃO')).toBe('Preparação')
      expect(normalizeBomSector('Preparacao')).toBe('Preparação')
      expect(normalizeBomSector('Acabamento')).toBe('Preparação')
      expect(normalizeBomSector('MONTAGEM')).toBe('Montagem')
      expect(normalizeBomSector('Montagem')).toBe('Montagem')
      expect(normalizeBomSector('EXPEDIÇÃO')).toBe('Expedição')
      expect(normalizeBomSector('Expedicao')).toBe('Expedição')
      expect(normalizeBomSector(null)).toBe(NO_SECTOR_LABEL)
      expect(normalizeBomSector('')).toBe(NO_SECTOR_LABEL)
      expect(normalizeBomSector('Outro')).toBe(NO_SECTOR_LABEL)
    })
  })

  describe('buildSectorGroups', () => {
    const orders: PcpOrder[] = [
      {
        id: 'ord-1',
        op_number: '000501/2026',
        order_number: '501',
        expand: { product_id: { id: 'p-1', name: 'Pendente Upper' } },
      } as any,
      {
        id: 'ord-2',
        op_number: '000502/2026',
        order_number: '502',
        manual_product_name: 'Pendente Lower',
      } as any,
      { id: 'ord-3', op_number: '000490/2026', order_number: '490' } as any,
    ]

    it('agrupa itens na ordem estrita: Fabricação, Preparação, Montagem, Expedição, Sem setor', () => {
      const items: SeparationItem[] = [
        {
          id: 'item-1',
          code: '14010038',
          description: 'BARRA CHATA AÇO',
          total_quantity: 10,
          unit: 'MT',
          order_ids: ['ord-3'],
          op_numbers: ['OP 000490/2026'],
        },
        {
          id: 'item-2',
          code: '06080018',
          description: 'PERFIL BORRACHA',
          total_quantity: 0.26,
          unit: 'MT',
          order_ids: ['ord-1', 'ord-2'],
          op_numbers: ['OP 000501/2026', 'OP 000502/2026'],
        },
        {
          id: 'item-3',
          code: 'UNKNOWN999',
          description: 'ITEM SEM BOM',
          total_quantity: 5,
          unit: 'UN',
          order_ids: ['ord-1'],
          op_numbers: ['OP 000501/2026'],
        },
      ]

      const bomMaterials: PcpOrderMaterial[] = [
        {
          id: 'bom-1',
          order_id: 'ord-3',
          code: '14010038',
          description: 'BARRA CHATA AÇO',
          sector: 'FABRICAÇÃO' as any,
          quantity: 10,
          unit: 'MT',
          status: 'Pendente',
        } as any,
        {
          id: 'bom-2',
          order_id: 'ord-1',
          code: '06080018',
          description: 'PERFIL BORRACHA',
          sector: 'MONTAGEM' as any,
          quantity: 0.13,
          unit: 'MT',
          status: 'Pendente',
        } as any,
        {
          id: 'bom-3',
          order_id: 'ord-2',
          code: '06080018',
          description: 'PERFIL BORRACHA',
          sector: 'MONTAGEM' as any,
          quantity: 0.13,
          unit: 'MT',
          status: 'Pendente',
        } as any,
      ]

      const groups = buildSectorGroups({ items, bomMaterials, orders })

      expect(groups.map((g) => g.sector)).toEqual(['Fabricação', 'Montagem', 'Sem setor'])

      const fabGroup = groups.find((g) => g.sector === 'Fabricação')!
      expect(fabGroup.cards).toHaveLength(1)
      expect(fabGroup.cards[0].item.code).toBe('14010038')
      expect(fabGroup.cards[0].sectorQuantity).toBe(10)

      const montGroup = groups.find((g) => g.sector === 'Montagem')!
      expect(montGroup.cards).toHaveLength(1)
      expect(montGroup.cards[0].item.code).toBe('06080018')
      expect(montGroup.cards[0].sectorQuantity).toBe(0.26)
      expect(montGroup.cards[0].sectorAllocations).toHaveLength(2)
      // Confere que o nome do produto foi propagado nas alocações do setor
      expect(montGroup.cards[0].sectorAllocations[0].productName).toBe('Pendente Upper')
      expect(montGroup.cards[0].sectorAllocations[1].productName).toBe('Pendente Lower')

      const noSecGroup = groups.find((g) => g.sector === 'Sem setor')!
      expect(noSecGroup.cards).toHaveLength(1)
      expect(noSecGroup.cards[0].item.code).toBe('UNKNOWN999')
    })

    it('aparece em cada bloco quando o mesmo código é usado em setores diferentes com as quantidades das OPs daquele setor', () => {
      const items: SeparationItem[] = [
        {
          id: 'item-shared',
          code: 'PARAF001',
          description: 'PARAFUSO ALLEN M4',
          total_quantity: 8,
          unit: 'PC',
          order_ids: ['ord-1', 'ord-2'],
          op_numbers: ['OP 000501/2026', 'OP 000502/2026'],
        },
      ]

      const bomMaterials: PcpOrderMaterial[] = [
        // Na OP 501 o parafuso está em Fabricação (qty 3)
        {
          id: 'bom-f1',
          order_id: 'ord-1',
          code: 'PARAF001',
          description: 'PARAFUSO ALLEN M4',
          sector: 'FABRICAÇÃO' as any,
          quantity: 3,
          unit: 'PC',
          status: 'Pendente',
        } as any,
        // Na OP 502 o parafuso está em Montagem (qty 5)
        {
          id: 'bom-m1',
          order_id: 'ord-2',
          code: 'PARAF001',
          description: 'PARAFUSO ALLEN M4',
          sector: 'MONTAGEM' as any,
          quantity: 5,
          unit: 'PC',
          status: 'Pendente',
        } as any,
      ]

      const groups = buildSectorGroups({ items, bomMaterials, orders })

      expect(groups.map((g) => g.sector)).toEqual(['Fabricação', 'Montagem'])

      const fabGroup = groups.find((g) => g.sector === 'Fabricação')!
      expect(fabGroup.cards).toHaveLength(1)
      expect(fabGroup.cards[0].sectorQuantity).toBe(3)
      expect(fabGroup.cards[0].sectorOpNumbers).toEqual(['OP 000501/2026'])

      const montGroup = groups.find((g) => g.sector === 'Montagem')!
      expect(montGroup.cards).toHaveLength(1)
      expect(montGroup.cards[0].sectorQuantity).toBe(5)
      expect(montGroup.cards[0].sectorOpNumbers).toEqual(['OP 000502/2026'])
    })
  })
})
