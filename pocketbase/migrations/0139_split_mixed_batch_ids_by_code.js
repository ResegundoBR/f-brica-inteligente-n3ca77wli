migrate(
  (app) => {
    // Migration 0139: Varrer material_shortages com batch_id e re-rotular por código lotes que misturam códigos diferentes
    // Requisito da tarefa:
    // (2) MIGRATION: varrer todos os material_shortages com batch_id cujo lote contenha mais de um code
    // e re-rotular por código — cada grupo de código fica com um batch_id próprio (sufixo novo),
    // registros únicos de um código dentro do lote ficam sem batch_id;
    // preservar status Compra, fornecedor, preços, datas e observações;
    // registrar no relatório quantos lotes foram corrigidos.
    // O lote afetado conhecido é lote_1791568159254_ftprwd, mas a varredura deve pegar qualquer lote com códigos misturados.

    console.log('[MIGRATION 0139] Iniciando varredura de lotes com códigos misturados...')

    // 1. Buscar todos os registros com batch_id preenchido
    const records = app.findRecordsByFilter(
      'material_shortages',
      'batch_id != "" && batch_id != null',
      'created',
      5000,
      0,
    )

    console.log('[MIGRATION 0139] Total de registros com batch_id encontrados: ' + records.length)

    // Agrupar por batch_id
    const batchesMap = {}
    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      const bId = rec.getString('batch_id')
      if (!batchesMap[bId]) {
        batchesMap[bId] = []
      }
      batchesMap[bId].push(rec)
    }

    let fixedBatchesCount = 0
    let totalUpdatedRecords = 0

    const batchIds = Object.keys(batchesMap)
    for (let b = 0; b < batchIds.length; b++) {
      const bId = batchIds[b]
      const batchList = batchesMap[bId]

      // Agrupa os itens deste lote por chave de código
      const byCode = {}
      for (let j = 0; j < batchList.length; j++) {
        const item = batchList[j]
        const rawCode = (item.getString('code') || '').trim()
        const rawDesc = (item.getString('description') || '').trim()
        const key = rawCode ? 'code:' + rawCode.toLowerCase() : 'desc:' + rawDesc.toLowerCase()
        if (!byCode[key]) {
          byCode[key] = []
        }
        byCode[key].push(item)
      }

      const distinctCodeCount = Object.keys(byCode).length

      // Se contém mais de 1 código/descrição, o lote está misturado e deve ser corrigido
      if (distinctCodeCount > 1) {
        fixedBatchesCount++
        console.log(
          '[MIGRATION 0139] Lote misturado detectado: ' +
            bId +
            ' com ' +
            distinctCodeCount +
            ' códigos distintos (' +
            batchList.length +
            ' registros totais)',
        )

        const codeKeys = Object.keys(byCode)
        for (let c = 0; c < codeKeys.length; c++) {
          const key = codeKeys[c]
          const group = byCode[key]

          if (group.length >= 2) {
            // Grupo de 2+ registros do mesmo código: ganha novo batch_id com sufixo por código
            // Formato preserva o prefixo original + sufixo determinístico do código / sub-índice
            // e.g. `${bId}_c${c + 1}`
            const newBatchId = bId + '_c' + (c + 1)
            console.log(
              '  -> Grupo [' +
                key +
                '] com ' +
                group.length +
                ' itens recebe novo batch_id: ' +
                newBatchId,
            )

            for (let k = 0; k < group.length; k++) {
              const recToUpdate = group[k]
              recToUpdate.set('batch_id', newBatchId)
              app.save(recToUpdate)
              totalUpdatedRecords++
            }
          } else {
            // Registro único de um código dentro do lote: fica sem batch_id (linha individual)
            const singleRec = group[0]
            console.log(
              '  -> Registro único [' +
                key +
                '] (id: ' +
                singleRec.id +
                ') removido batch_id (item individual)',
            )
            singleRec.set('batch_id', '')
            app.save(singleRec)
            totalUpdatedRecords++
          }
        }
      }
    }

    console.log(
      '[MIGRATION 0139] Concluído! Lotes corrigidos: ' +
        fixedBatchesCount +
        ', Registros atualizados: ' +
        totalUpdatedRecords,
    )
  },
  (app) => {
    // Reversão
  },
)
