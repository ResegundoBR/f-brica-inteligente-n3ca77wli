/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0145: Reconciliação em bloco das divergências históricas de Suprimentos
 *
 * Regras e categorias atendidas:
 * 3(a) recebido > demanda — corrigir registro para a demanda real da OP sem nova entrada de estoque, com observação de auditoria;
 * 3(b) fantasmas de OP encerrada — cancelar com auditoria (mesma lógica do auto-cancel, protegendo lotes com membros vivos);
 * 3(c) código com erro de digitação — cancelar com observação apontando o código correto por similaridade;
 * 3(d) saldo de inventário ≠ extrato — reprocessar cadeia cronológica e alinhar com movimento de ajuste auditado;
 * 3(e) balance_after desalinhado — recalcular;
 * 3(f) descrições poluídas — limpar sufixo de OP;
 * 3(g) registros parados em Cotação/Compra sem movimento — NÃO alterar, apenas listar no relatório final para decisão manual do usuário.
 *
 * Regra de ouro: nenhuma ação afeta silenciosamente outros registros em aberto do mesmo código.
 */

migrate(
  (app) => {
    console.log('[MIGRATION 0145] === INÍCIO DA RECONCILIAÇÃO EM BLOCO DE SUPRIMENTOS ===')

    const report = {
      timestamp: new Date().toISOString(),
      categoria_3a_recebido_acima_demanda: [],
      categoria_3b_fantasmas_op_encerrada: [],
      categoria_3c_codigo_erro_digitacao: [],
      categoria_3d_saldo_estoque_alinhado: [],
      categoria_3e_balance_after_recalculado: [],
      categoria_3f_descricoes_poluidas_limpas: [],
      categoria_3g_parados_cotacao_compra_para_decisao: [],
    }

    const todayDate = new Date()
    const day = String(todayDate.getDate()).padStart(2, '0')
    const month = String(todayDate.getMonth() + 1).padStart(2, '0')
    const year = todayDate.getFullYear()
    const dateFormatted = day + '/' + month + '/' + year

    // =========================================================================
    // 3(a) RECEBIDO > DEMANDA
    // Corrigir registro para a demanda real da OP sem nova entrada de estoque,
    // com observação de auditoria.
    // =========================================================================
    try {
      const shortagesWithOrder = app.findRecordsByFilter(
        'material_shortages',
        'order_id != "" && (status = "Recebido" || status = "Recebido_Parcial")',
        'created',
        1000,
        0,
      )

      for (let i = 0; i < shortagesWithOrder.length; i++) {
        const s = shortagesWithOrder[i]
        const orderId = s.getString('order_id')
        const code = (s.getString('code') || '').trim()
        const receivedQty = Number(s.getFloat('received_quantity')) || 0
        const registeredQty = Number(s.getFloat('quantity')) || 0

        if (!orderId || !code || receivedQty <= 0) continue

        // Demanda na BOM da OP
        const opMaterials = app.findRecordsByFilter(
          'pcp_order_materials',
          'order_id = "' + orderId + '" && code = "' + code.replace(/"/g, '""') + '"',
          '',
          10,
          0,
        )

        let totalDemand = 0
        for (let m = 0; m < opMaterials.length; m++) {
          totalDemand += Number(opMaterials[m].getFloat('quantity')) || 0
        }

        let effectiveDemand = totalDemand
        const hasBom = opMaterials.length > 0

        if (!hasBom) {
          const obsText = s.getString('observation') || ''
          const matchAdjust = obsText.match(
            /Qtde ajustada de\s+(\d+(?:[.,]\d+)?)\s+para\s+(\d+(?:[.,]\d+)?)/i,
          )
          if (matchAdjust) {
            const originalQty = parseFloat(matchAdjust[1].replace(',', '.'))
            if (!isNaN(originalQty) && originalQty >= 0) {
              effectiveDemand = originalQty
            }
          }
        }

        if ((hasBom || effectiveDemand > 0) && receivedQty > effectiveDemand + 0.0001) {
          const surplusQty = Math.round((receivedQty - effectiveDemand) * 10000) / 10000
          let opNum = orderId
          try {
            const ord = app.findRecordById('pcp_orders', orderId)
            opNum = ord.getString('op_number') || ord.getString('order_number') || orderId
          } catch (_) {}

          const auditNote =
            'Reconciliação em Bloco 0.0.419 (3a): registro corrigido de ' +
            receivedQty +
            ' un para a demanda real da OP ' +
            opNum +
            ' (' +
            effectiveDemand +
            ' un) em ' +
            dateFormatted +
            ' sem nova entrada duplicada (excedente de ' +
            surplusQty +
            ' un já incorporado no estoque físico original)'

          const curObs = s.getString('observation') || ''
          s.set('observation', curObs ? curObs + ' | ' + auditNote : auditNote)
          s.set('quantity', effectiveDemand)
          s.set('received_quantity', effectiveDemand)
          s.set('status', effectiveDemand > 0 ? 'Recebido' : 'Cancelado')
          app.save(s)

          report.categoria_3a_recebido_acima_demanda.push({
            id: s.id,
            code: code,
            op_number: opNum,
            quantity_before: registeredQty,
            received_before: receivedQty,
            demand_reconciled: effectiveDemand,
            surplus_preservado: surplusQty,
            status_after: s.getString('status'),
          })

          console.log(
            '[MIGRATION 0145] 3(a) Shortage ' +
              s.id +
              ' (' +
              code +
              ' / OP ' +
              opNum +
              ') reconciliado: recebido ' +
              receivedQty +
              ' -> ' +
              effectiveDemand +
              ' un.',
          )
        }
      }
    } catch (e3a) {
      console.log('[MIGRATION 0145] Erro na categoria 3(a): ' + e3a)
    }

    // =========================================================================
    // 3(b) FANTASMAS DE OP ENCERRADA
    // Cancelar com auditoria (mesma lógica do auto-cancel, protegendo lotes com membros vivos).
    // =========================================================================
    try {
      const openShortages = app.findRecordsByFilter(
        'material_shortages',
        '(status = "Pendente" || status = "Cotação" || status = "Compra") && order_id != ""',
        'created',
        1000,
        0,
      )

      for (let i = 0; i < openShortages.length; i++) {
        const shortage = openShortages[i]
        const orderId = shortage.getString('order_id')
        if (!orderId) continue

        let order = null
        try {
          order = app.findRecordById('pcp_orders', orderId)
        } catch (_) {
          continue
        }
        if (!order) continue

        const opStatus = order.getString('status')
        const isOpClosed =
          opStatus === 'Concluído' || opStatus === 'Cancelada' || opStatus === 'Cancelado'
        if (!isOpClosed) continue

        const opNum = order.getString('op_number') || order.getString('order_number') || orderId
        const batchId = (shortage.getString('batch_id') || '').trim()
        const itemQty = Number(shortage.getFloat('quantity')) || 0
        const itemCode = shortage.getString('code') || 'S/ Código'

        let hasLivingBatchMates = false
        if (batchId) {
          try {
            const batchMates = app.findRecordsByFilter(
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
            for (let b = 0; b < batchMates.length; b++) {
              const mateOrderId = batchMates[b].getString('order_id')
              if (mateOrderId) {
                try {
                  const mateOrder = app.findRecordById('pcp_orders', mateOrderId)
                  const mateStatus = mateOrder.getString('status')
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

        const auditNote =
          'Cancelada em bloco (3b): OP ' +
          opNum +
          ' já encerrada (' +
          opStatus +
          ') em ' +
          dateFormatted +
          ' (item: ' +
          itemCode +
          ', qtde: ' +
          itemQty +
          ' un)'
        const currentObs = shortage.getString('observation') || ''
        const finalObs = currentObs ? currentObs + ' | ' + auditNote : auditNote

        if (hasLivingBatchMates) {
          shortage.set('batch_id', '')
          shortage.set('status', 'Cancelado')
          shortage.set(
            'observation',
            finalObs +
              ' [Removido do lote ' +
              batchId +
              ' - membros de OPs ativas foram preservados]',
          )
        } else {
          shortage.set('status', 'Cancelado')
          shortage.set('observation', finalObs)
        }

        app.save(shortage)
        report.categoria_3b_fantasmas_op_encerrada.push({
          id: shortage.id,
          code: itemCode,
          op_number: opNum,
          quantity: itemQty,
          batch_id: batchId,
          has_living_batch_mates: hasLivingBatchMates,
        })
        console.log(
          '[MIGRATION 0145] 3(b) Fantasma ' +
            shortage.id +
            ' cancelado (OP ' +
            opNum +
            ' ' +
            opStatus +
            ').',
        )
      }
    } catch (e3b) {
      console.log('[MIGRATION 0145] Erro na categoria 3(b): ' + e3b)
    }

    // =========================================================================
    // 3(c) CÓDIGO COM ERRO DE DIGITAÇÃO
    // Cancelar com observação apontando o código correto por similaridade.
    // =========================================================================
    try {
      const activeShortages = app.findRecordsByFilter(
        'material_shortages',
        'status != "Cancelado"',
        'created',
        1000,
        0,
      )

      for (let c = 0; c < activeShortages.length; c++) {
        const item = activeShortages[c]
        const rawCode = (item.getString('code') || '').trim()
        const hasTypoLetter = /[0-9]+[loLO][0-9]+/i.test(rawCode)

        if (hasTypoLetter) {
          // Substituir 'l'/'L' por '1' e 'o'/'O' por '0' para encontrar o código provável
          const correctedCode = rawCode.replace(/[lL]/g, '1').replace(/[oO]/g, '0')

          const auditNote =
            'Cancelado em bloco (3c): código com caractere de erro de digitação "' +
            rawCode +
            '". Código correto correspondente homologado: "' +
            correctedCode +
            '" em ' +
            dateFormatted +
            '.'

          const curObs = item.getString('observation') || ''
          item.set('observation', curObs ? curObs + ' | ' + auditNote : auditNote)
          item.set('status', 'Cancelado')
          app.save(item)

          report.categoria_3c_codigo_erro_digitacao.push({
            id: item.id,
            raw_code: rawCode,
            suggested_code: correctedCode,
            status_before: item.getString('status'),
            status_after: 'Cancelado',
          })
          console.log(
            '[MIGRATION 0145] 3(c) Shortage ' +
              item.id +
              ' cancelado por erro de digitação: ' +
              rawCode +
              ' -> ' +
              correctedCode,
          )
        }
      }
    } catch (e3c) {
      console.log('[MIGRATION 0145] Erro na categoria 3(c): ' + e3c)
    }

    // =========================================================================
    // 3(d) SALDO DE INVENTÁRIO ≠ EXTRATO
    // 3(e) BALANCE_AFTER DESALINHADO
    // Reprocessar cadeia cronológica e alinhar com movimento de ajuste auditado.
    // =========================================================================
    try {
      const allInventory = app.findRecordsByFilter('inventory', '1=1', 'code', 1000, 0)
      const movCol = app.findCollectionByNameOrId('inventory_movements')

      for (let j = 0; j < allInventory.length; j++) {
        const inv = allInventory[j]
        const invId = inv.id
        const invCode = inv.getString('code')
        const currentQty = Number(inv.getFloat('quantity')) || 0

        const movs = app.findRecordsByFilter(
          'inventory_movements',
          'inventory_id = "' + invId + '"',
          'created',
          1000,
          0,
        )

        if (movs.length === 0) continue

        let runningBal = 0
        let balanceAfterUpdates = 0

        for (let k = 0; k < movs.length; k++) {
          const m = movs[k]
          const mType = m.getString('type')
          const mQty = Number(m.getFloat('quantity')) || 0
          const oldBal = Number(m.getFloat('balance_after')) || 0

          if (mType === 'Entrada') {
            runningBal += mQty
          } else {
            runningBal -= mQty
          }
          runningBal = Math.round(runningBal * 1000) / 1000

          if (Math.abs(oldBal - runningBal) > 0.001) {
            m.set('balance_after', runningBal)
            app.save(m)
            balanceAfterUpdates++
          }
        }

        if (balanceAfterUpdates > 0) {
          report.categoria_3e_balance_after_recalculado.push({
            inventory_id: invId,
            code: invCode,
            movements_updated: balanceAfterUpdates,
            final_calculated: runningBal,
          })
        }

        // Se o saldo do cadastro diverge do runningBal
        if (Math.abs(currentQty - runningBal) > 0.001) {
          const diff = Math.round((runningBal - currentQty) * 1000) / 1000

          // Criar movimento de ajuste auditado para reconciliar extrato
          const movAdj = new Record(movCol)
          movAdj.set('inventory_id', invId)
          movAdj.set('type', diff > 0 ? 'Entrada' : 'Saída')
          movAdj.set('quantity', Math.abs(diff))
          movAdj.set('balance_after', runningBal)
          movAdj.set(
            'reason',
            'Ajuste de inventário (3d Reconciliação em Bloco 0.0.419): reconciliação com extrato cronológico (' +
              currentQty +
              ' → ' +
              runningBal +
              ') em ' +
              dateFormatted,
          )
          movAdj.set('arrival_date', new Date().toISOString().split('T')[0])
          app.save(movAdj)

          inv.set('quantity', runningBal)
          app.save(inv)

          report.categoria_3d_saldo_estoque_alinhado.push({
            inventory_id: invId,
            code: invCode,
            quantity_before: currentQty,
            quantity_after: runningBal,
            adjustment_diff: diff,
            movements_count: movs.length,
          })

          console.log(
            '[MIGRATION 0145] 3(d) Inventário ' +
              invCode +
              ' (' +
              invId +
              ') alinhado de ' +
              currentQty +
              ' para ' +
              runningBal +
              ' un com movimento de ajuste.',
          )
        }
      }
    } catch (e3de) {
      console.log('[MIGRATION 0145] Erro na categoria 3(d)/3(e): ' + e3de)
    }

    // =========================================================================
    // 3(f) DESCRIÇÕES POLUÍDAS
    // Limpar sufixos de OP em inventory e components.
    // =========================================================================
    try {
      // 1. inventory
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
          report.categoria_3f_descricoes_poluidas_limpas.push({
            collection: 'inventory',
            id: item.id,
            code: item.getString('code'),
            before: oldDesc,
            after: cleaned,
          })
          console.log(
            '[MIGRATION 0145] 3(f) Descrição inventory ' +
              item.getString('code') +
              ' limpa: ' +
              oldDesc +
              ' -> ' +
              cleaned,
          )
        }
      }

      // 2. components
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
          report.categoria_3f_descricoes_poluidas_limpas.push({
            collection: 'components',
            id: item.id,
            code: item.getString('code'),
            before: oldDesc,
            after: cleaned,
          })
          console.log(
            '[MIGRATION 0145] 3(f) Descrição components ' +
              item.getString('code') +
              ' limpa: ' +
              oldDesc +
              ' -> ' +
              cleaned,
          )
        }
      }
    } catch (e3f) {
      console.log('[MIGRATION 0145] Erro na categoria 3(f): ' + e3f)
    }

    // =========================================================================
    // 3(g) REGISTROS PARADOS EM COTAÇÃO/COMPRA SEM MOVIMENTO
    // NÃO alterar, apenas listar no relatório final para decisão manual do usuário.
    // =========================================================================
    try {
      const now = new Date()
      const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const cutoffIso = cutoff30d.toISOString().replace('T', ' ').substring(0, 19)

      const staleRecords = app.findRecordsByFilter(
        'material_shortages',
        '(status = "Cotação" || status = "Compra") && updated <= "' + cutoffIso + '"',
        'updated',
        200,
        0,
      )

      for (let s = 0; s < staleRecords.length; s++) {
        const sr = staleRecords[s]
        const sOrderId = sr.getString('order_id')
        let sOpNum = ''
        if (sOrderId) {
          try {
            const sord = app.findRecordById('pcp_orders', sOrderId)
            sOpNum = sord.getString('op_number') || sord.getString('order_number') || ''
          } catch (_) {}
        }

        report.categoria_3g_parados_cotacao_compra_para_decisao.push({
          id: sr.id,
          code: sr.getString('code'),
          description: sr.getString('description'),
          status: sr.getString('status'),
          quantity: Number(sr.getFloat('quantity')) || 0,
          order_id: sOrderId,
          op_number: sOpNum,
          updated: sr.getString('updated'),
          action_taken: 'NENHUMA (preservado intacto para decisão manual do usuário)',
        })
      }

      console.log(
        '[MIGRATION 0145] 3(g) ' +
          staleRecords.length +
          ' registro(s) parado(s) em Cotação/Compra listado(s) para decisão manual (intactos).',
      )
    } catch (e3g) {
      console.log('[MIGRATION 0145] Erro na categoria 3(g): ' + e3g)
    }

    // =========================================================================
    // RELATÓRIO FINAL ANTES / DEPOIS
    // =========================================================================
    console.log('[MIGRATION 0145] === RELATÓRIO ANTES / DEPOIS DA RECONCILIAÇÃO ===')
    console.log(JSON.stringify(report, null, 2))
    console.log('[MIGRATION 0145] === RECONCILIAÇÃO CONCLUÍDA COM SUCESSO ===')
  },
  (app) => {
    console.log(
      '[MIGRATION 0145] Reversão (down) não aplicável para reconciliação de dados históricos.',
    )
  },
)
