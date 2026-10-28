/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/backend/v1/materials/distribute-oc-item',
  (e) => {
    console.log('=== DISTRIBUTE OC ITEM DIRECT TO INVENTORY START ===')

    function safeParseFloat(val) {
      if (val === null || val === undefined) return 0
      if (typeof val === 'number') {
        return isNaN(val) ? 0 : val
      }
      var s = String(val).trim()
      if (!s) return 0
      s = s.replace(',', '.')
      var n = parseFloat(s)
      return isNaN(n) ? 0 : n
    }

    function getRecordFloat(rec, field) {
      if (!rec) return 0
      var raw = null
      try {
        raw = rec.get(field)
      } catch (_) {}
      if (raw !== null && raw !== undefined && raw !== '') {
        var parsed = safeParseFloat(raw)
        if (parsed !== 0 || String(raw).trim() === '0') {
          return parsed
        }
      }
      try {
        var gf = rec.getFloat(field)
        if (gf !== 0) return gf
      } catch (_) {}
      try {
        var gs = rec.getString(field)
        if (gs) return safeParseFloat(gs)
      } catch (_) {}
      try {
        return safeParseFloat(rec.getInt(field))
      } catch (_) {}
      return 0
    }

    function checkAndPromoteOcIfComplete(ocId) {
      if (!ocId) return false
      try {
        var oc = $app.findRecordById('ordens_de_compra', ocId)
        if (
          !oc ||
          oc.getString('status') === 'Cancelada' ||
          oc.getString('status') === 'Recebida'
        ) {
          return false
        }
        var items = $app.findRecordsByFilter(
          'ordem_compra_itens',
          "oc_id = '" + ocId.replace(/'/g, "''") + "'",
          'created',
          500,
          0,
        )
        if (!items || items.length === 0) return false

        var allFully = true
        for (var i = 0; i < items.length; i++) {
          var qTot = getRecordFloat(items[i], 'quantity')
          var qRec = getRecordFloat(items[i], 'received_quantity')
          if (qTot > 0 && qRec < qTot - 0.0001) {
            allFully = false
            break
          }
        }

        if (allFully) {
          oc.set('status', 'Recebida')
          $app.save(oc)
          console.log(
            'OC ' +
              ocId +
              ' (' +
              (oc.getString('oc_number') || ocId) +
              ') automatically promoted to Recebida',
          )
          return true
        }
      } catch (err) {
        console.log('Error checking/promoting OC ' + ocId + ': ' + String(err))
      }
      return false
    }

    try {
      var body = e.requestInfo().body || {}
      var ocItemId = (body.oc_item_id || '').trim()
      var receivedQty = safeParseFloat(body.received_quantity)
      var traceability = body.traceability || {}
      var userId = e.auth ? e.auth.id : ''

      if (!ocItemId) {
        return e.badRequestError('ID do item da ordem de compra obrigatório')
      }
      if (receivedQty <= 0) {
        return e.badRequestError('Quantidade recebida deve ser maior que zero')
      }

      var ocItem = null
      try {
        ocItem = $app.findRecordById('ordem_compra_itens', ocItemId)
      } catch (findErr) {
        return e.badRequestError('Item da Ordem de Compra não encontrado: ' + String(findErr))
      }

      var ocId = ocItem.getString('oc_id')
      var ocNumber = ''
      if (ocId) {
        try {
          var ocRec = $app.findRecordById('ordens_de_compra', ocId)
          ocNumber = ocRec.getString('oc_number') || ''
        } catch (_) {}
      }

      var code = (traceability.code || ocItem.getString('code') || '').trim()
      var description = (traceability.description || ocItem.getString('description') || '').trim()
      var itemTotalQty = getRecordFloat(ocItem, 'quantity')
      var itemCurRcvd = getRecordFloat(ocItem, 'received_quantity')
      var newRcvd = Math.round((itemCurRcvd + receivedQty) * 10000) / 10000

      if (itemTotalQty > 0 && newRcvd > itemTotalQty + 0.0001) {
        return e.badRequestError(
          'Quantidade excede o saldo do item da OC (recebido: ' +
            newRcvd +
            ', total: ' +
            itemTotalQty +
            ')',
        )
      }

      // Buscar unidade do componente se existir
      var unit = (traceability.unit || '').trim() || 'un'
      if (code && !traceability.unit) {
        try {
          var comp = $app.findFirstRecordByFilter(
            'components',
            "code = '" + code.replace(/'/g, "''") + "'",
          )
          if (comp && comp.getString('unit')) {
            unit = comp.getString('unit')
          }
        } catch (_) {}
      }

      // --- 1. Buscar ou criar item no inventário (inventory) ---
      var invRecord = null
      if (code) {
        try {
          invRecord = $app.findFirstRecordByFilter(
            'inventory',
            "code = '" + code.replace(/'/g, "''") + "'",
          )
        } catch (_) {}
      }
      if (!invRecord && description) {
        try {
          invRecord = $app.findFirstRecordByFilter(
            'inventory',
            "description = '" + description.replace(/'/g, "''") + "'",
          )
        } catch (_) {}
      }

      if (!invRecord) {
        var invCol = $app.findCollectionByNameOrId('inventory')
        invRecord = new Record(invCol)
        var finalCode = code || 'REF-' + $security.randomString(6).toUpperCase()
        invRecord.set('code', finalCode)
        invRecord.set('description', description)
        invRecord.set('quantity', 0)
        invRecord.set('min_quantity', 0)
        invRecord.set('unit', unit)
        $app.save(invRecord)
        if (!code) code = finalCode
        invRecord = $app.findRecordById('inventory', invRecord.id)
      } else {
        invRecord = $app.findRecordById('inventory', invRecord.id)
        if (!invRecord.getString('code') && code) {
          invRecord.set('code', code)
          $app.save(invRecord)
        }
      }

      var runningBalance = getRecordFloat(invRecord, 'quantity')
      var todayStr = new Date().toISOString().split('T')[0]
      var purchaseDate = traceability.purchase_date || ''
      var arrivalDate = traceability.arrival_date || todayStr
      var unitPrice =
        safeParseFloat(traceability.unit_price) || getRecordFloat(ocItem, 'unit_price')
      var freight = safeParseFloat(traceability.freight)
      var totalValue = unitPrice > 0 ? unitPrice * receivedQty + freight : freight > 0 ? freight : 0

      // --- 2. Registrar Entrada no Estoque (inventory_movements) ---
      var movCol = $app.findCollectionByNameOrId('inventory_movements')
      var entrada = new Record(movCol)
      entrada.set('inventory_id', invRecord.id)
      entrada.set('quantity', receivedQty)
      entrada.set('type', 'Entrada')
      var ocLabel = ocNumber ? 'OC #' + ocNumber : 'OC ' + ocId
      entrada.set(
        'reason',
        'Recebimento direto ao estoque - Item avulso da ' + ocLabel + ' (Item: ' + ocItemId + ')',
      )
      entrada.set('arrival_date', arrivalDate)
      var balanceAfterEntrada = Math.round((runningBalance + receivedQty) * 10000) / 10000
      entrada.set('balance_after', balanceAfterEntrada)
      if (purchaseDate) entrada.set('purchase_date', purchaseDate)
      if (unitPrice > 0) entrada.set('unit_price', unitPrice)
      if (totalValue > 0) entrada.set('total_value', totalValue)
      if (freight > 0) entrada.set('freight', freight)
      if (userId) entrada.set('user_id', userId)
      $app.save(entrada)

      // --- 3. Atualizar saldo do inventário ---
      invRecord.set('quantity', balanceAfterEntrada)
      $app.save(invRecord)

      // --- 4. Atualizar item da Ordem de Compra ---
      ocItem.set('received_quantity', newRcvd)
      if (code && !ocItem.getString('code')) {
        ocItem.set('code', code)
      }
      $app.save(ocItem)

      if (ocId) {
        checkAndPromoteOcIfComplete(ocId)
      }

      console.log(
        '=== DISTRIBUTE OC ITEM SUCCESS: item=' +
          ocItemId +
          ' newRcvd=' +
          newRcvd +
          ' invBalance=' +
          balanceAfterEntrada +
          ' ===',
      )

      return e.json(200, {
        success: true,
        oc_item_id: ocItemId,
        oc_id: ocId,
        received_quantity: newRcvd,
        inventory_id: invRecord.id,
        balance: balanceAfterEntrada,
      })
    } catch (err) {
      console.log('=== DISTRIBUTE OC ITEM ERROR ===', String(err))
      return e.json(500, { error: 'Erro interno ao receber item avulso: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/materials/distribute-oc-full',
  (e) => {
    console.log('=== DISTRIBUTE OC FULL START ===')

    function safeParseFloat(val) {
      if (val === null || val === undefined) return 0
      if (typeof val === 'number') {
        return isNaN(val) ? 0 : val
      }
      var s = String(val).trim()
      if (!s) return 0
      s = s.replace(',', '.')
      var n = parseFloat(s)
      return isNaN(n) ? 0 : n
    }

    function getRecordFloat(rec, field) {
      if (!rec) return 0
      var raw = null
      try {
        raw = rec.get(field)
      } catch (_) {}
      if (raw !== null && raw !== undefined && raw !== '') {
        var parsed = safeParseFloat(raw)
        if (parsed !== 0 || String(raw).trim() === '0') {
          return parsed
        }
      }
      try {
        var gf = rec.getFloat(field)
        if (gf !== 0) return gf
      } catch (_) {}
      try {
        var gs = rec.getString(field)
        if (gs) return safeParseFloat(gs)
      } catch (_) {}
      try {
        return safeParseFloat(rec.getInt(field))
      } catch (_) {}
      return 0
    }

    try {
      var body = e.requestInfo().body || {}
      var ocId = (body.oc_id || '').trim()
      var selectedItemIds = body.selected_item_ids // array de IDs de ordem_compra_itens
      var reconcileOnly = Boolean(body.reconcile_only)
      var userId = e.auth ? e.auth.id : ''
      var todayStr = new Date().toISOString().split('T')[0]

      if (!ocId) {
        return e.badRequestError('ID da Ordem de Compra obrigatório')
      }

      var oc = null
      try {
        oc = $app.findRecordById('ordens_de_compra', ocId)
      } catch (findOcErr) {
        return e.badRequestError('Ordem de Compra não encontrada: ' + String(findOcErr))
      }

      var ocNumber = oc.getString('oc_number') || ocId
      var ocLabel = 'OC #' + ocNumber

      // Carregar todos os itens da OC
      var ocItems = $app.findRecordsByFilter(
        'ordem_compra_itens',
        "oc_id = '" + ocId.replace(/'/g, "''") + "'",
        'created',
        200,
        0,
      )

      if (!ocItems || ocItems.length === 0) {
        return e.badRequestError('A Ordem de Compra não possui itens')
      }

      var selectedSet = null
      if (Array.isArray(selectedItemIds)) {
        selectedSet = {}
        for (var si = 0; si < selectedItemIds.length; si++) {
          selectedSet[String(selectedItemIds[si]).trim()] = true
        }
      }

      var movCol = $app.findCollectionByNameOrId('inventory_movements')
      var processedItems = []
      var skippedItems = []

      for (var i = 0; i < ocItems.length; i++) {
        var it = ocItems[i]
        var itemId = it.id

        // Se uma seleção foi fornecida e o item não foi selecionado, pula
        if (selectedSet && !selectedSet[itemId]) {
          skippedItems.push({ item_id: itemId, reason: 'Não selecionado pelo usuário' })
          continue
        }

        var itemTotalQty = getRecordFloat(it, 'quantity')
        var itemCurRcvd = getRecordFloat(it, 'received_quantity')
        var itemSaldo = Math.round(Math.max(0, itemTotalQty - itemCurRcvd) * 10000) / 10000

        // Se item já está integralmente recebido (saldo 0), pula
        if (itemSaldo <= 0.0001) {
          skippedItems.push({ item_id: itemId, reason: 'Item já sem saldo pendente' })
          continue
        }

        var code = (it.getString('code') || '').trim()
        var description = (it.getString('description') || '').trim()
        var unitPrice = getRecordFloat(it, 'unit_price')
        var shortageId = it.getString('material_shortage_id')

        // 1. Resolver item no inventário
        var invRecord = null
        if (code) {
          try {
            invRecord = $app.findFirstRecordByFilter(
              'inventory',
              "code = '" + code.replace(/'/g, "''") + "'",
            )
          } catch (_) {}
        }
        if (!invRecord && description) {
          try {
            invRecord = $app.findFirstRecordByFilter(
              'inventory',
              "description = '" + description.replace(/'/g, "''") + "'",
            )
          } catch (_) {}
        }

        if (!invRecord) {
          var invCol = $app.findCollectionByNameOrId('inventory')
          invRecord = new Record(invCol)
          var finalCode = code || 'REF-' + $security.randomString(6).toUpperCase()
          invRecord.set('code', finalCode)
          invRecord.set('description', description)
          invRecord.set('quantity', 0)
          invRecord.set('min_quantity', 0)
          invRecord.set('unit', 'un')
          $app.save(invRecord)
          if (!code) code = finalCode
          invRecord = $app.findRecordById('inventory', invRecord.id)
        } else {
          invRecord = $app.findRecordById('inventory', invRecord.id)
          if (!invRecord.getString('code') && code) {
            invRecord.set('code', code)
            $app.save(invRecord)
          }
        }

        var runningBalance = getRecordFloat(invRecord, 'quantity')

        // 2. Verificar shortages vinculados exatamente a este item
        // A regra exige: "usar sempre o vínculo exato por material_shortage_id (nunca tocar registros alheios do mesmo código)"
        var shortageList = []
        if (shortageId) {
          try {
            var directShortage = $app.findRecordById('material_shortages', shortageId)
            if (directShortage) {
              shortageList.push(directShortage)
              // Se tiver batch_id explícito compartilhado, carregar outros membros do mesmo lote
              var bId = directShortage.getString('batch_id')
              if (bId) {
                var batchShortages = $app.findRecordsByFilter(
                  'material_shortages',
                  "batch_id = '" +
                    bId.replace(/'/g, "''") +
                    "' && id != '" +
                    directShortage.id.replace(/'/g, "''") +
                    "'",
                  'created',
                  50,
                  0,
                )
                for (var bs = 0; bs < batchShortages.length; bs++) {
                  // Confere se código bate
                  var bsCode = (batchShortages[bs].getString('code') || '').trim()
                  if (!code || !bsCode || bsCode.toUpperCase() === code.toUpperCase()) {
                    shortageList.push(batchShortages[bs])
                  }
                }
              }
            }
          } catch (stErr) {
            console.log('Shortage not found for item ' + itemId + ': ' + String(stErr))
          }
        }

        // Calcular demanda pendente nas OPs dos shortages vinculados
        // e excedente restante
        var opDemands = []
        var totalOpDemandPending = 0

        for (var s = 0; s < shortageList.length; s++) {
          var sht = shortageList[s]
          var hasOp = Boolean(sht.getString('order_id'))
          var sStatus = sht.getString('status')
          var sQty = getRecordFloat(sht, 'quantity')
          var sRcvd = getRecordFloat(sht, 'received_quantity')
          var sPending = Math.round(Math.max(0, sQty - sRcvd) * 10000) / 10000

          if (hasOp && sStatus !== 'Recebido' && sStatus !== 'Cancelado' && sPending > 0.0001) {
            opDemands.push({
              shortage: sht,
              pending: sPending,
              order_id: sht.getString('order_id'),
            })
            totalOpDemandPending = Math.round((totalOpDemandPending + sPending) * 10000) / 10000
          }
        }

        var distributedOpsCount = 0
        var totalAllocatedToOps = 0

        if (reconcileOnly) {
          // --- MODO APENAS CONCILIAR ---
          // O material físico JÁ está no estoque (excedente prévio ou recebido fora do fluxo).
          // NÃO cria movimentação de Entrada e NÃO altera o saldo total do inventário se não houver saída,
          // ou distribui as OPs pendentes usando o estoque atual (criando Saída e mensagem na OP).
          // Distribui a demanda pendente das OPs dos shortages vinculados usando o estoque atual (runningBalance):
          for (var d = 0; d < opDemands.length; d++) {
            var demand = opDemands[d]
            if (demand.pending <= 0.0001) continue

            // Aloca a demanda pendente da OP limitada pelo estoque atual disponível do item (ou pela demanda total da OP)
            // No modo conciliar, se runningBalance >= demand.pending, usa demand.pending.
            // Se runningBalance < demand.pending, aloca o que houver no estoque (Math.min(runningBalance, demand.pending)).
            var allocQty = demand.pending
            if (runningBalance > 0 && allocQty > runningBalance) {
              allocQty = runningBalance
            }
            allocQty = Math.round(allocQty * 10000) / 10000
            if (allocQty <= 0) continue

            var targetShortage = demand.shortage
            var curRec = getRecordFloat(targetShortage, 'received_quantity')
            var curTot = getRecordFloat(targetShortage, 'quantity')
            var newRec = Math.round((curRec + allocQty) * 10000) / 10000

            var newStatus = 'Recebido_Parcial'
            if (curTot > 0 && newRec >= curTot - 0.0001) {
              newStatus = 'Recebido'
            } else if (curTot === 0) {
              newStatus = 'Recebido'
            }

            targetShortage.set('received_quantity', newRec)
            targetShortage.set('status', newStatus)
            if (code) targetShortage.set('code', code)
            if (userId) {
              targetShortage.set('received_by', userId)
              targetShortage.set('distributed_by', userId)
            }
            $app.save(targetShortage)

            // Registrar somente a Saída para a OP
            var opNumber = ''
            if (demand.order_id) {
              try {
                var opOrder = $app.findRecordById('pcp_orders', demand.order_id)
                opNumber = opOrder.getString('op_number') || opOrder.getString('order_number') || ''
              } catch (_) {}
            }

            var balanceAfterSaida =
              Math.round(Math.max(0, runningBalance - allocQty) * 10000) / 10000
            var saida = new Record(movCol)
            saida.set('inventory_id', invRecord.id)
            saida.set('quantity', allocQty)
            saida.set('type', 'Saída')
            saida.set(
              'reason',
              'Conciliação de demanda para OP' +
                (opNumber ? ' ' + opNumber : '') +
                ' (ID: ' +
                targetShortage.id +
                ') via ' +
                ocLabel +
                ' (material já em estoque)',
            )
            saida.set('exit_date', todayStr)
            saida.set('balance_after', balanceAfterSaida)
            if (demand.order_id) saida.set('order_id', demand.order_id)
            if (userId) saida.set('user_id', userId)
            if (unitPrice > 0) saida.set('unit_price', unitPrice)
            $app.save(saida)
            runningBalance = balanceAfterSaida

            // Mensagem para a OP
            if (demand.order_id && userId) {
              try {
                var msgCol = $app.findCollectionByNameOrId('pcp_order_messages')
                var msg = new Record(msgCol)
                msg.set('order_id', demand.order_id)
                msg.set('user_id', userId)
                msg.set(
                  'content',
                  'Material conciliado do estoque e separado: ' +
                    targetShortage.getString('description') +
                    ' (Qtde: ' +
                    allocQty +
                    ') via ' +
                    ocLabel,
                )
                msg.set('sector', 'Operador')
                msg.set('read', false)
                $app.save(msg)
              } catch (_) {}
            }

            totalAllocatedToOps = Math.round((totalAllocatedToOps + allocQty) * 10000) / 10000
            distributedOpsCount++
          }

          // Se houve saída de estoque para as OPs conciliadas, atualiza o saldo do inventário
          if (distributedOpsCount > 0) {
            invRecord.set('quantity', runningBalance)
            $app.save(invRecord)
          }
        } else {
          // --- MODO PADRÃO (Entrada + Distribuição) ---
          // A entrada integral deste item traz para o sistema exatamente 'itemSaldo'.
          // Esse saldo alimenta primeiro as demandas de OP vinculadas até zerar sua falta;
          // O restante (excedente) fica como entrada direta ao estoque geral.
          // Registramos a movimentação de Entrada do total do saldo de uma só vez:
          var balanceAfterEntrada = Math.round((runningBalance + itemSaldo) * 10000) / 10000
          var entrada = new Record(movCol)
          entrada.set('inventory_id', invRecord.id)
          entrada.set('quantity', itemSaldo)
          entrada.set('type', 'Entrada')
          entrada.set('reason', 'Entrada integral da ' + ocLabel + ' - Item ' + (code || it.id))
          entrada.set('arrival_date', todayStr)
          entrada.set('balance_after', balanceAfterEntrada)
          if (unitPrice > 0) entrada.set('unit_price', unitPrice)
          if (userId) entrada.set('user_id', userId)
          $app.save(entrada)
          runningBalance = balanceAfterEntrada

          // Agora distribuir para as OPs com demanda pendente
          var remainingToDistribute = itemSaldo

          for (var d = 0; d < opDemands.length; d++) {
            if (remainingToDistribute <= 0.0001) break

            var demand = opDemands[d]
            var allocQty = Math.min(remainingToDistribute, demand.pending)
            allocQty = Math.round(allocQty * 10000) / 10000
            if (allocQty <= 0) continue

            var targetShortage = demand.shortage
            var curRec = getRecordFloat(targetShortage, 'received_quantity')
            var curTot = getRecordFloat(targetShortage, 'quantity')
            var newRec = Math.round((curRec + allocQty) * 10000) / 10000

            var newStatus = 'Recebido_Parcial'
            if (curTot > 0 && newRec >= curTot - 0.0001) {
              newStatus = 'Recebido'
            } else if (curTot === 0) {
              newStatus = 'Recebido'
            }

            targetShortage.set('received_quantity', newRec)
            targetShortage.set('status', newStatus)
            if (code) targetShortage.set('code', code)
            if (userId) {
              targetShortage.set('received_by', userId)
              targetShortage.set('distributed_by', userId)
            }
            $app.save(targetShortage)

            // Registrar Saída para a OP
            var opNumber = ''
            if (demand.order_id) {
              try {
                var opOrder = $app.findRecordById('pcp_orders', demand.order_id)
                opNumber = opOrder.getString('op_number') || opOrder.getString('order_number') || ''
              } catch (_) {}
            }

            var balanceAfterSaida = Math.round((runningBalance - allocQty) * 10000) / 10000
            var saida = new Record(movCol)
            saida.set('inventory_id', invRecord.id)
            saida.set('quantity', allocQty)
            saida.set('type', 'Saída')
            saida.set(
              'reason',
              'Distribuição para OP' +
                (opNumber ? ' ' + opNumber : '') +
                ' (ID: ' +
                targetShortage.id +
                ') via entrada integral da ' +
                ocLabel,
            )
            saida.set('exit_date', todayStr)
            saida.set('balance_after', balanceAfterSaida)
            if (demand.order_id) saida.set('order_id', demand.order_id)
            if (userId) saida.set('user_id', userId)
            if (unitPrice > 0) saida.set('unit_price', unitPrice)
            $app.save(saida)
            runningBalance = balanceAfterSaida

            // Mensagem para a OP
            if (demand.order_id && userId) {
              try {
                var msgCol = $app.findCollectionByNameOrId('pcp_order_messages')
                var msg = new Record(msgCol)
                msg.set('order_id', demand.order_id)
                msg.set('user_id', userId)
                msg.set(
                  'content',
                  'Material recebido e separado: ' +
                    targetShortage.getString('description') +
                    ' (Qtde: ' +
                    allocQty +
                    ') via entrada integral da ' +
                    ocLabel,
                )
                msg.set('sector', 'Operador')
                msg.set('read', false)
                $app.save(msg)
              } catch (_) {}
            }

            remainingToDistribute = Math.round((remainingToDistribute - allocQty) * 10000) / 10000
            totalAllocatedToOps = Math.round((totalAllocatedToOps + allocQty) * 10000) / 10000
            distributedOpsCount++
          }

          // Atualizar saldo final do item no estoque
          invRecord.set('quantity', runningBalance)
          $app.save(invRecord)
        }

        // Atualizar o item da OC como integralmente recebido (float-safe preservando o quantity do item)
        it.set('received_quantity', itemTotalQty)
        if (code && !it.getString('code')) {
          it.set('code', code)
        }
        $app.save(it)

        // Se houver shortage vinculado diretamente a este item de OC, garantir que também esteja sincronizado
        if (shortageId) {
          try {
            var linkedSt = $app.findRecordById('material_shortages', shortageId)
            var stQty = getRecordFloat(linkedSt, 'quantity')
            var stRcvd = getRecordFloat(linkedSt, 'received_quantity')
            if (stRcvd < stQty) {
              linkedSt.set('received_quantity', stQty)
              linkedSt.set('status', 'Recebido')
              if (userId) {
                linkedSt.set('received_by', userId)
                linkedSt.set('distributed_by', userId)
              }
              $app.save(linkedSt)
            }
          } catch (_) {}
        }

        var surplusQty = reconcileOnly
          ? 0
          : Math.max(0, Math.round((itemSaldo - totalAllocatedToOps) * 10000) / 10000)

        processedItems.push({
          item_id: itemId,
          code: code,
          total_qty: itemTotalQty,
          received_now: itemSaldo,
          distributed_ops: distributedOpsCount,
          surplus_stock: surplusQty,
          final_inv_balance: runningBalance,
          reconciled: reconcileOnly,
        })
      }

      // 3. Após fechar os itens selecionados, verificar se TODOS os itens da OC estão 100% recebidos
      var allOcItemsNow = $app.findRecordsByFilter(
        'ordem_compra_itens',
        "oc_id = '" + ocId.replace(/'/g, "''") + "'",
        'created',
        200,
        0,
      )

      var allItemsFullyReceived = true
      for (var j = 0; j < allOcItemsNow.length; j++) {
        var itCheck = allOcItemsNow[j]
        var qTotal = getRecordFloat(itCheck, 'quantity')
        var qRcvd = getRecordFloat(itCheck, 'received_quantity')
        if (qTotal > 0 && qRcvd < qTotal - 0.0001) {
          allItemsFullyReceived = false
          break
        }
      }

      var ocMarkedReceived = false
      if (allItemsFullyReceived && allOcItemsNow.length > 0) {
        oc.set('status', 'Recebida')
        $app.save(oc)
        ocMarkedReceived = true
        console.log('OC ' + ocId + ' (' + ocNumber + ') marked as Recebida automatically')
      }

      console.log(
        '=== DISTRIBUTE OC FULL COMPLETED: ' + processedItems.length + ' items processed ===',
      )

      return e.json(200, {
        success: true,
        oc_id: ocId,
        oc_number: ocNumber,
        oc_status: oc.getString('status'),
        oc_marked_received: ocMarkedReceived,
        processed_items: processedItems,
        skipped_items: skippedItems,
      })
    } catch (err) {
      console.log('=== DISTRIBUTE OC FULL ERROR ===', String(err))
      return e.json(500, { error: 'Erro interno ao dar entrada integral na OC: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/materials/distribute',
  (e) => {
    console.log('=== MATERIAL DISTRIBUTION START ===')

    function safeParseFloat(val) {
      if (val === null || val === undefined) return 0
      if (typeof val === 'number') {
        return isNaN(val) ? 0 : val
      }
      var s = String(val).trim()
      if (!s) return 0
      s = s.replace(',', '.')
      var n = parseFloat(s)
      return isNaN(n) ? 0 : n
    }

    function getRecordFloat(rec, field) {
      if (!rec) return 0
      var raw = null
      try {
        raw = rec.get(field)
      } catch (_) {}
      if (raw !== null && raw !== undefined && raw !== '') {
        var parsed = safeParseFloat(raw)
        if (parsed !== 0 || String(raw).trim() === '0') {
          return parsed
        }
      }
      try {
        var gf = rec.getFloat(field)
        if (gf !== 0) return gf
      } catch (_) {}
      try {
        var gs = rec.getString(field)
        if (gs) return safeParseFloat(gs)
      } catch (_) {}
      try {
        return safeParseFloat(rec.getInt(field))
      } catch (_) {}
      return 0
    }

    function checkAndPromoteOcIfComplete(ocId) {
      if (!ocId) return false
      try {
        var oc = $app.findRecordById('ordens_de_compra', ocId)
        if (
          !oc ||
          oc.getString('status') === 'Cancelada' ||
          oc.getString('status') === 'Recebida'
        ) {
          return false
        }
        var items = $app.findRecordsByFilter(
          'ordem_compra_itens',
          "oc_id = '" + ocId.replace(/'/g, "''") + "'",
          'created',
          500,
          0,
        )
        if (!items || items.length === 0) return false

        var allFully = true
        for (var i = 0; i < items.length; i++) {
          var qTot = getRecordFloat(items[i], 'quantity')
          var qRec = getRecordFloat(items[i], 'received_quantity')
          if (qTot > 0 && qRec < qTot - 0.0001) {
            allFully = false
            break
          }
        }

        if (allFully) {
          oc.set('status', 'Recebida')
          $app.save(oc)
          console.log(
            'OC ' +
              ocId +
              ' (' +
              (oc.getString('oc_number') || ocId) +
              ') automatically promoted to Recebida',
          )
          return true
        }
      } catch (err) {
        console.log('Error checking/promoting OC ' + ocId + ': ' + String(err))
      }
      return false
    }

    function syncLinkedOcItem(shortageId, addedQty) {
      if (!shortageId || !addedQty || addedQty <= 0) return
      try {
        var linkedOcItem = $app.findFirstRecordByFilter(
          'ordem_compra_itens',
          "material_shortage_id = '" + shortageId.replace(/'/g, "''") + "'",
        )
        if (linkedOcItem) {
          var curItemRcvd = getRecordFloat(linkedOcItem, 'received_quantity')
          var itemTotalQty = getRecordFloat(linkedOcItem, 'quantity')
          var newItemRcvd = Math.round((curItemRcvd + addedQty) * 10000) / 10000
          if (itemTotalQty > 0 && newItemRcvd > itemTotalQty) {
            newItemRcvd = itemTotalQty
          }
          linkedOcItem.set('received_quantity', newItemRcvd)
          $app.save(linkedOcItem)
          console.log(
            'Linked OC item ' +
              linkedOcItem.id +
              ' updated received_quantity=' +
              newItemRcvd +
              ' (added ' +
              addedQty +
              ') for shortage ' +
              shortageId,
          )

          var parentOcId = linkedOcItem.getString('oc_id')
          if (parentOcId) {
            checkAndPromoteOcIfComplete(parentOcId)
          }
        }
      } catch (ocErr) {
        console.log(
          'Error syncing linked OC item for shortage ' + shortageId + ': ' + String(ocErr),
        )
      }
    }

    try {
      var body = e.requestInfo().body || {}
      var distributions = body.distributions || []
      var shortageIdInput = (body.shortage_id || '').trim()
      var traceability = body.traceability || {}
      var userId = e.auth ? e.auth.id : ''

      var totalReceived = safeParseFloat(body.total_received)

      var code = (traceability.code || '').trim()
      var description = (traceability.description || '').trim()

      console.log(
        'Distribute input: distributions=' +
          JSON.stringify(distributions) +
          ' shortage_id="' +
          shortageIdInput +
          '" total_received=' +
          totalReceived +
          ' code="' +
          code +
          '" description="' +
          description +
          '" userId=' +
          userId,
      )

      if (!totalReceived || totalReceived <= 0) {
        if (!distributions || distributions.length === 0) {
          return e.badRequestError('Nenhuma quantidade recebida informada')
        }
        totalReceived = 0
        for (var i = 0; i < distributions.length; i++) {
          totalReceived += safeParseFloat(distributions[i].quantity)
        }
      }

      if (totalReceived <= 0) {
        return e.badRequestError('Quantidade total recebida deve ser maior que zero')
      }

      if (!description && shortageIdInput) {
        try {
          var originShortage = $app.findRecordById('material_shortages', shortageIdInput)
          description = originShortage.getString('description')
          if (!code) code = originShortage.getString('code') || ''
        } catch (_) {}
      }

      if (!description && distributions.length > 0) {
        try {
          var firstShortage = $app.findRecordById(
            'material_shortages',
            distributions[0].shortage_id,
          )
          description = firstShortage.getString('description')
          if (!code) code = firstShortage.getString('code') || ''
        } catch (_) {}
      }

      if (!description) {
        return e.badRequestError('Descrição do material é obrigatória')
      }

      console.log('Resolved code="' + code + '" description="' + description + '"')

      // --- 1. Buscar/criar item de inventário ---
      var invRecord = null
      if (code) {
        try {
          invRecord = $app.findFirstRecordByFilter(
            'inventory',
            "code = '" + code.replace(/'/g, "''") + "'",
          )
        } catch (_) {}
      }
      if (!invRecord && description) {
        try {
          invRecord = $app.findFirstRecordByFilter(
            'inventory',
            "description = '" + description.replace(/'/g, "''") + "'",
          )
        } catch (_) {}
      }

      if (!invRecord) {
        console.log('Inventory item not found — creating new')
        var invCol = $app.findCollectionByNameOrId('inventory')
        invRecord = new Record(invCol)
        var finalCode = code || 'REF-' + $security.randomString(6).toUpperCase()
        invRecord.set('code', finalCode)
        invRecord.set('description', description)
        invRecord.set('quantity', 0)
        invRecord.set('min_quantity', 0)
        invRecord.set('unit', 'un')
        $app.save(invRecord)
        console.log('Inventory item created id=' + invRecord.id + ' code=' + finalCode)
        if (!code) code = finalCode
        invRecord = $app.findRecordById('inventory', invRecord.id)
      } else {
        console.log('Inventory item found id=' + invRecord.id)
        invRecord = $app.findRecordById('inventory', invRecord.id)
        if (!invRecord.getString('code') && code) {
          invRecord.set('code', code)
          $app.save(invRecord)
          console.log('Inventory code updated to ' + code)
        }
      }

      var results = []
      var runningBalance = getRecordFloat(invRecord, 'quantity')
      var todayStr = new Date().toISOString().split('T')[0]
      var purchaseDate = traceability.purchase_date || ''
      var arrivalDate = traceability.arrival_date || todayStr
      var unitPrice = safeParseFloat(traceability.unit_price)
      var freight = safeParseFloat(traceability.freight)
      var totalValue =
        unitPrice > 0 ? unitPrice * totalReceived + freight : freight > 0 ? freight : 0

      console.log(
        'Prepared: runningBalance=' +
          runningBalance +
          ' today=' +
          todayStr +
          ' purchaseDate=' +
          purchaseDate +
          ' arrivalDate=' +
          arrivalDate +
          ' unitPrice=' +
          unitPrice +
          ' freight=' +
          freight +
          ' totalValue=' +
          totalValue,
      )

      var shortageIds = []
      for (var j = 0; j < distributions.length; j++) {
        if (
          distributions[j].shortage_id &&
          shortageIds.indexOf(distributions[j].shortage_id) === -1
        ) {
          shortageIds.push(distributions[j].shortage_id)
        }
      }
      if (shortageIdInput && shortageIds.indexOf(shortageIdInput) === -1) {
        shortageIds.push(shortageIdInput)
      }
      var shortageIdsStr = shortageIds.join(', ')

      // --- 2. Movimento de Entrada (total_received) ---
      var movCol = $app.findCollectionByNameOrId('inventory_movements')

      var entrada = new Record(movCol)
      entrada.set('inventory_id', invRecord.id)
      entrada.set('quantity', totalReceived)
      entrada.set('type', 'Entrada')
      entrada.set('reason', 'Recebimento de Material (IDs: ' + shortageIdsStr + ')')
      entrada.set('arrival_date', arrivalDate)
      var balanceAfterEntrada = Math.round((runningBalance + totalReceived) * 10000) / 10000
      entrada.set('balance_after', balanceAfterEntrada)
      if (purchaseDate) entrada.set('purchase_date', purchaseDate)
      if (unitPrice > 0) entrada.set('unit_price', unitPrice)
      if (totalValue > 0) entrada.set('total_value', totalValue)
      if (freight > 0) entrada.set('freight', freight)
      if (userId) entrada.set('user_id', userId)
      console.log('Saving Entrada movement (qty=' + totalReceived + ')')
      $app.save(entrada)
      console.log('Entrada movement saved id=' + entrada.id)
      runningBalance = balanceAfterEntrada

      // --- 2.1 Se não houver distributions mas houver shortageId de origem, atualizar a solicitação ---
      if ((!distributions || distributions.length === 0) && shortageIdInput) {
        try {
          var singleShortage = $app.findRecordById('material_shortages', shortageIdInput)
          var origTotalQty = getRecordFloat(singleShortage, 'quantity')
          var origCurrentReceived = getRecordFloat(singleShortage, 'received_quantity')
          var origNewReceived = Math.round((origCurrentReceived + totalReceived) * 10000) / 10000

          var singleStatus = 'Recebido_Parcial'
          if (origTotalQty > 0 && origNewReceived >= origTotalQty - 0.0001) {
            singleStatus = 'Recebido'
          } else if (origTotalQty === 0) {
            singleStatus = 'Recebido'
          }

          singleShortage.set('received_quantity', origNewReceived)
          singleShortage.set('status', singleStatus)
          if (code) singleShortage.set('code', code)
          if (userId) {
            singleShortage.set('received_by', userId)
          }
          $app.save(singleShortage)
          console.log(
            'Direct shortage ' +
              shortageIdInput +
              ' updated: status=' +
              singleStatus +
              ' received=' +
              origNewReceived,
          )

          // Sincronizar item de ordem_compra_itens vinculado exclusivamente a este shortage
          syncLinkedOcItem(shortageIdInput, totalReceived)

          results.push({ shortage_id: shortageIdInput, success: true, status: singleStatus })
        } catch (sErr) {
          console.log('Error updating direct shortage ' + shortageIdInput + ': ' + String(sErr))
          results.push({
            shortage_id: shortageIdInput,
            success: false,
            error: 'Erro ao atualizar solicitação: ' + String(sErr),
          })
        }
      }

      // --- 3. Para cada distribuição: atualizar shortage, criar Saída, criar mensagem ---
      for (var k = 0; k < distributions.length; k++) {
        var dist = distributions[k]
        var distQty = safeParseFloat(dist.quantity)
        console.log(
          'Processing distribution #' +
            (k + 1) +
            ' shortage_id=' +
            dist.shortage_id +
            ' qty=' +
            distQty,
        )

        var shortage = null
        try {
          shortage = $app.findRecordById('material_shortages', dist.shortage_id)
        } catch (findShortageErr) {
          console.log('Shortage not found ' + dist.shortage_id + ': ' + String(findShortageErr))
          results.push({
            shortage_id: dist.shortage_id,
            success: false,
            error: 'Solicitação de material não encontrada',
          })
          continue
        }

        // Trava estrutural contra contaminação cruzada:
        // Se shortageIdInput foi especificado, apenas o próprio registro ou registros que compartilhem
        // exatamente o mesmo batch_id (lote explícito) podem ser atualizados.
        if (shortageIdInput && dist.shortage_id !== shortageIdInput) {
          var inputRec = null
          try {
            inputRec = $app.findRecordById('material_shortages', shortageIdInput)
          } catch (_) {}
          var inputBatchId = inputRec ? inputRec.getString('batch_id') : ''
          var targetBatchId = shortage.getString('batch_id')
          if (!inputBatchId || !targetBatchId || inputBatchId !== targetBatchId) {
            console.log(
              'BLOCKED: attempt to distribute to unrelated shortage ' +
                dist.shortage_id +
                ' outside batch of ' +
                shortageIdInput,
            )
            results.push({
              shortage_id: dist.shortage_id,
              success: false,
              error: 'Registro não pertence ao lote do item distribuído',
            })
            continue
          }
        }

        var sTotalQty = getRecordFloat(shortage, 'quantity')
        var sCurrentReceived = getRecordFloat(shortage, 'received_quantity')
        var sNewReceived = Math.round((sCurrentReceived + distQty) * 10000) / 10000

        // Tolerância float de 0.0001 para arredondamentos binários
        if (sTotalQty > 0 && sNewReceived > sTotalQty + 0.0001) {
          console.log(
            'Skipped: qty exceeds total for shortage ' +
              dist.shortage_id +
              ' (new=' +
              sNewReceived +
              ', total=' +
              sTotalQty +
              ')',
          )
          results.push({
            shortage_id: dist.shortage_id,
            success: false,
            error: 'Quantidade excede o total',
          })
          continue
        }

        var newStatus = 'Recebido_Parcial'
        if (sTotalQty > 0 && sNewReceived >= sTotalQty - 0.0001) {
          newStatus = 'Recebido'
        } else if (sTotalQty === 0) {
          newStatus = 'Recebido'
        }

        shortage.set('received_quantity', sNewReceived)
        shortage.set('status', newStatus)
        if (code) shortage.set('code', code)
        if (userId) {
          shortage.set('received_by', userId)
          shortage.set('distributed_by', userId)
        }
        console.log(
          'Saving shortage ' +
            dist.shortage_id +
            ' status=' +
            newStatus +
            ' received=' +
            sNewReceived,
        )
        $app.save(shortage)
        console.log('Shortage saved ' + dist.shortage_id)

        // Sincronizar item de ordem_compra_itens vinculado exclusivamente a este shortage
        syncLinkedOcItem(dist.shortage_id, distQty)

        var orderId = shortage.getString('order_id') || ''
        var opNumber = ''
        if (orderId) {
          try {
            var opOrder = $app.findRecordById('pcp_orders', orderId)
            opNumber = opOrder.getString('op_number') || opOrder.getString('order_number') || ''
          } catch (_) {}
        }

        var balanceAfterSaida = Math.round((runningBalance - distQty) * 10000) / 10000
        var saida = new Record(movCol)
        saida.set('inventory_id', invRecord.id)
        saida.set('quantity', distQty)
        saida.set('type', 'Saída')
        saida.set(
          'reason',
          'Distribuição para OP' +
            (opNumber ? ' ' + opNumber : '') +
            ' (ID: ' +
            dist.shortage_id +
            ')',
        )
        saida.set('exit_date', todayStr)
        saida.set('balance_after', balanceAfterSaida)
        if (orderId) saida.set('order_id', orderId)
        if (userId) saida.set('user_id', userId)
        if (unitPrice > 0) saida.set('unit_price', unitPrice)
        console.log('Saving Saída movement (qty=' + distQty + ' order=' + orderId + ')')
        $app.save(saida)
        console.log('Saída movement saved id=' + saida.id)
        runningBalance = balanceAfterSaida

        if (orderId && userId) {
          try {
            var msgCol = $app.findCollectionByNameOrId('pcp_order_messages')
            var msg = new Record(msgCol)
            msg.set('order_id', orderId)
            msg.set('user_id', userId)
            msg.set(
              'content',
              'Material recebido e separado: ' +
                shortage.getString('description') +
                ' (Qtde: ' +
                distQty +
                ')',
            )
            msg.set('sector', 'Operador')
            msg.set('read', false)
            $app.save(msg)
            console.log('OP message created id=' + msg.id)
          } catch (msgErr) {
            console.log('Failed to create OP message: ' + String(msgErr))
          }
        }

        results.push({ shortage_id: dist.shortage_id, success: true, status: newStatus })
      }

      // --- 4. Atualizar saldo final do inventário ---
      var finalInvBalance = Math.round(runningBalance * 10000) / 10000
      invRecord.set('quantity', finalInvBalance)
      console.log('Updating inventory final quantity=' + finalInvBalance)
      $app.save(invRecord)
      console.log('Inventory quantity updated')

      var hasFailures = false
      var failureCount = 0
      for (var r = 0; r < results.length; r++) {
        if (!results[r].success) {
          hasFailures = true
          failureCount++
        }
      }

      if (hasFailures) {
        var failureDetails = []
        for (var f = 0; f < results.length; f++) {
          if (!results[f].success) {
            failureDetails.push(results[f].error || 'Falha na distribuição')
          }
        }
        var errorMsg =
          'Falha na distribuição de ' + failureCount + ' item(ns): ' + failureDetails.join('; ')
        console.log('=== MATERIAL DISTRIBUTION PARTIAL/FAIL: ' + errorMsg + ' ===')
        return e.json(400, {
          error: errorMsg,
          success: false,
          results: results,
          inventory_id: invRecord.id,
          balance: finalInvBalance,
        })
      }

      console.log('=== MATERIAL DISTRIBUTION SUCCESS ===')
      return e.json(200, {
        success: true,
        results: results,
        inventory_id: invRecord.id,
        balance: finalInvBalance,
      })
    } catch (err) {
      console.log('=== MATERIAL DISTRIBUTION ERROR ===', String(err))
      return e.json(500, { error: 'Erro interno: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)
