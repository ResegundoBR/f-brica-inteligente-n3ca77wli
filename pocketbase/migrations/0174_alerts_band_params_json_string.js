/// <reference path="../pb_data/types.d.ts" />
// Migration 0174 — Correção: grava band_days como string JSON
// (arrays JS puros não foram persistidos pela 0173 em pcp_alert_configs.params)

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('pcp_alert_configs')
    const targets = ['ops_atrasadas', 'ops_paradas_sem_movimentacao']

    for (const key of targets) {
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

      if (params.band_days === undefined) {
        params.band_days = [30, 60, 100]
        rec.set('params', JSON.stringify(params))
        app.save(rec)
      }
    }
  },
  (app) => {
    // Revert: nada destrutivo — remove apenas band_days se existir
    const collection = app.findCollectionByNameOrId('pcp_alert_configs')
    const targets = ['ops_atrasadas', 'ops_paradas_sem_movimentacao']
    for (const key of targets) {
      try {
        const rec = app.findFirstRecordByFilter(collection.name, 'check_key = "' + key + '"')
        if (!rec) continue
        const raw = rec.get('params')
        let params = {}
        try {
          if (typeof raw === 'string') params = JSON.parse(raw) || {}
          else if (raw && typeof raw === 'object') params = raw
        } catch (_) {
          params = {}
        }
        if (params.band_days !== undefined) {
          delete params.band_days
          rec.set('params', JSON.stringify(params))
          app.save(rec)
        }
      } catch (_) {}
    }
  },
)
