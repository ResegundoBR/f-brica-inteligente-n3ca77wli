/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0147: Execução efetiva do reparo de pcp_order_materials e reconciliação da Separação #4
 *
 * Diagnóstico da 0146:
 * 1. Em Goja / PocketBase v0.36, campos JSON (como `products.data`, `material_separations.items`, `material_separations.order_ids`)
 *    podem ser acessados de formas variadas: `product.get('data')` pode retornar JSON string, objeto serializado Goja ou Map.
 * 2. `Array.isArray(...)` em tipos Map/Goja e métodos de Record como `.set('items', array)` requerem manipulação
 *    resiliente (deserialização via JSON.parse com fallback e serialização segura).
 * 3. Esta migration garante que a desconstrução da composição funcione tanto se `data` for string, objeto ou parseado.
 * 4. Além disso, executa atualizações diretas e verificadas nos registros via `app.save()` e sincroniza Separação #4 e reservas.
 */

migrate(
  (app) => {
    console.log(
      '[MIGRATION 0147] === INÍCIO DO REPARO EFETIVO DE pcp_order_materials E SEPARAÇÃO #4 ===',
    )

    // Helper para normalizar strings de código
    function normalizeCode(code) {
      if (!code) return ''
      return String(code).trim().toLowerCase()
    }

    function normalizeKey(str) {
      if (!str) return ''
      return String(str)
        .trim()
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
    }

    function round4(val) {
      return Math.round((Number(val) || 0) * 10000) / 10000
    }

    // Extrair objeto JSON com segurança de qualquer formato retornado pelo PB
    function getJsonField(record, fieldName) {
      var raw = null
      try {
        raw = record.get(fieldName)
      } catch (_) {}

      if (!raw) {
        try {
          raw = record.getString(fieldName)
        } catch (_) {}
      }

      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw)
        } catch (_) {
          return null
        }
      }

      if (raw && typeof raw === 'object') {
        // Pode ser um objeto Goja ou array
        try {
          // Normaliza convertendo para string e parseando novamente
          return JSON.parse(JSON.stringify(raw))
        } catch (_) {
          return raw
        }
      }

      return null
    }

    // =========================================================================
    // ETAPA 1: RECALCULAR pcp_order_materials PARA TODAS AS OPs NÃO CONCLUÍDAS
    // CRIADAS A PARTIR DE 2026-09-15
    // =========================================================================

    var targetOrders = []
    try {
      targetOrders = app.findRecordsByFilter(
        'pcp_orders',
        'created >= "2026-09-15 00:00:00" && status != "Concluído" && status != "Cancelada" && status != "Cancelado"',
        'created',
        500,
        0,
      )
    } catch (eFilter) {
      console.log('[MIGRATION 0147] Erro ao buscar targetOrders com filtro: ' + eFilter)
    }

    console.log(
      '[MIGRATION 0147] Encontradas ' +
        targetOrders.length +
        ' OPs ativas criadas a partir de 2026-09-15.',
    )

    var totalMaterialsUpdated = 0
    var opsRepairedCount = 0

    for (var o = 0; o < targetOrders.length; o++) {
      var order = targetOrders[o]
      var orderId = order.id
      var opNum = order.getString('op_number') || order.getString('order_number') || orderId
      var opQty = Number(order.getFloat('quantity')) || 1
      var prodId = order.getString('product_id')

      if (!prodId) {
        continue
      }

      var product = null
      try {
        product = app.findRecordById('products', prodId)
      } catch (err) {
        continue
      }

      var prodData = getJsonField(product, 'data') || {}
      var composition = prodData.composition || []

      // Tratar caso composition seja objeto Goja com chaves numéricas
      if (!Array.isArray(composition) && typeof composition === 'object') {
        var compArr = []
        var keys = Object.keys(composition)
        for (var k = 0; k < keys.length; k++) {
          compArr.push(composition[keys[k]])
        }
        composition = compArr
      }

      if (!Array.isArray(composition) || composition.length === 0) {
        continue
      }

      // Montar mapas da composição
      var compByCode = {}
      var compByDesc = {}

      for (var c = 0; c < composition.length; c++) {
        var compItem = composition[c]
        if (!compItem) continue

        var rawCode =
          compItem.code !== undefined && compItem.code !== null ? String(compItem.code).trim() : ''
        var normCode = normalizeCode(rawCode)
        var normDesc = normalizeKey(compItem.description)

        var unitQty = 1
        if (
          compItem.quantity !== undefined &&
          compItem.quantity !== null &&
          compItem.quantity !== ''
        ) {
          var parsed = parseFloat(String(compItem.quantity).replace(',', '.'))
          if (!isNaN(parsed) && parsed > 0) {
            unitQty = parsed
          }
        }

        var entry = {
          code: rawCode,
          description: compItem.description,
          parsedUnitQty: unitQty,
          item: compItem,
        }

        if (normCode) {
          compByCode[normCode] = entry
        }
        if (normDesc) {
          compByDesc[normDesc] = entry
        }
      }

      // Buscar linhas de pcp_order_materials desta OP
      var materials = []
      try {
        materials = app.findRecordsByFilter(
          'pcp_order_materials',
          'order_id = "' + orderId + '"',
          'created',
          500,
          0,
        )
      } catch (mErr) {
        console.log('[MIGRATION 0147] Erro ao buscar materiais da OP ' + opNum + ': ' + mErr)
        continue
      }

      if (materials.length === 0) {
        continue
      }

      var updatedInThisOp = 0

      for (var m = 0; m < materials.length; m++) {
        var mat = materials[m]
        var matCode = (mat.getString('code') || '').trim()
        var normMatCode = normalizeCode(matCode)
        var matDesc = mat.getString('description') || ''
        var normMatDesc = normalizeKey(matDesc)
        var currentQty = Number(mat.getFloat('quantity')) || 0
        var matStatus = mat.getString('status') || 'Pendente'

        // Localizar item correspondente na composição
        var compMatch = normMatCode && compByCode[normMatCode] ? compByCode[normMatCode] : null
        if (!compMatch && normMatDesc && compByDesc[normMatDesc]) {
          compMatch = compByDesc[normMatDesc]
        }

        if (!compMatch) {
          continue
        }

        var expectedTotalQty = round4(compMatch.parsedUnitQty * opQty)

        // Se a quantidade já estiver correta
        if (Math.abs(currentQty - expectedTotalQty) < 0.0001) {
          continue
        }

        // Salvaguarda: se já foi marcado como Separado, não reduzir a quantidade
        if (matStatus === 'Separado' && expectedTotalQty < currentQty) {
          console.log(
            '[MIGRATION 0147] Preservando ' +
              matCode +
              ' da OP ' +
              opNum +
              ' pois já está Separado com ' +
              currentQty,
          )
          continue
        }

        // Atualizar quantity na linha de pcp_order_materials
        mat.set('quantity', expectedTotalQty)
        try {
          app.save(mat)
          updatedInThisOp++
          totalMaterialsUpdated++
          console.log(
            '[MIGRATION 0147] OP ' +
              opNum +
              ' (' +
              orderId +
              '): material ' +
              matCode +
              ' atualizado de ' +
              currentQty +
              ' para ' +
              expectedTotalQty +
              ' (unit ' +
              compMatch.parsedUnitQty +
              ' x OP ' +
              opQty +
              ')',
          )
        } catch (saveMatErr) {
          console.log('[MIGRATION 0147] Falha ao salvar material ' + mat.id + ': ' + saveMatErr)
        }
      }

      if (updatedInThisOp > 0) {
        opsRepairedCount++
      }
    }

    console.log(
      '[MIGRATION 0147] ETAPA 1 CONCLUÍDA: ' +
        opsRepairedCount +
        ' OPs reparadas, totalizando ' +
        totalMaterialsUpdated +
        ' registros de pcp_order_materials atualizados.',
    )

    // =========================================================================
    // ETAPA 2: RECALCULAR ITENS CONSOLIDADOS DA SEPARAÇÃO #4 (hbifdk2k7u7rm5q)
    // E SUAS RESERVAS DE ESTOQUE (material_reservations)
    // =========================================================================

    var sep4List = []
    try {
      sep4List = app.findRecordsByFilter(
        'material_separations',
        'id = "hbifdk2k7u7rm5q" || title ~ "Separação #4"',
        '-created',
        1,
        0,
      )
    } catch (sepErr) {
      console.log('[MIGRATION 0147] Erro ao buscar Separação #4: ' + sepErr)
    }

    if (sep4List.length > 0) {
      var sep = sep4List[0]
      var sepId = sep.id
      var sepTitle = sep.getString('title')

      var rawOrderIds = getJsonField(sep, 'order_ids') || []
      var orderIds = []
      if (Array.isArray(rawOrderIds)) {
        orderIds = rawOrderIds
      } else if (typeof rawOrderIds === 'object') {
        var oKeys = Object.keys(rawOrderIds)
        for (var ok = 0; ok < oKeys.length; ok++) {
          orderIds.push(rawOrderIds[oKeys[ok]])
        }
      }

      // Se orderIds estiver vazio, usar a lista canônica do pedido 13988 da Separação #4
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

      var items = getJsonField(sep, 'items') || []
      if (!Array.isArray(items) && typeof items === 'object') {
        var itArr = []
        var itKeys = Object.keys(items)
        for (var ik = 0; ik < itKeys.length; ik++) {
          itArr.push(items[itKeys[ik]])
        }
        items = itArr
      }

      console.log(
        '[MIGRATION 0147] Processando ' +
          sepTitle +
          ' (' +
          sepId +
          '): ' +
          orderIds.length +
          ' OPs e ' +
          items.length +
          ' itens existentes.',
      )

      // Carregar todas as linhas de pcp_order_materials das OPs da Separação #4
      var allSepMaterials = []
      for (var oi = 0; oi < orderIds.length; oi++) {
        var oid = orderIds[oi]
        try {
          var mats = app.findRecordsByFilter(
            'pcp_order_materials',
            'order_id = "' + oid + '"',
            'created',
            500,
            0,
          )
          for (var mi = 0; mi < mats.length; mi++) {
            allSepMaterials.push(mats[mi])
          }
        } catch (_) {}
      }

      // Mapear demanda por código e por descrição
      var bomDemandByCode = {}
      var bomDemandByDesc = {}

      for (var sm = 0; sm < allSepMaterials.length; sm++) {
        var mRec = allSepMaterials[sm]
        var mCode = (mRec.getString('code') || '').trim()
        var normMCode = normalizeCode(mCode)
        var mDesc = mRec.getString('description') || ''
        var normMDesc = normalizeKey(mDesc)
        var mQty = Number(mRec.getFloat('quantity')) || 0

        if (normMCode) {
          bomDemandByCode[normMCode] = round4((bomDemandByCode[normMCode] || 0) + mQty)
        }
        if (normMDesc) {
          bomDemandByDesc[normMDesc] = round4((bomDemandByDesc[normMDesc] || 0) + mQty)
        }
      }

      var updatedItems = []
      var itemsModifiedCount = 0

      for (var it = 0; it < items.length; it++) {
        var curItem = items[it]
        if (!curItem) continue

        var itCode =
          curItem.code !== undefined && curItem.code !== null ? String(curItem.code).trim() : ''
        var normItCode = normalizeCode(itCode)
        var normItDesc = normalizeKey(curItem.description)
        var currentTotalQty = Number(curItem.total_quantity) || 0
        var itemStatus = curItem.status || 'pendente'

        var recalculatedQty =
          normItCode && bomDemandByCode[normItCode] !== undefined
            ? bomDemandByCode[normItCode]
            : null
        if (recalculatedQty === null && normItDesc && bomDemandByDesc[normItDesc] !== undefined) {
          recalculatedQty = bomDemandByDesc[normItDesc]
        }

        if (
          recalculatedQty !== null &&
          recalculatedQty !== undefined &&
          recalculatedQty > 0 &&
          Math.abs(recalculatedQty - currentTotalQty) > 0.0001
        ) {
          var oldQty = currentTotalQty
          var newQty = recalculatedQty

          var finalTotalQty = newQty
          var finalSeparatedQty = curItem.separated_quantity
          var finalShortageQty = curItem.shortage_quantity

          if (itemStatus === 'separado') {
            finalSeparatedQty = newQty
          } else if (itemStatus === 'parcial') {
            var sepQty = Number(curItem.separated_quantity) || 0
            finalShortageQty = Math.max(0, round4(newQty - sepQty))
          }

          var updatedItem = {}
          var propKeys = Object.keys(curItem)
          for (var pk = 0; pk < propKeys.length; pk++) {
            updatedItem[propKeys[pk]] = curItem[propKeys[pk]]
          }

          updatedItem.total_quantity = finalTotalQty
          if (finalSeparatedQty !== undefined) {
            updatedItem.separated_quantity = finalSeparatedQty
          }
          if (finalShortageQty !== undefined) {
            updatedItem.shortage_quantity = finalShortageQty
          }

          updatedItems.push(updatedItem)
          itemsModifiedCount++
          console.log(
            '[MIGRATION 0147] Item Separação ' +
              itCode +
              ' (' +
              curItem.description +
              '): total_quantity ' +
              oldQty +
              ' -> ' +
              finalTotalQty +
              ' (' +
              itemStatus +
              ')',
          )
        } else {
          updatedItems.push(curItem)
        }
      }

      // Salvar os itens na Separação #4
      sep.set('items', updatedItems)
      try {
        app.save(sep)
        console.log(
          '[MIGRATION 0147] Separação #4 atualizada com sucesso (' +
            itemsModifiedCount +
            ' itens ajustados).',
        )
      } catch (saveSepErr) {
        console.log('[MIGRATION 0147] Erro ao salvar Separação #4: ' + saveSepErr)
      }

      // Atualizar também na tabela pcp_programacoes (registro vinculado 90vq5ysbo2o1k0t)
      var progId = sep.getString('programacao_id')
      if (progId) {
        try {
          var prog = app.findRecordById('pcp_programacoes', progId)
          var progCompiled = getJsonField(prog, 'compiled_items') || []
          if (!Array.isArray(progCompiled) && typeof progCompiled === 'object') {
            var pcArr = []
            var pcKeys = Object.keys(progCompiled)
            for (var pck = 0; pck < pcKeys.length; pck++) {
              pcArr.push(progCompiled[pcKeys[pck]])
            }
            progCompiled = pcArr
          }

          if (Array.isArray(progCompiled)) {
            var progUpdatedCount = 0
            var newCompiled = []
            for (var ci = 0; ci < progCompiled.length; ci++) {
              var cItem = progCompiled[ci]
              if (!cItem) continue
              var cCode = normalizeCode(cItem.code)
              var cDesc = normalizeKey(cItem.description)
              var recQty =
                cCode && bomDemandByCode[cCode] !== undefined ? bomDemandByCode[cCode] : null
              if (recQty === null && cDesc && bomDemandByDesc[cDesc] !== undefined) {
                recQty = bomDemandByDesc[cDesc]
              }

              if (
                recQty !== null &&
                recQty !== undefined &&
                recQty > 0 &&
                Math.abs(recQty - (Number(cItem.totalQuantity) || 0)) > 0.0001
              ) {
                progUpdatedCount++
                var cItemCopy = {}
                var cKeys = Object.keys(cItem)
                for (var ck = 0; ck < cKeys.length; ck++) {
                  cItemCopy[cKeys[ck]] = cItem[cKeys[ck]]
                }
                cItemCopy.totalQuantity = recQty
                newCompiled.push(cItemCopy)
              } else {
                newCompiled.push(cItem)
              }
            }

            if (progUpdatedCount > 0) {
              prog.set('compiled_items', newCompiled)
              app.save(prog)
              console.log(
                '[MIGRATION 0147] Programação #' +
                  prog.getInt('seq_number') +
                  ' atualizada com ' +
                  progUpdatedCount +
                  ' itens recompilados.',
              )
            }
          }
        } catch (progErr) {
          console.log('[MIGRATION 0147] Aviso ao atualizar pcp_programacoes: ' + progErr)
        }
      }

      // Sincronizar reservas em material_reservations desta Separação
      var reservations = []
      try {
        reservations = app.findRecordsByFilter(
          'material_reservations',
          'separation_id = "' + sepId + '" && status = "Ativa"',
          'created',
          500,
          0,
        )
      } catch (_) {}

      console.log(
        '[MIGRATION 0147] Verificando ' + reservations.length + ' reservas ativas da Separação #4.',
      )

      var updatedItemsMap = {}
      for (var u = 0; u < updatedItems.length; u++) {
        var uItem = updatedItems[u]
        if (uItem && uItem.id) {
          updatedItemsMap[uItem.id] = uItem
        }
      }

      for (var r = 0; r < reservations.length; r++) {
        var res = reservations[r]
        var resItemId = res.getString('item_id')
        var currentResQty = Number(res.getFloat('quantity')) || 0
        var matchedItem = resItemId ? updatedItemsMap[resItemId] : null

        if (matchedItem) {
          var targetQty =
            matchedItem.status === 'parcial' && matchedItem.separated_quantity !== undefined
              ? Number(matchedItem.separated_quantity) || 0
              : Number(matchedItem.total_quantity) || 0

          if (targetQty > 0 && Math.abs(currentResQty - targetQty) > 0.0001) {
            res.set('quantity', targetQty)
            try {
              app.save(res)
              console.log(
                '[MIGRATION 0147] Reserva ' +
                  res.id +
                  ' (' +
                  res.getString('code') +
                  '): ' +
                  currentResQty +
                  ' -> ' +
                  targetQty,
              )
            } catch (saveResErr) {
              console.log('[MIGRATION 0147] Erro ao salvar reserva ' + res.id + ': ' + saveResErr)
            }
          }
        }
      }
    } else {
      console.log('[MIGRATION 0147] Separação #4 não encontrada por filtro.')
    }

    console.log('[MIGRATION 0147] === FIM DA MIGRATION 0147 ===')
  },
  (app) => {
    console.log('[MIGRATION 0147] Revert da Migration 0147 não destrutivo.')
  },
)
