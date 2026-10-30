import { describe, it, expect } from 'vitest'
import {
  mergeCategoryLists,
  resolveCategoryIdByName,
  resolveCategoryNameById,
} from './unified-categories'
import type { ComponentCategory, CompositionCategory } from '@/types'

describe('unified-categories service', () => {
  const compCats: ComponentCategory[] = [
    { id: 'comp_1', name: 'Usinagem', active: true, created: '', updated: '' },
    { id: 'comp_2', name: 'Corte a Laser', active: true, created: '', updated: '' },
    { id: 'comp_3', name: 'Borracha', active: true, created: '', updated: '' },
    { id: 'comp_4', name: 'Barras e Tubos', active: true, created: '', updated: '' },
  ]

  const composCats: CompositionCategory[] = [
    { id: 'compos_1', name: 'Tubos e Barras', created: '', updated: '' },
    { id: 'compos_2', name: 'Repuxo', created: '', updated: '' },
    { id: 'compos_3', name: 'Usinagem', created: '', updated: '' }, // Duplicado case-insensitive
    { id: 'compos_4', name: 'Corte a Laser', created: '', updated: '' }, // Duplicado
  ]

  it('mergeCategoryLists une sem duplicatas, priorizando component_categories e ordenando alfabeticamente', () => {
    const unified = mergeCategoryLists(compCats, composCats)

    const names = unified.map((u) => u.name)
    // Esperado: Barras e Tubos, Borracha, Corte a Laser, Repuxo, Tubos e Barras, Usinagem
    expect(names).toContain('Tubos e Barras')
    expect(names).toContain('Repuxo')
    expect(names).toContain('Usinagem')
    expect(names).toContain('Corte a Laser')
    expect(names).toContain('Borracha')
    expect(names).toContain('Barras e Tubos')

    // Sem duplicações para "Usinagem" e "Corte a Laser"
    const usinagemEntries = unified.filter((u) => u.name.toLowerCase() === 'usinagem')
    expect(usinagemEntries.length).toBe(1)
    expect(usinagemEntries[0].id).toBe('comp_1') // prioridade component_categories
    expect(usinagemEntries[0].source).toBe('component_categories')

    // Repuxo veio de composition_categories
    const repuxo = unified.find((u) => u.name === 'Repuxo')
    expect(repuxo).toBeDefined()
    expect(repuxo?.id).toBe('compos_2')
    expect(repuxo?.source).toBe('composition_categories')
  })

  it('resolveCategoryIdByName busca primeiro em component_categories e depois em composition_categories', () => {
    // Usinagem existe em ambos: deve retornar o ID de component_categories
    expect(resolveCategoryIdByName('Usinagem', compCats, composCats)).toBe('comp_1')
    expect(resolveCategoryIdByName('usinagem ', compCats, composCats)).toBe('comp_1')

    // Repuxo existe apenas em composition_categories: deve retornar compos_2
    expect(resolveCategoryIdByName('Repuxo', compCats, composCats)).toBe('compos_2')
    expect(resolveCategoryIdByName('  repuxo  ', compCats, composCats)).toBe('compos_2')

    // Inexistente
    expect(resolveCategoryIdByName('Inexistente', compCats, composCats)).toBe('')
  })

  it('resolveCategoryNameById recupera o nome a partir de ID de qualquer uma das coleções', () => {
    expect(resolveCategoryNameById('comp_3', compCats, composCats)).toBe('Borracha')
    expect(resolveCategoryNameById('compos_2', compCats, composCats)).toBe('Repuxo')
    expect(resolveCategoryNameById('nao_existe', compCats, composCats)).toBe('')
  })
})
