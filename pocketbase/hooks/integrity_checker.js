/// <reference path="../pb_data/types.d.ts" />

/**
 * Verificador Permanente de Integridade de Suprimentos
 *
 * Validações implementadas:
 * 1. Recebido > demanda real da OP de origem (material_shortages com received_quantity > demanda da OP)
 * 2. Saldo de estoque != soma dos movimentos (inventory.quantity !== sum(inventory_movements))
 * 3. Registros em aberto sem necessidade pendente (fantasmas em Cotação/Compra sem OP ou com OP já atendida/concluída)
 * 4. Códigos com caracteres inválidos (letras minúsculas 'l', 'o', caracteres especiais ou formatação fora do padrão de catálogo)
 * 5. Itens de inventário com descrições poluídas (ex: sufixos '(OPs: ...)')
 */

// 1. ROTINA AGENDADA DIÁRIA (cronAdd) às 04:00 UTC (01:00 BRT)
cronAdd('suprimentos_integrity_verifier', '0 4 * * *', () => {
  try {
    var countCancelled = 0
    var todayDate = new Date()
    var day = String(todayDate.getDate()).padStart(2, '0')
    var month = String(todayDate.getMonth() + 1).padStart(2, '0')
    var dateFormatted = day + '/' + month

    var openShortages = $app.findRecordsByFilter(
      'material_shortages',
      '(status = "Pendente" || status = "Cotação" || status = "Compra") && order_id != ""',
      'created',
      1000,
      0,
    )

    for (var i = 0; i < openShortages.length; i++) {
      var shortage = openShortages[i]
      var orderId = shortage.getString('order_id')
      if (!orderId) continue

      var order = null
      try {
        order = $app.findRecordById('pcp_orders', orderId)
      } catch (_) {
        continue
      }

      if (!order) continue
      var opStatus = order.getString('status')
      var isOpClosed =
        opStatus === 'Concluído' || opStatus === 'Cancelada' || opStatus === 'Cancelado'
      if (!isOpClosed) continue

      var opNum = order.getString('op_number') || order.getString('order_number') || orderId
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
            if (mateOrderId) {
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
            } else {
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
        countCancelled++
      } catch (saveErr) {
        console.error(
          '[AUTO_CANCEL] Erro ao cancelar shortage ' + shortage.id + ':',
          String(saveErr),
        )
      }
    }
    var todayDate = new Date()
    var day = String(todayDate.getDate()).padStart(2, '0')
    var month = String(todayDate.getMonth() + 1).padStart(2, '0')
    var dateFormatted = day + '/' + month

    var openShortages = $app.findRecordsByFilter(
      'material_shortages',
      '(status = "Pendente" || status = "Cotação" || status = "Compra") && order_id != ""',
      'created',
      1000,
      0,
    )

    for (var i = 0; i < openShortages.length; i++) {
      var shortage = openShortages[i]
      var orderId = shortage.getString('order_id')
      if (!orderId) continue

      var order = null
      try {
        order = $app.findRecordById('pcp_orders', orderId)
      } catch (_) {
        continue
      }

      if (!order) continue
      var opStatus = order.getString('status')
      var isOpClosed =
        opStatus === 'Concluído' || opStatus === 'Cancelada' || opStatus === 'Cancelado'
      if (!isOpClosed) continue

      var opNum = order.getString('op_number') || order.getString('order_number') || orderId
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
            if (mateOrderId) {
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
            } else {
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
        countCancelled++
      } catch (saveErr) {
        console.error(
          '[AUTO_CANCEL] Erro ao cancelar shortage ' + shortage.id + ':',
          String(saveErr),
        )
      }
    }

    if (countCancelled > 0) {
      console.log(
        '[CRON] Cancelamento automático: ' +
          countCancelled +
          ' solicitação(ões) de OP encerrada cancelada(s).',
      )
    }
  } catch (err) {
    console.error(
      '[CRON] Erro no cancelamento automático de solicitações de OPs encerradas:',
      String(err),
    )
  }
})

// 2. ENDPOINT REST PARA O FRONTEND (/backend/v1/suprimentos/integrity-check)
routerAdd(
  'GET',
  '/backend/v1/suprimentos/integrity-check',
  (e) => {
    try {
      var divergences = []
      var nowIso = new Date().toISOString()

      // Helper para buscar informações de OP
      var getOrderInfo = function (orderId) {
        if (!orderId) return { op_number: '', order_number: '', status: '', client_name: '' }
        try {
          var rec = $app.findRecordById('pcp_orders', orderId)
          return {
            op_number: rec.getString('op_number') || rec.getString('order_number') || '',
            order_number: rec.getString('order_number') || '',
            status: rec.getString('status') || '',
            client_name: rec.getString('client_name') || '',
          }
        } catch (_) {
          return { op_number: '', order_number: '', status: '', client_name: '' }
        }
      }

      // Helper para buscar lote
      var getBatchDetails = function (shortageRecord) {
        var batchId = (shortageRecord.getString('batch_id') || '').trim()
        if (!batchId) return null
        var mates = []
        try {
          var matesRecs = $app.findRecordsByFilter(
            'material_shortages',
            'batch_id = "' + batchId.replace(/"/g, '""') + '"',
            'created',
            20,
            0,
          )
          for (var b = 0; b < matesRecs.length; b++) {
            var mRec = matesRecs[b]
            var mOrd = getOrderInfo(mRec.getString('order_id'))
            mates.push({
              id: mRec.id,
              order_id: mRec.getString('order_id'),
              op_number: mOrd.op_number,
              order_number: mOrd.order_number,
              quantity: Number(mRec.getFloat('quantity')) || 0,
              received_quantity: Number(mRec.getFloat('received_quantity')) || 0,
              status: mRec.getString('status'),
            })
          }
        } catch (_) {}
        return {
          batch_id: batchId,
          members_count: mates.length,
          members: mates,
        }
      }

      // -------------------------------------------------------------------------
      // REGRA 1: Recebido <= Demanda real da OP de origem
      // -------------------------------------------------------------------------
      try {
        var shortagesWithOrder = $app.findRecordsByFilter(
          'material_shortages',
          'order_id != "" && (status = "Recebido" || status = "Recebido_Parcial")',
          'created',
          1000,
          0,
        )

        for (var i = 0; i < shortagesWithOrder.length; i++) {
          var s = shortagesWithOrder[i]
          var orderId = s.getString('order_id')
          var code = s.getString('code')
          var receivedQty = Number(s.getFloat('received_quantity')) || 0
          var registeredQty = Number(s.getFloat('quantity')) || 0

          if (orderId && code && receivedQty > 0) {
            var opMaterials = $app.findRecordsByFilter(
              'pcp_order_materials',
              'order_id = "' + orderId + '" && code = "' + code.replace(/"/g, '""') + '"',
              '',
              10,
              0,
            )

            var totalDemand = 0
            for (var m = 0; m < opMaterials.length; m++) {
              totalDemand += Number(opMaterials[m].getFloat('quantity')) || 0
            }

            var effectiveDemand = totalDemand
            var hasBom = opMaterials.length > 0

            if (!hasBom) {
              var obsText = s.getString('observation') || ''
              var matchAdjust = obsText.match(
                /Qtde ajustada de\s+(\d+(?:[.,]\d+)?)\s+para\s+(\d+(?:[.,]\d+)?)/i,
              )
              if (matchAdjust) {
                var originalQty = parseFloat(matchAdjust[1].replace(',', '.'))
                if (!isNaN(originalQty) && originalQty >= 0) {
                  effectiveDemand = originalQty
                }
              }
            }

            if ((hasBom || effectiveDemand > 0) && receivedQty > effectiveDemand + 0.0001) {
              var ordInfo = getOrderInfo(orderId)
              var batchInfo = getBatchDetails(s)
              var surplusQty = Math.round((receivedQty - effectiveDemand) * 10000) / 10000

              var alreadyInInventory = false
              try {
                var checkMovs = $app.findRecordsByFilter(
                  'inventory_movements',
                  "type = 'Entrada' && (reason ~ '" + s.id + "')",
                  '-created',
                  1,
                  0,
                )
                if (checkMovs.length > 0) {
                  alreadyInInventory = true
                }
              } catch (_) {}

              divergences.push({
                id: 'div_recv_demand_' + s.id,
                category: 'recebimento_acima_demanda',
                severity: 'alta',
                item_type: 'material_shortage',
                record_id: s.id,
                code: code,
                description: s.getString('description'),
                order_id: orderId,
                op_number: ordInfo.op_number,
                order_number: ordInfo.order_number,
                record_status: s.getString('status'),
                record_created: s.getString('created'),
                batch_id: s.getString('batch_id') || '',
                batch_members: batchInfo ? batchInfo.members : undefined,
                problem:
                  'Quantidade recebida (' +
                  receivedQty +
                  ' un) excede a demanda real da OP ' +
                  (ordInfo.op_number ? 'OP ' + ordInfo.op_number : '') +
                  ' (' +
                  effectiveDemand +
                  ' un' +
                  (!hasBom ? ' via auditoria original' : '') +
                  '). Excedente: ' +
                  surplusQty +
                  ' un.',
                suggestion: alreadyInInventory
                  ? 'Excedente (' +
                    surplusQty +
                    ' un) já foi recebido no inventário físico. Ajustar registro da OP para ' +
                    effectiveDemand +
                    ' un SEM lançar nova entrada duplicada.'
                  : 'Destinar excedente (' +
                    surplusQty +
                    ' un) ao estoque geral ou corrigir o registro da falta para ' +
                    effectiveDemand +
                    ' un.',
                detected_at: nowIso,
                details: {
                  order_id: orderId,
                  op_number: ordInfo.op_number,
                  order_number: ordInfo.order_number,
                  op_status: ordInfo.status,
                  received_quantity: receivedQty,
                  registered_quantity: registeredQty,
                  op_demand: effectiveDemand,
                  surplus_quantity: surplusQty,
                  batch_info: batchInfo,
                  has_bom: hasBom,
                  already_in_inventory: alreadyInInventory,
                },
              })
            }
          }
        }
      } catch (err1) {
        console.error(
          '[INTEGRITY_CHECK] Erro ao validar regra 1 (recebido x demanda):',
          String(err1),
        )
      }

      // -------------------------------------------------------------------------
      // REGRA 2: Saldo de cada inventário = soma dos movimentos (balance_after coerente)
      // -------------------------------------------------------------------------
      try {
        var allInventory = $app.findRecordsByFilter('inventory', '1=1', 'code', 1000, 0)

        for (var j = 0; j < allInventory.length; j++) {
          var inv = allInventory[j]
          var invId = inv.id
          var invCode = inv.getString('code')
          var invQty = Number(inv.getFloat('quantity')) || 0

          var movs = $app.findRecordsByFilter(
            'inventory_movements',
            'inventory_id = "' + invId + '"',
            'created',
            1000,
            0,
          )

          if (movs.length === 0) {
            if (Math.abs(invQty) > 0.001) {
              divergences.push({
                id: 'div_inv_no_movs_' + invId,
                category: 'saldo_sem_movimentos',
                severity: 'baixa',
                item_type: 'inventory',
                record_id: invId,
                code: invCode,
                description: inv.getString('description'),
                order_id: '',
                op_number: '',
                order_number: '',
                record_status: 'Estoque Físico',
                record_created: inv.getString('created'),
                problem:
                  'Item possui saldo cadastrado (' +
                  invQty +
                  ' un) mas nenhum movimento de entrada ou saída registrado no histórico.',
                suggestion:
                  'Registrar movimento inicial auditado ou alinhar saldo para 0 caso seja resíduo.',
                detected_at: nowIso,
                details: {
                  inventory_quantity: invQty,
                  movements_count: 0,
                },
              })
            }
          } else {
            var runningBal = 0
            var hasBalanceAfterDrift = false

            for (var k = 0; k < movs.length; k++) {
              var mov = movs[k]
              var mType = mov.getString('type')
              var mQty = Number(mov.getFloat('quantity')) || 0
              var mBal = Number(mov.getFloat('balance_after')) || 0

              if (mType === 'Entrada') {
                runningBal += mQty
              } else {
                runningBal -= mQty
              }
              runningBal = Math.round(runningBal * 1000) / 1000

              if (Math.abs(mBal - runningBal) > 0.001) {
                hasBalanceAfterDrift = true
              }
            }

            if (Math.abs(invQty - runningBal) > 0.001) {
              divergences.push({
                id: 'div_inv_balance_' + invId,
                category: 'saldo_estoque_incoerente',
                severity: 'alta',
                item_type: 'inventory',
                record_id: invId,
                code: invCode,
                description: inv.getString('description'),
                order_id: '',
                op_number: '',
                order_number: '',
                record_status: 'Estoque Físico',
                record_created: inv.getString('created'),
                problem:
                  'Saldo cadastrado no estoque (' +
                  invQty +
                  ' un) diverge da soma dos movimentos cronológicos (' +
                  runningBal +
                  ' un).',
                suggestion:
                  'Ajustar o saldo do item de inventário para ' +
                  runningBal +
                  ' un com movimento auditado de inventário.',
                detected_at: nowIso,
                details: {
                  inventory_quantity: invQty,
                  calculated_balance: runningBal,
                  movements_count: movs.length,
                },
              })
            } else if (hasBalanceAfterDrift) {
              divergences.push({
                id: 'div_mov_drift_' + invId,
                category: 'balance_after_incoerente',
                severity: 'media',
                item_type: 'inventory',
                record_id: invId,
                code: invCode,
                description: inv.getString('description'),
                order_id: '',
                op_number: '',
                order_number: '',
                record_status: 'Estoque Físico',
                record_created: inv.getString('created'),
                problem:
                  'Existem movimentos históricos com balance_after desalinhado da sequência cronológica de entradas/saídas.',
                suggestion:
                  'Reprocessar os movimentos do item para recalcular a coluna balance_after.',
                detected_at: nowIso,
                details: {
                  inventory_quantity: invQty,
                  movements_count: movs.length,
                },
              })
            }
          }
        }
      } catch (err2) {
        console.error(
          '[INTEGRITY_CHECK] Erro ao validar regra 2 (saldo x movimentos):',
          String(err2),
        )
      }

      // -------------------------------------------------------------------------
      // REGRA 3: Registros em aberto sem necessidade pendente (fantasmas travando o fluxo)
      // -------------------------------------------------------------------------
      try {
        var openShortages = $app.findRecordsByFilter(
          'material_shortages',
          'status = "Pendente" || status = "Cotação" || status = "Compra"',
          'created',
          1000,
          0,
        )

        for (var x = 0; x < openShortages.length; x++) {
          var openItem = openShortages[x]
          var openOrderId = openItem.getString('order_id')
          var openQty = Number(openItem.getFloat('quantity')) || 0
          var openCode = openItem.getString('code')

          if (openOrderId) {
            try {
              var orderRec = $app.findRecordById('pcp_orders', openOrderId)
              var opStatus = orderRec.getString('status')
              if (
                opStatus === 'Concluído' ||
                opStatus === 'Cancelada' ||
                opStatus === 'Cancelado'
              ) {
                var ghostOpNum =
                  orderRec.getString('op_number') || orderRec.getString('order_number')
                var ghostBatch = getBatchDetails(openItem)
                divergences.push({
                  id: 'div_ghost_op_concluida_' + openItem.id,
                  category: 'solicitacao_fantasma_op_encerrada',
                  severity: 'alta',
                  item_type: 'material_shortage',
                  record_id: openItem.id,
                  code: openCode,
                  description: openItem.getString('description'),
                  order_id: openOrderId,
                  op_number: orderRec.getString('op_number'),
                  order_number: orderRec.getString('order_number'),
                  record_status: openItem.getString('status'),
                  record_created: openItem.getString('created'),
                  batch_id: openItem.getString('batch_id') || '',
                  batch_members: ghostBatch ? ghostBatch.members : undefined,
                  problem:
                    'Registro em aberto (' +
                    openItem.getString('status') +
                    ', ' +
                    openQty +
                    ' un) vinculado à OP ' +
                    ghostOpNum +
                    ' que já está ' +
                    opStatus +
                    '.',
                  suggestion:
                    'Cancelar esta solicitação desnecessária ou usar "Limpar OPs Encerradas".',
                  detected_at: nowIso,
                  details: {
                    order_id: openOrderId,
                    op_number: orderRec.getString('op_number'),
                    order_number: orderRec.getString('order_number'),
                    status: openItem.getString('status'),
                    quantity: openQty,
                    batch_info: ghostBatch,
                  },
                })
              }
            } catch (_) {}
          } else {
            if (openItem.getString('status') === 'Compra') {
              var ocItens = $app.findRecordsByFilter(
                'ordem_compra_itens',
                'material_shortage_id = "' + openItem.id + '"',
                '',
                1,
                0,
              )
              if (ocItens.length === 0) {
                divergences.push({
                  id: 'div_ghost_compra_sem_oc_' + openItem.id,
                  category: 'compra_sem_oc_vinculada',
                  severity: 'baixa',
                  item_type: 'material_shortage',
                  record_id: openItem.id,
                  code: openCode,
                  description: openItem.getString('description'),
                  order_id: '',
                  op_number: '',
                  order_number: '',
                  record_status: 'Compra',
                  record_created: openItem.getString('created'),
                  problem:
                    'Registro avulso em status Compra sem Ordem de Compra emitida vinculada.',
                  suggestion: 'Emitir Ordem de Compra ou retornar para Cotação/cancelar.',
                  detected_at: nowIso,
                  details: {
                    status: 'Compra',
                    quantity: openQty,
                  },
                })
              }
            }
          }
        }
      } catch (err3) {
        console.error(
          '[INTEGRITY_CHECK] Erro ao validar regra 3 (registros sem necessidade):',
          String(err3),
        )
      }

      // -------------------------------------------------------------------------
      // REGRA 4: Códigos com caracteres inválidos
      // -------------------------------------------------------------------------
      try {
        var allShortages = $app.findRecordsByFilter(
          'material_shortages',
          'status != "Cancelado"',
          'created',
          1000,
          0,
        )

        for (var c = 0; c < allShortages.length; c++) {
          var sItem = allShortages[c]
          var cCode = (sItem.getString('code') || '').trim()

          if (cCode) {
            var hasTypoLetter = /[0-9]+[loLO][0-9]+/i.test(cCode)
            var hasLeadingTrailingSpaces = sItem.getString('code') !== cCode

            if (hasTypoLetter) {
              var typoOrd = getOrderInfo(sItem.getString('order_id'))
              divergences.push({
                id: 'div_code_typo_' + sItem.id,
                category: 'codigo_com_erro_digitacao',
                severity: 'alta',
                item_type: 'material_shortage',
                record_id: sItem.id,
                code: cCode,
                description: sItem.getString('description'),
                order_id: sItem.getString('order_id'),
                op_number: typoOrd.op_number,
                order_number: typoOrd.order_number,
                record_status: sItem.getString('status'),
                record_created: sItem.getString('created'),
                batch_id: sItem.getString('batch_id') || '',
                problem:
                  'Código contém letras suspeitas no meio de sequência numérica (possível "l" em vez de "1" ou "o" em vez de "0").',
                suggestion:
                  'Substituir pelo código numérico homologado e cancelar/unificar duplicatas.',
                detected_at: nowIso,
                details: {
                  raw_code: sItem.getString('code'),
                  status: sItem.getString('status'),
                },
              })
            } else if (hasLeadingTrailingSpaces) {
              var spaceOrd = getOrderInfo(sItem.getString('order_id'))
              divergences.push({
                id: 'div_code_spaces_' + sItem.id,
                category: 'codigo_com_espacos',
                severity: 'baixa',
                item_type: 'material_shortage',
                record_id: sItem.id,
                code: cCode,
                description: sItem.getString('description'),
                order_id: sItem.getString('order_id'),
                op_number: spaceOrd.op_number,
                order_number: spaceOrd.order_number,
                record_status: sItem.getString('status'),
                record_created: sItem.getString('created'),
                batch_id: sItem.getString('batch_id') || '',
                problem: 'Código possui espaços no início ou fim.',
                suggestion: 'Remover espaços em branco para garantir unicidade na busca.',
                detected_at: nowIso,
                details: {
                  raw_code: sItem.getString('code'),
                },
              })
            }
          }
        }
      } catch (err4) {
        console.error(
          '[INTEGRITY_CHECK] Erro ao validar regra 4 (códigos inválidos):',
          String(err4),
        )
      }

      // -------------------------------------------------------------------------
      // REGRA 5: Descrições de estoque ou componentes poluídas
      // -------------------------------------------------------------------------
      try {
        var pollutedInv = $app.findRecordsByFilter(
          'inventory',
          "description ~ '(OPs:' || description ~ '(OP:'",
          '',
          100,
          0,
        )
        for (var pi = 0; pi < pollutedInv.length; pi++) {
          var pInv = pollutedInv[pi]
          divergences.push({
            id: 'div_polluted_inv_' + pInv.id,
            category: 'descricao_poluida',
            severity: 'baixa',
            item_type: 'inventory',
            record_id: pInv.id,
            code: pInv.getString('code'),
            description: pInv.getString('description'),
            order_id: '',
            op_number: '',
            order_number: '',
            record_status: 'Estoque Físico',
            record_created: pInv.getString('created'),
            problem: "Descrição do item de estoque contém sufixo '(OPs: ...)' indevido.",
            suggestion: 'Remover a menção a OPs da descrição mestra do material.',
            detected_at: nowIso,
          })
        }
      } catch (err5) {
        console.error(
          '[INTEGRITY_CHECK] Erro ao validar regra 5 (descrições poluídas):',
          String(err5),
        )
      }

      // -------------------------------------------------------------------------
      // REGRA 6: Itens de ordem de compra
      // -------------------------------------------------------------------------
      try {
        var allOcItens = $app.findRecordsByFilter('ordem_compra_itens', '1=1', 'created', 1000, 0)

        for (var ocIdx = 0; ocIdx < allOcItens.length; ocIdx++) {
          var ocItem = allOcItens[ocIdx]
          var ocId = ocItem.getString('oc_id')
          var shortageId = ocItem.getString('material_shortage_id')
          var itemCode = ocItem.getString('code') || ''
          var itemDesc = ocItem.getString('description') || ''
          var ocItemQty = Number(ocItem.getFloat('quantity')) || 0
          var ocItemPrice = Number(ocItem.getFloat('unit_price')) || 0

          var ocRecord = null
          if (ocId) {
            try {
              ocRecord = $app.findRecordById('ordens_de_compra', ocId)
            } catch (_) {}
          }

          if (!ocId || !ocRecord) {
            divergences.push({
              id: 'div_oc_orphan_' + ocItem.id,
              category: 'item_oc_orfa',
              severity: 'alta',
              item_type: 'ordem_compra_item',
              record_id: ocItem.id,
              code: itemCode,
              description: itemDesc,
              order_id: '',
              op_number: '',
              order_number: '',
              record_status: 'Órfão',
              record_created: ocItem.getString('created'),
              problem:
                'Item de ordem de compra (ID: ' +
                ocItem.id +
                ') está vinculado a uma OC inexistente ou vazia (oc_id: ' +
                (ocId || 'vazio') +
                ').',
              suggestion: 'Remover item órfão ou vincular à OC correspondente.',
              detected_at: nowIso,
              details: {
                oc_id: ocId,
                material_shortage_id: shortageId,
                quantity: ocItemQty,
                unit_price: ocItemPrice,
              },
            })
            continue
          }

          var ocNumber = ocRecord.getString('oc_number') || ocRecord.id

          if (shortageId) {
            var shortageRec = null
            try {
              shortageRec = $app.findRecordById('material_shortages', shortageId)
            } catch (_) {}

            if (!shortageRec) {
              divergences.push({
                id: 'div_oc_shortage_missing_' + ocItem.id,
                category: 'item_oc_solicitacao_inexistente',
                severity: 'media',
                item_type: 'ordem_compra_item',
                record_id: ocItem.id,
                code: itemCode,
                description: itemDesc,
                order_id: '',
                op_number: '',
                order_number: '',
                record_status: 'OC ' + ocNumber,
                record_created: ocItem.getString('created'),
                problem:
                  'Item da OC ' +
                  ocNumber +
                  ' aponta para solicitação inexistente (ID: ' +
                  shortageId +
                  ').',
                suggestion: 'Limpar vínculo inválido de solicitação do item de OC.',
                detected_at: nowIso,
                details: {
                  oc_id: ocId,
                  oc_number: ocNumber,
                  material_shortage_id: shortageId,
                },
              })
            } else {
              var sQty = Number(shortageRec.getFloat('quantity')) || 0
              var sPrice = Number(shortageRec.getFloat('unit_price')) || 0
              var sOrderId = shortageRec.getString('order_id')
              var sOrdInfo = getOrderInfo(sOrderId)

              var qtyDiff = Math.abs(ocItemQty - sQty)
              var priceDiff = Math.abs(ocItemPrice - sPrice)

              if (qtyDiff > 0.0001) {
                divergences.push({
                  id: 'div_oc_qty_mismatch_' + ocItem.id,
                  category: 'divergencia_oc_solicitacao',
                  severity: 'media',
                  item_type: 'ordem_compra_item',
                  record_id: ocItem.id,
                  code: itemCode || shortageRec.getString('code'),
                  description: itemDesc || shortageRec.getString('description'),
                  order_id: sOrderId,
                  op_number: sOrdInfo.op_number,
                  order_number: sOrdInfo.order_number,
                  record_status: 'OC ' + ocNumber,
                  record_created: ocItem.getString('created'),
                  problem:
                    'Quantidade na OC ' +
                    ocNumber +
                    ' (' +
                    ocItemQty +
                    ' un) diverge da quantidade na solicitação vinculada (' +
                    sQty +
                    ' un).',
                  suggestion: 'Alinhar a quantidade do item da OC com a solicitação de compra.',
                  detected_at: nowIso,
                  details: {
                    oc_id: ocId,
                    oc_number: ocNumber,
                    oc_item_quantity: ocItemQty,
                    shortage_quantity: sQty,
                    shortage_id: shortageId,
                  },
                })
              } else if (priceDiff > 0.01 && sPrice > 0) {
                divergences.push({
                  id: 'div_oc_price_mismatch_' + ocItem.id,
                  category: 'divergencia_preco_oc_solicitacao',
                  severity: 'baixa',
                  item_type: 'ordem_compra_item',
                  record_id: ocItem.id,
                  code: itemCode || shortageRec.getString('code'),
                  description: itemDesc || shortageRec.getString('description'),
                  order_id: sOrderId,
                  op_number: sOrdInfo.op_number,
                  order_number: sOrdInfo.order_number,
                  record_status: 'OC ' + ocNumber,
                  record_created: ocItem.getString('created'),
                  problem:
                    'Preço unitário na OC ' +
                    ocNumber +
                    ' (R$ ' +
                    ocItemPrice +
                    ') diverge do preço na solicitação vinculada (R$ ' +
                    sPrice +
                    ').',
                  suggestion: 'Alinhar os preços cadastrados na ordem de compra e na solicitação.',
                  detected_at: nowIso,
                  details: {
                    oc_id: ocId,
                    oc_number: ocNumber,
                    oc_item_price: ocItemPrice,
                    shortage_price: sPrice,
                    shortage_id: shortageId,
                  },
                })
              }
            }
          }
        }
      } catch (err6) {
        console.error(
          '[INTEGRITY_CHECK] Erro ao validar regra 6 (itens de ordem de compra):',
          String(err6),
        )
      }

      var result = {
        verified_at: nowIso,
        total_divergences: divergences.length,
        high_severity_count: divergences.filter(function (d) {
          return d.severity === 'alta'
        }).length,
        divergences: divergences,
      }

      return e.json(200, {
        success: true,
        data: result,
      })
    } catch (err) {
      console.error('[API] Erro ao executar integrity check:', String(err))
      return e.json(500, {
        success: false,
        error: String(err),
      })
    }
  },
  $apis.requireAuth(),
)

// 3. ENDPOINT REST PARA EXECUTAR O CANCELAMENTO AUTOMÁTICO DE OPs ENCERRADAS SOB DEMANDA
routerAdd(
  'POST',
  '/backend/v1/suprimentos/auto-cancel-closed-ops',
  (e) => {
    try {
      var openShortages = $app.findRecordsByFilter(
        'material_shortages',
        '(status = "Pendente" || status = "Cotação" || status = "Compra") && order_id != ""',
        'created',
        1000,
        0,
      )

      var countCancelled = 0
      var todayDate = new Date()
      var day = String(todayDate.getDate()).padStart(2, '0')
      var month = String(todayDate.getMonth() + 1).padStart(2, '0')
      var dateFormatted = day + '/' + month

      for (var i = 0; i < openShortages.length; i++) {
        var shortage = openShortages[i]
        var orderId = shortage.getString('order_id')
        if (!orderId) continue

        var order = null
        try {
          order = $app.findRecordById('pcp_orders', orderId)
        } catch (_) {
          continue
        }

        if (!order) continue
        var opStatus = order.getString('status')
        var isOpClosed =
          opStatus === 'Concluído' || opStatus === 'Cancelada' || opStatus === 'Cancelado'
        if (!isOpClosed) continue

        var opNum = order.getString('op_number') || order.getString('order_number') || orderId
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
              if (mateOrderId) {
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
              } else {
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
            finalObs +
              ' [Removido do lote ' +
              batchId +
              ' - demais membros de OPs ativas mantidos]',
          )
        } else {
          shortage.set('status', 'Cancelado')
          shortage.set('observation', finalObs)
        }

        try {
          $app.save(shortage)
          countCancelled++
        } catch (saveErr) {
          console.error(
            '[AUTO_CANCEL] Erro ao cancelar shortage ' + shortage.id + ':',
            String(saveErr),
          )
        }
      }

      return e.json(200, {
        success: true,
        cancelledCount: countCancelled,
        message:
          countCancelled > 0
            ? countCancelled + ' solicitação(ões) de OP encerrada cancelada(s) automaticamente.'
            : 'Nenhuma solicitação pendente de OP encerrada encontrada.',
      })
    } catch (err) {
      console.error('[API] Erro ao executar auto-cancel:', String(err))
      return e.json(500, {
        success: false,
        error: String(err),
      })
    }
  },
  $apis.requireAuth(),
)

// 4. ENDPOINT REST: LISTAR ITENS RESIDUAIS E PARADOS PARA ENCERRAMENTO (ETAPA 5 PARTE 2)
routerAdd(
  'GET',
  '/backend/v1/suprimentos/residual-items',
  (e) => {
    try {
      var thresholdDays = 30
      try {
        var qDays = Number(e.request.url.query().get('days'))
        if (qDays > 0) thresholdDays = qDays
      } catch (_) {}

      var now = new Date()
      var cutoffDate = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000)
      var cutoffIso = cutoffDate.toISOString().replace('T', ' ').substring(0, 19)

      // (a) Registros em Recebido_Parcial cujo saldo remanescente não foi entregue
      var partials = $app.findRecordsByFilter(
        'material_shortages',
        'status = "Recebido_Parcial"',
        '-created',
        200,
        0,
      )

      var partialList = []
      for (var p = 0; p < partials.length; p++) {
        var pr = partials[p]
        var q = Number(pr.getFloat('quantity')) || 0
        var rq = Number(pr.getFloat('received_quantity')) || 0
        var rem = Math.max(0, q - rq)

        var pOp = ''
        var pOrderId = pr.getString('order_id')
        if (pOrderId) {
          try {
            var pOrd = $app.findRecordById('pcp_orders', pOrderId)
            pOp = pOrd.getString('op_number') || pOrd.getString('order_number')
          } catch (_) {}
        }

        partialList.push({
          id: pr.id,
          code: pr.getString('code'),
          description: pr.getString('description'),
          quantity: q,
          received_quantity: rq,
          remaining_quantity: rem,
          status: 'Recebido_Parcial',
          order_id: pOrderId,
          op_number: pOp,
          created: pr.getString('created'),
          updated: pr.getString('updated'),
          type: 'recebido_parcial',
        })
      }

      // (b) Solicitações paradas em Cotação ou Compra sem movimentação há mais de thresholdDays
      var staleItems = $app.findRecordsByFilter(
        'material_shortages',
        '(status = "Cotação" || status = "Compra") && updated <= "' + cutoffIso + '"',
        'updated',
        200,
        0,
      )

      var staleList = []
      for (var s = 0; s < staleItems.length; s++) {
        var sr = staleItems[s]
        var sq = Number(sr.getFloat('quantity')) || 0
        var sOrderId = sr.getString('order_id')
        var sOp = ''
        if (sOrderId) {
          try {
            var sOrd = $app.findRecordById('pcp_orders', sOrderId)
            sOp = sOrd.getString('op_number') || sOrd.getString('order_number')
          } catch (_) {}
        }

        var updatedDate = new Date(sr.getString('updated').replace(' ', 'T') + 'Z')
        var diffDays = Math.max(
          0,
          Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24)),
        )

        staleList.push({
          id: sr.id,
          code: sr.getString('code'),
          description: sr.getString('description'),
          quantity: sq,
          received_quantity: Number(sr.getFloat('received_quantity')) || 0,
          remaining_quantity: sq,
          status: sr.getString('status'),
          order_id: sOrderId,
          op_number: sOp,
          created: sr.getString('created'),
          updated: sr.getString('updated'),
          days_inactive: diffDays,
          type: 'stale_cotacao_compra',
        })
      }

      return e.json(200, {
        success: true,
        threshold_days: thresholdDays,
        partials_count: partialList.length,
        stale_count: staleList.length,
        total_residual: partialList.length + staleList.length,
        partials: partialList,
        stale: staleList,
      })
    } catch (err) {
      console.error('[API] Erro ao listar residual-items:', String(err))
      return e.json(500, { success: false, error: String(err) })
    }
  },
  $apis.requireAuth(),
)

// 5. ENDPOINT REST: EXECUTAR ENCERRAMENTO DE SALDO RESIDUAL INDIVIDUAL (ETAPA 5 PARTE 2)
routerAdd(
  'POST',
  '/backend/v1/suprimentos/close-residual-shortage',
  (e) => {
    try {
      var info = e.requestInfo()
      var body = info && info.body ? info.body : {}
      var shortageId = (body.shortage_id || '').trim()
      var reasonNote = (body.reason || '').trim()

      if (!shortageId) {
        return e.json(400, { success: false, error: 'O ID da solicitação é obrigatório.' })
      }

      var record = null
      try {
        record = $app.findRecordById('material_shortages', shortageId)
      } catch (_) {
        return e.json(404, { success: false, error: 'Solicitação não encontrada.' })
      }

      var authUser = e.auth ? e.auth.getString('name') || e.auth.getString('email') : 'Usuário'
      var today = new Date()
      var day = String(today.getDate()).padStart(2, '0')
      var month = String(today.getMonth() + 1).padStart(2, '0')
      var year = today.getFullYear()
      var dateFormatted = day + '/' + month + '/' + year

      var currentStatus = record.getString('status')
      var qty = Number(record.getFloat('quantity')) || 0
      var recQty = Number(record.getFloat('received_quantity')) || 0
      var currentObs = record.getString('observation') || ''

      var auditNote = ''
      if (currentStatus === 'Recebido_Parcial') {
        auditNote =
          'Saldo residual encerrado manualmente por ' +
          authUser +
          ' em ' +
          dateFormatted +
          ' (recebido ' +
          recQty +
          ' de ' +
          qty +
          ')'
        if (reasonNote) {
          auditNote += ' - Motivo: ' + reasonNote
        }
        record.set('status', 'Recebido')
      } else if (currentStatus === 'Cotação' || currentStatus === 'Compra') {
        auditNote =
          'Solicitação parada em ' +
          currentStatus +
          ' encerrada manualmente por ' +
          authUser +
          ' em ' +
          dateFormatted
        if (reasonNote) {
          auditNote += ' - Motivo: ' + reasonNote
        }
        record.set('status', 'Cancelado')
      } else {
        return e.json(400, {
          success: false,
          error:
            'Apenas solicitações em Recebido_Parcial, Cotação ou Compra podem ter seu saldo encerrado por esta rotina.',
        })
      }

      var finalObs = currentObs ? currentObs + ' | ' + auditNote : auditNote
      record.set('observation', finalObs)

      $app.save(record)

      return e.json(200, {
        success: true,
        shortage_id: shortageId,
        new_status: record.getString('status'),
        audit_note: auditNote,
        message: 'Saldo residual encerrado com sucesso.',
      })
    } catch (err) {
      console.error('[API] Erro ao encerrar residual shortage:', String(err))
      return e.json(500, { success: false, error: String(err) })
    }
  },
  $apis.requireAuth(),
)

// 6. ENDPOINT REST: AÇÕES DIRETAS DE CORREÇÃO DE DIVERGÊNCIAS AUDITADAS
routerAdd(
  'POST',
  '/backend/v1/suprimentos/fix-divergence',
  (e) => {
    try {
      var info = e.requestInfo()
      var body = info && info.body ? info.body : {}
      var action = (body.action || '').trim()
      var recordId = (body.record_id || '').trim()
      var reason = (body.reason || '').trim()

      if (!action || !recordId) {
        return e.json(400, { success: false, error: 'Ação e ID do registro são obrigatórios.' })
      }

      var authUser = e.auth ? e.auth.getString('name') || e.auth.getString('email') : 'Usuário'
      var today = new Date()
      var day = String(today.getDate()).padStart(2, '0')
      var month = String(today.getMonth() + 1).padStart(2, '0')
      var year = today.getFullYear()
      var hours = String(today.getHours()).padStart(2, '0')
      var mins = String(today.getMinutes()).padStart(2, '0')
      var dateFormatted = day + '/' + month + '/' + year + ' ' + hours + ':' + mins

      // -------------------------------------------------------------
      // CASO A: Destinar excedente ao estoque geral
      // -------------------------------------------------------------
      if (action === 'destinar_excedente_estoque') {
        var shortage = null
        try {
          shortage = $app.findRecordById('material_shortages', recordId)
        } catch (_) {
          return e.json(404, {
            success: false,
            error: 'Registro de falta de material não encontrado.',
          })
        }

        var orderId = shortage.getString('order_id')
        var code = shortage.getString('code')
        var currentRecv = Number(shortage.getFloat('received_quantity')) || 0
        var currentQty = Number(shortage.getFloat('quantity')) || 0

        var totalDemand = Number(body.target_quantity)
        if (isNaN(totalDemand) || totalDemand < 0) {
          if (orderId && code) {
            var opMats = $app.findRecordsByFilter(
              'pcp_order_materials',
              'order_id = "' + orderId + '" && code = "' + code.replace(/"/g, '""') + '"',
              '',
              10,
              0,
            )
            totalDemand = 0
            for (var dm = 0; dm < opMats.length; dm++) {
              totalDemand += Number(opMats[dm].getFloat('quantity')) || 0
            }
          } else {
            totalDemand = currentQty
          }
        }

        var surplus = Math.round((currentRecv - totalDemand) * 10000) / 10000
        if (surplus <= 0) {
          return e.json(400, {
            success: false,
            error:
              'Não há excedente a destinar ao estoque (recebido: ' +
              currentRecv +
              ', demanda: ' +
              totalDemand +
              ').',
          })
        }

        var invItem = null
        try {
          var invList = $app.findRecordsByFilter(
            'inventory',
            'code = "' + code.replace(/"/g, '""') + '"',
            '-created',
            1,
            0,
          )
          if (invList.length > 0) {
            invItem = invList[0]
          }
        } catch (_) {}

        if (!invItem) {
          var invCol = $app.findCollectionByNameOrId('inventory')
          invItem = new Record(invCol)
          invItem.set('code', code)
          invItem.set('description', shortage.getString('description'))
          invItem.set('quantity', 0)
          invItem.set('unit', 'un')
          $app.save(invItem)
        }

        // Verificar se o recebimento deste registro já gerou movimento 'Entrada' no inventário
        // referenciando este shortageId. Se sim, a entrada integral já ocorreu (excedente já está físico no estoque);
        // criar outra entrada causaria contagem em dobro.
        var alreadyInInventory = false
        try {
          var matchingEntries = $app.findRecordsByFilter(
            'inventory_movements',
            "inventory_id = '" +
              invItem.id +
              "' && type = 'Entrada' && (reason ~ '" +
              recordId +
              "' || reason ~ '" +
              shortage.id +
              "')",
            '-created',
            10,
            0,
          )
          if (matchingEntries.length > 0) {
            alreadyInInventory = true
          }
        } catch (_) {}

        var opNumber = ''
        if (orderId) {
          try {
            var opRec = $app.findRecordById('pcp_orders', orderId)
            opNumber = opRec.getString('op_number') || opRec.getString('order_number')
          } catch (_) {}
        }

        if (!alreadyInInventory) {
          var invCurrentQty = Number(invItem.getFloat('quantity')) || 0
          var invNewQty = Math.round((invCurrentQty + surplus) * 10000) / 10000

          var movCol = $app.findCollectionByNameOrId('inventory_movements')
          var mov = new Record(movCol)
          mov.set('inventory_id', invItem.id)
          mov.set('type', 'Entrada')
          mov.set('quantity', surplus)
          mov.set('balance_after', invNewQty)
          mov.set(
            'reason',
            'Ajuste: Entrada de excedente de recebimento da OP ' +
              (opNumber ? 'OP ' + opNumber : '') +
              ' (' +
              surplus +
              ' un)',
          )
          if (orderId) mov.set('order_id', orderId)
          if (e.auth) mov.set('user_id', e.auth.id)
          mov.set('arrival_date', new Date().toISOString().split('T')[0])
          $app.save(mov)

          invItem.set('quantity', invNewQty)
          $app.save(invItem)
        }

        var auditNote = alreadyInInventory
          ? 'Excedente de ' +
            surplus +
            ' un reconhecido no estoque geral (já incorporado no recebimento original) por ' +
            authUser +
            ' em ' +
            dateFormatted +
            ' (registro ajustado de ' +
            currentRecv +
            ' para ' +
            totalDemand +
            ' un sem duplicar entrada)'
          : 'Excedente de ' +
            surplus +
            ' un destinado ao estoque geral por ' +
            authUser +
            ' em ' +
            dateFormatted +
            ' (recebimento ajustado de ' +
            currentRecv +
            ' para ' +
            totalDemand +
            ' un)'
        if (reason) auditNote += ' - Motivo: ' + reason

        var curObs = shortage.getString('observation') || ''
        shortage.set('observation', curObs ? curObs + ' | ' + auditNote : auditNote)
        shortage.set('quantity', totalDemand)
        shortage.set('received_quantity', totalDemand)
        shortage.set('status', totalDemand > 0 ? 'Recebido' : 'Cancelado')
        $app.save(shortage)

        return e.json(200, {
          success: true,
          message: alreadyInInventory
            ? 'Registro da OP ajustado para a demanda real (' +
              totalDemand +
              ' un). O excedente de ' +
              surplus +
              ' un já estava registrado no estoque físico (nenhuma entrada duplicada foi criada).'
            : 'Excedente de ' +
              surplus +
              ' un destinado com sucesso ao estoque geral. Registro da OP ajustado para ' +
              totalDemand +
              ' un.',
          audit_note: auditNote,
          already_in_inventory: alreadyInInventory,
          surplus_quantity: surplus,
          target_quantity: totalDemand,
        })
      }

      // -------------------------------------------------------------
      // CASO B: Corrigir registro da falta (quantidades reais)
      // -------------------------------------------------------------
      if (action === 'corrigir_registro') {
        var shortageRec = null
        try {
          shortageRec = $app.findRecordById('material_shortages', recordId)
        } catch (_) {
          return e.json(404, { success: false, error: 'Registro não encontrado.' })
        }

        var oldQ = Number(shortageRec.getFloat('quantity')) || 0
        var oldR = Number(shortageRec.getFloat('received_quantity')) || 0

        var newQ = body.quantity !== undefined ? Number(body.quantity) : oldQ
        var newR = body.received_quantity !== undefined ? Number(body.received_quantity) : oldR

        if (isNaN(newQ) || newQ < 0) {
          return e.json(400, { success: false, error: 'Quantidade total inválida.' })
        }
        if (isNaN(newR) || newR < 0) {
          return e.json(400, { success: false, error: 'Quantidade recebida inválida.' })
        }
        if (newR > newQ + 0.0001) {
          return e.json(400, {
            success: false,
            error:
              'Quantidade recebida (' +
              newR +
              ') não pode exceder a quantidade do registro (' +
              newQ +
              ').',
          })
        }

        var auditNote2 =
          'Registro corrigido por ' +
          authUser +
          ' em ' +
          dateFormatted +
          ' (Qtd: ' +
          oldQ +
          '→' +
          newQ +
          ', Rec: ' +
          oldR +
          '→' +
          newR +
          ')'
        if (reason) auditNote2 += ' - Motivo: ' + reason

        var curObs2 = shortageRec.getString('observation') || ''
        shortageRec.set('observation', curObs2 ? curObs2 + ' | ' + auditNote2 : auditNote2)
        shortageRec.set('quantity', newQ)
        shortageRec.set('received_quantity', newR)

        if (newQ === 0) {
          shortageRec.set('status', 'Cancelado')
        } else if (newR >= newQ - 0.0001 && newR > 0) {
          shortageRec.set('status', 'Recebido')
        } else if (newR > 0) {
          shortageRec.set('status', 'Recebido_Parcial')
        }

        $app.save(shortageRec)

        return e.json(200, {
          success: true,
          message: 'Registro corrigido com sucesso.',
          audit_note: auditNote2,
          quantity: newQ,
          received_quantity: newR,
          status: shortageRec.getString('status'),
        })
      }

      // -------------------------------------------------------------
      // CASO C: Cancelar solicitação (ex: fantasma de OP encerrada)
      // -------------------------------------------------------------
      if (action === 'cancelar_solicitacao') {
        var shortageGhost = null
        try {
          shortageGhost = $app.findRecordById('material_shortages', recordId)
        } catch (_) {
          return e.json(404, { success: false, error: 'Registro não encontrado.' })
        }

        var oldStatusGhost = shortageGhost.getString('status')
        var auditNote3 =
          'Solicitação cancelada manualmente na tela de Divergências por ' +
          authUser +
          ' em ' +
          dateFormatted +
          ' (status anterior: ' +
          oldStatusGhost +
          ')'
        if (reason) auditNote3 += ' - Motivo: ' + reason

        var curObs3 = shortageGhost.getString('observation') || ''
        shortageGhost.set('observation', curObs3 ? curObs3 + ' | ' + auditNote3 : auditNote3)
        shortageGhost.set('status', 'Cancelado')
        $app.save(shortageGhost)

        return e.json(200, {
          success: true,
          message: 'Solicitação cancelada com sucesso.',
          audit_note: auditNote3,
        })
      }

      // -------------------------------------------------------------
      // CASO D: Ajustar saldo do estoque para soma dos movimentos
      // -------------------------------------------------------------
      if (action === 'ajustar_saldo_estoque') {
        var invTarget = null
        try {
          invTarget = $app.findRecordById('inventory', recordId)
        } catch (_) {
          return e.json(404, { success: false, error: 'Item de estoque não encontrado.' })
        }

        var oldInvQ = Number(invTarget.getFloat('quantity')) || 0
        var targetBal = Number(body.target_balance)

        if (isNaN(targetBal)) {
          var allMovs = $app.findRecordsByFilter(
            'inventory_movements',
            'inventory_id = "' + invTarget.id + '"',
            'created',
            1000,
            0,
          )
          var runBal = 0
          for (var mi = 0; mi < allMovs.length; mi++) {
            var mm = allMovs[mi]
            if (mm.getString('type') === 'Entrada') {
              runBal += Number(mm.getFloat('quantity')) || 0
            } else {
              runBal -= Number(mm.getFloat('quantity')) || 0
            }
          }
          targetBal = Math.round(runBal * 1000) / 1000
        }

        var diff = Math.round((targetBal - oldInvQ) * 1000) / 1000
        if (Math.abs(diff) > 0.0001) {
          var movColAdj = $app.findCollectionByNameOrId('inventory_movements')
          var movAdj = new Record(movColAdj)
          movAdj.set('inventory_id', invTarget.id)
          movAdj.set('type', diff > 0 ? 'Entrada' : 'Saída')
          movAdj.set('quantity', Math.abs(diff))
          movAdj.set('balance_after', targetBal)
          movAdj.set(
            'reason',
            'Ajuste de inventário por ' +
              authUser +
              ' em ' +
              dateFormatted +
              ' (reconciliação com extrato: ' +
              oldInvQ +
              ' → ' +
              targetBal +
              ')' +
              (reason ? ' - Motivo: ' + reason : ''),
          )
          if (e.auth) movAdj.set('user_id', e.auth.id)
          $app.save(movAdj)
        }

        invTarget.set('quantity', targetBal)
        $app.save(invTarget)

        return e.json(200, {
          success: true,
          message:
            'Saldo do item de inventário alinhado para ' +
            targetBal +
            ' un com movimento auditado de ajuste.',
          new_balance: targetBal,
        })
      }

      return e.json(400, { success: false, error: 'Ação desconhecida: ' + action })
    } catch (err) {
      console.error('[API] Erro ao corrigir divergência:', String(err))
      return e.json(500, { success: false, error: String(err) })
    }
  },
  $apis.requireAuth(),
)
