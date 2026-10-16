migrate(
  (app) => {
    console.log(
      '[MIGRATION 0154] Reparando distribuição de shortage mba6np1d4f9mtxg (tubo redondo 14010035, 1,459 MT)...',
    )

    // 1. Localiza shortage mba6np1d4f9mtxg
    let shortage = null
    try {
      shortage = app.findRecordById('material_shortages', 'mba6np1d4f9mtxg')
    } catch (_) {
      console.log('[MIGRATION 0154] Shortage mba6np1d4f9mtxg não encontrado. Abortando reparo.')
      return
    }

    const currentStatus = shortage.getString('status')
    const currentReceived = shortage.getFloat('received_quantity') || 0
    const targetQuantity = shortage.getFloat('quantity') || 1.459

    console.log(
      '[MIGRATION 0154] Shortage mba6np1d4f9mtxg: status=' +
        currentStatus +
        ', quantity=' +
        targetQuantity +
        ', received=' +
        currentReceived,
    )

    if (currentStatus === 'Recebido' && Math.abs(currentReceived - targetQuantity) < 0.001) {
      console.log('[MIGRATION 0154] Shortage já está como Recebido com 1.459 MT. Nada a fazer.')
      return
    }

    const orderId = shortage.getString('order_id') || ''
    const description = shortage.getString('description') || 'TUBO REDONDO AÇO Ø12,70MM - #1,50MM'
    const code = shortage.getString('code') || '14010035'
    const todayStr = new Date().toISOString().split('T')[0]

    // 2. Localiza ou cria inventário para o código 14010035
    let invRecord = null
    try {
      invRecord = app.findFirstRecordByFilter(
        'inventory',
        "code = '" + code.replace(/'/g, "''") + "'",
      )
    } catch (_) {}

    if (!invRecord) {
      const invCol = app.findCollectionByNameOrId('inventory')
      invRecord = new Record(invCol)
      invRecord.set('code', code)
      invRecord.set('description', description)
      invRecord.set('quantity', 0)
      invRecord.set('min_quantity', 0)
      invRecord.set('unit', 'MT')
      app.save(invRecord)
      invRecord = app.findRecordById('inventory', invRecord.id)
    }

    const initialInvQty = invRecord.getFloat('quantity') || 0
    console.log(
      '[MIGRATION 0154] Inventário id=' + invRecord.id + ' saldo inicial=' + initialInvQty,
    )

    // 3. Verifica se a Saída de 1.459 MT já existe
    const movCol = app.findCollectionByNameOrId('inventory_movements')
    const existingSaidas = app.findRecordsByFilter(
      'inventory_movements',
      "type = 'Saída' && reason ~ 'mba6np1d4f9mtxg'",
      '-created',
      10,
      0,
    )

    let runningInvQty = initialInvQty

    if (existingSaidas.length === 0) {
      console.log('[MIGRATION 0154] Criando movimentação de Saída de 1.459 MT para a OP...')
      let opNumber = ''
      if (orderId) {
        try {
          const opOrder = app.findRecordById('pcp_orders', orderId)
          opNumber = opOrder.getString('op_number') || opOrder.getString('order_number') || ''
        } catch (_) {}
      }

      const balanceAfterSaida = Math.round((runningInvQty - targetQuantity) * 10000) / 10000
      const saida = new Record(movCol)
      saida.set('inventory_id', invRecord.id)
      saida.set('quantity', targetQuantity)
      saida.set('type', 'Saída')
      saida.set(
        'reason',
        'Distribuição para OP' + (opNumber ? ' ' + opNumber : '') + ' (ID: mba6np1d4f9mtxg)',
      )
      saida.set('exit_date', todayStr)
      saida.set('balance_after', balanceAfterSaida)
      if (orderId) saida.set('order_id', orderId)
      saida.set('unit_price', 0)
      app.save(saida)
      console.log('[MIGRATION 0154] Movimento de Saída criado id=' + saida.id)

      runningInvQty = balanceAfterSaida
      invRecord.set('quantity', runningInvQty)
      app.save(invRecord)
      console.log('[MIGRATION 0154] Saldo do estoque ajustado para ' + runningInvQty)
    } else {
      console.log('[MIGRATION 0154] Movimento de Saída já existe (id=' + existingSaidas[0].id + ')')
    }

    // 4. Atualiza o shortage para Recebido com received_quantity = 1.459
    shortage.set('received_quantity', targetQuantity)
    shortage.set('status', 'Recebido')
    app.save(shortage)
    console.log(
      '[MIGRATION 0154] Shortage mba6np1d4f9mtxg atualizado para status=Recebido, received_quantity=' +
        targetQuantity,
    )

    // 5. Envia mensagem para a OP 000480 (e OP vinculada orderId) se ainda não existir
    if (orderId) {
      try {
        const msgCol = app.findCollectionByNameOrId('pcp_order_messages')
        const existingMsgs = app.findRecordsByFilter(
          'pcp_order_messages',
          "order_id = '" + orderId.replace(/'/g, "''") + "' && content ~ 'mba6np1d4f9mtxg'",
          '-created',
          1,
          0,
        )

        // Também verificar se já existe mensagem recente de tubo 14010035 recebido
        const existingDescMsgs = app.findRecordsByFilter(
          'pcp_order_messages',
          "order_id = '" + orderId.replace(/'/g, "''") + "' && content ~ '1,459'",
          '-created',
          1,
          0,
        )

        if (existingMsgs.length === 0 && existingDescMsgs.length === 0) {
          const msg = new Record(msgCol)
          msg.set('order_id', orderId)
          msg.set(
            'content',
            'Material recebido e separado: ' +
              description +
              ' (Qtde: ' +
              targetQuantity +
              ' MT) [ID: mba6np1d4f9mtxg]',
          )
          msg.set('sector', 'Operador')
          msg.set('read', false)
          app.save(msg)
          console.log('[MIGRATION 0154] Mensagem enviada para a OP ' + orderId + ' id=' + msg.id)
        } else {
          console.log('[MIGRATION 0154] Mensagem para a OP ' + orderId + ' já existia.')
        }
      } catch (msgErr) {
        console.log('[MIGRATION 0154] Erro ao criar mensagem para OP:', msgErr)
      }
    }

    // Também verificar se há OP 000480 explicitamente no banco
    try {
      const op480Records = app.findRecordsByFilter(
        'pcp_orders',
        "op_number ~ '000480'",
        '-created',
        1,
        0,
      )
      if (op480Records.length > 0 && op480Records[0].id !== orderId) {
        const op480Id = op480Records[0].id
        const msgCol = app.findCollectionByNameOrId('pcp_order_messages')
        const existing480Msgs = app.findRecordsByFilter(
          'pcp_order_messages',
          "order_id = '" + op480Id.replace(/'/g, "''") + "' && content ~ 'mba6np1d4f9mtxg'",
          '-created',
          1,
          0,
        )
        if (existing480Msgs.length === 0) {
          const msg480 = new Record(msgCol)
          msg480.set('order_id', op480Id)
          msg480.set(
            'content',
            'Material recebido e separado: ' +
              description +
              ' (Qtde: ' +
              targetQuantity +
              ' MT) [ID: mba6np1d4f9mtxg]',
          )
          msg480.set('sector', 'Operador')
          msg480.set('read', false)
          app.save(msg480)
          console.log('[MIGRATION 0154] Mensagem enviada para OP 000480 id=' + msg480.id)
        }
      }
    } catch (op480Err) {
      console.log('[MIGRATION 0154] Aviso ao checar OP 000480:', op480Err)
    }

    // Leitura live final para validar a gravação
    try {
      const recheck = app.findRecordById('material_shortages', 'mba6np1d4f9mtxg')
      console.log(
        '[MIGRATION 0154] Validação live final: status=' +
          recheck.getString('status') +
          ', received_quantity=' +
          recheck.getFloat('received_quantity'),
      )
    } catch (_) {}
  },
  (app) => {
    console.log('[MIGRATION 0154] Reversão do reparo de mba6np1d4f9mtxg...')
  },
)
