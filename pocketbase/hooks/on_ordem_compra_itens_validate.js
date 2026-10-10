onRecordCreate((e) => {
  const record = e.record
  if (!record) return e.next()

  const ocId = record.getString('oc_id')
  if (!ocId) {
    const errs = {
      oc_id: new ValidationError(
        'validation_required',
        'O item deve estar vinculado a uma Ordem de Compra (oc_id).',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Verificar se a OC pai existe
  try {
    $app.findRecordById('ordens_de_compra', ocId)
  } catch (_) {
    const errs = {
      oc_id: new ValidationError(
        'validation_not_found',
        'Ordem de Compra não encontrada para o ID informado.',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Descrição obrigatória
  const desc = (record.getString('description') || '').trim()
  if (!desc) {
    const errs = {
      description: new ValidationError(
        'validation_required',
        'A descrição do item da Ordem de Compra é obrigatória.',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Quantidade > 0
  var qty = 0
  try {
    qty = Number(record.getFloat('quantity')) || 0
  } catch (_) {}

  if (qty <= 0) {
    const errs = {
      quantity: new ValidationError(
        'validation_min',
        'A quantidade do item da Ordem de Compra deve ser maior que zero.',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Preço unitário e total coerentes
  var unitPrice = 0
  try {
    unitPrice = Number(record.getFloat('unit_price')) || 0
  } catch (_) {}

  if (unitPrice < 0) {
    const errs = {
      unit_price: new ValidationError(
        'validation_min',
        'O preço unitário do item da Ordem de Compra não pode ser negativo.',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Se houver vínculo com material_shortage_id, garantir que o registro exista
  const shortageId = (record.getString('material_shortage_id') || '').trim()
  if (shortageId) {
    try {
      $app.findRecordById('material_shortages', shortageId)
    } catch (_) {
      const errs = {
        material_shortage_id: new ValidationError(
          'validation_not_found',
          'Solicitação de material vinculada (material_shortage_id) não encontrada.',
        ),
      }
      throw new BadRequestError('Falha na validação do item da OC.', errs)
    }
  }

  return e.next()
}, 'ordem_compra_itens')

onRecordUpdate((e) => {
  const record = e.record
  if (!record) return e.next()

  const ocId = record.getString('oc_id')
  if (!ocId) {
    const errs = {
      oc_id: new ValidationError(
        'validation_required',
        'O item deve estar vinculado a uma Ordem de Compra (oc_id).',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Verificar se a OC pai existe
  try {
    $app.findRecordById('ordens_de_compra', ocId)
  } catch (_) {
    const errs = {
      oc_id: new ValidationError(
        'validation_not_found',
        'Ordem de Compra não encontrada para o ID informado.',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Descrição obrigatória
  const desc = (record.getString('description') || '').trim()
  if (!desc) {
    const errs = {
      description: new ValidationError(
        'validation_required',
        'A descrição do item da Ordem de Compra é obrigatória.',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Quantidade > 0
  var qty = 0
  try {
    qty = Number(record.getFloat('quantity')) || 0
  } catch (_) {}

  if (qty <= 0) {
    const errs = {
      quantity: new ValidationError(
        'validation_min',
        'A quantidade do item da Ordem de Compra deve ser maior que zero.',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Preço unitário e total coerentes
  var unitPrice = 0
  try {
    unitPrice = Number(record.getFloat('unit_price')) || 0
  } catch (_) {}

  if (unitPrice < 0) {
    const errs = {
      unit_price: new ValidationError(
        'validation_min',
        'O preço unitário do item da Ordem de Compra não pode ser negativo.',
      ),
    }
    throw new BadRequestError('Falha na validação do item da OC.', errs)
  }

  // Se houver vínculo com material_shortage_id, garantir que o registro exista
  const shortageId = (record.getString('material_shortage_id') || '').trim()
  if (shortageId) {
    try {
      $app.findRecordById('material_shortages', shortageId)
    } catch (_) {
      const errs = {
        material_shortage_id: new ValidationError(
          'validation_not_found',
          'Solicitação de material vinculada (material_shortage_id) não encontrada.',
        ),
      }
      throw new BadRequestError('Falha na validação do item da OC.', errs)
    }
  }

  return e.next()
}, 'ordem_compra_itens')
