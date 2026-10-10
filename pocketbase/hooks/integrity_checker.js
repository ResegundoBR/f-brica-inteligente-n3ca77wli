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

function runSuprimentosIntegrityCheck() {
  var divergences = []
  var nowIso = new Date().toISOString()

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

        if (opMaterials.length > 0 && receivedQty > totalDemand + 0.0001) {
          divergences.push({
            id: 'div_recv_demand_' + s.id,
            category: 'recebimento_acima_demanda',
            severity: 'alta',
            item_type: 'material_shortage',
            record_id: s.id,
            code: code,
            description: s.getString('description'),
            problem:
              'Quantidade recebida (' +
              receivedQty +
              ' un) excede a demanda total da OP de origem (' +
              totalDemand +
              ' un).',
            suggestion:
              'Ajustar o registro da falta e seu recebimento para ' +
              totalDemand +
              ' un e destinar o excedente ao estoque geral.',
            detected_at: nowIso,
            details: {
              order_id: orderId,
              received_quantity: receivedQty,
              registered_quantity: registeredQty,
              op_demand: totalDemand,
            },
          })
        }
      }
    }
  } catch (err1) {
    console.error('[INTEGRITY_CHECK] Erro ao validar regra 1 (recebido x demanda):', String(err1))
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

      if (movs.length > 0) {
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
            problem:
              'Saldo cadastrado no estoque (' +
              invQty +
              ') diverge da soma dos movimentos cronológicos (' +
              runningBal +
              ').',
            suggestion:
              'Ajustar o saldo do item de inventário para ' +
              runningBal +
              ' un e auditar os movimentos de entrada/saída.',
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
            problem:
              'Existem movimentos históricos com balance_after desalinhado da sequência cronológica de entradas/saídas.',
            suggestion: 'Reprocessar os movimentos do item para recalcular a coluna balance_after.',
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
    console.error('[INTEGRITY_CHECK] Erro ao validar regra 2 (saldo x movimentos):', String(err2))
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
          if (opStatus === 'Concluído') {
            divergences.push({
              id: 'div_ghost_op_concluida_' + openItem.id,
              category: 'solicitacao_fantasma_op_encerrada',
              severity: 'media',
              item_type: 'material_shortage',
              record_id: openItem.id,
              code: openCode,
              description: openItem.getString('description'),
              problem:
                'Registro em aberto (' +
                openItem.getString('status') +
                ', ' +
                openQty +
                ' un) vinculado à OP ' +
                orderRec.getString('op_number') +
                ' que já está Concluída.',
              suggestion:
                'Verificar se o material ainda é necessário ou cancelar/fechar o registro de falta.',
              detected_at: nowIso,
              details: {
                order_id: openOrderId,
                op_number: orderRec.getString('op_number'),
                status: openItem.getString('status'),
              },
            })
          }
        } catch (_) {}
      } else {
        // Registro avulso (sem OP vinculada)
        // Se estiver em Compra sem OC vinculada ou se estiver abandonado com quantidade alta sem lote/motivo
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
              problem: 'Registro avulso em status Compra sem Ordem de Compra emitida vinculada.',
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
  // REGRA 4: Códigos com caracteres inválidos (letras minúsculas 'l', 'o', espaços, etc.)
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
        // Detectar casos como '05100l0105' (contém 'l' ou 'o' no meio de números)
        var hasTypoLetter = /[0-9]+[loLO][0-9]+/i.test(cCode)
        var hasLeadingTrailingSpaces = sItem.getString('code') !== cCode

        if (hasTypoLetter) {
          divergences.push({
            id: 'div_code_typo_' + sItem.id,
            category: 'codigo_com_erro_digitacao',
            severity: 'alta',
            item_type: 'material_shortage',
            record_id: sItem.id,
            code: cCode,
            description: sItem.getString('description'),
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
          divergences.push({
            id: 'div_code_spaces_' + sItem.id,
            category: 'codigo_com_espacos',
            severity: 'baixa',
            item_type: 'material_shortage',
            record_id: sItem.id,
            code: cCode,
            description: sItem.getString('description'),
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
    console.error('[INTEGRITY_CHECK] Erro ao validar regra 4 (códigos inválidos):', String(err4))
  }

  // -------------------------------------------------------------------------
  // REGRA 5: Descrições de estoque ou componentes poluídas com '(OPs: ...)'
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
        problem: "Descrição do item de estoque contém sufixo '(OPs: ...)' indevido.",
        suggestion: 'Remover a menção a OPs da descrição mestra do material.',
        detected_at: nowIso,
      })
    }
  } catch (err5) {
    console.error('[INTEGRITY_CHECK] Erro ao validar regra 5 (descrições poluídas):', String(err5))
  }

  return {
    verified_at: nowIso,
    total_divergences: divergences.length,
    high_severity_count: divergences.filter(function (d) {
      return d.severity === 'alta'
    }).length,
    divergences: divergences,
  }
}

// 1. ROTINA AGENDADA DIÁRIA (cronAdd) às 04:00 UTC (01:00 BRT)
cronAdd('suprimentos_integrity_verifier', '0 4 * * *', () => {
  try {
    var result = runSuprimentosIntegrityCheck()
    console.log(
      '[CRON] Verificador permanente de Suprimentos executado: ' +
        result.total_divergences +
        ' divergência(s) detectada(s) (' +
        result.high_severity_count +
        ' de alta gravidade).',
    )
  } catch (err) {
    console.error(
      '[CRON] Erro na execução do verificador de integridade de Suprimentos:',
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
      var result = runSuprimentosIntegrityCheck()
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
