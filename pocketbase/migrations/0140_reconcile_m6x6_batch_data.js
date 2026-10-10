migrate(
  (app) => {
    console.log('[MIGRATION 0140] === INÍCIO DA RECONCILIAÇÃO LOTE M6X6 (05100030) ===')
    const report = {
      step1_7gik8p6htqja7u3: null,
      step2_zdl6nl8pmt45op4: null,
      step3_inventory_movements: [],
      step3_inventory_balance: null,
      step4_oc_itens: [],
      step4_ordens_compra: [],
    }

    // -------------------------------------------------------------------------
    // PASSO 1: material_shortages 7gik8p6htqja7u3 (falta da OP 000488/2026)
    // quantity=4, received_quantity=4, status='Recebido'
    // observação explicando a correção
    // -------------------------------------------------------------------------
    try {
      const rec7g = app.findRecordById('material_shortages', '7gik8p6htqja7u3')
      const before7g = {
        id: rec7g.id,
        quantity: rec7g.getInt('quantity'),
        received_quantity: rec7g.getInt('received_quantity'),
        status: rec7g.getString('status'),
        observation: rec7g.getString('observation'),
      }

      rec7g.set('quantity', 4)
      rec7g.set('received_quantity', 4)
      rec7g.set('status', 'Recebido')
      const currentObs = rec7g.getString('observation') || ''
      const corrObs =
        'Reconciliação Rodada A: quantidade corrigida de 50 para 4 (valor real da falta da OP 000488/2026, havia sido inflado indevidamente no modal de Compra).'
      rec7g.set('observation', currentObs ? currentObs + ' | ' + corrObs : corrObs)
      app.save(rec7g)

      report.step1_7gik8p6htqja7u3 = {
        before: before7g,
        after: {
          id: rec7g.id,
          quantity: rec7g.getInt('quantity'),
          received_quantity: rec7g.getInt('received_quantity'),
          status: rec7g.getString('status'),
          observation: rec7g.getString('observation'),
        },
      }
      console.log(
        '[MIGRATION 0140] Passo 1 concluído: 7gik8p6htqja7u3 quantity ' +
          before7g.quantity +
          ' -> 4, received_quantity ' +
          before7g.received_quantity +
          ' -> 4, status Recebido',
      )
    } catch (e) {
      console.log('[MIGRATION 0140] Erro no Passo 1 (7gik8p6htqja7u3): ' + e)
    }

    // -------------------------------------------------------------------------
    // PASSO 2: zdl6nl8pmt45op4 (linha de compra de 50 para estoque)
    // mantém/garante status='Recebido', received_quantity=50
    // observação explicando a regularização
    // -------------------------------------------------------------------------
    try {
      const recZdl = app.findRecordById('material_shortages', 'zdl6nl8pmt45op4')
      const beforeZdl = {
        id: recZdl.id,
        quantity: recZdl.getInt('quantity'),
        received_quantity: recZdl.getInt('received_quantity'),
        status: recZdl.getString('status'),
        observation: recZdl.getString('observation'),
      }

      recZdl.set('quantity', 50)
      recZdl.set('received_quantity', 50)
      recZdl.set('status', 'Recebido')
      const currentObsZdl = recZdl.getString('observation') || ''
      const corrObsZdl =
        'Reconciliação Rodada A: compra real de 50 un para estoque regularizada como Recebido (received_quantity=50).'
      recZdl.set('observation', currentObsZdl ? currentObsZdl + ' | ' + corrObsZdl : corrObsZdl)
      app.save(recZdl)

      report.step2_zdl6nl8pmt45op4 = {
        before: beforeZdl,
        after: {
          id: recZdl.id,
          quantity: recZdl.getInt('quantity'),
          received_quantity: recZdl.getInt('received_quantity'),
          status: recZdl.getString('status'),
          observation: recZdl.getString('observation'),
        },
      }
      console.log(
        '[MIGRATION 0140] Passo 2 concluído: zdl6nl8pmt45op4 status ' +
          beforeZdl.status +
          ' -> Recebido, received_quantity ' +
          beforeZdl.received_quantity +
          ' -> 50',
      )
    } catch (e) {
      console.log('[MIGRATION 0140] Erro no Passo 2 (zdl6nl8pmt45op4): ' + e)
    }

    // -------------------------------------------------------------------------
    // PASSO 3: Corrigir movimento de saída hh0b29y56s3o37i de 50 para 4
    // Reprocessar a cadeia de balance_after dos movimentos subsequentes do item
    // Saldo final do inventário qqrn566sxcodwnq deve ficar 38
    // (Entrada 50 − saídas 21: 1+14+2+4 = 38; saldo anterior era 9, 9+50-21=38)
    // -------------------------------------------------------------------------
    try {
      const movHh = app.findRecordById('inventory_movements', 'hh0b29y56s3o37i')
      const beforeHh = {
        id: movHh.id,
        quantity: movHh.getInt('quantity'),
        balance_after: movHh.getInt('balance_after'),
        reason: movHh.getString('reason'),
      }

      movHh.set('quantity', 4)
      const currentReason = movHh.getString('reason') || ''
      const corrReason =
        ' [Reconciliação Rodada A: saída corrigida de 50 para 4 conforme falta real da OP 000488/2026]'
      movHh.set('reason', currentReason + corrReason)
      app.save(movHh)

      console.log(
        '[MIGRATION 0140] Movimento hh0b29y56s3o37i atualizado: quantity ' +
          beforeHh.quantity +
          ' -> 4',
      )

      // Reprocessar TODOS os movimentos do inventário qqrn566sxcodwnq em ordem cronológica de created
      const allMovements = app.findRecordsByFilter(
        'inventory_movements',
        'inventory_id = "qqrn566sxcodwnq"',
        'created',
        500,
        0,
      )

      let runningBalance = 0
      for (let i = 0; i < allMovements.length; i++) {
        const mov = allMovements[i]
        const mType = mov.getString('type')
        const mQty = mov.getInt('quantity')
        const oldBalance = mov.getInt('balance_after')

        if (mType === 'Entrada') {
          runningBalance += mQty
        } else {
          runningBalance -= mQty
        }

        if (oldBalance !== runningBalance) {
          report.step3_inventory_movements.push({
            id: mov.id,
            type: mType,
            quantity: mQty,
            balance_after_before: oldBalance,
            balance_after_after: runningBalance,
          })
          mov.set('balance_after', runningBalance)
          app.save(mov)
        }
      }

      // Atualizar saldo final na tabela inventory
      const invRec = app.findRecordById('inventory', 'qqrn566sxcodwnq')
      const beforeInvQty = invRec.getInt('quantity')
      invRec.set('quantity', runningBalance)
      app.save(invRec)

      report.step3_inventory_balance = {
        inventory_id: 'qqrn566sxcodwnq',
        code: invRec.getString('code'),
        before_quantity: beforeInvQty,
        after_quantity: runningBalance,
      }
      console.log(
        '[MIGRATION 0140] Passo 3 concluído: Saldo do inventário qqrn566sxcodwnq ' +
          beforeInvQty +
          ' -> ' +
          runningBalance +
          ' (movimentos recalculados: ' +
          report.step3_inventory_movements.length +
          ')',
      )
    } catch (e) {
      console.log('[MIGRATION 0140] Erro no Passo 3 (movimentos/inventário): ' + e)
    }

    // -------------------------------------------------------------------------
    // PASSO 4: Nas duas OCs, remover/cancelar o item da compra inflada com observação,
    // preservando a OC real de 50.
    // Analisando as duas OCs:
    // - OC sihug4pcy0dl1cl (OC 38919, status Recebida):
    //   Contém o item rjvx9ui61tdj9ve vinculado a 7gik8p6htqja7u3 (a falta inflada para 50).
    //   Ajustamos o item rjvx9ui61tdj9ve:
    //   quantity=4, total = 4 * 0.357 = 1.428 (arredondado para 1.43).
    //   O total da OC 38919 cai de 33.44 para: 33.44 - 17.85 + 1.43 = 17.02.
    // - OC fr6wz84tdt4tf9o (OC 38920, status Pendente):
    //   Contém dgfrt66tfjhjycj (vinculado a zdl6nl8pmt45op4, 50 un a 0.357 = 17.85).
    //   Como zdl6nl8pmt45op4 é a compra real de 50 já recebida via entrada no lote de 09/10,
    //   a inclusão de dgfrt66tfjhjycj na OC 38920 foi a duplicação inflada.
    //   Removemos o item duplicado dgfrt66tfjhjycj da OC 38920.
    //   O total da OC 38920 cai de 34.42 para 34.42 - 17.85 = 16.57.
    //   Adicionamos nota explicativa em delivery_terms da OC 38920.
    // -------------------------------------------------------------------------
    try {
      // 4.1 Corrigir item rjvx9ui61tdj9ve na OC sihug4pcy0dl1cl (OC 38919)
      try {
        const itemRj = app.findRecordById('ordem_compra_itens', 'rjvx9ui61tdj9ve')
        const beforeRj = {
          id: itemRj.id,
          oc_id: itemRj.getString('oc_id'),
          quantity: itemRj.getInt('quantity'),
          unit_price: itemRj.getFloat('unit_price'),
          total: itemRj.getFloat('total'),
          description: itemRj.getString('description'),
        }

        const newQtyRj = 4
        const unitPriceRj = itemRj.getFloat('unit_price') || 0.357
        const newTotalRj = Math.round(newQtyRj * unitPriceRj * 100) / 100
        itemRj.set('quantity', newQtyRj)
        itemRj.set('total', newTotalRj)
        const curDescRj = itemRj.getString('description') || ''
        itemRj.set(
          'description',
          curDescRj + ' [Corrigido de 50 para 4 un na Reconciliação Rodada A — OP 000488/2026]',
        )
        app.save(itemRj)

        report.step4_oc_itens.push({
          action: 'ajustado_quantidade_e_total',
          item_id: itemRj.id,
          oc_id: beforeRj.oc_id,
          before: beforeRj,
          after: {
            quantity: newQtyRj,
            total: newTotalRj,
          },
        })

        // Recalcular total da OC sihug4pcy0dl1cl
        const oc1 = app.findRecordById('ordens_de_compra', 'sihug4pcy0dl1cl')
        const beforeOc1Total = oc1.getFloat('total')
        const oc1Itens = app.findRecordsByFilter(
          'ordem_compra_itens',
          'oc_id = "sihug4pcy0dl1cl"',
          'created',
          100,
          0,
        )
        let calcOc1Total = 0
        for (let j = 0; j < oc1Itens.length; j++) {
          calcOc1Total += oc1Itens[j].getFloat('total') || 0
        }
        calcOc1Total = Math.round(calcOc1Total * 100) / 100
        oc1.set('total', calcOc1Total)
        const curDeliveryTerms1 = oc1.getString('delivery_terms') || ''
        const noteOc1 =
          '[Reconciliação Rodada A: item 05100030 corrigido de 50 para 4 un (OP 000488). Total ajustado de ' +
          beforeOc1Total +
          ' para ' +
          calcOc1Total +
          ']'
        oc1.set('delivery_terms', curDeliveryTerms1 ? curDeliveryTerms1 + ' | ' + noteOc1 : noteOc1)
        app.save(oc1)

        report.step4_ordens_compra.push({
          oc_id: oc1.id,
          oc_number: oc1.getString('oc_number'),
          before_total: beforeOc1Total,
          after_total: calcOc1Total,
          status: oc1.getString('status'),
        })
        console.log(
          '[MIGRATION 0140] OC 38919 (sihug4pcy0dl1cl) total atualizado: ' +
            beforeOc1Total +
            ' -> ' +
            calcOc1Total,
        )
      } catch (e1) {
        console.log('[MIGRATION 0140] Erro ao ajustar item rjvx9ui61tdj9ve / OC 38919: ' + e1)
      }

      // 4.2 Remover/cancelar item dgfrt66tfjhjycj na OC fr6wz84tdt4tf9o (OC 38920)
      try {
        const itemDg = app.findRecordById('ordem_compra_itens', 'dgfrt66tfjhjycj')
        const beforeDg = {
          id: itemDg.id,
          oc_id: itemDg.getString('oc_id'),
          code: itemDg.getString('code'),
          quantity: itemDg.getInt('quantity'),
          total: itemDg.getFloat('total'),
        }

        // Remover o item duplicado da OC
        app.delete(itemDg)

        report.step4_oc_itens.push({
          action: 'removido_item_duplicado',
          item_id: beforeDg.id,
          oc_id: beforeDg.oc_id,
          before: beforeDg,
        })
        console.log(
          '[MIGRATION 0140] Item duplicado dgfrt66tfjhjycj removido da OC fr6wz84tdt4tf9o',
        )

        // Recalcular total da OC fr6wz84tdt4tf9o
        const oc2 = app.findRecordById('ordens_de_compra', 'fr6wz84tdt4tf9o')
        const beforeOc2Total = oc2.getFloat('total')
        const oc2Itens = app.findRecordsByFilter(
          'ordem_compra_itens',
          'oc_id = "fr6wz84tdt4tf9o"',
          'created',
          100,
          0,
        )
        let calcOc2Total = 0
        for (let k = 0; k < oc2Itens.length; k++) {
          calcOc2Total += oc2Itens[k].getFloat('total') || 0
        }
        calcOc2Total = Math.round(calcOc2Total * 100) / 100
        oc2.set('total', calcOc2Total)
        const curDeliveryTerms2 = oc2.getString('delivery_terms') || ''
        const noteOc2 =
          '[Reconciliação Rodada A: removido item duplicado 05100030 de 50 un (zdl6nl8pmt45op4 já recebido na remessa de 09/10). Total ajustado de ' +
          beforeOc2Total +
          ' para ' +
          calcOc2Total +
          ']'
        oc2.set('delivery_terms', curDeliveryTerms2 ? curDeliveryTerms2 + ' | ' + noteOc2 : noteOc2)
        app.save(oc2)

        report.step4_ordens_compra.push({
          oc_id: oc2.id,
          oc_number: oc2.getString('oc_number'),
          before_total: beforeOc2Total,
          after_total: calcOc2Total,
          status: oc2.getString('status'),
        })
        console.log(
          '[MIGRATION 0140] OC 38920 (fr6wz84tdt4tf9o) total atualizado: ' +
            beforeOc2Total +
            ' -> ' +
            calcOc2Total,
        )
      } catch (e2) {
        console.log('[MIGRATION 0140] Erro ao remover dgfrt66tfjhjycj / atualizar OC 38920: ' + e2)
      }
    } catch (e) {
      console.log('[MIGRATION 0140] Erro no Passo 4 (OCs): ' + e)
    }

    // -------------------------------------------------------------------------
    // PASSO 5: Relatório do antes/depois de cada valor tocado
    // -------------------------------------------------------------------------
    console.log('[MIGRATION 0140] === RELATÓRIO ANTES / DEPOIS DA RECONCILIAÇÃO ===')
    console.log(JSON.stringify(report, null, 2))
    console.log('[MIGRATION 0140] === FIM DA RECONCILIAÇÃO LOTE M6X6 ===')
  },
  (app) => {
    // Reversão (down)
    console.log('[MIGRATION 0140] Reversão não implementada (migration de reconciliação de dados).')
  },
)
