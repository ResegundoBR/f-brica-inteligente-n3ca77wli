onRecordCreate((e) => {
  const record = e.record
  const bottleneck = record.getString('bottleneck_reason')

  if (bottleneck && bottleneck !== 'Nenhum') {
    record.set('status', 'Parado')
  } else if (!record.getString('status')) {
    record.set('status', 'Fila')
  }

  e.next()
}, 'pcp_orders')

onRecordUpdate((e) => {
  const record = e.record
  const original = e.record.original()
  const newBottleneck = record.getString('bottleneck_reason')
  const oldBottleneck = original.getString('bottleneck_reason')
  const status = record.getString('status')
  const oldStatus = original.getString('status')

  const statusChangedManually = status !== oldStatus

  if (newBottleneck && newBottleneck !== 'Nenhum') {
    if (newBottleneck !== oldBottleneck || !statusChangedManually) {
      record.set('status', 'Parado')
    }
  }

  e.next()
}, 'pcp_orders')

// ETAPA 5 — Cancelamento automático instantâneo de solicitações quando a OP é Concluída ou Cancelada
onRecordAfterUpdateSuccess((e) => {
  const record = e.record
  const original = e.record.original()
  const status = record.getString('status')
  const oldStatus = original ? original.getString('status') : ''

  if (status === oldStatus) return e.next()

  const isClosed = status === 'Concluído' || status === 'Cancelada' || status === 'Cancelado'
  if (!isClosed) return e.next()

  const orderId = record.id
  const opNum = record.getString('op_number') || record.getString('order_number') || orderId
  const todayDate = new Date()
  const day = String(todayDate.getDate()).padStart(2, '0')
  const month = String(todayDate.getMonth() + 1).padStart(2, '0')
  const dateFormatted = day + '/' + month

  try {
    const openShortages = $app.findRecordsByFilter(
      'material_shortages',
      'order_id = "' +
        orderId.replace(/"/g, '""') +
        '" && (status = "Pendente" || status = "Cotação" || status = "Compra")',
      'created',
      500,
      0,
    )

    for (var i = 0; i < openShortages.length; i++) {
      var shortage = openShortages[i]
      var batchId = (shortage.getString('batch_id') || '').trim()
      var itemQty = Number(shortage.getFloat('quantity')) || 0
      var itemCode = shortage.getString('code') || 'S/ Código'

      var hasLivingBatchMates = false
      if (batchId) {
        try {
          var batchMates = $app.findRecordsByFilter(
            'material_shortages',
            'batch_id = "' +
              batchId.replace(/"/g, '""') +
              '" && id != "' +
              shortage.id +
              '" && (status = "Pendente" || status = "Cotação" || status = "Compra")',
            '',
            100,
            0,
          )
          for (var b = 0; b < batchMates.length; b++) {
            var mateOrderId = batchMates[b].getString('order_id')
            if (mateOrderId && mateOrderId !== orderId) {
              try {
                var mateOrder = $app.findRecordById('pcp_orders', mateOrderId)
                var mateStatus = mateOrder.getString('status')
                if (
                  mateStatus !== 'Concluído' &&
                  mateStatus !== 'Cancelada' &&
                  mateStatus !== 'Cancelado'
                ) {
                  hasLivingBatchMates = true
                  break
                }
              } catch (_) {}
            } else if (!mateOrderId) {
              hasLivingBatchMates = true
              break
            }
          }
        } catch (_) {}
      }

      var auditNote =
        'Cancelada automaticamente: OP ' +
        opNum +
        ' encerrada em ' +
        dateFormatted +
        ' (item: ' +
        itemCode +
        ', qtde: ' +
        itemQty +
        ' un)'
      var currentObs = shortage.getString('observation') || ''
      var finalObs = currentObs ? currentObs + ' | ' + auditNote : auditNote

      if (hasLivingBatchMates) {
        shortage.set('batch_id', '')
        shortage.set('status', 'Cancelado')
        shortage.set(
          'observation',
          finalObs + ' [Removido do lote ' + batchId + ' - demais membros de OPs ativas mantidos]',
        )
      } else {
        shortage.set('status', 'Cancelado')
        shortage.set('observation', finalObs)
      }

      try {
        $app.save(shortage)
      } catch (saveErr) {
        console.error(
          '[AUTO_CANCEL_HOOK] Erro ao cancelar shortage ' + shortage.id + ':',
          String(saveErr),
        )
      }
    }
  } catch (err) {
    console.error(
      '[AUTO_CANCEL_HOOK] Erro no processamento de encerramento da OP ' + orderId + ':',
      String(err),
    )
  }

  return e.next()
}, 'pcp_orders')
