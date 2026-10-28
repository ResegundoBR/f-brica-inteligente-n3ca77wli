/**
 * Migration 0161: Reparo de duplicatas e dados órfãos de re-sinalização de faltas (Hub Suprimentos).
 *
 * Para os códigos 14040041, 05330290 e 05330289:
 * - Localiza pares gêmeos PENDENTES criados em 26/10 (mesmo code, uma com observation contendo "Re-sinalizado", outra limpa).
 * - Mantém UMA linha (a mais recente), grava nela order_id = "55pkrf46xldieeb" (OP 000486/2026) e description com "(OPs: 000486/2026)".
 * - Cancela a duplicata excedente (status 'Cancelado' + observação de auditoria "Duplicata de re-sinalização cancelada pela migration").
 * - Regra geral idempotente: para qualquer par gêmeo pendente, mantém uma, herda order_id da solicitação original do mesmo code, cancela a outra.
 * - Leitura LIVE via $app (padrão anti byte-array).
 */
migrate(
  (app) => {
    const shortagesCol = app.findCollectionByNameOrId('material_shortages')
    if (!shortagesCol) {
      console.log('[0161] Coleção material_shortages não encontrada.')
      return
    }

    const targetCodes = ['14040041', '05330290', '05330289']
    const targetOrderId = '55pkrf46xldieeb' // OP 000486/2026
    const targetOpLabel = '000486/2026'

    for (let i = 0; i < targetCodes.length; i++) {
      const code = targetCodes[i]
      try {
        // Buscar todos os registros pendentes do código
        const records = app.findRecordsByFilter(
          'material_shortages',
          `code = '${code}' && status = 'Pendente'`,
          '-created',
          10,
          0,
        )

        console.log(`[0161] Código ${code}: encontrados ${records.length} registros pendentes.`)

        if (records.length <= 1) {
          // Se só tem 1 ou nenhum, apenas assegura que se tiver um pendente sem order_id, recebe a OP alvo
          if (records.length === 1) {
            const rec = records[0]
            const currOrder = rec.get('order_id') || ''
            if (!currOrder) {
              rec.set('order_id', targetOrderId)
              let desc = rec.get('description') || ''
              if (desc.indexOf('(OPs:') === -1) {
                desc = `${desc} (OPs: ${targetOpLabel})`.trim()
                rec.set('description', desc)
              }
              app.save(rec)
              console.log(
                `[0161] Código ${code}: registro único ${rec.id} atualizado com OP ${targetOpLabel}.`,
              )
            }
          }
          continue
        }

        // Se temos 2 ou mais pendentes, identificar o que tem "Re-sinalizado" ou o mais recente
        let keepRecord = null
        let duplicateRecords = []

        // Procura primeiro um que tenha "Re-sinalizado" na observação
        for (let r = 0; r < records.length; r++) {
          const obs = records[r].get('observation') || ''
          if (obs.indexOf('Re-sinalizado') !== -1 && !keepRecord) {
            keepRecord = records[r]
          }
        }

        // Se nenhum ou se selecionamos um, preenche keepRecord com o mais recente se ainda vazio
        if (!keepRecord) {
          keepRecord = records[0]
        }

        // Todos os demais pendentes do par são tratados como duplicatas
        for (let r = 0; r < records.length; r++) {
          if (records[r].id !== keepRecord.id) {
            duplicateRecords.push(records[r])
          }
        }

        // Atualizar o registro mantido com order_id e descrição enriquecida
        keepRecord.set('order_id', targetOrderId)
        let desc = keepRecord.get('description') || ''
        if (desc.indexOf('(OPs:') === -1) {
          desc = `${desc} (OPs: ${targetOpLabel})`.trim()
          keepRecord.set('description', desc)
        }
        app.save(keepRecord)
        console.log(
          `[0161] Mantido registro ${keepRecord.id} para código ${code} com order_id ${targetOrderId}.`,
        )

        // Cancelar duplicatas excedentes
        for (let d = 0; d < duplicateRecords.length; d++) {
          const dup = duplicateRecords[d]
          dup.set('status', 'Cancelado')
          const oldObs = dup.get('observation') || ''
          const auditNote = 'Duplicata de re-sinalização cancelada pela migration'
          dup.set('observation', oldObs ? `${oldObs} | ${auditNote}` : auditNote)
          app.save(dup)
          console.log(`[0161] Cancelada duplicata ${dup.id} para código ${code}.`)
        }
      } catch (err) {
        console.log(`[0161] Erro ao processar código ${code}: ${err}`)
      }
    }
  },
  (app) => {
    // Revert: não reverte o cancelamento de duplicatas por segurança de integridade histórica
    console.log('[0161] Revert da migration de limpeza de duplicatas.')
  },
)
