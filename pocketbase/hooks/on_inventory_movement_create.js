onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const invId = record.getString('inventory_id')
  if (!invId) {
    const errs = {
      inventory_id: new ValidationError(
        'validation_required',
        'O item de inventário é obrigatório para registrar movimentação.',
      ),
    }
    throw new BadRequestError('Falha na movimentação de estoque.', errs)
  }

  var qty = 0
  try {
    qty = Number(record.getFloat('quantity')) || 0
  } catch (_) {}

  // TRAVA: quantity != 0 e quantity > 0
  if (qty <= 0) {
    const errs = {
      quantity: new ValidationError(
        'validation_min',
        'A quantidade da movimentação deve ser maior que zero.',
      ),
    }
    throw new BadRequestError('Falha na movimentação de estoque.', errs)
  }

  const type = record.getString('type') || ''
  if (type !== 'Entrada' && type !== 'Saída') {
    const errs = {
      type: new ValidationError(
        'validation_invalid_type',
        'Tipo de movimentação inválido. Deve ser Entrada ou Saída.',
      ),
    }
    throw new BadRequestError('Falha na movimentação de estoque.', errs)
  }

  // Buscar saldo atual do estoque
  var invRecord = null
  try {
    invRecord = $app.findRecordById('inventory', invId)
  } catch (findErr) {
    const errs = {
      inventory_id: new ValidationError(
        'validation_not_found',
        'Item de estoque não encontrado para o ID informado.',
      ),
    }
    throw new BadRequestError('Falha na movimentação de estoque.', errs)
  }

  const currentQty = Number(invRecord.getFloat('quantity')) || 0
  const reason = (record.getString('reason') || '').toLowerCase()
  const isAdjustmentOrRetroactive =
    reason.indexOf('ajuste') !== -1 ||
    reason.indexOf('retroativ') !== -1 ||
    reason.indexOf('reconcilia') !== -1 ||
    reason.indexOf('inventário') !== -1 ||
    reason.indexOf('inventario') !== -1

  // TRAVA: Saída sem saldo suficiente (exceto ajuste/retroativo explícito)
  if (type === 'Saída' && qty > currentQty + 0.0001 && !isAdjustmentOrRetroactive) {
    const errs = {
      quantity: new ValidationError(
        'validation_insufficient_stock',
        'Saldo insuficiente no estoque para esta saída. Saldo disponível: ' +
          currentQty +
          ', solicitado: ' +
          qty +
          '. Para correções ou baixas retroativas excepcionais, informe o motivo com termo "Ajuste" ou "Retroativo".',
      ),
    }
    throw new BadRequestError('Falha na movimentação de estoque.', errs)
  }

  // Coerência do balance_after
  var expectedBalanceAfter = type === 'Entrada' ? currentQty + qty : Math.max(0, currentQty - qty)
  expectedBalanceAfter = Math.round(expectedBalanceAfter * 10000) / 10000

  // Se balance_after não estiver definido ou for discrepante, força o valor coerente
  record.set('balance_after', expectedBalanceAfter)

  return e.next()
}, 'inventory_movements')

onRecordAfterCreateSuccess((e) => {
  var invId = e.record.getString('inventory_id')
  var qty = Number(e.record.getFloat('quantity')) || 0
  var type = e.record.getString('type')

  if (!invId || qty <= 0) return e.next()

  try {
    var invRecord = $app.findRecordById('inventory', invId)
    var currentQty = Number(invRecord.getFloat('quantity')) || 0
    var newQty = currentQty
    if (type === 'Entrada') {
      newQty = currentQty + qty
    } else if (type === 'Saída') {
      newQty = Math.max(0, currentQty - qty)
    }
    newQty = Math.round(newQty * 10000) / 10000
    invRecord.set('quantity', newQty)
    $app.save(invRecord)
  } catch (err) {
    console.log('Error updating inventory quantity from movement:', err.message)
  }

  return e.next()
}, 'inventory_movements')
