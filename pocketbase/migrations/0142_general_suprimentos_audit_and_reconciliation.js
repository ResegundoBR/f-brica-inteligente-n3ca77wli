migrate(
  (app) => {
    console.log('[MIGRATION 0142] === INÍCIO DA AUDITORIA E RECONCILIAÇÃO GERAL DE SUPRIMENTOS ===')
    const report = {
      reconciled_shortages: [],
      ghost_records_closed: [],
      inventory_movements_adjusted: [],
      inventory_balances_corrected: [],
      oc_itens_adjusted: [],
      oc_totals_adjusted: [],
      inventory_descriptions_cleaned: [],
      invalid_codes_resolved: [],
    }

    // -------------------------------------------------------------------------
    // BLOCO 1: RECONCILIAÇÃO DE REGISTROS ESPECÍFICOS IDENTIFICADOS NA VARREDURA
    // -------------------------------------------------------------------------

    // 1.1 Item 46ipklk1bnznomm (05100004)
    // Falta gerada na Separação: OP 000494 (demanda 1) + OP 000518 (demanda 2) = falta real 3.
    // Havia sido inflada de 3 para 20 e recebido 20.
    try {
      const rec46 = app.findRecordById('material_shortages', '46ipklk1bnznomm')
      const before = {
        id: rec46.id,
        quantity: rec46.getInt('quantity'),
        received_quantity: rec46.getInt('received_quantity'),
        status: rec46.getString('status'),
        observation: rec46.getString('observation'),
      }
      rec46.set('quantity', 3)
      rec46.set('received_quantity', 3)
      rec46.set('status', 'Recebido')
      const obs = rec46.getString('observation') || ''
      const auditObs =
        'Reconciliação Geral (Frente 1): quantidade e recebimento corrigidos de 20 para 3 (demanda real de falta das OPs 000494 e 000518: 3 PC).'
      rec46.set('observation', obs ? obs + ' | ' + auditObs : auditObs)
      app.save(rec46)

      report.reconciled_shortages.push({
        id: rec46.id,
        code: '05100004',
        before,
        after: {
          quantity: 3,
          received_quantity: 3,
          status: 'Recebido',
        },
      })
      console.log('[MIGRATION 0142] 46ipklk1bnznomm corrigido para 3 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir 46ipklk1bnznomm: ' + e)
    }

    // 1.2 Item 6u1vw8lbdawaq8d (05100105)
    // Falta gerada na Separação: OP 480 (4) + OP 481 (3) + OP 483 (3) = falta real 10.
    // Havia sido inflada de 10 para 20 e recebido 20.
    try {
      const rec6u = app.findRecordById('material_shortages', '6u1vw8lbdawaq8d')
      const before = {
        id: rec6u.id,
        quantity: rec6u.getInt('quantity'),
        received_quantity: rec6u.getInt('received_quantity'),
        status: rec6u.getString('status'),
        observation: rec6u.getString('observation'),
      }
      rec6u.set('quantity', 10)
      rec6u.set('received_quantity', 10)
      rec6u.set('status', 'Recebido')
      const obs = rec6u.getString('observation') || ''
      const auditObs =
        'Reconciliação Geral (Frente 1): quantidade e recebimento corrigidos de 20 para 10 (demanda real de falta das OPs 480, 481 e 483: 10 PC).'
      rec6u.set('observation', obs ? obs + ' | ' + auditObs : auditObs)
      app.save(rec6u)

      report.reconciled_shortages.push({
        id: rec6u.id,
        code: '05100105',
        before,
        after: {
          quantity: 10,
          received_quantity: 10,
          status: 'Recebido',
        },
      })
      console.log('[MIGRATION 0142] 6u1vw8lbdawaq8d corrigido para 10 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir 6u1vw8lbdawaq8d: ' + e)
    }

    // 1.3 Item 3huhm8yzodo5ybk (05100263)
    // Falta gerada na Separação: OP 481 (2) + OP 483 (2) = falta real 4.
    // Havia sido inflada de 4 para 50 e recebido 50.
    try {
      const rec3h = app.findRecordById('material_shortages', '3huhm8yzodo5ybk')
      const before = {
        id: rec3h.id,
        quantity: rec3h.getInt('quantity'),
        received_quantity: rec3h.getInt('received_quantity'),
        status: rec3h.getString('status'),
        observation: rec3h.getString('observation'),
      }
      rec3h.set('quantity', 4)
      rec3h.set('received_quantity', 4)
      rec3h.set('status', 'Recebido')
      const obs = rec3h.getString('observation') || ''
      const auditObs =
        'Reconciliação Geral (Frente 1): quantidade e recebimento corrigidos de 50 para 4 (demanda real de falta das OPs 481 e 483: 4 PC).'
      rec3h.set('observation', obs ? obs + ' | ' + auditObs : auditObs)
      app.save(rec3h)

      report.reconciled_shortages.push({
        id: rec3h.id,
        code: '05100263',
        before,
        after: {
          quantity: 4,
          received_quantity: 4,
          status: 'Recebido',
        },
      })
      console.log('[MIGRATION 0142] 3huhm8yzodo5ybk corrigido para 4 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir 3huhm8yzodo5ybk: ' + e)
    }

    // 1.4 Item eoibn3xo7q2ztj5 (05090029)
    // Demanda real de falta registrada pelo operador: 2 PC. quantity estava 21 na Compra.
    try {
      const recEo = app.findRecordById('material_shortages', 'eoibn3xo7q2ztj5')
      const before = {
        id: recEo.id,
        quantity: recEo.getInt('quantity'),
        received_quantity: recEo.getInt('received_quantity'),
        status: recEo.getString('status'),
        observation: recEo.getString('observation'),
      }
      recEo.set('quantity', 2)
      const obs = recEo.getString('observation') || ''
      const auditObs =
        'Reconciliação Geral (Frente 1): quantidade corrigida de 21 para 2 PC conforme demanda real de falta das OPs 000494 e 000515.'
      recEo.set('observation', obs ? obs + ' | ' + auditObs : auditObs)
      app.save(recEo)

      report.reconciled_shortages.push({
        id: recEo.id,
        code: '05090029',
        before,
        after: {
          quantity: 2,
          received_quantity: recEo.getInt('received_quantity'),
          status: recEo.getString('status'),
        },
      })
      console.log('[MIGRATION 0142] eoibn3xo7q2ztj5 corrigido de 21 para 2 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir eoibn3xo7q2ztj5: ' + e)
    }

    // 1.5 Avulsa fantasma 1430f7nlty5m74a (05100004)
    // Linha avulsa de 50 un em status 'Compra' sem necessidade pendente, mantendo o item preso na tela de Recebimento.
    // Fechar como no M6x6 (status 'Cancelado' com observação de auditoria).
    try {
      const rec14 = app.findRecordById('material_shortages', '1430f7nlty5m74a')
      const before = {
        id: rec14.id,
        quantity: rec14.getInt('quantity'),
        received_quantity: rec14.getInt('received_quantity'),
        status: rec14.getString('status'),
        observation: rec14.getString('observation'),
      }
      rec14.set('status', 'Cancelado')
      const obs = rec14.getString('observation') || ''
      const auditObs =
        'Reconciliação Geral (Frente 1): registro avulso fantasma (50 un) cancelado por não corresponder a necessidade pendente real e travar a tela de Recebimento.'
      rec14.set('observation', obs ? obs + ' | ' + auditObs : auditObs)
      app.save(rec14)

      report.ghost_records_closed.push({
        id: rec14.id,
        code: '05100004',
        before,
        after: {
          status: 'Cancelado',
        },
      })
      console.log('[MIGRATION 0142] Avulsa fantasma 1430f7nlty5m74a cancelada com sucesso.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao fechar 1430f7nlty5m74a: ' + e)
    }

    // -------------------------------------------------------------------------
    // BLOCO 2: RESOLVER CÓDIGO COM ERRO DE DIGITAÇÃO 05100l0105
    // w9xyguidqk0wkbs: código com 'l' minúsculo inserido no meio (50 un em Cotação).
    // Duplicata do código correto 05100105. Cancelar com observação apontando o código correto.
    // -------------------------------------------------------------------------
    try {
      const recW9 = app.findRecordById('material_shortages', 'w9xyguidqk0wkbs')
      const before = {
        id: recW9.id,
        code: recW9.getString('code'),
        quantity: recW9.getInt('quantity'),
        status: recW9.getString('status'),
        observation: recW9.getString('observation'),
      }
      recW9.set('status', 'Cancelado')
      const obs = recW9.getString('observation') || ''
      const auditObs =
        'Reconciliação Geral (Frente 1): registro cancelado devido a erro de digitação no código (05100l0105 com "l"). O código correto homologado é 05100105.'
      recW9.set('observation', obs ? obs + ' | ' + auditObs : auditObs)
      app.save(recW9)

      report.invalid_codes_resolved.push({
        id: recW9.id,
        code: recW9.getString('code'),
        before,
        after: {
          status: 'Cancelado',
        },
      })
      console.log(
        '[MIGRATION 0142] Código inválido 05100l0105 (w9xyguidqk0wkbs) cancelado com sucesso.',
      )
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao resolver w9xyguidqk0wkbs: ' + e)
    }

    // -------------------------------------------------------------------------
    // BLOCO 3: CORREÇÃO DE ORDENS DE COMPRA ITENS (ordem_compra_itens)
    // -------------------------------------------------------------------------
    // 3.1 Item oerhnlg29wi658m (vinculado a 46ipklk1bnznomm, OC sihug4pcy0dl1cl)
    // Reduzir de 20 para 3 un. unit_price = 0.051 => total = 0.15.
    try {
      const itemOe = app.findRecordById('ordem_compra_itens', 'oerhnlg29wi658m')
      const beforeQty = itemOe.getInt('quantity')
      const beforeTot = itemOe.getFloat('total')
      const unitP = itemOe.getFloat('unit_price') || 0.051
      itemOe.set('quantity', 3)
      const newTot = Math.round(3 * unitP * 100) / 100
      itemOe.set('total', newTot)
      const desc = itemOe.getString('description') || ''
      itemOe.set(
        'description',
        desc + ' [Reconciliação Geral: ajustado de 20 para 3 un conforme demanda real]',
      )
      app.save(itemOe)

      report.oc_itens_adjusted.push({
        id: itemOe.id,
        code: '05100004',
        oc_id: itemOe.getString('oc_id'),
        before: { quantity: beforeQty, total: beforeTot },
        after: { quantity: 3, total: newTot },
      })
      console.log('[MIGRATION 0142] Item OC oerhnlg29wi658m corrigido de 20 para 3 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir item OC oerhnlg29wi658m: ' + e)
    }

    // 3.2 Item cdu0no7z1jysmn6 (vinculado a 6u1vw8lbdawaq8d, OC sihug4pcy0dl1cl)
    // Reduzir de 20 para 10 un. unit_price = 0.051 => total = 0.51.
    try {
      const itemCd = app.findRecordById('ordem_compra_itens', 'cdu0no7z1jysmn6')
      const beforeQty = itemCd.getInt('quantity')
      const beforeTot = itemCd.getFloat('total')
      const unitP = itemCd.getFloat('unit_price') || 0.051
      itemCd.set('quantity', 10)
      const newTot = Math.round(10 * unitP * 100) / 100
      itemCd.set('total', newTot)
      const desc = itemCd.getString('description') || ''
      itemCd.set(
        'description',
        desc + ' [Reconciliação Geral: ajustado de 20 para 10 un conforme demanda real]',
      )
      app.save(itemCd)

      report.oc_itens_adjusted.push({
        id: itemCd.id,
        code: '05100105',
        oc_id: itemCd.getString('oc_id'),
        before: { quantity: beforeQty, total: beforeTot },
        after: { quantity: 10, total: newTot },
      })
      console.log('[MIGRATION 0142] Item OC cdu0no7z1jysmn6 corrigido de 20 para 10 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir item OC cdu0no7z1jysmn6: ' + e)
    }

    // 3.3 Item xn3dfxxmqwjdqhk (vinculado a 3huhm8yzodo5ybk, OC sihug4pcy0dl1cl)
    // Reduzir de 50 para 4 un. unit_price = 0.1674 => total = 0.67.
    try {
      const itemXn = app.findRecordById('ordem_compra_itens', 'xn3dfxxmqwjdqhk')
      const beforeQty = itemXn.getInt('quantity')
      const beforeTot = itemXn.getFloat('total')
      const unitP = itemXn.getFloat('unit_price') || 0.1674
      itemXn.set('quantity', 4)
      const newTot = Math.round(4 * unitP * 100) / 100
      itemXn.set('total', newTot)
      const desc = itemXn.getString('description') || ''
      itemXn.set(
        'description',
        desc + ' [Reconciliação Geral: ajustado de 50 para 4 un conforme demanda real]',
      )
      app.save(itemXn)

      report.oc_itens_adjusted.push({
        id: itemXn.id,
        code: '05100263',
        oc_id: itemXn.getString('oc_id'),
        before: { quantity: beforeQty, total: beforeTot },
        after: { quantity: 4, total: newTot },
      })
      console.log('[MIGRATION 0142] Item OC xn3dfxxmqwjdqhk corrigido de 50 para 4 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir item OC xn3dfxxmqwjdqhk: ' + e)
    }

    // 3.4 Item vqutqw1rqt3snl9 (vinculado a eoibn3xo7q2ztj5, OC 175zm67jodnurv5)
    // Reduzir de 21 para 2 un. unit_price = 2.5 => total = 5.00.
    try {
      const itemVq = app.findRecordById('ordem_compra_itens', 'vqutqw1rqt3snl9')
      const beforeQty = itemVq.getInt('quantity')
      const beforeTot = itemVq.getFloat('total')
      const unitP = itemVq.getFloat('unit_price') || 2.5
      itemVq.set('quantity', 2)
      const newTot = Math.round(2 * unitP * 100) / 100
      itemVq.set('total', newTot)
      const desc = itemVq.getString('description') || ''
      itemVq.set(
        'description',
        desc + ' [Reconciliação Geral: ajustado de 21 para 2 un conforme demanda real]',
      )
      app.save(itemVq)

      report.oc_itens_adjusted.push({
        id: itemVq.id,
        code: '05090029',
        oc_id: itemVq.getString('oc_id'),
        before: { quantity: beforeQty, total: beforeTot },
        after: { quantity: 2, total: newTot },
      })
      console.log('[MIGRATION 0142] Item OC vqutqw1rqt3snl9 corrigido de 21 para 2 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir item OC vqutqw1rqt3snl9: ' + e)
    }

    // 3.5 Recalcular totais das OCs afetadas
    const ocsToRecalculate = ['sihug4pcy0dl1cl', '175zm67jodnurv5']
    for (let oIdx = 0; oIdx < ocsToRecalculate.length; oIdx++) {
      const ocId = ocsToRecalculate[oIdx]
      try {
        const ocRec = app.findRecordById('ordens_de_compra', ocId)
        const beforeTotal = ocRec.getFloat('total')
        const items = app.findRecordsByFilter(
          'ordem_compra_itens',
          'oc_id = "' + ocId + '"',
          'created',
          200,
          0,
        )
        let sumTot = 0
        for (let it = 0; it < items.length; it++) {
          sumTot += items[it].getFloat('total') || 0
        }
        sumTot = Math.round(sumTot * 100) / 100
        ocRec.set('total', sumTot)
        const curDt = ocRec.getString('delivery_terms') || ''
        const auditNote =
          '[Reconciliação Geral: total recalculado para R$ ' + sumTot.toFixed(2) + ']'
        ocRec.set('delivery_terms', curDt ? curDt + ' | ' + auditNote : auditNote)
        app.save(ocRec)

        report.oc_totals_adjusted.push({
          oc_id: ocId,
          oc_number: ocRec.getString('oc_number'),
          before_total: beforeTotal,
          after_total: sumTot,
        })
        console.log(
          '[MIGRATION 0142] OC ' + ocId + ' recalculada: ' + beforeTotal + ' -> ' + sumTot,
        )
      } catch (e) {
        console.log('[MIGRATION 0142] Erro ao recalcular OC ' + ocId + ': ' + e)
      }
    }

    // -------------------------------------------------------------------------
    // BLOCO 4: CORREÇÃO DOS MOVIMENTOS DE DISTRIBUIÇÃO E SALDO DE INVENTÁRIO
    // -------------------------------------------------------------------------
    // 4.1 Movimento de saída 6vzcu71y0qjj0xe (inventário r4x7h1kh7v2rldb, código 05100004)
    // Reduzir saída de 20 para 3 un (falta real da OP).
    try {
      const mov6v = app.findRecordById('inventory_movements', '6vzcu71y0qjj0xe')
      const beforeQty = mov6v.getInt('quantity')
      mov6v.set('quantity', 3)
      const curReas = mov6v.getString('reason') || ''
      mov6v.set(
        'reason',
        curReas +
          ' [Reconciliação Geral: saída corrigida de 20 para 3 un conforme falta real da OP 000518/2026]',
      )
      app.save(mov6v)
      report.inventory_movements_adjusted.push({
        id: mov6v.id,
        code: '05100004',
        inventory_id: 'r4x7h1kh7v2rldb',
        before_quantity: beforeQty,
        after_quantity: 3,
      })
      console.log('[MIGRATION 0142] Movimento 6vzcu71y0qjj0xe corrigido para 3 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir movimento 6vzcu71y0qjj0xe: ' + e)
    }

    // 4.2 Movimento de saída wemzopl969f5pv1 (inventário pvvaz2lsukbx55b, código 05100105)
    // Reduzir saída de 20 para 10 un (falta real da OP).
    try {
      const movWe = app.findRecordById('inventory_movements', 'wemzopl969f5pv1')
      const beforeQty = movWe.getInt('quantity')
      movWe.set('quantity', 10)
      const curReas = movWe.getString('reason') || ''
      movWe.set(
        'reason',
        curReas +
          ' [Reconciliação Geral: saída corrigida de 20 para 10 un conforme falta real da OP 483/2026]',
      )
      app.save(movWe)
      report.inventory_movements_adjusted.push({
        id: movWe.id,
        code: '05100105',
        inventory_id: 'pvvaz2lsukbx55b',
        before_quantity: beforeQty,
        after_quantity: 10,
      })
      console.log('[MIGRATION 0142] Movimento wemzopl969f5pv1 corrigido para 10 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir movimento wemzopl969f5pv1: ' + e)
    }

    // 4.3 Movimento de saída untfumtgm6nr8ob (inventário 405o4yorf74tetp, código 05100263)
    // Reduzir saída de 50 para 4 un (falta real da OP).
    try {
      const movUn = app.findRecordById('inventory_movements', 'untfumtgm6nr8ob')
      const beforeQty = movUn.getInt('quantity')
      movUn.set('quantity', 4)
      const curReas = movUn.getString('reason') || ''
      movUn.set(
        'reason',
        curReas +
          ' [Reconciliação Geral: saída corrigida de 50 para 4 un conforme falta real da OP 483/2026]',
      )
      app.save(movUn)
      report.inventory_movements_adjusted.push({
        id: movUn.id,
        code: '05100263',
        inventory_id: '405o4yorf74tetp',
        before_quantity: beforeQty,
        after_quantity: 4,
      })
      console.log('[MIGRATION 0142] Movimento untfumtgm6nr8ob corrigido para 4 un.')
    } catch (e) {
      console.log('[MIGRATION 0142] Erro ao corrigir movimento untfumtgm6nr8ob: ' + e)
    }

    // -------------------------------------------------------------------------
    // BLOCO 5: REPROCESSAR CADEIA DE BALANCE_AFTER E SALDO FINAL DE TODOS OS INVENTÁRIOS
    // Varrer TODOS os itens de inventory, ordenar seus movimentos por created asc,
    // recalcular balance_after rigorosamente: runningBalance += Entrada / -= Saída.
    // Atualizar quantity do inventário para coincidir perfeitamente com a soma/saldo final.
    // -------------------------------------------------------------------------
    try {
      const allInventory = app.findRecordsByFilter('inventory', '1=1', 'created', 1000, 0)
      console.log(
        '[MIGRATION 0142] Varrendo ' +
          allInventory.length +
          ' itens de estoque para verificar consistência...',
      )

      for (let i = 0; i < allInventory.length; i++) {
        const inv = allInventory[i]
        const invId = inv.id
        const invCode = inv.getString('code')
        const currentInvQty = inv.getFloat('quantity') || 0

        const movements = app.findRecordsByFilter(
          'inventory_movements',
          'inventory_id = "' + invId + '"',
          'created',
          1000,
          0,
        )

        let running = 0
        let movementsUpdated = 0

        for (let m = 0; m < movements.length; m++) {
          const mov = movements[m]
          const mType = mov.getString('type')
          const mQty = mov.getFloat('quantity') || 0
          const oldBal = mov.getFloat('balance_after')

          if (mType === 'Entrada') {
            running += mQty
          } else {
            running -= mQty
          }
          running = Math.round(running * 1000) / 1000

          if (oldBal !== running) {
            mov.set('balance_after', running)
            app.save(mov)
            movementsUpdated++
          }
        }

        // Se houver movimentos, o saldo final do item DEVE ser o running.
        // Se NÃO houver movimentos, o saldo final permanece como está (a menos que tenha divergência declarada).
        if (movements.length > 0 && Math.abs(currentInvQty - running) > 0.0001) {
          inv.set('quantity', running)
          app.save(inv)
          report.inventory_balances_corrected.push({
            inventory_id: invId,
            code: invCode,
            before_quantity: currentInvQty,
            after_quantity: running,
            movements_count: movements.length,
            movements_recalculated: movementsUpdated,
          })
          console.log(
            '[MIGRATION 0142] Inventário ' +
              invCode +
              ' (' +
              invId +
              ') corrigido de ' +
              currentInvQty +
              ' para ' +
              running +
              ' (' +
              movementsUpdated +
              ' movimentos recalculados)',
          )
        } else if (movementsUpdated > 0) {
          console.log(
            '[MIGRATION 0142] Inventário ' +
              invCode +
              ': ' +
              movementsUpdated +
              ' movimentos recalculados, saldo já compatível (' +
              running +
              ').',
          )
        }
      }
    } catch (e) {
      console.log('[MIGRATION 0142] Erro no Bloco 5 (reprocessamento de inventários): ' + e)
    }

    // -------------------------------------------------------------------------
    // BLOCO 6: LIMPEZA DE DESCRIÇÕES POLUÍDAS COM SUFIXO '(OPs: ...)'
    // Remover o sufixo contaminado tanto em inventory quanto em components.
    // -------------------------------------------------------------------------
    try {
      // 6.1 Limpar na coleção inventory
      const pollutedInv = app.findRecordsByFilter(
        'inventory',
        "description ~ '(OPs:' || description ~ '(OP:'",
        '',
        200,
        0,
      )
      for (let p = 0; p < pollutedInv.length; p++) {
        const item = pollutedInv[p]
        const oldDesc = item.getString('description')
        const cleaned = oldDesc.replace(/\s*\(OPs?:[^\)]+\)/gi, '').trim()
        if (cleaned && cleaned !== oldDesc) {
          item.set('description', cleaned)
          app.save(item)
          report.inventory_descriptions_cleaned.push({
            collection: 'inventory',
            id: item.id,
            code: item.getString('code'),
            before: oldDesc,
            after: cleaned,
          })
          console.log(
            '[MIGRATION 0142] Descrição de estoque limpa: ' +
              item.getString('code') +
              ' -> ' +
              cleaned,
          )
        }
      }

      // 6.2 Limpar na coleção components
      const pollutedComp = app.findRecordsByFilter(
        'components',
        "description ~ '(OPs:' || description ~ '(OP:'",
        '',
        200,
        0,
      )
      for (let c = 0; c < pollutedComp.length; c++) {
        const item = pollutedComp[c]
        const oldDesc = item.getString('description')
        const cleaned = oldDesc.replace(/\s*\(OPs?:[^\)]+\)/gi, '').trim()
        if (cleaned && cleaned !== oldDesc) {
          item.set('description', cleaned)
          app.save(item)
          report.inventory_descriptions_cleaned.push({
            collection: 'components',
            id: item.id,
            code: item.getString('code'),
            before: oldDesc,
            after: cleaned,
          })
          console.log(
            '[MIGRATION 0142] Descrição de componente limpa: ' +
              item.getString('code') +
              ' -> ' +
              cleaned,
          )
        }
      }
    } catch (e) {
      console.log('[MIGRATION 0142] Erro no Bloco 6 (limpeza de descrições): ' + e)
    }

    // -------------------------------------------------------------------------
    // BLOCO 7: RELATÓRIO ANTES / DEPOIS COMPLETO
    // -------------------------------------------------------------------------
    console.log('[MIGRATION 0142] === RELATÓRIO COMPLETO ANTES / DEPOIS ===')
    console.log(JSON.stringify(report, null, 2))
    console.log('[MIGRATION 0142] === FIM DA AUDITORIA GERAL ===')
  },
  (app) => {
    console.log(
      '[MIGRATION 0142] Reversão (down) não implementada para migration de auditoria/reconciliação.',
    )
  },
)
