onRecordCreate((e) => {
  const record = e.record
  if (!record) {
    return e.next()
  }

  // --- TRAVA 6: Validação de código de material (apenas em criação) ---
  const rawCode = record.getString('code') || ''
  const trimmedCode = rawCode.trim()
  if (trimmedCode !== rawCode) {
    record.set('code', trimmedCode)
  }

  if (trimmedCode) {
    // Bloquear apenas typos evidentes no padrão numérico: letras minúsculas 'l' ou 'o' no meio de dígitos
    // Exemplo clássico do bug real: 05100l0105
    if (/[0-9]+[loLO][0-9]+/.test(trimmedCode)) {
      const errs = {
        code: new ValidationError(
          'validation_invalid_code',
          'Código de material inválido: contém caracteres suspeitos ("l" ou "o" no meio de dígitos, ex.: ' +
            trimmedCode +
            '). Use apenas algarismos numéricos correspondentes ao catálogo.',
        ),
      }
      throw new BadRequestError('Falha na validação do material.', errs)
    }
  }

  // --- TRAVA DE DESCRIÇÃO OBRIGATÓRIA ---
  const desc = (record.getString('description') || '').trim()
  if (!desc) {
    const errs = {
      description: new ValidationError(
        'validation_required',
        'A descrição do material é obrigatória.',
      ),
    }
    throw new BadRequestError('Falha na validação do material.', errs)
  }

  // --- TRAVA DE QUANTIDADE > 0 ---
  var totalQty = 0
  try {
    totalQty = Number(record.getFloat('quantity')) || 0
  } catch (_) {}

  if (totalQty <= 0) {
    const errs = {
      quantity: new ValidationError(
        'validation_min',
        'A quantidade solicitada deve ser maior que zero.',
      ),
    }
    throw new BadRequestError('Falha na validação do material.', errs)
  }

  // --- TRAVA 1 (em criação): received_quantity <= quantity ---
  var receivedQty = 0
  try {
    receivedQty = Number(record.getFloat('received_quantity')) || 0
  } catch (_) {}

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
          ') não pode exceder a quantidade total solicitada (' +
          totalQty +
          ').',
      ),
    }
    throw new BadRequestError('Falha na validação do material.', errs)
  }

  // --- TRAVA 2 (em criação): Registros em lote (batch_id) com código idêntico ---
  const batchId = (record.getString('batch_id') || '').trim()
  if (batchId && trimmedCode) {
    try {
      const existingInBatch = $app.findRecordsByFilter(
        'material_shortages',
        "batch_id = '" + batchId.replace(/'/g, "''") + "'",
        '-created',
        10,
        0,
      )
      for (var b = 0; b < existingInBatch.length; b++) {
        var existingCode = (existingInBatch[b].getString('code') || '').trim()
        if (existingCode && existingCode.toUpperCase() !== trimmedCode.toUpperCase()) {
          const errs = {
            batch_id: new ValidationError(
              'validation_batch_mixed_code',
              'Lote consolidado inválido: o lote "' +
                batchId +
                '" já pertence ao código ' +
                existingCode +
                ' e não pode conter itens de outro código (' +
                trimmedCode +
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

  // --- REQUISITO: Excedente de Lote vinculado a Estoque (order_id = null) ---
  const obs = record.getString('observation') || ''
  if (obs.indexOf('Compra para estoque') !== -1 && record.getString('order_id')) {
    record.set('order_id', null)
  }

  // --- DATAS E STATUS PADRÃO ---
  var status = record.getString('status') || 'Pendente'
  record.set('status', status)
  var dateStr = new Date().toISOString().split('T')[0]

  if (status === 'Cotação' && !record.getString('quotation_date')) {
    record.set('quotation_date', dateStr)
  }

  if (status === 'Compra' && !record.getString('purchase_date')) {
    record.set('purchase_date', dateStr)
  }

  // Sincronização automática de status baseado em recebimento
  if (status !== 'Cancelado' && status !== 'Liberado_Estoque') {
    if (totalQty > 0 && receivedQty > 0 && receivedQty >= totalQty - 0.0001) {
      record.set('status', 'Recebido')
    } else if (totalQty > 0 && receivedQty > 0 && receivedQty < totalQty - 0.0001) {
      record.set('status', 'Recebido_Parcial')
    }
  }

  return e.next()
}, 'material_shortages')
