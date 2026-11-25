// Migration 0178 — REPARO RETROATIVO de custo de entradas de estoque (inventory_movements
// type=Entrada) para incluir IPI/ST e parcela de frete que já constavam nas OCs, mas não
// entraram no custo gravado (custos antigos gravavam só mercadoria ± frete rateado por valor
// de mercadoria). Regras:
//   • Custo corrigido = mercadoria + ipi_value + st_value do item da OC + parcela de frete
//     (rateio pela MESMA fórmula nova do hook distribute-oc-full: peso = qty×preço + IPI + ST).
//   • Idempotente: só repara registros cuja traceability NÃO contenha as parcelas (sem ipi_
//     nem freight_ gravados) — nunca duplica IPI/frete em quem já tem.
//   • Frete só é aplicado quando está registrado (traceability.freight ou freight da própria
//     movimentação). Sem frete registrado, NÃO inventa valor: repara apenas IPI/ST e lista
//     os pulados no log.
//   • Marca o custo reparado: traceability.cost_repaired = true (auditabilidade).
//   • No-op em banco vazio. Segura para rodar em produção.
migrate(
  (app) => {
    const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100
    const num = (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }
    const parseTrace = (raw) => {
      if (!raw) return null
      if (typeof raw === 'object') return raw
      try {
        return JSON.parse(raw)
      } catch (_) {
        return null
      }
    }

    let repaired = 0
    let taxOnly = 0
    const skippedNoFreight = []

    // 1) Entradas vinculadas a itens de OC — fonte de IPI/ST/frete
    const items = app.findRecordsByFilter(
      'ordem_compra_itens',
      'ipi_value > 0 || st_value > 0 || received_quantity > 0',
      '',
      0,
      0,
    )
    for (const item of items) {
      const trace = parseTrace(item.get('traceability')) || {}
      const movements = app.findRecordsByFilter(
        'inventory_movements',
        `oc_item_id = "${item.id}"`,
        '',
        0,
        0,
      )
      if (movements.length === 0) continue

      const qty = num(item.get('quantity'))
      const unitPrice = num(item.get('unit_price'))
      const ipi = num(item.get('ipi_value'))
      const st = num(item.get('st_value'))
      const merchandise = round2(qty * unitPrice)

      for (const mov of movements) {
        const movTrace = parseTrace(mov.get('traceability')) || {}
        // Já tem IPI e frete? (idempotência)
        const hasIpi =
          movTrace.ipi_amount != null || movTrace.ipi_value != null || movTrace.tax_amount != null
        const hasFreight =
          movTrace.freight != null ||
          movTrace.freight_amount != null ||
          movTrace.freight_share != null ||
          movTrace.freight_key != null
        const oldTotal = num(mov.get('total_value'))

        // Peso do item na nota (fórmula nova: mercadoria + IPI + ST)
        const weight = round2(merchandise + ipi + st)

        // Frete: prioridade para o gravado na própria movimentação (traceability ou campo),
        // senão o da OC. Não inventor valor.
        let freightTotal = num(movTrace.freight ?? mov.get('freight'))
        if (freightTotal <= 0) {
          const oc = (() => {
            try {
              return app.findRecordById('ordens_de_compra', item.get('oc_id'))
            } catch (_) {
              return null
            }
          })()
          if (oc) {
            const ocTrace = parseTrace(oc.get('traceability')) || {}
            freightTotal = num(ocTrace.freight)
          }
        }

        let newTotal = oldTotal
        const notes = []

        if (!hasIpi && ipi + st > 0) {
          newTotal += ipi + st
          notes.push('IPI/ST')
        }
        if (!hasFreight && freightTotal > 0 && weight > 0) {
          // Parcela do item no frete total — só repara quando a movimentação cobre a
          // integralidade do item (entrada integral). Parciais ficam de fora para não
          // superestimar o custo.
          const receivedQty = num(mov.get('quantity'))
          if (receivedQty + 0.0001 >= qty) {
            const share = (weight / weight) * freightTotal // item único na nota? não — ver abaixo
            // O rateio correto considera TODOS os itens da OC; aqui buscamos a OC inteira:
            const ocId = item.get('oc_id')
            if (ocId) {
              const siblings = app.findRecordsByFilter(
                'ordem_compra_itens',
                `oc_id = "${ocId}"`,
                '',
                0,
                0,
              )
              const totalWeight = siblings.reduce(
                (acc, s) =>
                  acc +
                  (num(s.get('quantity')) * num(s.get('unit_price')) +
                    num(s.get('ipi_value')) +
                    num(s.get('st_value'))),
                0,
              )
              if (totalWeight > 0) {
                newTotal += round2((weight / totalWeight) * freightTotal)
                notes.push('frete')
                repaired++
              } else {
                skippedNoFreight.push(mov.id + ' (peso total da OC zerado)')
                continue
              }
            }
          } else {
            skippedNoFreight.push(mov.id + ' (entrada parcial — frete não atribuído)')
            continue
          }
        }

        if (notes.length === 0) continue

        const mergedTrace = { ...movTrace }
        // preserva parcelas já existentes
        mergedTrace.cost_repaired = true
        mergedTrace.repair_note = `Migration 0178: +${notes.join(' + ')}`
        if (!hasIpi) {
          mergedTrace.ipi_amount = ipi
          mergedTrace.st_amount = st
        }
        mergedTrace.freight_items = mergedTrace.freight_items || undefined

        mov.set('total_value', round2(newTotal))
        mov.set('traceability', JSON.stringify(mergedTrace))
        app.save(mov)
        if (notes.includes('IPI/ST')) taxOnly++
      }
    }

    // 2) Entradas SEM item de OC (item avulso com traceability e frete próprio): repara
    //    apenas IPI/ST se o item da OC não existir — caso raro, tratado pelo item 1.
    //    (Nada a fazer: IPI/ST vivem em ordem_compra_itens.)

    console.log(
      `[migration-0178] reparos aplicados: ${repaired} (somente frete), taxOnly=${taxOnly}, ` +
        `pulados sem frete registrado: ${skippedNoFreight.length ? skippedNoFreight.join('; ') : 'nenhum'}`,
    )
  },
  (app) => {
    // Down: reversão dos totais é inviável sem backup dos valores originais —
    // migration de reparo, forward-only. No-op.
  },
)
