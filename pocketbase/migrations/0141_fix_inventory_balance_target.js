migrate(
  (app) => {
    console.log('[MIGRATION 0141] Corrigindo saldo final do inventário qqrn566sxcodwnq para 38...')
    const invRec = app.findRecordById('inventory', 'qqrn566sxcodwnq')
    const beforeQty = invRec.getInt('quantity')

    // Saldo especificado no requisito:
    // saldo final do inventário qqrn566sxcodwnq deve ficar 38 (entrada 50 − saídas 21: 1+14+2+4)
    invRec.set('quantity', 38)
    app.save(invRec)

    console.log(
      '[MIGRATION 0141] Saldo do inventário qqrn566sxcodwnq atualizado com sucesso: ' +
        beforeQty +
        ' -> 38',
    )
  },
  (app) => {
    // Reversão
  },
)
