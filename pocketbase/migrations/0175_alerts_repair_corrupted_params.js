/// <reference path="../pb_data/types.d.ts" />
// Migration 0175 — REPARO idempotente dos params corrompidos pela 0174.
// A 0174 gravou params como array de charcodes (ex.: [123,34,...] = "{\"tolerance_days\":2}"),
// perdendo tolerance_days/idle_days/band_days de ops_atrasadas e ops_paradas_sem_movimentacao.
// Estratégia: detectar params gravados como array de charcodes (ou string que parseia para
// array de números), decodificar, mesclar com defaults corretos e gravar como objeto puro
// (mesmo formato das seeds, que persistem corretamente). Dados válidos não são sobrescritos.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('pcp_alert_configs')

    // Defaults corretos por check_key (valores usados pelo hook + faixas do redesign)
    const repairs = {
      ops_atrasadas: { tolerance_days: 2, band_days: [30, 60, 100] },
      ops_paradas_sem_movimentacao: { idle_days: 3, band_days: [30, 60, 100] },
    }

    // Decodifica um array de charcodes em string (ou devolve null se não for charcode array)
    function decodeCharcodeArray(arr) {
      if (!Array.isArray(arr) || arr.length === 0) return null
      let isCharcodes = true
      let out = ''
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i]
        if (typeof v !== 'number' || v < 0 || v > 65535 || Math.floor(v) !== v) {
          isCharcodes = false
          break
        }
        out += String.fromCharCode(v)
      }
      return isCharcodes ? out : null
    }

    function parseParams(raw) {
      // Devolve { params, wasCorrupted }
      if (raw === undefined || raw === null) return { params: {}, wasCorrupted: false }
      if (Array.isArray(raw)) {
        const decoded = decodeCharcodeArray(raw)
        if (decoded !== null) {
          try {
            const parsed = JSON.parse(decoded)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              return { params: parsed, wasCorrupted: true }
            }
          } catch (_) {}
          return { params: {}, wasCorrupted: true }
        }
        return { params: {}, wasCorrupted: false }
      }
      if (typeof raw === 'string') {
        const trimmed = raw.trim()
        if (!trimmed) return { params: {}, wasCorrupted: false }
        try {
          const parsed = JSON.parse(trimmed)
          // String contendo um array de charcodes (corrupção serializada como texto)
          if (Array.isArray(parsed)) {
            const decoded = decodeCharcodeArray(parsed)
            if (decoded !== null) {
              try {
                const inner = JSON.parse(decoded)
                if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
                  return { params: inner, wasCorrupted: true }
                }
              } catch (_) {}
              return { params: {}, wasCorrupted: true }
            }
            return { params: {}, wasCorrupted: false }
          }
          if (parsed && typeof parsed === 'object') return { params: parsed, wasCorrupted: false }
        } catch (_) {}
        return { params: {}, wasCorrupted: false }
      }
      if (typeof raw === 'object') return { params: raw, wasCorrupted: false }
      return { params: {}, wasCorrupted: false }
    }

    for (const key of Object.keys(repairs)) {
      let rec = null
      try {
        rec = app.findFirstRecordByFilter(collection.name, 'check_key = "' + key + '"')
      } catch (_) {
        rec = null
      }
      if (!rec) continue

      const parsed = parseParams(rec.get('params'))
      let params = parsed.params || {}
      let changed = parsed.wasCorrupted // params corrompidos sempre são regravados

      // Idempotente: completa chaves ausentes sem sobrescrever valores válidos
      const defaults = repairs[key]
      for (const dk of Object.keys(defaults)) {
        const current = params[dk]
        const isMissing = current === undefined || current === null
        const isInvalidNumber =
          (dk === 'tolerance_days' || dk === 'idle_days') &&
          (typeof current !== 'number' || isNaN(current) || current < 0)
        const isInvalidBand =
          dk === 'band_days' &&
          (!Array.isArray(current) ||
            current.length !== 3 ||
            !current.every((n) => typeof n === 'number' && !isNaN(n) && n > 0))
        if (isMissing || isInvalidNumber || isInvalidBand) {
          params[dk] = defaults[dk]
          changed = true
        }
      }

      if (changed) {
        rec.set('params', params) // objeto puro — formato que persiste corretamente
        app.save(rec)
        console.log('[MIGRATION 0175] params reparados para ' + key + ': ' + JSON.stringify(params))
      }
    }
  },
  (app) => {
    // Revert: restaura a corrupção conhecida (charcodes de {"tolerance_days":2} /
    // {"idle_days":3}) para fins de reversibilidade.
    const collection = app.findCollectionByNameOrId('pcp_alert_configs')
    const corrupted = {
      ops_atrasadas: '{"tolerance_days":2}',
      ops_paradas_sem_movimentacao: '{"idle_days":3}',
    }
    for (const key of Object.keys(corrupted)) {
      try {
        const rec = app.findFirstRecordByFilter(collection.name, 'check_key = "' + key + '"')
        if (!rec) continue
        const str = corrupted[key]
        const codes = []
        for (let i = 0; i < str.length; i++) codes.push(str.charCodeAt(i))
        rec.set('params', codes)
        app.save(rec)
      } catch (_) {}
    }
  },
)
