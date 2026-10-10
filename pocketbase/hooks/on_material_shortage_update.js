onRecordUpdate((e) => {
  const record = e.record
  if (!record) {
    return e.next()
  }

  var original = null
  var oldStatus = ''
  var oldCode = ''
  var oldBatchId = ''
  var oldQuantity = 0
  var oldReceivedQty = 0

  try {
    original = record.original()
    if (original) {
      oldStatus = original.getString('status') || ''
      oldCode = (original.getString('code') || '').trim()
      oldBatchId = (original.getString('batch_id') || '').trim()
      oldQuantity = Number(original.getFloat('quantity')) || 0
      oldReceivedQty = Number(original.getFloat('received_quantity')) || 0
    }
  } catch (_) {}

  var newStatus = record.getString('status') || ''
  var newCode = (record.getString('code') || '').trim()
  var newBatchId = (record.getString('batch_id') || '').trim()

  var totalQty = 0
  var receivedQty = 0
  try {
    totalQty = Number(record.getFloat('quantity')) || 0
    receivedQty = Number(record.getFloat('received_quantity')) || 0
  } catch (_) {}

  // --- TRAVA 1: received_quantity <= quantity (bloqueio duro) ---
  if (receivedQty < 0) {
    const errs = {
      received_quantity: new ValidationError(
        'validation_min',
        'A quantidade recebida não pode ser negativa.',
      ),
    }
    throw new BadRequestError('Falha na validação do material.', errs)
  }

  if (totalQty > 0 && receivedQty > totalQty + 0.0001) {
    const errs = {
      received_quantity: new ValidationError(
        'validation_max_received',
        'A quantidade recebida (' +
          receivedQty +
          ') não pode ser maior que a quantidade do registro (' +
          totalQty +
          '). O excedente deve ser recebido como estoque geral.',
      ),
    }
    throw new BadRequestError('Falha na validação do material.', errs)
  }

  // --- TRAVA 2: Registros em LOTE (batch_id) — Bloquear mudança de código ou consolidação heterogênea ---
  // A) Se o registro já tem batch_id e o código está sendo alterado:
  if (oldBatchId && newCode && oldCode && newCode.toUpperCase() !== oldCode.toUpperCase()) {
    const errs = {
      code: new ValidationError(
        'validation_batch_immutable_code',
        'Não é permitido alterar o código de um item que pertence a um lote consolidado (' +
          oldBatchId +
          '). Para alterar o código, desvincule o lote primeiro.',
      ),
    }
    throw new BadRequestError('Falha na validação do lote.', errs)
  }

  // B) Se está sendo atribuído um novo batch_id (ou associado a um existente), validar se há código conflitante no lote:
  if (newBatchId && newCode) {
    try {
      const existingInBatch = $app.findRecordsByFilter(
        'material_shortages',
        "batch_id = '" +
          newBatchId.replace(/'/g, "''") +
          "' && id != '" +
          record.id.replace(/'/g, "''") +
          "'",
        '-created',
        10,
        0,
      )
      for (var b = 0; b < existingInBatch.length; b++) {
        var existingCode = (existingInBatch[b].getString('code') || '').trim()
        if (existingCode && existingCode.toUpperCase() !== newCode.toUpperCase()) {
          const errs = {
            batch_id: new ValidationError(
              'validation_batch_mixed_code',
              'Lote consolidado inválido: o lote "' +
                newBatchId +
                '" já pertence ao código ' +
                existingCode +
                ' e não pode conter itens de outro código (' +
                newCode +
                ').',
            ),
          }
          throw new BadRequestError('Falha na validação do lote.', errs)
        }
      }
    } catch (batchErr) {
      if (batchErr instanceof BadRequestError) {
        throw batchErr
      }
    }
  }

  // --- TRAVA 3: Máquina de estados de material_shortages ---
  // Status válidos:
  // Pendente, Liberado_Estoque, Cotação, Compra, Recebido_Parcial, Recebido, Cancelado
  if (oldStatus && newStatus && oldStatus !== newStatus) {
    var isTransitionAllowed = true
    var invalidTransitionMsg = ''

    if (oldStatus === 'Pendente') {
      // De Pendente pode ir para: Liberado_Estoque, Cotação, Compra (direto) ou Cancelado
      // Bloquear ir direto para Recebido ou Recebido_Parcial sem passar por estoque ou compra
      if (newStatus === 'Recebido' || newStatus === 'Recebido_Parcial') {
        isTransitionAllowed = false
        invalidTransitionMsg =
          'Transição inválida: uma solicitação Pendente não pode ir diretamente para ' +
          newStatus +
          ' sem antes passar pela Triagem (Liberado Estoque) ou Compra/Recebimento.'
      }
    } else if (oldStatus === 'Liberado_Estoque') {
      // Liberado Estoque pode ser Cancelado ou reaberto para Pendente/Cotação
      // Não deve saltar direto para Recebido de fornecedor externo
      if (newStatus === 'Recebido' || newStatus === 'Recebido_Parcial') {
        isTransitionAllowed = false
        invalidTransitionMsg =
          'Transição inválida: material liberado do estoque interno não deve receber mercadoria externa direta.'
      }
    } else if (oldStatus === 'Cotação') {
      // De Cotação pode ir para Compra, Cancelado ou voltar para Pendente
      if (newStatus === 'Recebido' || newStatus === 'Recebido_Parcial') {
        isTransitionAllowed = false
        invalidTransitionMsg =
          'Transição inválida: um item em Cotação deve avançar para Compra antes do Recebimento.'
      }
    } else if (oldStatus === 'Compra') {
      // De Compra pode ir para Recebido, Recebido_Parcial, Cancelado, ou voltar para Cotação (reversão/split)
    } else if (oldStatus === 'Recebido_Parcial') {
      // De Recebido_Parcial pode ir para Recebido, Cancelado, ou manter em Compra
    } else if (oldStatus === 'Recebido') {
      // De Recebido para outros status: se reaberto, logar aviso e verificar se quantidade recebida foi zerada
      if (newStatus !== 'Recebido') {
        console.log(
          '[STATE_TRANSITION] Shortage ' +
            record.id +
            ' reaberto de Recebido para ' +
            newStatus +
            ' por ' +
            (e.auth ? e.auth.id : 'sistema'),
        )
      }
    } else if (oldStatus === 'Cancelado') {
      // Cancelado para outros status: reabertura legítima permitida apenas para Pendente ou Cotação
      if (newStatus === 'Recebido' || newStatus === 'Recebido_Parcial') {
        isTransitionAllowed = false
        invalidTransitionMsg =
          'Transição inválida: um registro Cancelado não pode ser finalizado direto como Recebido. Reabra como Pendente ou Cotação.'
      }
    }

    if (!isTransitionAllowed) {
      const errs = {
        status: new ValidationError('validation_invalid_status_transition', invalidTransitionMsg),
      }
      throw new BadRequestError('Falha na transição de status do material.', errs)
    }
  }

  // --- AUTOMATIZAÇÃO DE DATAS ---
  var dateStr = new Date().toISOString().split('T')[0]

  if (newStatus === 'Cotação' && oldStatus !== 'Cotação') {
    if (!record.getString('quotation_date')) {
      record.set('quotation_date', dateStr)
    }
  }

  if (newStatus === 'Compra' && oldStatus !== 'Compra') {
    if (!record.getString('purchase_date')) {
      record.set('purchase_date', dateStr)
    }
  }

  // Sincronização automática do status com base nas quantidades recebidas
  var currentStatus = record.getString('status') || ''
  if (currentStatus !== 'Cancelado' && currentStatus !== 'Liberado_Estoque') {
    if (totalQty > 0 && receivedQty > 0 && receivedQty >= totalQty - 0.0001) {
      record.set('status', 'Recebido')
    } else if (totalQty > 0 && receivedQty > 0 && receivedQty < totalQty - 0.0001) {
      record.set('status', 'Recebido_Parcial')
    }
  }

  return e.next()
}, 'material_shortages')
