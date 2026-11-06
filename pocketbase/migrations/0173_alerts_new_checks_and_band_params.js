/// <reference path="../pb_data/types.d.ts" />
// Migration 0173 — Central de Alertas: 3 novas verificações + params de faixas
// 1. Seed das verificações 'prazo_sem_iniciar', 'prometida_em_risco' e 'especial_prazo'
//    no catálogo pcp_alert_configs (idempotente — cresce por acréscimo).
// 2. Recategoriza as 3 para 'Prazo em Risco' (seção própria no redesign).
// 3. Acrescenta params de faixas de tempo às verificações existentes:
//    ops_atrasadas.band_days, ops_paradas_sem_movimentacao.band_days.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('pcp_alert_configs')

    const seeds = [
      {
        check_key: 'prazo_sem_iniciar',
        title: 'Prazo sem iniciar',
        description:
          'OPs em aberto que ainda não foram iniciadas (started_at vazio) e vencem nos próximos N dias. Urgências: ≤7 dias Crítica, 8–14 Alta, 15–21 Média.',
        category: 'Prazo em Risco',
        params: { antecedencia_dias: 21 },
      },
      {
        check_key: 'prometida_em_risco',
        title: 'Prometida em risco',
        description:
          'OPs em aberto e não entregues com data prometida já vencida (Crítica), vencendo nos próximos 7 dias (Alta) ou em 8–14 dias (Média). Exibe nota e autor da promessa.',
        category: 'Prazo em Risco',
        params: { margem_dias: 7 },
      },
      {
        check_key: 'especial_prazo',
        title: 'Especial com prazo apertado',
        description:
          'Projetos Especiais em aberto com entrega nos próximos 21 dias que ainda estão fora das fases finais (Pintura, Retoques, Montagem, Qualidade, Embalagem, Expedição).',
        category: 'Prazo em Risco',
        params: { antecedencia_dias: 21 },
      },
    ]

    for (const seed of seeds) {
      let existing = null
      try {
        existing = app.findFirstRecordByFilter(
          collection.name,
          'check_key = "' + seed.check_key + '"',
        )
      } catch (_) {
        existing = null
      }

      if (existing) {
        // Acréscimo não destrutivo: só garante categoria e defaults de params faltantes.
        const rawParams = existing.get('params')
        let params = {}
        try {
          if (typeof rawParams === 'string') params = JSON.parse(rawParams) || {}
          else if (rawParams && typeof rawParams === 'object') params = rawParams
        } catch (_) {
          params = {}
        }
        let changed = false
        if (existing.get('category') !== seed.category) {
          existing.set('category', seed.category)
          changed = true
        }
        for (const k of Object.keys(seed.params)) {
          if (params[k] === undefined) {
            params[k] = seed.params[k]
            changed = true
          }
        }
        if (changed) existing.set('params', params)
        if (changed) app.save(existing)
      } else {
        const record = new Record(collection)
        record.set('check_key', seed.check_key)
        record.set('title', seed.title)
        record.set('description', seed.description)
        record.set('category', seed.category)
        record.set('enabled', true)
        record.set('params', seed.params)
        app.save(record)
      }
    }

    // Params de faixas de tempo nas verificações existentes (Parte C)
    const bandDefaults = {
      ops_atrasadas: { band_days: [30, 60, 100] },
      ops_paradas_sem_movimentacao: { band_days: [30, 60, 100] },
    }
    for (const key of Object.keys(bandDefaults)) {
      let rec = null
      try {
        rec = app.findFirstRecordByFilter(collection.name, 'check_key = "' + key + '"')
      } catch (_) {
        rec = null
      }
      if (!rec) continue
      const raw = rec.get('params')
      let params = {}
      try {
        if (typeof raw === 'string') params = JSON.parse(raw) || {}
        else if (raw && typeof raw === 'object') params = raw
      } catch (_) {
        params = {}
      }
      let changed = false
      for (const k of Object.keys(bandDefaults[key])) {
        if (params[k] === undefined) {
          params[k] = bandDefaults[key][k]
          changed = true
        }
      }
      if (changed) {
        rec.set('params', params)
        app.save(rec)
      }
    }
  },
  (app) => {
    // Revert: remove as 3 verificações seeded
    const collection = app.findCollectionByNameOrId('pcp_alert_configs')
    for (const key of ['prazo_sem_iniciar', 'prometida_em_risco', 'especial_prazo']) {
      try {
        const rec = app.findFirstRecordByFilter(collection.name, 'check_key = "' + key + '"')
        if (rec) app.delete(rec)
      } catch (_) {}
    }
  },
)
