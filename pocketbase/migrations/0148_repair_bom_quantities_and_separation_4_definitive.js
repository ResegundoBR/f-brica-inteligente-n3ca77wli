/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0148: Reparo definitivo das quantidades da BOM das OPs não concluídas
 * criadas a partir de 2026-09-15.
 *
 * Regras mandatórias:
 * 1) nova_quantity = quantity_atual × order.quantity nas OPs não concluídas criadas >= 2026-09-15.
 * 2) NÃO reler a composição do produto (ela foi editada posteriormente).
 * 3) Preservar setor, unit, status, observações e marcações de cada linha.
 * 4) Não reduzir linhas que já estejam em status 'Separado' ou 'Parcial'.
 * 5) ARMADILHA OP 000486 (order_id whv9bfu7eab8aj4):
 *    - A linha 14010036 (Tubo) foi alterada indevidamente pela 0147 para 2 m.
 *      O valor correto é 1.2 (0.6 por unidade original × 2 da OP).
 *      Recuperar o valor original por unidade da observação de auditoria ("Qtde ajustada de X para Y")
 *      ou aplicar o alvo declarado 1.2.
 *    - Alvos exatos da OP 000486:
 *      05330314 = 2
 *      06080013 = 4
 *      05090029 = 2
 *      05100030 = 4
 *      05330313 = 2
 *      14010036 = 1.2
 * 6) Recalcular itens consolidados da Separação #4 (material_separations id hbifdk2k7u7rm5q, Em_Separacao)
 *    e as reservas ativas em material_reservations, preservando marcações (Separado/Falta/Parcial/Já Separado).
 * 7) Sincronizar snapshot consolidado da programação (pcp_programacoes seq #4 id 90vq5ysbo2o1k0t).
 */
migrate(
  (app) => {
    function unwrapJson(raw) {
      if (!raw) return null
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw
      var current = raw
      if (typeof current !== 'string') {
        try {
          current = JSON.stringify(current)
        } catch (_) {
          return raw
        }
      }
      var loops = 0
      while (loops < 10) {
        loops++
        try {
          var parsed = JSON.parse(current)
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'number') {
            var str = ''
            for (var b = 0; b < parsed.length; b += 5000) {
              str += String.fromCharCode.apply(null, parsed.slice(b, b + 5000))
            }
            current = str
          } else if (typeof parsed === 'string') {
            current = parsed
          } else {
            return parsed
          }
        } catch (_) {
          return current
        }
      }
      return current
    }

    function round4(val) {
      return Math.round((Number(val) || 0) * 10000) / 10000
    }

    function normalizeCode(code) {
      if (!code) return ''
      return String(code).trim().toLowerCase()
    }

    console.log('[MIGRATION 0148] Iniciando reparo definitivo das quantidades da BOM...')

    // -------------------------------------------------------------------------
    // ETAPA 1: OPs não concluídas criadas a partir de 2026-09-15 00:00:00
    // -------------------------------------------------------------------------
    var targetOrders = app.findRecordsByFilter(
      'pcp_orders',
      'created >= "2026-09-15 00:00:00" && status != "Concluído" && status != "Cancelada" && status != "Cancelado"',
      'created',
      500,
      0,
    )

    console.log('[MIGRATION 0148] Total de OPs elegíveis encontradas: ' + targetOrders.length)

    var totalMatsUpdated = 0
    var opsRepairedCount = 0

    for (var o = 0; o < targetOrders.length; o++) {
      var order = targetOrders[o]
      var orderId = order.id
      var opNum = order.getString('op_number') || order.getString('order_number') || orderId
      var opQty = Number(order.getFloat('quantity')) || 1

      // Se a OP tiver quantidade 1, a quantidade unitária já é a quantidade total
      // Não faz sentido multiplicar 1x por 1x a não ser que tenha havido anomalia
      var isOp486 =
        orderId === 'whv9bfu7eab8aj4' ||
        opNum.indexOf('000486') !== -1 ||
        opNum.indexOf('486') !== -1

      var mats = app.findRecordsByFilter(
        'pcp_order_materials',
        'order_id = "' + orderId + '"',
        'created',
        500,
        0,
      )

      if (mats.length === 0) continue

      var opUpdated = 0

      for (var m = 0; m < mats.length; m++) {
        var mat = mats[m]
        var code = (mat.getString('code') || '').trim()
        var curQty = Number(mat.getFloat('quantity')) || 0
        var status = mat.getString('status') || 'Pendente'
        var obs = mat.getString('observations') || ''

        var targetQty = null

        if (isOp486) {
          // Tratar especificamente as regras da OP 000486 (opQty = 2)
          if (code === '05330314') targetQty = 2
          else if (code === '06080013') targetQty = 4
          else if (code === '05090029') targetQty = 2
          else if (code === '05100030') targetQty = 4
          else if (code === '05330313') targetQty = 2
          else if (code === '14010036') targetQty = 1.2
          else {
            // Demais linhas da OP 000486: nova_quantity = quantity_atual × opQty
            targetQty = round4(curQty * opQty)
          }
        } else {
          // Demais OPs:
          // Se opQty > 1: nova_quantity = quantity_atual × opQty
          // Verificar se a linha tem auditoria de ajuste anterior
          var matchAdjust = obs.match(
            /Qtde ajustada de\s+(\d+(?:[.,]\d+)?)\s+para\s+(\d+(?:[.,]\d+)?)/i,
          )
          if (matchAdjust) {
            var origUnitQty = parseFloat(matchAdjust[1].replace(',', '.'))
            if (!isNaN(origUnitQty) && origUnitQty > 0) {
              targetQty = round4(origUnitQty * opQty)
            }
          }

          if (targetQty === null) {
            // Se opQty > 1 e ainda não foi multiplicada
            if (opQty > 1) {
              targetQty = round4(curQty * opQty)
            } else {
              targetQty = curQty
            }
          }
        }

        if (targetQty !== null && Math.abs(curQty - targetQty) > 0.0001) {
          // REGRA DE SEGURANÇA: Não reduzir linhas já em status 'Separado' ou 'Parcial'
          if ((status === 'Separado' || status === 'Parcial') && targetQty < curQty) {
            console.warn(
              '[MIGRATION 0148] AVISO: Linha ' +
                code +
                ' da OP ' +
                opNum +
                ' está em status "' +
                status +
                '" com qtde ' +
                curQty +
                '. Redução para ' +
                targetQty +
                ' evitada para conferência manual.',
            )
            continue
          }

          mat.set('quantity', targetQty)
          // Preservar setor, unit, status, etc. (não foram alterados no record)
          app.save(mat)
          opUpdated++
          totalMatsUpdated++

          console.log(
            '[MIGRATION 0148] OP ' +
              opNum +
              ' material ' +
              code +
              ': ' +
              curQty +
              ' -> ' +
              targetQty +
              ' (status: ' +
              status +
              ')',
          )
        }
      }

      if (opUpdated > 0) {
        opsRepairedCount++
      }
    }

    console.log(
      '[MIGRATION 0148] Total de OPs reparadas: ' +
        opsRepairedCount +
        ', total de materiais atualizados: ' +
        totalMatsUpdated,
    )

    // -------------------------------------------------------------------------
    // ETAPA 2: Recalcular Separação #4 (hbifdk2k7u7rm5q) e reservas ativas
    // -------------------------------------------------------------------------
    var sep4 = null
    try {
      sep4 = app.findRecordById('material_separations', 'hbifdk2k7u7rm5q')
    } catch (e) {
      console.warn('[MIGRATION 0148] Separação hbifdk2k7u7rm5q não encontrada: ' + String(e))
    }

    if (sep4) {
      console.log('[MIGRATION 0148] Recalculando itens consolidados da Separação #4...')
      var rawOrderIds = unwrapJson(sep4.getString('order_ids') || sep4.get('order_ids')) || []
      var orderIds = Array.isArray(rawOrderIds) ? rawOrderIds : []
      if (orderIds.length === 0) {
        orderIds = [
          'whv9bfu7eab8aj4',
          '895nm5arogb637t',
          '4jeb59suctt8e9v',
          'zm8jy5d3oxv7js1',
          '3ox7mmmnu41hhrt',
          'oa0twvu9d1xdrah',
          'gftjq6iito4dx01',
          'yra6gluilivcf4n',
        ]
      }

      // Buscar materiais de todas as OPs pertencentes a esta separação
      var sepOpMaterials = []
      for (var oi = 0; oi < orderIds.length; oi++) {
        var opMatsList = app.findRecordsByFilter(
          'pcp_order_materials',
          'order_id = "' + orderIds[oi] + '"',
          'created',
          500,
          0,
        )
        for (var mi = 0; mi < opMatsList.length; mi++) {
          sepOpMaterials.push(opMatsList[mi])
        }
      }

      // Consolidar demanda por código
      var demandByCode = {}
      for (var sm = 0; sm < sepOpMaterials.length; sm++) {
        var mRec = sepOpMaterials[sm]
        var mCode = normalizeCode(mRec.getString('code'))
        var mQty = Number(mRec.getFloat('quantity')) || 0
        if (mCode) {
          demandByCode[mCode] = round4((demandByCode[mCode] || 0) + mQty)
        }
      }

      var rawItems = unwrapJson(sep4.getString('items') || sep4.get('items')) || []
      var currentItems = Array.isArray(rawItems) ? rawItems : []
      var updatedItems = []
      var sepItemsChanged = 0

      for (var it = 0; it < currentItems.length; it++) {
        var itObj = currentItems[it]
        if (!itObj) continue
        var itCode = normalizeCode(itObj.code)
        var curTotal = Number(itObj.total_quantity) || 0
        var itStatus = itObj.status || 'pendente'

        var correctTotal = demandByCode[itCode]

        if (
          correctTotal !== undefined &&
          correctTotal > 0 &&
          Math.abs(curTotal - correctTotal) > 0.0001
        ) {
          var itemCloned = JSON.parse(JSON.stringify(itObj))
          itemCloned.total_quantity = correctTotal

          // Preservar marcações: Separado, Falta, Parcial, Já Separado
          if (itStatus === 'separado' || itStatus === 'ja_separado') {
            itemCloned.separated_quantity = correctTotal
            itemCloned.shortage_quantity = 0
          } else if (itStatus === 'parcial') {
            var sepQty = Number(itemCloned.separated_quantity) || 0
            itemCloned.shortage_quantity = Math.max(0, round4(correctTotal - sepQty))
          } else if (itStatus === 'falta') {
            itemCloned.shortage_quantity = correctTotal
          }

          updatedItems.push(itemCloned)
          sepItemsChanged++
          console.log(
            '[MIGRATION 0148] Separação #4 item ' +
              itObj.code +
              ': total ' +
              curTotal +
              ' -> ' +
              correctTotal +
              ' (status: ' +
              itStatus +
              ')',
          )
        } else {
          updatedItems.push(itObj)
        }
      }

      sep4.set('items', JSON.stringify(updatedItems))
      app.save(sep4)
      console.log(
        '[MIGRATION 0148] Separação #4 salva com ' + sepItemsChanged + ' itens atualizados.',
      )

      // Sincronizar reservas em material_reservations
      var reservations = app.findRecordsByFilter(
        'material_reservations',
        'separation_id = "hbifdk2k7u7rm5q" && status = "Ativa"',
        'created',
        500,
        0,
      )

      var itemsMapById = {}
      for (var u = 0; u < updatedItems.length; u++) {
        if (updatedItems[u] && updatedItems[u].id) {
          itemsMapById[updatedItems[u].id] = updatedItems[u]
        }
      }

      var resChangedCount = 0
      for (var r = 0; r < reservations.length; r++) {
        var res = reservations[r]
        var rItemId = res.getString('item_id')
        var curResQty = Number(res.getFloat('quantity')) || 0
        var matchedItem = rItemId ? itemsMapById[rItemId] : null

        if (matchedItem) {
          var targetResQty =
            matchedItem.status === 'parcial' && matchedItem.separated_quantity !== undefined
              ? Number(matchedItem.separated_quantity) || 0
              : Number(matchedItem.total_quantity) || 0

          if (targetResQty > 0 && Math.abs(curResQty - targetResQty) > 0.0001) {
            res.set('quantity', targetResQty)
            app.save(res)
            resChangedCount++
            console.log(
              '[MIGRATION 0148] Reserva ' +
                res.getString('code') +
                ' (res id ' +
                res.id +
                '): ' +
                curResQty +
                ' -> ' +
                targetResQty,
            )
          }
        }
      }
      console.log('[MIGRATION 0148] Reservas atualizadas: ' + resChangedCount)

      // Sincronizar snapshot consolidado da programação (pcp_programacoes)
      var progId = sep4.getString('programacao_id') || '90vq5ysbo2o1k0t'
      if (progId) {
        try {
          var prog = app.findRecordById('pcp_programacoes', progId)
          var rawCompiled =
            unwrapJson(prog.getString('compiled_items') || prog.get('compiled_items')) || []
          var compiledArr = Array.isArray(rawCompiled) ? rawCompiled : []
          var newCompiled = []
          var progUpdated = 0

          for (var cIdx = 0; cIdx < compiledArr.length; cIdx++) {
            var cIt = compiledArr[cIdx]
            var cCode = normalizeCode(cIt.code)
            var cCurTotal = Number(cIt.totalQuantity) || 0
            var cDemand = demandByCode[cCode]

            if (cDemand !== undefined && cDemand > 0 && Math.abs(cCurTotal - cDemand) > 0.0001) {
              var cCloned = JSON.parse(JSON.stringify(cIt))
              cCloned.totalQuantity = cDemand
              newCompiled.push(cCloned)
              progUpdated++
            } else {
              newCompiled.push(cIt)
            }
          }

          if (progUpdated > 0) {
            prog.set('compiled_items', JSON.stringify(newCompiled))
            app.save(prog)
            console.log(
              '[MIGRATION 0148] Programação ' +
                progId +
                ' sincronizada com ' +
                progUpdated +
                ' itens.',
            )
          }
        } catch (progErr) {
          console.warn('[MIGRATION 0148] Aviso ao sincronizar programação: ' + String(progErr))
        }
      }
    }

    console.log('[MIGRATION 0148] Concluído com sucesso!')
  },
  (app) => {
    // Revert opcional
  },
)
