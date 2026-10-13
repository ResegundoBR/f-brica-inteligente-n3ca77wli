/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0146: Reparo de dados das OPs criadas a partir de 2026-09-15
 * e reconciliação dos itens consolidados da Separação #4 (e reservas de estoque).
 *
 * Contexto de negócio:
 * 1. A composição do catálogo de produto (product.data.composition) guarda a quantidade POR 1 UNIDADE do produto.
 * 2. Em pcp_order_materials, a quantidade da OP deve ser: quantidade unitária da composição × order.quantity.
 * 3. As OPs criadas a partir de ~18/09 nasceram com quantidade unitária (sem multiplicar por order.quantity).
 * 4. Para todas as OPs NÃO concluídas criadas a partir de 2026-09-15, recalcular pcp_order_materials preservando
 *    setor, unit, status, marcações de separação e sem reduzir o que já foi separado.
 * 5. Recalcular os itens da Separação #4 (rodada Em_Separacao) a partir das BOMs corrigidas e atualizar as
 *    reservas ativas de material_reservations, preservando as marcações já feitas e sinalizando divergências.
 */

migrate(
  (app) => {
    console.log('[MIGRATION 0146] === INÍCIO DO REPARO DE DADOS DAS OPs E SEPARAÇÃO #4 ===')

    const report = {
      timestamp: new Date().toISOString(),
      ops_repaired: [],
      ops_skipped: [],
      materials_updated: [],
      materials_preserved_already_separated: [],
      separation_4_reconciled: {
        separation_id: null,
        title: null,
        items_count_before: 0,
        items_count_after: 0,
        items_updated: [],
        reservations_updated: [],
        divergences: [],
      },
    }

    // Helper para normalizar strings de código
    function normalizeCode(code) {
      return (code || '').trim().toLowerCase()
    }

    function normalizeKey(str) {
      return (str || '')
        .trim()
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
    }

    function round4(val) {
      return Math.round((Number(val) || 0) * 10000) / 10000
    }

    // =========================================================================
    // ETAPA 1: RECALCULAR pcp_order_materials PARA TODAS AS OPs NÃO CONCLUÍDAS
    // CRIADAS A PARTIR DE 2026-09-15
    // =========================================================================

    const targetOrders = app.findRecordsByFilter(
      'pcp_orders',
      'created >= "2026-09-15 00:00:00" && status != "Concluído" && status != "Cancelada" && status != "Cancelado"',
      'created',
      500,
      0,
    )

    console.log(
      '[MIGRATION 0146] Encontradas ' +
        targetOrders.length +
        ' OPs ativas criadas a partir de 2026-09-15.',
    )

    for (let o = 0; o < targetOrders.length; o++) {
      const order = targetOrders[o]
      const orderId = order.id
      const opNum = order.getString('op_number') || order.getString('order_number') || orderId
      const opQty = Number(order.getFloat('quantity')) || 1
      const prodId = order.getString('product_id')

      if (!prodId) {
        report.ops_skipped.push({
          order_id: orderId,
          op_number: opNum,
          reason: 'OP sem product_id (assistência/especial sem catálogo)',
        })
        continue
      }

      let product = null
      try {
        product = app.findRecordById('products', prodId)
      } catch (err) {
        report.ops_skipped.push({
          order_id: orderId,
          op_number: opNum,
          reason: 'Produto id ' + prodId + ' não encontrado',
        })
        continue
      }

      const prodData = product.get('data') || {}
      const composition = prodData.composition || []
      if (!Array.isArray(composition) || composition.length === 0) {
        report.ops_skipped.push({
          order_id: orderId,
          op_number: opNum,
          reason: 'Produto sem composição em data.composition',
        })
        continue
      }

      // Montar mapa da composição por código normalizado e fallback descrição
      const compByCode = new Map()
      const compByDesc = new Map()

      for (let c = 0; c < composition.length; c++) {
        const item = composition[c]
        const rawCode = (item.code || '').trim()
        const normCode = normalizeCode(rawCode)
        const normDesc = normalizeKey(item.description)

        let unitQty = 1
        if (item.quantity !== undefined && item.quantity !== null && item.quantity !== '') {
          const parsed = parseFloat(String(item.quantity).replace(',', '.'))
          if (!isNaN(parsed) && parsed > 0) {
            unitQty = parsed
          }
        }

        if (normCode) {
          compByCode.set(normCode, { ...item, parsedUnitQty: unitQty })
        }
        if (normDesc) {
          compByDesc.set(normDesc, { ...item, parsedUnitQty: unitQty })
        }
      }

      // Buscar linhas de pcp_order_materials desta OP
      const materials = app.findRecordsByFilter(
        'pcp_order_materials',
        'order_id = "' + orderId + '"',
        'created',
        500,
        0,
      )

      if (materials.length === 0) {
        report.ops_skipped.push({
          order_id: orderId,
          op_number: opNum,
          reason: 'Nenhum material gerado em pcp_order_materials para esta OP',
        })
        continue
      }

      let updatedCountForOp = 0
      const opChanges = []

      for (let m = 0; m < materials.length; m++) {
        const mat = materials[m]
        const matCode = (mat.getString('code') || '').trim()
        const normMatCode = normalizeCode(matCode)
        const matDesc = mat.getString('description') || ''
        const normMatDesc = normalizeKey(matDesc)
        const currentQty = Number(mat.getFloat('quantity')) || 0
        const matStatus = mat.getString('status') || 'Pendente'

        // Localizar item na composição
        let compMatch = normMatCode ? compByCode.get(normMatCode) : null
        if (!compMatch && normMatDesc) {
          compMatch = compByDesc.get(normMatDesc)
        }

        if (!compMatch) {
          // Não achou na composição (pode ser material adicionado avulso ou substituído)
          continue
        }

        const expectedTotalQty = round4(compMatch.parsedUnitQty * opQty)

        // Se a quantidade já estiver correta (ou opQty === 1)
        if (Math.abs(currentQty - expectedTotalQty) < 0.0001) {
          continue
        }

        // Salvaguarda: se já foi marcado como Separado, não reduzir a quantidade
        if (matStatus === 'Separado' && expectedTotalQty < currentQty) {
          report.materials_preserved_already_separated.push({
            order_id: orderId,
            op_number: opNum,
            code: matCode,
            status: matStatus,
            current_quantity: currentQty,
            expected_quantity: expectedTotalQty,
            action: 'Quantidade preservada para não reduzir item já separado',
          })
          continue
        }

        // Atualizar quantity na linha de pcp_order_materials
        mat.set('quantity', expectedTotalQty)
        app.save(mat)

        updatedCountForOp++
        opChanges.push({
          code: matCode,
          description: matDesc,
          old_quantity: currentQty,
          new_quantity: expectedTotalQty,
          unit_quantity_in_comp: compMatch.parsedUnitQty,
          op_quantity: opQty,
          status: matStatus,
        })

        report.materials_updated.push({
          material_id: mat.id,
          order_id: orderId,
          op_number: opNum,
          code: matCode,
          old_quantity: currentQty,
          new_quantity: expectedTotalQty,
        })
      }

      if (updatedCountForOp > 0) {
        report.ops_repaired.push({
          order_id: orderId,
          op_number: opNum,
          op_quantity: opQty,
          materials_updated_count: updatedCountForOp,
          changes: opChanges,
        })
        console.log(
          '[MIGRATION 0146] OP ' +
            opNum +
            ' (qtd ' +
            opQty +
            '): ' +
            updatedCountForOp +
            ' linhas de materiais recalculadas.',
        )
      }
    }

    // =========================================================================
    // ETAPA 2: RECALCULAR ITENS CONSOLIDADOS DA SEPARAÇÃO #4 (hbifdk2k7u7rm5q)
    // E SUAS RESERVAS DE ESTOQUE (material_reservations)
    // =========================================================================

    const sep4List = app.findRecordsByFilter(
      'material_separations',
      'id = "hbifdk2k7u7rm5q" || title ~ "Separação #4"',
      '-created',
      1,
      0,
    )

    if (sep4List.length > 0) {
      const sep = sep4List[0]
      const sepId = sep.id
      report.separation_4_reconciled.separation_id = sepId
      report.separation_4_reconciled.title = sep.getString('title')

      const rawOrderIds = sep.get('order_ids') || []
      const orderIds = Array.isArray(rawOrderIds) ? rawOrderIds : []
      const items = sep.get('items') || []
      report.separation_4_reconciled.items_count_before = items.length

      console.log(
        '[MIGRATION 0146] Iniciando reconciliação da ' +
          sep.getString('title') +
          ' (' +
          sepId +
          ') com ' +
          orderIds.length +
          ' OPs e ' +
          items.length +
          ' itens.',
      )

      // Carregar todas as linhas atualizadas de pcp_order_materials de todas as OPs da Separação #4
      const allSepMaterials = []
      for (let oi = 0; oi < orderIds.length; oi++) {
        const oid = orderIds[oi]
        const mats = app.findRecordsByFilter(
          'pcp_order_materials',
          'order_id = "' + oid + '"',
          'created',
          500,
          0,
        )
        for (let mi = 0; mi < mats.length; mi++) {
          allSepMaterials.push(mats[mi])
        }
      }

      // Agrupar materiais da BOM por código normalizado e fallback por descrição
      const bomDemandByCode = new Map()
      const bomDemandByDesc = new Map()

      for (let sm = 0; sm < allSepMaterials.length; sm++) {
        const m = allSepMaterials[sm]
        const mCode = (m.getString('code') || '').trim()
        const normMCode = normalizeCode(mCode)
        const mDesc = m.getString('description') || ''
        const normMDesc = normalizeKey(mDesc)
        const mQty = Number(m.getFloat('quantity')) || 0

        if (normMCode) {
          const cur = bomDemandByCode.get(normMCode) || 0
          bomDemandByCode.set(normMCode, round4(cur + mQty))
        }
        if (normMDesc) {
          const cur = bomDemandByDesc.get(normMDesc) || 0
          bomDemandByDesc.set(normMDesc, round4(cur + mQty))
        }
      }

      // Atualizar items da Separação #4 preservando marcações já feitas
      const updatedItems = []
      let itemsModifiedCount = 0

      for (let it = 0; it < items.length; it++) {
        const item = items[it]
        const itemCode = (item.code || '').trim()
        const normItemCode = normalizeCode(itemCode)
        const normItemDesc = normalizeKey(item.description)
        const currentTotalQty = Number(item.total_quantity) || 0
        const itemStatus = item.status || 'pendente'

        // Verificar demanda recalculada da BOM
        let recalculatedQty = normItemCode ? bomDemandByCode.get(normItemCode) : null
        if (recalculatedQty === null || recalculatedQty === undefined) {
          recalculatedQty = bomDemandByDesc.get(normItemDesc)
        }

        if (
          recalculatedQty !== null &&
          recalculatedQty !== undefined &&
          recalculatedQty > 0 &&
          Math.abs(recalculatedQty - currentTotalQty) > 0.0001
        ) {
          const oldQty = currentTotalQty
          const newQty = recalculatedQty

          // Se item já estiver marcado como separado ou parcial, salvaguardar
          let finalTotalQty = newQty
          let finalSeparatedQty = item.separated_quantity
          let finalShortageQty = item.shortage_quantity

          if (itemStatus === 'separado') {
            // Se já foi marcado como 'separado' pelo operador:
            // Ajusta o total_quantity para a nova demanda da OP.
            // Se a nova demanda for maior, sinalizar que precisa separar o complemento ou manter
            // o que já foi fisicamente separado.
            finalSeparatedQty = newQty
            report.separation_4_reconciled.divergences.push({
              item_id: item.id,
              code: itemCode,
              description: item.description,
              status: itemStatus,
              old_quantity: oldQty,
              new_quantity: newQty,
              action:
                'Item já marcado como Separado: total_quantity atualizado para ' + newQty + ' un.',
            })
          } else if (itemStatus === 'parcial') {
            // Se já estava parcial, preservar separated_quantity e recomputar shortage_quantity
            const sepQty = Number(item.separated_quantity) || 0
            finalShortageQty = Math.max(0, round4(newQty - sepQty))
            report.separation_4_reconciled.divergences.push({
              item_id: item.id,
              code: itemCode,
              description: item.description,
              status: itemStatus,
              separated_quantity: sepQty,
              old_total: oldQty,
              new_total: newQty,
              new_shortage: finalShortageQty,
              action: 'Item Parcial recalculado: novo saldo faltante ' + finalShortageQty + ' un.',
            })
          }

          const updatedItem = {
            ...item,
            total_quantity: finalTotalQty,
          }
          if (finalSeparatedQty !== undefined) {
            updatedItem.separated_quantity = finalSeparatedQty
          }
          if (finalShortageQty !== undefined) {
            updatedItem.shortage_quantity = finalShortageQty
          }

          updatedItems.push(updatedItem)
          itemsModifiedCount++

          report.separation_4_reconciled.items_updated.push({
            item_id: item.id,
            code: itemCode,
            description: item.description,
            status: itemStatus,
            old_quantity: oldQty,
            new_quantity: finalTotalQty,
          })
        } else {
          updatedItems.push(item)
        }
      }

      // Salvar os itens atualizados na Separação #4
      sep.set('items', updatedItems)
      app.save(sep)
      report.separation_4_reconciled.items_count_after = updatedItems.length

      console.log(
        '[MIGRATION 0146] Separação #4 atualizada: ' +
          itemsModifiedCount +
          ' itens tiveram total_quantity corrigidos.',
      )

      // Atualizar também na tabela pcp_programacoes (registro vinculado)
      const progId = sep.getString('programacao_id')
      if (progId) {
        try {
          const prog = app.findRecordById('pcp_programacoes', progId)
          const progCompiled = prog.get('compiled_items') || []
          if (Array.isArray(progCompiled)) {
            let progUpdatedCount = 0
            const newCompiled = progCompiled.map((cItem) => {
              const cCode = normalizeCode(cItem.code)
              const cDesc = normalizeKey(cItem.description)
              let recQty = cCode ? bomDemandByCode.get(cCode) : null
              if (recQty === null || recQty === undefined) {
                recQty = bomDemandByDesc.get(cDesc)
              }
              if (
                recQty !== null &&
                recQty !== undefined &&
                recQty > 0 &&
                Math.abs(recQty - (Number(cItem.totalQuantity) || 0)) > 0.0001
              ) {
                progUpdatedCount++
                return {
                  ...cItem,
                  totalQuantity: recQty,
                }
              }
              return cItem
            })

            if (progUpdatedCount > 0) {
              prog.set('compiled_items', newCompiled)
              app.save(prog)
              console.log(
                '[MIGRATION 0146] Programação #' +
                  prog.getInt('seq_number') +
                  ' atualizada com ' +
                  progUpdatedCount +
                  ' itens recompilados.',
              )
            }
          }
        } catch (progErr) {
          console.log('[MIGRATION 0146] Aviso ao atualizar pcp_programacoes: ' + progErr)
        }
      }

      // Sincronizar as reservas em material_reservations desta Separação
      const reservations = app.findRecordsByFilter(
        'material_reservations',
        'separation_id = "' + sepId + '" && status = "Ativa"',
        'created',
        500,
        0,
      )

      console.log(
        '[MIGRATION 0146] Verificando ' + reservations.length + ' reservas ativas da Separação #4.',
      )

      // Montar mapa dos itens atualizados da separação por item.id
      const updatedItemsMap = new Map()
      for (let u = 0; u < updatedItems.length; u++) {
        updatedItemsMap.set(updatedItems[u].id, updatedItems[u])
      }

      for (let r = 0; r < reservations.length; r++) {
        const res = reservations[r]
        const resItemId = res.getString('item_id')
        const currentResQty = Number(res.getFloat('quantity')) || 0
        const matchedItem = updatedItemsMap.get(resItemId)

        if (matchedItem) {
          // Se o item for marcado como separado ou parcial, a reserva deve refletir o valor atualizado
          const targetQty =
            matchedItem.status === 'parcial' && matchedItem.separated_quantity !== undefined
              ? Number(matchedItem.separated_quantity) || 0
              : Number(matchedItem.total_quantity) || 0

          if (targetQty > 0 && Math.abs(currentResQty - targetQty) > 0.0001) {
            res.set('quantity', targetQty)
            app.save(res)
            report.separation_4_reconciled.reservations_updated.push({
              reservation_id: res.id,
              code: res.getString('code'),
              description: res.getString('description'),
              old_quantity: currentResQty,
              new_quantity: targetQty,
            })
            console.log(
              '[MIGRATION 0146] Reserva ' +
                res.id +
                ' (' +
                res.getString('code') +
                '): ' +
                currentResQty +
                ' -> ' +
                targetQty,
            )
          }
        }
      }
    } else {
      console.log('[MIGRATION 0146] Separação #4 não encontrada por filtro direto.')
    }

    // =========================================================================
    // RELATÓRIO FINAL
    // =========================================================================
    console.log('[MIGRATION 0146] === RELATÓRIO ANTES / DEPOIS DA MIGRATION 0146 ===')
    console.log(
      '[MIGRATION 0146] Total de OPs reparadas: ' +
        report.ops_repaired.length +
        ' | Linhas de materiais corrigidas: ' +
        report.materials_updated.length,
    )
    for (let rIdx = 0; rIdx < report.ops_repaired.length; rIdx++) {
      const opInfo = report.ops_repaired[rIdx]
      console.log(
        '  • OP ' +
          opInfo.op_number +
          ' (qtd ' +
          opInfo.op_quantity +
          '): ' +
          opInfo.materials_updated_count +
          ' materiais corrigidos',
      )
      for (let ch = 0; ch < opInfo.changes.length; ch++) {
        const c = opInfo.changes[ch]
        console.log(
          '    - [' +
            c.code +
            '] ' +
            c.description +
            ': de ' +
            c.old_quantity +
            ' -> ' +
            c.new_quantity +
            ' (unitário ' +
            c.unit_quantity_in_comp +
            ' x OP ' +
            c.op_quantity +
            ')',
        )
      }
    }

    console.log('[MIGRATION 0146] === FIM DA MIGRATION 0146 ===')
  },
  (app) => {
    // Down migration
    console.log('[MIGRATION 0146] Revert da Migration 0146 não destrutivo.')
  },
)
