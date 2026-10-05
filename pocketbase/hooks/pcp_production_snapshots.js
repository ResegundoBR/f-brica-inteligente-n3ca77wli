/// <reference path="../pb_data/types.d.ts" />

// 1. JOB AGENDADO: roda 1x ao dia na madrugada (03:00)
// Cron expression: "0 3 * * *"
cronAdd('pcp_daily_production_snapshot', '0 3 * * *', () => {
  try {
    var refDateStr = new Date().toISOString().split('T')[0]
    var refDayEnd = refDateStr + ' 23:59:59.999Z'

    var orders = $app.findRecordsByFilter('pcp_orders', '1=1', '', 0, 0)

    var totalUnits = 0
    var delayedUnits = 0
    var toStartUnits = 0
    var inProcessUnits = 0
    var expeditionUnits = 0
    var linhaUnits = 0
    var especialUnits = 0
    var assistenciaUnits = 0
    var openOrdersCount = 0
    var delayedOrdersCount = 0

    for (var i = 0; i < orders.length; i++) {
      var op = orders[i]
      var createdStr = op.getString('created')

      if (createdStr && createdStr > refDayEnd) {
        continue
      }

      var status = op.getString('status')
      var wasFinished = false

      if (status === 'Concluído') {
        var finishedStr = op.getString('finished_at') || op.getString('updated')
        if (finishedStr && finishedStr <= refDayEnd) {
          wasFinished = true
        } else if (!finishedStr) {
          wasFinished = true
        }
      }

      if (wasFinished) {
        continue
      }

      var qty = Number(op.getFloat('quantity')) || 0
      totalUnits += qty
      openOrdersCount++

      var deliveryStr = op.getString('delivery_date')
      if (deliveryStr) {
        var dDate = deliveryStr.split('T')[0].split(' ')[0]
        if (dDate < refDateStr) {
          delayedUnits += qty
          delayedOrdersCount++
        }
      }

      if (status === 'Fila') {
        toStartUnits += qty
      } else if (status === 'Em Andamento' || status === 'Parado') {
        inProcessUnits += qty
      }

      var stage = op.getString('stage')
      if (stage === 'Expedição') {
        expeditionUnits += qty
      }

      var opType = op.getString('op_type') || 'Linha'
      if (opType === 'Especial') {
        especialUnits += qty
      } else if (opType === 'Assistência') {
        assistenciaUnits += qty
      } else {
        linhaUnits += qty
      }
    }

    var existingRecord = null
    try {
      existingRecord = $app.findFirstRecordByFilter(
        'pcp_production_snapshots',
        "reference_date = '" + refDateStr.replace(/'/g, "''") + "'",
      )
    } catch (_) {}

    var col = $app.findCollectionByNameOrId('pcp_production_snapshots')
    var record = existingRecord || new Record(col)

    record.set('reference_date', refDateStr)
    record.set('total_units', totalUnits)
    record.set('delayed_units', delayedUnits)
    record.set('to_start_units', toStartUnits)
    record.set('in_process_units', inProcessUnits)
    record.set('expedition_units', expeditionUnits)
    record.set('linha_units', linhaUnits)
    record.set('especial_units', especialUnits)
    record.set('assistencia_units', assistenciaUnits)
    record.set('open_orders_count', openOrdersCount)
    record.set('delayed_orders_count', delayedOrdersCount)
    record.set('metadata', {
      calculated_at: new Date().toISOString(),
      source: 'cron_pcp_daily_production_snapshot',
    })

    $app.save(record)
    console.log('[CRON] Snapshot gravado para ' + refDateStr + ': total=' + totalUnits)
  } catch (err) {
    console.error('[CRON] Erro ao gravar snapshot diário de produção:', String(err))
  }
})

// 2. ENDPOINT AUXILIAR: Permite gravar ou atualizar o snapshot de hoje (ou de uma data específica)
routerAdd(
  'POST',
  '/backend/v1/pcp/snapshots/record-today',
  (e) => {
    try {
      var body = e.requestInfo().body || {}
      var refDateStr = (body.reference_date || '').trim()
      if (!refDateStr) {
        refDateStr = new Date().toISOString().split('T')[0]
      }

      var refDayEnd = refDateStr + ' 23:59:59.999Z'

      var orders = $app.findRecordsByFilter('pcp_orders', '1=1', '', 0, 0)

      var totalUnits = 0
      var delayedUnits = 0
      var toStartUnits = 0
      var inProcessUnits = 0
      var expeditionUnits = 0
      var linhaUnits = 0
      var especialUnits = 0
      var assistenciaUnits = 0
      var openOrdersCount = 0
      var delayedOrdersCount = 0

      for (var i = 0; i < orders.length; i++) {
        var op = orders[i]
        var createdStr = op.getString('created')

        if (createdStr && createdStr > refDayEnd) {
          continue
        }

        var status = op.getString('status')
        var wasFinished = false

        if (status === 'Concluído') {
          var finishedStr = op.getString('finished_at') || op.getString('updated')
          if (finishedStr && finishedStr <= refDayEnd) {
            wasFinished = true
          } else if (!finishedStr) {
            wasFinished = true
          }
        }

        if (wasFinished) {
          continue
        }

        var qty = Number(op.getFloat('quantity')) || 0
        totalUnits += qty
        openOrdersCount++

        var deliveryStr = op.getString('delivery_date')
        if (deliveryStr) {
          var dDate = deliveryStr.split('T')[0].split(' ')[0]
          if (dDate < refDateStr) {
            delayedUnits += qty
            delayedOrdersCount++
          }
        }

        if (status === 'Fila') {
          toStartUnits += qty
        } else if (status === 'Em Andamento' || status === 'Parado') {
          inProcessUnits += qty
        }

        var stage = op.getString('stage')
        if (stage === 'Expedição') {
          expeditionUnits += qty
        }

        var opType = op.getString('op_type') || 'Linha'
        if (opType === 'Especial') {
          especialUnits += qty
        } else if (opType === 'Assistência') {
          assistenciaUnits += qty
        } else {
          linhaUnits += qty
        }
      }

      var existingRecord = null
      try {
        existingRecord = $app.findFirstRecordByFilter(
          'pcp_production_snapshots',
          "reference_date = '" + refDateStr.replace(/'/g, "''") + "'",
        )
      } catch (_) {}

      var col = $app.findCollectionByNameOrId('pcp_production_snapshots')
      var record = existingRecord || new Record(col)

      record.set('reference_date', refDateStr)
      record.set('total_units', totalUnits)
      record.set('delayed_units', delayedUnits)
      record.set('to_start_units', toStartUnits)
      record.set('in_process_units', inProcessUnits)
      record.set('expedition_units', expeditionUnits)
      record.set('linha_units', linhaUnits)
      record.set('especial_units', especialUnits)
      record.set('assistencia_units', assistenciaUnits)
      record.set('open_orders_count', openOrdersCount)
      record.set('delayed_orders_count', delayedOrdersCount)
      record.set('metadata', {
        calculated_at: new Date().toISOString(),
        source: 'manual_or_initial_trigger',
      })

      $app.save(record)

      return e.json(200, {
        success: true,
        reference_date: record.getString('reference_date'),
        total_units: record.getFloat('total_units'),
        delayed_units: record.getFloat('delayed_units'),
        to_start_units: record.getFloat('to_start_units'),
        in_process_units: record.getFloat('in_process_units'),
        expedition_units: record.getFloat('expedition_units'),
        linha_units: record.getFloat('linha_units'),
        especial_units: record.getFloat('especial_units'),
        assistencia_units: record.getFloat('assistencia_units'),
        open_orders_count: record.getInt('open_orders_count'),
        delayed_orders_count: record.getInt('delayed_orders_count'),
      })
    } catch (err) {
      console.error('Erro na rota record-today snapshot:', String(err))
      return e.json(500, { error: String(err) })
    }
  },
  $apis.requireAuth(),
)
