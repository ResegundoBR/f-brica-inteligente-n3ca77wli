import { describe, it, expect } from 'vitest'
import {
  ALL_CANONICAL_STAGES,
  getNextStageForOp,
  getImmediateNextCanonicalStage,
  normalizeStage,
} from './pcp-utils'

describe('Transição de etapas da OP (getNextStageForOp e ALL_CANONICAL_STAGES)', () => {
  it('contém a sequência canônica correta Montagem -> Qualidade -> Embalagem -> Expedição', () => {
    const montagemIdx = ALL_CANONICAL_STAGES.indexOf('Montagem')
    const qualidadeIdx = ALL_CANONICAL_STAGES.indexOf('Qualidade')
    const embalagemIdx = ALL_CANONICAL_STAGES.indexOf('Embalagem')
    const expedicaoIdx = ALL_CANONICAL_STAGES.indexOf('Expedição')

    expect(montagemIdx).toBeGreaterThan(-1)
    expect(qualidadeIdx).toBe(montagemIdx + 1)
    expect(embalagemIdx).toBe(qualidadeIdx + 1)
    expect(expedicaoIdx).toBe(embalagemIdx + 1)
    expect(expedicaoIdx).toBe(ALL_CANONICAL_STAGES.length - 1)
  })

  it('ao concluir Qualidade, o próximo padrão DEVE ser Embalagem mesmo sem processo cadastrado', () => {
    const op = { product_id: 'prod-sem-processo', outsourcing_data: {} }
    const processes: any[] = []

    const next = getNextStageForOp('Qualidade', op as any, processes)
    expect(next).toBe('Embalagem')
  })

  it('ao concluir Embalagem, o próximo padrão DEVE ser Expedição mesmo sem processo cadastrado', () => {
    const op = { product_id: 'prod-sem-processo', outsourcing_data: {} }
    const processes: any[] = []

    const next = getNextStageForOp('Embalagem', op as any, processes)
    expect(next).toBe('Expedição')
  })

  it('ao concluir Expedição, o próximo padrão DEVE ser null (Finalizar OP / Concluído)', () => {
    const op = { product_id: 'prod-qualquer', outsourcing_data: {} }
    const processes: any[] = [
      { product_id: 'prod-qualquer', kanban_stage: 'Expedição', estimated_hours: 1 },
    ]

    const next = getNextStageForOp('Expedição', op as any, processes)
    expect(next).toBeNull()
  })

  it('com processos cadastrados, respeita o próximo processo com estimated_hours > 0 antes de Qualidade/Embalagem', () => {
    const op = { product_id: 'prod-1', outsourcing_data: {} }
    const processes = [
      { product_id: 'prod-1', kanban_stage: 'Corte', estimated_hours: 2 },
      { product_id: 'prod-1', kanban_stage: 'Solda', estimated_hours: 3 }, // Dobra/Calandra sem processo
      { product_id: 'prod-1', kanban_stage: 'Pintura', estimated_hours: 4 },
    ]

    // A partir de Corte, o próximo com horas é Solda (pulando Dobra e Calandra que não têm processo)
    const nextFromCorte = getNextStageForOp('Corte', op as any, processes)
    expect(nextFromCorte).toBe('Solda')
  })

  it('quando não há processo posterior cadastrado para um produto, usa fallback canônico em vez de retornar null prematuramente', () => {
    const op = { product_id: 'prod-parcial', outsourcing_data: {} }
    // Produto só tem cadastro até Montagem
    const processes = [
      { product_id: 'prod-parcial', kanban_stage: 'Corte', estimated_hours: 1 },
      { product_id: 'prod-parcial', kanban_stage: 'Montagem', estimated_hours: 1 },
    ]

    // Ao concluir Montagem, embora não haja cadastro de Qualidade com horas, fallback deve avançar para Qualidade
    const nextFromMontagem = getNextStageForOp('Montagem', op as any, processes)
    expect(nextFromMontagem).toBe('Qualidade')
  })

  it('respeita normalização de etapas (ex: Retoque -> Retoques)', () => {
    expect(normalizeStage('Retoque')).toBe('Retoques')
    expect(normalizeStage('Retoques')).toBe('Retoques')

    const op = { product_id: 'p1', outsourcing_data: {} }
    const nextFromRetoque = getNextStageForOp('Retoque', op as any, [])
    expect(nextFromRetoque).toBe('Montagem')
  })

  it('getImmediateNextCanonicalStage avança para a próxima etapa canônica', () => {
    expect(getImmediateNextCanonicalStage('Qualidade')).toBe('Embalagem')
    expect(getImmediateNextCanonicalStage('Embalagem')).toBe('Expedição')
    expect(getImmediateNextCanonicalStage('Expedição')).toBeNull()
  })
})
