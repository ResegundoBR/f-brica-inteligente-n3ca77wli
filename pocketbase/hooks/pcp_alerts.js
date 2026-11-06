/// <reference path="../pb_data/types.d.ts" />

/**
 * Hook central do PCP: Central de Alertas Inteligente
 * Regra do JSVM do PocketBase: cada callback (routerAdd, cronAdd) roda em pool de VM isolado.
 * Toda a lógica deve ser inline em cada callback para evitar ReferenceError de top-level functions.
 */

// 1. ENDPOINT REST PARA EXECUTAR ANÁLISE (/backend/v1/pcp/alerts/analyze)
routerAdd(
  'POST',
  '/backend/v1/pcp/alerts/analyze',
  (e) => {
    try {
      var authUserId = e.auth ? e.auth.id : null
      var triggerType = 'manual'
      var started = new Date().toISOString()

      // 1. Carregar configurações de alerta do catálogo
      var configs = []
      try {
        configs = $app.findRecordsByFilter('pcp_alert_configs', '', 'title', 200, 0)
      } catch (errConfigs) {
        console.log('[PCP ALERTS] Erro ao carregar pcp_alert_configs:', String(errConfigs))
        configs = []
      }

      var configMap = {}
      for (var c = 0; c < configs.length; c++) {
        var item = configs[c]
        var checkKey = item.getString('check_key')
        var enabled = item.getBool('enabled')
        var params = {}
        try {
          var rawParams = item.get('params')
          if (typeof rawParams === 'string') {
            params = JSON.parse(rawParams) || {}
          } else if (rawParams && typeof rawParams === 'object') {
            params = rawParams
          }
        } catch (_) {
          params = {}
        }

        configMap[checkKey] = {
          id: item.id,
          check_key: checkKey,
          title: item.getString('title'),
          description: item.getString('description'),
          category: item.getString('category') || 'Inconsistência',
          enabled: enabled,
          params: params,
        }
      }

      var now = new Date()
      var alerts = []

      function diffDays(d1, d2) {
        return (d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)
      }

      function diffHours(d1, d2) {
        return (d1.getTime() - d2.getTime()) / (1000 * 60 * 60)
      }

      // VERIFICAÇÃO 1: OPs atrasadas
      var checkOpsAtrasadas = configMap['ops_atrasadas']
      if (checkOpsAtrasadas && checkOpsAtrasadas.enabled) {
        var tolDays = Number(checkOpsAtrasadas.params.tolerance_days)
        if (isNaN(tolDays) || tolDays < 0) tolDays = 2

        try {
          var openOrders = $app.findRecordsByFilter(
            'pcp_orders',
            'status != "Concluído" && (delivery_date != "" || promised_date != "")',
            'delivery_date',
            500,
            0,
          )

          for (var o = 0; o < openOrders.length; o++) {
            var order = openOrders[o]
            var targetDateStr = order.getString('promised_date') || order.getString('delivery_date')
            if (!targetDateStr) continue

            var targetDate = new Date(targetDateStr)
            if (isNaN(targetDate.getTime())) continue

            var daysOverdue = Math.floor(diffDays(now, targetDate))
            if (daysOverdue > tolDays) {
              var opNumber =
                order.getString('op_number') || order.getString('order_number') || order.id
              var client = order.getString('client_name') || 'Cliente não informado'
              var stage = order.getString('stage') || 'Fase não definida'
              var severity = daysOverdue > tolDays + 5 ? 'Crítica' : 'Alta'

              alerts.push({
                id: 'ops_atrasadas_' + order.id,
                check_key: 'ops_atrasadas',
                category: 'Atrasado',
                entity_type: 'pcp_order',
                entity_id: order.id,
                entity_ref: 'OP ' + opNumber,
                title: 'OP ' + opNumber + ' atrasada (' + daysOverdue + ' dias além da data)',
                time_info:
                  'Atrasada há ' + daysOverdue + ' dias (tolerância: ' + tolDays + ' dias)',
                severity: severity,
                action_suggestion:
                  'Priorizar no setor de ' +
                  stage +
                  ' e alinhar nova data ou agilizar expedição para ' +
                  client +
                  '.',
                details: {
                  op_number: opNumber,
                  client_name: client,
                  stage: stage,
                  delivery_date: targetDateStr,
                  days_overdue: daysOverdue,
                },
              })
            }
          }
        } catch (err1) {
          console.log('[PCP ALERTS] Erro na checagem ops_atrasadas:', String(err1))
        }
      }

      // VERIFICAÇÃO 2: OPs paradas sem movimentação
      var checkOpsParadas = configMap['ops_paradas_sem_movimentacao']
      if (checkOpsParadas && checkOpsParadas.enabled) {
        var idleDaysParam = Number(checkOpsParadas.params.idle_days)
        if (isNaN(idleDaysParam) || idleDaysParam < 1) idleDaysParam = 3

        try {
          var runningOrders = $app.findRecordsByFilter(
            'pcp_orders',
            'status = "Em Andamento" || status = "Parado"',
            'updated',
            500,
            0,
          )

          for (var r = 0; r < runningOrders.length; r++) {
            var rOrder = runningOrders[r]
            var updatedDate = new Date(rOrder.getString('updated') || rOrder.getString('created'))
            if (isNaN(updatedDate.getTime())) continue

            var daysIdle = Math.floor(diffDays(now, updatedDate))
            if (daysIdle >= idleDaysParam) {
              var rOpNum =
                rOrder.getString('op_number') || rOrder.getString('order_number') || rOrder.id
              var rStage = rOrder.getString('stage') || 'Não definida'
              var bottleneck = rOrder.getString('bottleneck_reason') || 'Nenhum'
              var rSev = daysIdle >= idleDaysParam + 4 ? 'Alta' : 'Média'

              alerts.push({
                id: 'ops_paradas_' + rOrder.id,
                check_key: 'ops_paradas_sem_movimentacao',
                category: 'Parado',
                entity_type: 'pcp_order',
                entity_id: rOrder.id,
                entity_ref: 'OP ' + rOpNum,
                title: 'OP ' + rOpNum + ' sem avanço há ' + daysIdle + ' dias na etapa ' + rStage,
                time_info:
                  'Sem movimentação há ' + daysIdle + ' dias (limite: ' + idleDaysParam + ' dias)',
                severity: rSev,
                action_suggestion:
                  bottleneck !== 'Nenhum'
                    ? 'Verificar gargalo sinalizado (' +
                      bottleneck +
                      ') e desbloquear produção imediatamente.'
                    : 'Verificar com o operador responsável da etapa ' +
                      rStage +
                      ' se há falta de insumo ou trava técnica.',
                details: {
                  op_number: rOpNum,
                  stage: rStage,
                  bottleneck_reason: bottleneck,
                  days_idle: daysIdle,
                },
              })
            }
          }
        } catch (err2) {
          console.log('[PCP ALERTS] Erro na checagem ops_paradas_sem_movimentacao:', String(err2))
        }
      }

      // VERIFICAÇÃO 3: Solicitações de compra sem cotação
      var checkSolSemCot = configMap['solicitacoes_sem_cotacao']
      if (checkSolSemCot && checkSolSemCot.enabled) {
        var maxHoursCot = Number(checkSolSemCot.params.max_hours)
        if (isNaN(maxHoursCot) || maxHoursCot < 1) maxHoursCot = 24

        try {
          var pendingShortages = $app.findRecordsByFilter(
            'material_shortages',
            'status = "Pendente"',
            'created',
            500,
            0,
          )

          for (var s = 0; s < pendingShortages.length; s++) {
            var sh = pendingShortages[s]
            var shCreated = new Date(sh.getString('created'))
            if (isNaN(shCreated.getTime())) continue

            var hoursWaitingCot = Math.floor(diffHours(now, shCreated))
            if (hoursWaitingCot >= maxHoursCot) {
              var code = sh.getString('code') || 'S/ Código'
              var desc = sh.getString('description') || 'Sem descrição'
              var qty = sh.getFloat('quantity') || 0
              var sSev = hoursWaitingCot >= maxHoursCot * 2 ? 'Alta' : 'Média'

              alerts.push({
                id: 'solicitacao_sem_cotacao_' + sh.id,
                check_key: 'solicitacoes_sem_cotacao',
                category: 'Problema de Material',
                entity_type: 'material_shortage',
                entity_id: sh.id,
                entity_ref: 'Item ' + code,
                title: 'Falta de ' + code + ' (' + desc + ') sem cotação iniciada',
                time_info: 'Aguardando há ' + hoursWaitingCot + 'h (limite: ' + maxHoursCot + 'h)',
                severity: sSev,
                action_suggestion:
                  'Inserir fornecedores no módulo de cotações para ' +
                  qty +
                  ' un de ' +
                  code +
                  ' ou verificar saldo em estoque.',
                details: {
                  code: code,
                  description: desc,
                  quantity: qty,
                  hours_waiting: hoursWaitingCot,
                },
              })
            }
          }
        } catch (err3) {
          console.log('[PCP ALERTS] Erro na checagem solicitacoes_sem_cotacao:', String(err3))
        }
      }

      // VERIFICAÇÃO 4: Cotações sem pedido de compra
      var checkCotSemPed = configMap['cotacoes_sem_pedido']
      if (checkCotSemPed && checkCotSemPed.enabled) {
        var maxHoursPed = Number(checkCotSemPed.params.max_hours)
        if (isNaN(maxHoursPed) || maxHoursPed < 1) maxHoursPed = 48

        try {
          var quotedShortages = $app.findRecordsByFilter(
            'material_shortages',
            'status = "Cotação"',
            'created',
            500,
            0,
          )

          for (var q = 0; q < quotedShortages.length; q++) {
            var qSh = quotedShortages[q]
            var qDateStr =
              qSh.getString('quotation_date') ||
              qSh.getString('updated') ||
              qSh.getString('created')
            var qDate = new Date(qDateStr)
            if (isNaN(qDate.getTime())) continue

            var hoursWaitingOrder = Math.floor(diffHours(now, qDate))
            if (hoursWaitingOrder >= maxHoursPed) {
              var qCode = qSh.getString('code') || 'S/ Código'
              var qDesc = qSh.getString('description') || 'Sem descrição'
              var qQty = qSh.getFloat('quantity') || 0
              var qSev = hoursWaitingOrder >= maxHoursPed * 2 ? 'Alta' : 'Média'

              alerts.push({
                id: 'cotacao_sem_pedido_' + qSh.id,
                check_key: 'cotacoes_sem_pedido',
                category: 'Inconsistência',
                entity_type: 'material_shortage',
                entity_id: qSh.id,
                entity_ref: 'Item ' + qCode,
                title: 'Item ' + qCode + ' cotado mas sem Ordem de Compra emitida',
                time_info:
                  'Em cotação há ' + hoursWaitingOrder + 'h (limite: ' + maxHoursPed + 'h)',
                severity: qSev,
                action_suggestion:
                  'Aprovar a melhor cotação e gerar Ordem de Compra para ' +
                  qQty +
                  ' un de ' +
                  qCode +
                  ' antes que o preço expire.',
                details: {
                  code: qCode,
                  description: qDesc,
                  quantity: qQty,
                  hours_waiting: hoursWaitingOrder,
                },
              })
            }
          }
        } catch (err4) {
          console.log('[PCP ALERTS] Erro na checagem cotacoes_sem_pedido:', String(err4))
        }
      }

      // VERIFICAÇÃO 5: Faltas em aberto sem compra associada
      var checkFaltasSemCompra = configMap['faltas_sem_compra']
      if (checkFaltasSemCompra && checkFaltasSemCompra.enabled) {
        try {
          var purchaseShortages = $app.findRecordsByFilter(
            'material_shortages',
            'status = "Compra"',
            'created',
            500,
            0,
          )

          for (var f = 0; f < purchaseShortages.length; f++) {
            var fSh = purchaseShortages[f]
            var ocItens = []
            try {
              ocItens = $app.findRecordsByFilter(
                'ordem_compra_itens',
                'material_shortage_id = "' + fSh.id + '"',
                '',
                1,
                0,
              )
            } catch (_) {
              ocItens = []
            }

            if (ocItens.length === 0) {
              var fCode = fSh.getString('code') || 'S/ Código'
              var fDesc = fSh.getString('description') || 'Sem descrição'
              var fQty = fSh.getFloat('quantity') || 0
              var fCreated = new Date(fSh.getString('created'))
              var fDays = isNaN(fCreated.getTime())
                ? 1
                : Math.max(1, Math.floor(diffDays(now, fCreated)))

              alerts.push({
                id: 'falta_sem_compra_' + fSh.id,
                check_key: 'faltas_sem_compra',
                category: 'Problema de Material',
                entity_type: 'material_shortage',
                entity_id: fSh.id,
                entity_ref: 'Item ' + fCode,
                title: 'Falta marcada como "Compra" mas sem item em Ordem de Compra',
                time_info: 'Pendente há ' + fDays + ' dia(s)',
                severity: 'Alta',
                action_suggestion:
                  'Vincular o item ' +
                  fCode +
                  ' a uma Ordem de Compra existente ou emitir nova OC para formalizar o pedido.',
                details: {
                  code: fCode,
                  description: fDesc,
                  quantity: fQty,
                },
              })
            }
          }
        } catch (err5) {
          console.log('[PCP ALERTS] Erro na checagem faltas_sem_compra:', String(err5))
        }
      }

      // VERIFICAÇÃO 6: Recebimentos parciais pendentes
      var checkRecParcial = configMap['recebimentos_parciais_pendentes']
      if (checkRecParcial && checkRecParcial.enabled) {
        var maxDaysRec = Number(checkRecParcial.params.max_days)
        if (isNaN(maxDaysRec) || maxDaysRec < 1) maxDaysRec = 5

        try {
          var partialShortages = $app.findRecordsByFilter(
            'material_shortages',
            'status = "Recebido_Parcial"',
            'updated',
            500,
            0,
          )

          for (var p = 0; p < partialShortages.length; p++) {
            var pSh = partialShortages[p]
            var pUpdated = new Date(pSh.getString('updated') || pSh.getString('created'))
            if (isNaN(pUpdated.getTime())) continue

            var daysPartial = Math.floor(diffDays(now, pUpdated))
            if (daysPartial >= maxDaysRec) {
              var pCode = pSh.getString('code') || 'S/ Código'
              var pDesc = pSh.getString('description') || 'Sem descrição'
              var pTotal = pSh.getFloat('quantity') || 0
              var pReceived = pSh.getFloat('received_quantity') || 0
              var pRemaining = Math.max(0, pTotal - pReceived)

              alerts.push({
                id: 'recebimento_parcial_' + pSh.id,
                check_key: 'recebimentos_parciais_pendentes',
                category: 'Inconsistência',
                entity_type: 'material_shortage',
                entity_id: pSh.id,
                entity_ref: 'Item ' + pCode,
                title: 'Saldo pendente de recebimento (' + pRemaining + ' un de ' + pCode + ')',
                time_info: 'Parcial há ' + daysPartial + ' dias (limite: ' + maxDaysRec + ' dias)',
                severity: daysPartial >= maxDaysRec * 2 ? 'Alta' : 'Média',
                action_suggestion:
                  'Cobrar fornecedor pela remessa restante de ' +
                  pRemaining +
                  ' un ou registrar encerramento residual caso o fornecedor não entregue mais.',
                details: {
                  code: pCode,
                  description: pDesc,
                  total_quantity: pTotal,
                  received_quantity: pReceived,
                  remaining_quantity: pRemaining,
                  days_partial: daysPartial,
                },
              })
            }
          }
        } catch (err6) {
          console.log(
            '[PCP ALERTS] Erro na checagem recebimentos_parciais_pendentes:',
            String(err6),
          )
        }
      }

      // VERIFICAÇÃO 7: Baixas retroativas aguardando aprovação
      var checkBaixasRetroativas = configMap['baixas_retroativas_pendentes']
      if (checkBaixasRetroativas && checkBaixasRetroativas.enabled) {
        var maxHoursRetro = Number(checkBaixasRetroativas.params.max_hours)
        if (isNaN(maxHoursRetro) || maxHoursRetro < 1) maxHoursRetro = 24

        try {
          var pendingRetros = $app.findRecordsByFilter(
            'pcp_retroactive_withdrawals',
            'status = "Pendente"',
            'created',
            500,
            0,
          )

          for (var b = 0; b < pendingRetros.length; b++) {
            var ret = pendingRetros[b]
            var retCreated = new Date(ret.getString('created'))
            if (isNaN(retCreated.getTime())) continue

            var hoursWaitingRetro = Math.floor(diffHours(now, retCreated))
            if (hoursWaitingRetro >= maxHoursRetro) {
              var retCode = ret.getString('material_code') || 'S/ Código'
              var retOp = ret.getString('order_number') || 'OP S/ Número'
              var retQty = ret.getFloat('quantity') || 0
              var retReason = ret.getString('reason') || 'Sem motivo'

              alerts.push({
                id: 'baixa_retroativa_' + ret.id,
                check_key: 'baixas_retroativas_pendentes',
                category: 'Inconsistência',
                entity_type: 'pcp_retroactive_withdrawal',
                entity_id: ret.id,
                entity_ref: 'OP ' + retOp + ' / ' + retCode,
                title:
                  'Baixa retroativa de ' + retQty + ' un (' + retCode + ') aguardando aprovação',
                time_info:
                  'Aguardando há ' + hoursWaitingRetro + 'h (limite: ' + maxHoursRetro + 'h)',
                severity: hoursWaitingRetro >= maxHoursRetro * 2 ? 'Alta' : 'Média',
                action_suggestion:
                  'Acessar Suprimentos > Baixas Retroativas para aprovar ou rejeitar a solicitação (Motivo: "' +
                  retReason +
                  '").',
                details: {
                  op_number: retOp,
                  material_code: retCode,
                  quantity: retQty,
                  reason: retReason,
                  hours_waiting: hoursWaitingRetro,
                },
              })
            }
          }
        } catch (err7) {
          console.log('[PCP ALERTS] Erro na checagem baixas_retroativas_pendentes:', String(err7))
        }
      }

      // VERIFICAÇÃO 8: OPs com prazo próximo e ainda não iniciadas
      var checkPrazoSemIniciar = configMap['prazo_sem_iniciar']
      if (checkPrazoSemIniciar && checkPrazoSemIniciar.enabled) {
        var antecDays = Number(checkPrazoSemIniciar.params.antecedencia_dias)
        if (isNaN(antecDays) || antecDays < 1) antecDays = 21

        try {
          var notStartedOrders = $app.findRecordsByFilter(
            'pcp_orders',
            'status != "Concluído" && started_at = ""',
            'delivery_date',
            500,
            0,
          )

          for (var n = 0; n < notStartedOrders.length; n++) {
            var nsOrder = notStartedOrders[n]
            var nsDeliveryStr = nsOrder.getString('delivery_date')
            if (!nsDeliveryStr) continue

            var nsDelivery = new Date(nsDeliveryStr)
            if (isNaN(nsDelivery.getTime())) continue

            var daysUntil = Math.ceil(diffDays(nsDelivery, now))
            if (daysUntil >= 0 && daysUntil <= antecDays) {
              var nsOpNum =
                nsOrder.getString('op_number') || nsOrder.getString('order_number') || nsOrder.id
              var nsClient = nsOrder.getString('client_name') || 'Cliente não informado'
              var nsSev = daysUntil <= 7 ? 'Crítica' : daysUntil <= 14 ? 'Alta' : 'Média'

              alerts.push({
                id: 'prazo_sem_iniciar_' + nsOrder.id,
                check_key: 'prazo_sem_iniciar',
                category: 'Inconsistência',
                entity_type: 'pcp_order',
                entity_id: nsOrder.id,
                entity_ref: 'OP ' + nsOpNum,
                title:
                  'OP ' +
                  nsOpNum +
                  ' (' +
                  nsClient +
                  ') vence em ' +
                  daysUntil +
                  ' dias e ainda não foi iniciada',
                time_info: 'Vence em ' + daysUntil + ' dias (janela: ' + antecDays + ' dias)',
                severity: nsSev,
                action_suggestion:
                  'Priorizar liberação da OP ' +
                  nsOpNum +
                  ' no sequenciamento e verificar se há material disponível para começar a produção.',
                details: {
                  op_number: nsOpNum,
                  client_name: nsClient,
                  delivery_date: nsDeliveryStr,
                  days_until_delivery: daysUntil,
                },
              })
            }
          }
        } catch (err8) {
          console.log('[PCP ALERTS] Erro na checagem prazo_sem_iniciar:', String(err8))
        }
      }

      // VERIFICAÇÃO 9: Data prometida em risco
      var checkPrometidaEmRisco = configMap['prometida_em_risco']
      if (checkPrometidaEmRisco && checkPrometidaEmRisco.enabled) {
        var margemDays = Number(checkPrometidaEmRisco.params.margem_dias)
        if (isNaN(margemDays) || margemDays < 1) margemDays = 7

        try {
          var promisedOrders = $app.findRecordsByFilter(
            'pcp_orders',
            'status != "Concluído" && promised_date != "" && data_saida = ""',
            'promised_date',
            500,
            0,
          )

          for (var pr = 0; pr < promisedOrders.length; pr++) {
            var pOrder = promisedOrders[pr]
            var pPromisedStr = pOrder.getString('promised_date')
            if (!pPromisedStr) continue

            var pPromised = new Date(pPromisedStr)
            if (isNaN(pPromised.getTime())) continue

            var pDaysUntil = Math.ceil(diffDays(pPromised, now))
            if (pDaysUntil > 14) continue // fora das janelas monitoradas

            var pOpNum =
              pOrder.getString('op_number') || pOrder.getString('order_number') || pOrder.id
            var pClient = pOrder.getString('client_name') || 'Cliente não informado'
            var pNote = pOrder.getString('promised_note') || 'Sem observação registrada'
            var pById = pOrder.getString('promised_by') || ''
            var pByName = pById
            if (pById) {
              try {
                var pUser = $app.findRecordById('users', pById)
                if (pUser) pByName = pUser.getString('name') || pUser.getString('email') || pById
              } catch (_) {
                pByName = pById
              }
            }
            var pStage = pOrder.getString('stage') || 'Fase não definida'
            var pSev = pDaysUntil < 0 ? 'Crítica' : pDaysUntil <= margemDays ? 'Alta' : 'Média'

            var pTitle, pTimeInfo, pSuggestion
            if (pDaysUntil < 0) {
              pTitle =
                'Prometida vencida: OP ' +
                pOpNum +
                ' (' +
                pClient +
                ') passou ' +
                Math.abs(pDaysUntil) +
                ' dias da data prometida'
              pTimeInfo = 'Vencida há ' + Math.abs(pDaysUntil) + ' dias'
              pSuggestion =
                'Comunicar ' +
                pByName +
                ' (autor da promessa) e renegociar a data com o cliente ' +
                pClient +
                ' ou priorizar a OP na etapa ' +
                pStage +
                '.'
            } else if (pDaysUntil <= margemDays) {
              pTitle =
                'Prometida em risco: OP ' +
                pOpNum +
                ' (' +
                pClient +
                ') vence em ' +
                pDaysUntil +
                ' dias'
              pTimeInfo = 'Vence em ' + pDaysUntil + ' dias (margem: ' + margemDays + ' dias)'
              pSuggestion =
                'Confirmar viabilidade com ' +
                pByName +
                ' e cobrar andamento na etapa ' +
                pStage +
                ' para cumprir o que foi prometido ao cliente ' +
                pClient +
                '.'
            } else {
              pTitle =
                'Prometida próximo do vencimento: OP ' +
                pOpNum +
                ' (' +
                pClient +
                ') vence em ' +
                pDaysUntil +
                ' dias'
              pTimeInfo = 'Vence em ' + pDaysUntil + ' dias'
              pSuggestion =
                'Monitorar andamento da OP ' +
                pOpNum +
                ' na etapa ' +
                pStage +
                ' — a data prometida por ' +
                pByName +
                ' vence em breve.'
            }

            alerts.push({
              id: 'prometida_em_risco_' + pOrder.id,
              check_key: 'prometida_em_risco',
              category: 'Inconsistência',
              entity_type: 'pcp_order',
              entity_id: pOrder.id,
              entity_ref: 'OP ' + pOpNum,
              title: pTitle,
              time_info: pTimeInfo,
              severity: pSev,
              action_suggestion: pSuggestion,
              details: {
                op_number: pOpNum,
                client_name: pClient,
                promised_date: pPromisedStr,
                promised_note: pNote,
                promised_by_name: pByName,
                days_until_promised: pDaysUntil,
              },
            })
          }
        } catch (err9) {
          console.log('[PCP ALERTS] Erro na checagem prometida_em_risco:', String(err9))
        }
      }

      // VERIFICAÇÃO 10: Especiais com entrega próxima e ainda longe do fim do fluxo
      var checkEspecialPrazo = configMap['especial_prazo']
      if (checkEspecialPrazo && checkEspecialPrazo.enabled) {
        var espDays = Number(checkEspecialPrazo.params.antecedencia_dias)
        if (isNaN(espDays) || espDays < 1) espDays = 21

        var finalStages = {}
        var finalStageList = [
          'Pintura',
          'Retoques',
          'Montagem',
          'Qualidade',
          'Embalagem',
          'Expedição',
        ]
        for (var fs = 0; fs < finalStageList.length; fs++) {
          finalStages[finalStageList[fs]] = true
        }

        try {
          var specialOrders = $app.findRecordsByFilter(
            'pcp_orders',
            'op_type = "Especial" && status != "Concluído"',
            'delivery_date',
            500,
            0,
          )

          for (var sp = 0; sp < specialOrders.length; sp++) {
            var spOrder = specialOrders[sp]
            var spDeliveryStr = spOrder.getString('delivery_date')
            if (!spDeliveryStr) continue

            var spDelivery = new Date(spDeliveryStr)
            if (isNaN(spDelivery.getTime())) continue

            var spDaysUntil = Math.ceil(diffDays(spDelivery, now))
            if (spDaysUntil < 0 || spDaysUntil > espDays) continue

            var spStage = spOrder.getString('stage') || 'Fase não definida'
            if (finalStages[spStage]) continue // já está no fim do fluxo, ok

            var spOpNum =
              spOrder.getString('op_number') || spOrder.getString('order_number') || spOrder.id
            var spClient = spOrder.getString('client_name') || 'Cliente não informado'

            alerts.push({
              id: 'especial_prazo_' + spOrder.id,
              check_key: 'especial_prazo',
              category: 'Inconsistência',
              entity_type: 'pcp_order',
              entity_id: spOrder.id,
              entity_ref: 'OP ' + spOpNum,
              title:
                'Especial com entrega em ' +
                spDaysUntil +
                ' dias ainda na etapa ' +
                spStage +
                ' (' +
                spClient +
                ')',
              time_info: 'Entrega em ' + spDaysUntil + ' dias (janela: ' + espDays + ' dias)',
              severity: spDaysUntil <= 7 ? 'Crítica' : spDaysUntil <= 14 ? 'Alta' : 'Média',
              action_suggestion:
                'Especial ' +
                spOpNum +
                ' de ' +
                spClient +
                ' ainda está na etapa ' +
                spStage +
                ' com entrega próxima — revisar caminho crítico e considerar antecipar etapas ou terceirizar.',
              details: {
                op_number: spOpNum,
                client_name: spClient,
                delivery_date: spDeliveryStr,
                stage: spStage,
                days_until_delivery: spDaysUntil,
              },
            })
          }
        } catch (err10) {
          console.log('[PCP ALERTS] Erro na checagem especial_prazo:', String(err10))
        }
      }

      // 2. CONSULTA AO AGENTE NATIVO SKIP CLOUD ("supervisor-producao")
      var agentSummaryText = ''

      try {
        var agentUserId = authUserId
        if (!agentUserId) {
          try {
            var adminUser = $app.findFirstRecordByFilter('users', 'active = true', 'created')
            if (adminUser) agentUserId = adminUser.id
          } catch (_) {}
        }

        if (agentUserId) {
          var agentPrompt =
            'Analise o estado atual da fábrica e forneça:\n' +
            '1. Um resumo executivo curto da situação produtiva.\n' +
            '2. Padrões anômalos que estamos deixando passar (itens que NÃO são simples atrasos, mas riscos ocultos de ruptura, gargalos ocultos, itens acumulados ou comportamentos suspeitos).\n\n' +
            'Para cada padrão suspeito identificado, forneça exatamente neste formato JSON dentro de um bloco ```json [ ... ] ```:\n' +
            '[\n' +
            '  {\n' +
            '    "title": "título curto do padrão",\n' +
            '    "entity_ref": "identificador da entidade",\n' +
            '    "time_info": "tempo ou recorrência estimada",\n' +
            '    "severity": "Crítica" | "Alta" | "Média" | "Baixa",\n' +
            '    "action_suggestion": "ação concreta para o gestor",\n' +
            '    "details": "explicação do padrão"\n' +
            '  }\n' +
            ']'

          var agentRes = $ai.agent('supervisor-producao').chat({
            user_id: agentUserId,
            message: agentPrompt,
          })

          if (agentRes && agentRes.content) {
            agentSummaryText = agentRes.content

            var jsonMatch =
              agentRes.content.match(/```json([\s\S]*?)```/) ||
              agentRes.content.match(/\[([\s\S]*?)\]/)
            if (jsonMatch) {
              var rawJson = jsonMatch[1] ? jsonMatch[1].trim() : jsonMatch[0].trim()
              if (!rawJson.startsWith('[')) rawJson = '[' + rawJson + ']'
              try {
                var parsed = JSON.parse(rawJson)
                if (Array.isArray(parsed)) {
                  for (var a = 0; a < parsed.length; a++) {
                    var itemA = parsed[a]
                    if (itemA && itemA.title) {
                      alerts.push({
                        id: 'agente_padrao_' + (a + 1) + '_' + Date.now(),
                        check_key: 'padrao_anomalo_ia',
                        category: 'Padrões Suspeitos',
                        entity_type: 'ia_insight',
                        entity_id: 'ia_' + (a + 1),
                        entity_ref: itemA.entity_ref || 'Chão de Fábrica',
                        title: String(itemA.title),
                        time_info: itemA.time_info || 'Identificado nesta rodada',
                        severity: itemA.severity || 'Média',
                        action_suggestion:
                          itemA.action_suggestion ||
                          'Investigar junto à equipe de produção e suprimentos.',
                        details: itemA.details ? { explanation: itemA.details } : {},
                      })
                    }
                  }
                }
              } catch (parseErr) {
                console.log(
                  '[PCP ALERTS] Não foi possível fazer parse do JSON do agente:',
                  String(parseErr),
                )
              }
            }
          }
        }
      } catch (agentErr) {
        console.log(
          '[PCP ALERTS] Consulta ao agente supervisor-producao falhou (não bloqueia):',
          String(agentErr),
        )
      }

      var finished = new Date().toISOString()

      // 3. Diff simples contra a rodada anterior
      var previousRun = null
      try {
        previousRun = $app.findFirstRecordByFilter('pcp_alert_runs', '', '-created')
      } catch (_) {
        previousRun = null
      }

      var previousAlertIds = {}
      if (previousRun) {
        try {
          var prevResults = previousRun.get('results')
          if (typeof prevResults === 'string') prevResults = JSON.parse(prevResults)
          if (prevResults && Array.isArray(prevResults.alerts)) {
            for (var pa = 0; pa < prevResults.alerts.length; pa++) {
              previousAlertIds[prevResults.alerts[pa].id] = prevResults.alerts[pa]
            }
          }
        } catch (_) {}
      }

      var currentAlertIds = {}
      var categorizedCounts = {
        Atrasado: 0,
        Parado: 0,
        'Problema de Material': 0,
        Inconsistência: 0,
        'Padrões Suspeitos': 0,
      }

      for (var al = 0; al < alerts.length; al++) {
        var oneAlert = alerts[al]
        currentAlertIds[oneAlert.id] = true
        if (previousAlertIds[oneAlert.id]) {
          oneAlert.status = 'persistente'
        } else {
          oneAlert.status = 'novo'
        }

        var cat = oneAlert.category || 'Inconsistência'
        if (categorizedCounts[cat] !== undefined) {
          categorizedCounts[cat]++
        } else {
          categorizedCounts[cat] = 1
        }
      }

      var resolvedItems = []
      var prevKeys = Object.keys(previousAlertIds)
      for (var pk = 0; pk < prevKeys.length; pk++) {
        var pId = prevKeys[pk]
        if (!currentAlertIds[pId]) {
          var resolvedAlert = previousAlertIds[pId]
          resolvedAlert.status = 'resolvido'
          resolvedItems.push(resolvedAlert)
        }
      }

      var summaryLine =
        'Análise concluída com ' +
        alerts.length +
        ' alertas ativos (' +
        (categorizedCounts['Atrasado'] || 0) +
        ' Atrasados, ' +
        (categorizedCounts['Parado'] || 0) +
        ' Parados, ' +
        (categorizedCounts['Problema de Material'] || 0) +
        ' Materiais, ' +
        (categorizedCounts['Inconsistência'] || 0) +
        ' Inconsistências, ' +
        (categorizedCounts['Padrões Suspeitos'] || 0) +
        ' Padrões IA) e ' +
        resolvedItems.length +
        ' resolvidos.'

      var runPayload = {
        alerts: alerts,
        resolved_count: resolvedItems.length,
        resolved_alerts: resolvedItems.slice(0, 50),
        categorized_counts: categorizedCounts,
        agent_summary: agentSummaryText,
      }

      try {
        var runsCol = $app.findCollectionByNameOrId('pcp_alert_runs')
        var runRecord = new Record(runsCol)
        runRecord.set('started', started)
        runRecord.set('finished', finished)
        runRecord.set('trigger_type', triggerType)
        runRecord.set('results', runPayload)
        runRecord.set('summary', summaryLine)
        $app.save(runRecord)
      } catch (saveErr) {
        console.log('[PCP ALERTS] Erro ao gravar pcp_alert_runs:', String(saveErr))
      }

      return e.json(200, {
        success: true,
        data: {
          started: started,
          finished: finished,
          trigger_type: triggerType,
          summary: summaryLine,
          alerts: alerts,
          resolved_alerts: resolvedItems,
          categorized_counts: categorizedCounts,
          agent_summary: agentSummaryText,
        },
      })
    } catch (err) {
      console.log('[PCP ALERTS] Erro no endpoint analyze:', String(err))
      return e.json(500, { error: 'Erro ao executar análise: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)

// 2. ENDPOINT REST PARA ATUALIZAR CONFIGURAÇÃO DE ALERTA (/backend/v1/pcp/alerts/configs/{id})
routerAdd(
  'PATCH',
  '/backend/v1/pcp/alerts/configs/{id}',
  (e) => {
    try {
      var id = e.request.pathValue('id')
      if (!id) return e.badRequestError('ID da configuração é obrigatório')

      var configRecord = $app.findRecordById('pcp_alert_configs', id)
      if (!configRecord) return e.notFoundError('Configuração não encontrada')

      var body = e.requestInfo().body || {}

      if (body.enabled !== undefined) {
        configRecord.set('enabled', Boolean(body.enabled))
      }
      if (body.params !== undefined) {
        configRecord.set('params', body.params)
      }
      if (body.title !== undefined && typeof body.title === 'string') {
        configRecord.set('title', body.title.trim())
      }
      if (body.description !== undefined && typeof body.description === 'string') {
        configRecord.set('description', body.description.trim())
      }

      $app.save(configRecord)

      return e.json(200, {
        success: true,
        data: {
          id: configRecord.id,
          check_key: configRecord.getString('check_key'),
          title: configRecord.getString('title'),
          description: configRecord.getString('description'),
          category: configRecord.getString('category'),
          enabled: configRecord.getBool('enabled'),
          params: configRecord.get('params'),
          updated: configRecord.getString('updated'),
        },
      })
    } catch (err) {
      console.log('[PCP ALERTS] Erro ao atualizar config:', String(err))
      return e.json(500, { error: 'Erro ao atualizar configuração: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)

// 3. CRON DIÁRIO ÀS 04:05 UTC (01:05 BRT)
// Todo o código inline para evitar ReferenceError no JSVM
cronAdd('pcp_daily_alerts', '5 4 * * *', () => {
  try {
    console.log('[PCP ALERTS] Iniciando rotina diária de alertas às 04:05 UTC...')
    var started = new Date().toISOString()

    var configs = []
    try {
      configs = $app.findRecordsByFilter('pcp_alert_configs', '', 'title', 200, 0)
    } catch (err) {
      configs = []
    }

    var configMap = {}
    for (var c = 0; c < configs.length; c++) {
      var item = configs[c]
      var checkKey = item.getString('check_key')
      var enabled = item.getBool('enabled')
      var params = {}
      try {
        var rawParams = item.get('params')
        if (typeof rawParams === 'string') {
          params = JSON.parse(rawParams) || {}
        } else if (rawParams && typeof rawParams === 'object') {
          params = rawParams
        }
      } catch (_) {
        params = {}
      }

      configMap[checkKey] = {
        id: item.id,
        check_key: checkKey,
        enabled: enabled,
        params: params,
      }
    }

    var now = new Date()
    var alerts = []

    function diffDaysCron(d1, d2) {
      return (d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)
    }

    function diffHoursCron(d1, d2) {
      return (d1.getTime() - d2.getTime()) / (1000 * 60 * 60)
    }

    // 1. OPs atrasadas
    var cAtrasadas = configMap['ops_atrasadas']
    if (cAtrasadas && cAtrasadas.enabled) {
      var tolDays = Number(cAtrasadas.params.tolerance_days)
      if (isNaN(tolDays) || tolDays < 0) tolDays = 2

      try {
        var openOrders = $app.findRecordsByFilter(
          'pcp_orders',
          'status != "Concluído" && (delivery_date != "" || promised_date != "")',
          'delivery_date',
          500,
          0,
        )

        for (var o = 0; o < openOrders.length; o++) {
          var order = openOrders[o]
          var targetDateStr = order.getString('promised_date') || order.getString('delivery_date')
          if (!targetDateStr) continue

          var targetDate = new Date(targetDateStr)
          if (isNaN(targetDate.getTime())) continue

          var daysOverdue = Math.floor(diffDaysCron(now, targetDate))
          if (daysOverdue > tolDays) {
            var opNumber =
              order.getString('op_number') || order.getString('order_number') || order.id
            var client = order.getString('client_name') || 'Cliente'
            var stage = order.getString('stage') || 'Fase'

            alerts.push({
              id: 'ops_atrasadas_' + order.id,
              check_key: 'ops_atrasadas',
              category: 'Atrasado',
              entity_type: 'pcp_order',
              entity_id: order.id,
              entity_ref: 'OP ' + opNumber,
              title: 'OP ' + opNumber + ' atrasada (' + daysOverdue + ' dias além da data)',
              time_info: 'Atrasada há ' + daysOverdue + ' dias',
              severity: daysOverdue > tolDays + 5 ? 'Crítica' : 'Alta',
              action_suggestion: 'Priorizar no setor de ' + stage + ' para ' + client + '.',
              details: { op_number: opNumber, days_overdue: daysOverdue },
            })
          }
        }
      } catch (_) {}
    }

    // 2. OPs paradas
    var cParadas = configMap['ops_paradas_sem_movimentacao']
    if (cParadas && cParadas.enabled) {
      var idleDays = Number(cParadas.params.idle_days)
      if (isNaN(idleDays) || idleDays < 1) idleDays = 3

      try {
        var runningOrders = $app.findRecordsByFilter(
          'pcp_orders',
          'status = "Em Andamento" || status = "Parado"',
          'updated',
          500,
          0,
        )

        for (var r = 0; r < runningOrders.length; r++) {
          var rOrder = runningOrders[r]
          var updatedDate = new Date(rOrder.getString('updated') || rOrder.getString('created'))
          if (isNaN(updatedDate.getTime())) continue

          var daysIdle = Math.floor(diffDaysCron(now, updatedDate))
          if (daysIdle >= idleDays) {
            var rOpNum =
              rOrder.getString('op_number') || rOrder.getString('order_number') || rOrder.id
            var rStage = rOrder.getString('stage') || 'Não definida'

            alerts.push({
              id: 'ops_paradas_' + rOrder.id,
              check_key: 'ops_paradas_sem_movimentacao',
              category: 'Parado',
              entity_type: 'pcp_order',
              entity_id: rOrder.id,
              entity_ref: 'OP ' + rOpNum,
              title: 'OP ' + rOpNum + ' sem avanço há ' + daysIdle + ' dias na etapa ' + rStage,
              time_info: 'Sem movimentação há ' + daysIdle + ' dias',
              severity: daysIdle >= idleDays + 4 ? 'Alta' : 'Média',
              action_suggestion:
                'Verificar com o operador da etapa ' + rStage + ' se há falta de insumo.',
              details: { op_number: rOpNum, days_idle: daysIdle },
            })
          }
        }
      } catch (_) {}
    }

    // 3. Solicitações sem cotação
    var cSol = configMap['solicitacoes_sem_cotacao']
    if (cSol && cSol.enabled) {
      var maxHCot = Number(cSol.params.max_hours)
      if (isNaN(maxHCot) || maxHCot < 1) maxHCot = 24

      try {
        var pendingShortages = $app.findRecordsByFilter(
          'material_shortages',
          'status = "Pendente"',
          'created',
          500,
          0,
        )
        for (var s = 0; s < pendingShortages.length; s++) {
          var sh = pendingShortages[s]
          var shCreated = new Date(sh.getString('created'))
          if (isNaN(shCreated.getTime())) continue

          var hoursW = Math.floor(diffHoursCron(now, shCreated))
          if (hoursW >= maxHCot) {
            var code = sh.getString('code') || 'S/ Código'
            var desc = sh.getString('description') || 'Sem descrição'
            var qty = sh.getFloat('quantity') || 0

            alerts.push({
              id: 'solicitacao_sem_cotacao_' + sh.id,
              check_key: 'solicitacoes_sem_cotacao',
              category: 'Problema de Material',
              entity_type: 'material_shortage',
              entity_id: sh.id,
              entity_ref: 'Item ' + code,
              title: 'Falta de ' + code + ' (' + desc + ') sem cotação iniciada',
              time_info: 'Aguardando há ' + hoursW + 'h',
              severity: hoursW >= maxHCot * 2 ? 'Alta' : 'Média',
              action_suggestion:
                'Inserir fornecedores no módulo de cotações para ' + qty + ' un de ' + code + '.',
              details: { code: code, hours_waiting: hoursW },
            })
          }
        }
      } catch (_) {}
    }

    // 4. Cotações sem pedido
    var cCot = configMap['cotacoes_sem_pedido']
    if (cCot && cCot.enabled) {
      var maxHPed = Number(cCot.params.max_hours)
      if (isNaN(maxHPed) || maxHPed < 1) maxHPed = 48

      try {
        var quotedShortages = $app.findRecordsByFilter(
          'material_shortages',
          'status = "Cotação"',
          'created',
          500,
          0,
        )
        for (var q = 0; q < quotedShortages.length; q++) {
          var qSh = quotedShortages[q]
          var qDateStr =
            qSh.getString('quotation_date') || qSh.getString('updated') || qSh.getString('created')
          var qDate = new Date(qDateStr)
          if (isNaN(qDate.getTime())) continue

          var hoursP = Math.floor(diffHoursCron(now, qDate))
          if (hoursP >= maxHPed) {
            var qCode = qSh.getString('code') || 'S/ Código'
            alerts.push({
              id: 'cotacao_sem_pedido_' + qSh.id,
              check_key: 'cotacoes_sem_pedido',
              category: 'Inconsistência',
              entity_type: 'material_shortage',
              entity_id: qSh.id,
              entity_ref: 'Item ' + qCode,
              title: 'Item ' + qCode + ' cotado mas sem Ordem de Compra emitida',
              time_info: 'Em cotação há ' + hoursP + 'h',
              severity: hoursP >= maxHPed * 2 ? 'Alta' : 'Média',
              action_suggestion:
                'Gerar Ordem de Compra para ' + qCode + ' antes que o preço expire.',
              details: { code: qCode, hours_waiting: hoursP },
            })
          }
        }
      } catch (_) {}
    }

    // 5. Faltas sem compra
    var cFaltas = configMap['faltas_sem_compra']
    if (cFaltas && cFaltas.enabled) {
      try {
        var purchaseShortages = $app.findRecordsByFilter(
          'material_shortages',
          'status = "Compra"',
          'created',
          500,
          0,
        )
        for (var f = 0; f < purchaseShortages.length; f++) {
          var fSh = purchaseShortages[f]
          var ocItens = []
          try {
            ocItens = $app.findRecordsByFilter(
              'ordem_compra_itens',
              'material_shortage_id = "' + fSh.id + '"',
              '',
              1,
              0,
            )
          } catch (_) {
            ocItens = []
          }

          if (ocItens.length === 0) {
            var fCode = fSh.getString('code') || 'S/ Código'
            alerts.push({
              id: 'falta_sem_compra_' + fSh.id,
              check_key: 'faltas_sem_compra',
              category: 'Problema de Material',
              entity_type: 'material_shortage',
              entity_id: fSh.id,
              entity_ref: 'Item ' + fCode,
              title: 'Falta marcada como "Compra" mas sem item em Ordem de Compra',
              time_info: 'Pendente',
              severity: 'Alta',
              action_suggestion:
                'Vincular o item ' + fCode + ' a uma Ordem de Compra existente ou emitir nova OC.',
              details: { code: fCode },
            })
          }
        }
      } catch (_) {}
    }

    // 6. Recebimentos parciais pendentes
    var cRec = configMap['recebimentos_parciais_pendentes']
    if (cRec && cRec.enabled) {
      var maxDRec = Number(cRec.params.max_days)
      if (isNaN(maxDRec) || maxDRec < 1) maxDRec = 5

      try {
        var partialShortages = $app.findRecordsByFilter(
          'material_shortages',
          'status = "Recebido_Parcial"',
          'updated',
          500,
          0,
        )
        for (var p = 0; p < partialShortages.length; p++) {
          var pSh = partialShortages[p]
          var pUpdated = new Date(pSh.getString('updated') || pSh.getString('created'))
          if (isNaN(pUpdated.getTime())) continue

          var dPartial = Math.floor(diffDaysCron(now, pUpdated))
          if (dPartial >= maxDRec) {
            var pCode = pSh.getString('code') || 'S/ Código'
            var pTotal = pSh.getFloat('quantity') || 0
            var pRec = pSh.getFloat('received_quantity') || 0
            var pRem = Math.max(0, pTotal - pRec)

            alerts.push({
              id: 'recebimento_parcial_' + pSh.id,
              check_key: 'recebimentos_parciais_pendentes',
              category: 'Inconsistência',
              entity_type: 'material_shortage',
              entity_id: pSh.id,
              entity_ref: 'Item ' + pCode,
              title: 'Saldo pendente de recebimento (' + pRem + ' un de ' + pCode + ')',
              time_info: 'Parcial há ' + dPartial + ' dias',
              severity: dPartial >= maxDRec * 2 ? 'Alta' : 'Média',
              action_suggestion:
                'Cobrar fornecedor pela remessa restante de ' +
                pRem +
                ' un ou registrar encerramento residual.',
              details: { code: pCode, remaining_quantity: pRem },
            })
          }
        }
      } catch (_) {}
    }

    // 7. Baixas retroativas aguardando aprovação
    var cRetro = configMap['baixas_retroativas_pendentes']
    if (cRetro && cRetro.enabled) {
      var maxHRetro = Number(cRetro.params.max_hours)
      if (isNaN(maxHRetro) || maxHRetro < 1) maxHRetro = 24

      try {
        var pendingRetros = $app.findRecordsByFilter(
          'pcp_retroactive_withdrawals',
          'status = "Pendente"',
          'created',
          500,
          0,
        )
        for (var b = 0; b < pendingRetros.length; b++) {
          var ret = pendingRetros[b]
          var retCreated = new Date(ret.getString('created'))
          if (isNaN(retCreated.getTime())) continue

          var hRetro = Math.floor(diffHoursCron(now, retCreated))
          if (hRetro >= maxHRetro) {
            var retCode = ret.getString('material_code') || 'S/ Código'
            var retOp = ret.getString('order_number') || 'OP'
            var retQty = ret.getFloat('quantity') || 0

            alerts.push({
              id: 'baixa_retroativa_' + ret.id,
              check_key: 'baixas_retroativas_pendentes',
              category: 'Inconsistência',
              entity_type: 'pcp_retroactive_withdrawal',
              entity_id: ret.id,
              entity_ref: 'OP ' + retOp + ' / ' + retCode,
              title: 'Baixa retroativa de ' + retQty + ' un (' + retCode + ') aguardando aprovação',
              time_info: 'Aguardando há ' + hRetro + 'h',
              severity: hRetro >= maxHRetro * 2 ? 'Alta' : 'Média',
              action_suggestion:
                'Acessar Suprimentos > Baixas Retroativas para aprovar ou rejeitar a solicitação.',
              details: { op_number: retOp, material_code: retCode },
            })
          }
        }
      } catch (_) {}
    }

    // 8. Prazo sem iniciar (prazo_sem_iniciar)
    var cPrazoSemIniciar = configMap['prazo_sem_iniciar']
    if (cPrazoSemIniciar && cPrazoSemIniciar.enabled) {
      var antDays = Number(cPrazoSemIniciar.params.antecedencia_dias)
      if (isNaN(antDays) || antDays < 1) antDays = 21

      try {
        var notStarted = $app.findRecordsByFilter(
          'pcp_orders',
          'status != "Concluído" && started_at = ""',
          'delivery_date',
          500,
          0,
        )

        for (var n = 0; n < notStarted.length; n++) {
          var nOrder = notStarted[n]
          var nDeliveryStr = nOrder.getString('delivery_date')
          if (!nDeliveryStr) continue

          var nDelivery = new Date(nDeliveryStr)
          if (isNaN(nDelivery.getTime())) continue

          var nDaysUntil = Math.ceil(diffDaysCron(nDelivery, now))
          if (nDaysUntil >= 0 && nDaysUntil <= antDays) {
            var nOpNum =
              nOrder.getString('op_number') || nOrder.getString('order_number') || nOrder.id
            var nClient = nOrder.getString('client_name') || 'Cliente não informado'
            var nSev = nDaysUntil <= 7 ? 'Crítica' : nDaysUntil <= 14 ? 'Alta' : 'Média'

            alerts.push({
              id: 'prazo_sem_iniciar_' + nOrder.id,
              check_key: 'prazo_sem_iniciar',
              category: 'Inconsistência',
              entity_type: 'pcp_order',
              entity_id: nOrder.id,
              entity_ref: 'OP ' + nOpNum,
              title:
                'OP ' +
                nOpNum +
                ' (' +
                nClient +
                ') vence em ' +
                nDaysUntil +
                ' dias e ainda não foi iniciada',
              time_info: 'Vence em ' + nDaysUntil + ' dias (janela: ' + antDays + ' dias)',
              severity: nSev,
              action_suggestion:
                'Priorizar liberação da OP ' +
                nOpNum +
                ' no sequenciamento e verificar se há material disponível para começar a produção.',
              details: {
                op_number: nOpNum,
                client_name: nClient,
                delivery_date: nDeliveryStr,
                days_until_delivery: nDaysUntil,
              },
            })
          }
        }
      } catch (errCron8) {
        console.log('[PCP ALERTS] Erro no cron prazo_sem_iniciar:', String(errCron8))
      }
    }

    // 9. Prometida em risco (prometida_em_risco)
    var cPrometidaRisco = configMap['prometida_em_risco']
    if (cPrometidaRisco && cPrometidaRisco.enabled) {
      var margemDaysC = Number(cPrometidaRisco.params.margem_dias)
      if (isNaN(margemDaysC) || margemDaysC < 1) margemDaysC = 7

      try {
        var promisedOrders = $app.findRecordsByFilter(
          'pcp_orders',
          'status != "Concluído" && promised_date != "" && data_saida = ""',
          'promised_date',
          500,
          0,
        )

        for (var pr = 0; pr < promisedOrders.length; pr++) {
          var pOrder = promisedOrders[pr]
          var pPromisedStr = pOrder.getString('promised_date')
          if (!pPromisedStr) continue

          var pPromised = new Date(pPromisedStr)
          if (isNaN(pPromised.getTime())) continue

          var pDaysUntil = Math.ceil(diffDaysCron(pPromised, now))
          if (pDaysUntil > 14) continue // fora das janelas monitoradas

          var pOpNum =
            pOrder.getString('op_number') || pOrder.getString('order_number') || pOrder.id
          var pClient = pOrder.getString('client_name') || 'Cliente não informado'
          var pNote = pOrder.getString('promised_note') || 'Sem observação registrada'
          var pById = pOrder.getString('promised_by') || ''
          var pByName = pById
          if (pById) {
            try {
              var pUser = $app.findRecordById('users', pById)
              if (pUser) pByName = pUser.getString('name') || pUser.getString('email') || pById
            } catch (_) {
              pByName = pById
            }
          }
          var pStage = pOrder.getString('stage') || 'Fase não definida'
          var pSev = pDaysUntil < 0 ? 'Crítica' : pDaysUntil <= margemDaysC ? 'Alta' : 'Média'

          var pTitle, pTimeInfo, pSuggestion
          if (pDaysUntil < 0) {
            pTitle =
              'Prometida vencida: OP ' +
              pOpNum +
              ' (' +
              pClient +
              ') passou ' +
              Math.abs(pDaysUntil) +
              ' dias da data prometida'
            pTimeInfo = 'Vencida há ' + Math.abs(pDaysUntil) + ' dias'
            pSuggestion =
              'Comunicar ' +
              pByName +
              ' (autor da promessa) e renegociar a data com o cliente ' +
              pClient +
              ' ou priorizar a OP na etapa ' +
              pStage +
              '.'
          } else if (pDaysUntil <= margemDaysC) {
            pTitle =
              'Prometida em risco: OP ' +
              pOpNum +
              ' (' +
              pClient +
              ') vence em ' +
              pDaysUntil +
              ' dias'
            pTimeInfo = 'Vence em ' + pDaysUntil + ' dias (margem: ' + margemDaysC + ' dias)'
            pSuggestion =
              'Confirmar viabilidade com ' +
              pByName +
              ' e cobrar andamento na etapa ' +
              pStage +
              ' para cumprir o que foi prometido ao cliente ' +
              pClient +
              '.'
          } else {
            pTitle =
              'Prometida próximo do vencimento: OP ' +
              pOpNum +
              ' (' +
              pClient +
              ') vence em ' +
              pDaysUntil +
              ' dias'
            pTimeInfo = 'Vence em ' + pDaysUntil + ' dias'
            pSuggestion =
              'Monitorar andamento da OP ' +
              pOpNum +
              ' na etapa ' +
              pStage +
              ' — a data prometida por ' +
              pByName +
              ' vence em breve.'
          }

          alerts.push({
            id: 'prometida_em_risco_' + pOrder.id,
            check_key: 'prometida_em_risco',
            category: 'Inconsistência',
            entity_type: 'pcp_order',
            entity_id: pOrder.id,
            entity_ref: 'OP ' + pOpNum,
            title: pTitle,
            time_info: pTimeInfo,
            severity: pSev,
            action_suggestion: pSuggestion,
            details: {
              op_number: pOpNum,
              client_name: pClient,
              promised_date: pPromisedStr,
              promised_note: pNote,
              promised_by_name: pByName,
              days_until_promised: pDaysUntil,
            },
          })
        }
      } catch (errCron9) {
        console.log('[PCP ALERTS] Erro no cron prometida_em_risco:', String(errCron9))
      }
    }

    // 10. Especial com prazo apertado (especial_prazo)
    var cEspecialPrazo = configMap['especial_prazo']
    if (cEspecialPrazo && cEspecialPrazo.enabled) {
      var espDaysC = Number(cEspecialPrazo.params.antecedencia_dias)
      if (isNaN(espDaysC) || espDaysC < 1) espDaysC = 21

      var finalStages = {}
      var finalStageList = [
        'Pintura',
        'Retoques',
        'Montagem',
        'Qualidade',
        'Embalagem',
        'Expedição',
      ]
      for (var fs = 0; fs < finalStageList.length; fs++) {
        finalStages[finalStageList[fs]] = true
      }

      try {
        var specialOrders = $app.findRecordsByFilter(
          'pcp_orders',
          'op_type = "Especial" && status != "Concluído"',
          'delivery_date',
          500,
          0,
        )

        for (var sp = 0; sp < specialOrders.length; sp++) {
          var spOrder = specialOrders[sp]
          var spDeliveryStr = spOrder.getString('delivery_date')
          if (!spDeliveryStr) continue

          var spDelivery = new Date(spDeliveryStr)
          if (isNaN(spDelivery.getTime())) continue

          var spDaysUntil = Math.ceil(diffDaysCron(spDelivery, now))
          if (spDaysUntil < 0 || spDaysUntil > espDaysC) continue

          var spStage = spOrder.getString('stage') || 'Fase não definida'
          if (finalStages[spStage]) continue // já está no fim do fluxo, ok

          var spOpNum =
            spOrder.getString('op_number') || spOrder.getString('order_number') || spOrder.id
          var spClient = spOrder.getString('client_name') || 'Cliente não informado'

          alerts.push({
            id: 'especial_prazo_' + spOrder.id,
            check_key: 'especial_prazo',
            category: 'Inconsistência',
            entity_type: 'pcp_order',
            entity_id: spOrder.id,
            entity_ref: 'OP ' + spOpNum,
            title:
              'Especial com entrega em ' +
              spDaysUntil +
              ' dias ainda na etapa ' +
              spStage +
              ' (' +
              spClient +
              ')',
            time_info: 'Entrega em ' + spDaysUntil + ' dias (janela: ' + espDaysC + ' dias)',
            severity: spDaysUntil <= 7 ? 'Crítica' : spDaysUntil <= 14 ? 'Alta' : 'Média',
            action_suggestion:
              'Especial ' +
              spOpNum +
              ' de ' +
              spClient +
              ' ainda está na etapa ' +
              spStage +
              ' com entrega próxima — revisar caminho crítico e considerar antecipar etapas ou terceirizar.',
            details: {
              op_number: spOpNum,
              client_name: spClient,
              delivery_date: spDeliveryStr,
              stage: spStage,
              days_until_delivery: spDaysUntil,
            },
          })
        }
      } catch (errCron10) {
        console.log('[PCP ALERTS] Erro no cron especial_prazo:', String(errCron10))
      }
    }

    // Agente IA (supervisor-producao)
    var agentSummaryText = ''
    try {
      var adminUser = null
      try {
        adminUser = $app.findFirstRecordByFilter('users', 'active = true', 'created')
      } catch (_) {}

      if (adminUser) {
        var agentPrompt =
          'Analise o estado atual da fábrica e forneça:\n' +
          '1. Um resumo executivo curto da situação produtiva.\n' +
          '2. Padrões anômalos que estamos deixando passar em JSON no formato ```json [ ... ] ```.'

        var agentRes = $ai.agent('supervisor-producao').chat({
          user_id: adminUser.id,
          message: agentPrompt,
        })

        if (agentRes && agentRes.content) {
          agentSummaryText = agentRes.content
          var jsonMatch =
            agentRes.content.match(/```json([\s\S]*?)```/) ||
            agentRes.content.match(/\[([\s\S]*?)\]/)
          if (jsonMatch) {
            var rawJson = jsonMatch[1] ? jsonMatch[1].trim() : jsonMatch[0].trim()
            if (!rawJson.startsWith('[')) rawJson = '[' + rawJson + ']'
            try {
              var parsed = JSON.parse(rawJson)
              if (Array.isArray(parsed)) {
                for (var a = 0; a < parsed.length; a++) {
                  var itemA = parsed[a]
                  if (itemA && itemA.title) {
                    alerts.push({
                      id: 'agente_padrao_' + (a + 1) + '_' + Date.now(),
                      check_key: 'padrao_anomalo_ia',
                      category: 'Padrões Suspeitos',
                      entity_type: 'ia_insight',
                      entity_id: 'ia_' + (a + 1),
                      entity_ref: itemA.entity_ref || 'Chão de Fábrica',
                      title: String(itemA.title),
                      time_info: itemA.time_info || 'Identificado no cron',
                      severity: itemA.severity || 'Média',
                      action_suggestion: itemA.action_suggestion || 'Investigar junto à equipe.',
                      details: itemA.details ? { explanation: itemA.details } : {},
                    })
                  }
                }
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    var finished = new Date().toISOString()

    // Diff contra rodada anterior
    var previousRun = null
    try {
      previousRun = $app.findFirstRecordByFilter('pcp_alert_runs', '', '-created')
    } catch (_) {
      previousRun = null
    }

    var previousAlertIds = {}
    if (previousRun) {
      try {
        var prevResults = previousRun.get('results')
        if (typeof prevResults === 'string') prevResults = JSON.parse(prevResults)
        if (prevResults && Array.isArray(prevResults.alerts)) {
          for (var pa = 0; pa < prevResults.alerts.length; pa++) {
            previousAlertIds[prevResults.alerts[pa].id] = prevResults.alerts[pa]
          }
        }
      } catch (_) {}
    }

    var currentAlertIds = {}
    var categorizedCounts = {
      Atrasado: 0,
      Parado: 0,
      'Problema de Material': 0,
      Inconsistência: 0,
      'Padrões Suspeitos': 0,
    }

    for (var al = 0; al < alerts.length; al++) {
      var oneAlert = alerts[al]
      currentAlertIds[oneAlert.id] = true
      if (previousAlertIds[oneAlert.id]) {
        oneAlert.status = 'persistente'
      } else {
        oneAlert.status = 'novo'
      }
      var cat = oneAlert.category || 'Inconsistência'
      if (categorizedCounts[cat] !== undefined) {
        categorizedCounts[cat]++
      } else {
        categorizedCounts[cat] = 1
      }
    }

    var resolvedItems = []
    var prevKeys = Object.keys(previousAlertIds)
    for (var pk = 0; pk < prevKeys.length; pk++) {
      var pId = prevKeys[pk]
      if (!currentAlertIds[pId]) {
        var resolvedAlert = previousAlertIds[pId]
        resolvedAlert.status = 'resolvido'
        resolvedItems.push(resolvedAlert)
      }
    }

    var summaryLine =
      'Rotina diária concluída com ' +
      alerts.length +
      ' alertas ativos e ' +
      resolvedItems.length +
      ' resolvidos.'

    var runPayload = {
      alerts: alerts,
      resolved_count: resolvedItems.length,
      resolved_alerts: resolvedItems.slice(0, 50),
      categorized_counts: categorizedCounts,
      agent_summary: agentSummaryText,
    }

    var runsCol = $app.findCollectionByNameOrId('pcp_alert_runs')
    var runRecord = new Record(runsCol)
    runRecord.set('started', started)
    runRecord.set('finished', finished)
    runRecord.set('trigger_type', 'cron_0405')
    runRecord.set('results', runPayload)
    runRecord.set('summary', summaryLine)
    $app.save(runRecord)

    console.log('[PCP ALERTS] Rotina diária concluída:', summaryLine)
  } catch (cronFatal) {
    console.log('[PCP ALERTS] Erro fatal no cron diário:', String(cronFatal))
  }
})
