migrate(
  (app) => {
    // 1. Cancelar o registro de excedente duplicado s6oue176nfqp5in
    try {
      const dupRec = app.findRecordById('material_shortages', 's6oue176nfqp5in')
      dupRec.set('status', 'Cancelado')
      const currentObs = dupRec.getString('observation') || ''
      const cancelObs =
        'Cancelado por duplicidade de excedente em lote — mantido id 5hcl185ovv57nai'
      dupRec.set('observation', currentObs ? currentObs + ' | ' + cancelObs : cancelObs)
      app.save(dupRec)
    } catch (e) {
      console.log('Error canceling surplus duplicate s6oue176nfqp5in: ' + e)
    }

    // 2. Ajustar o excedente mantido 5hcl185ovv57nai para 7 un (conforme OC 38.911 que comprou 17 un: 10 solicitadas + 7 estoque)
    try {
      const surplusRec = app.findRecordById('material_shortages', '5hcl185ovv57nai')
      surplusRec.set('quantity', 7)
      surplusRec.set(
        'observation',
        'Compra para estoque (excedente de lote consolidado: 17 un compradas − 10 un solicitadas)',
      )
      app.save(surplusRec)
    } catch (e) {
      console.log('Error adjusting surplus 5hcl185ovv57nai: ' + e)
    }

    // 3. Atualizar o batch_info do representante do lote owbbm9ibmq0pntn para refletir 17 un reais e 7 un excedente
    try {
      const parentRec = app.findRecordById('material_shortages', 'owbbm9ibmq0pntn')
      const batchInfo = {
        is_batch_parent: true,
        actual_quantity: 17,
        requested_total: 10,
        surplus_quantity: 7,
        sub_shortage_ids: ['owbbm9ibmq0pntn', 'pvja5jo8r1l36bv', 'rwszhhy714twx1e'],
        surplus_shortage_id: '5hcl185ovv57nai',
        supplier: 'Eletrorastro',
        unit_price: 4.26,
        expected_date: '2026-09-30 12:00:00.000Z',
      }
      parentRec.set('batch_info', JSON.stringify(batchInfo))
      app.save(parentRec)
    } catch (e) {
      console.log('Error updating batch_info for owbbm9ibmq0pntn: ' + e)
    }
  },
  (app) => {
    // Reverter ajustes se necessário
    try {
      const surplusRec = app.findRecordById('material_shortages', '5hcl185ovv57nai')
      surplusRec.set('quantity', 9)
      app.save(surplusRec)
    } catch (_) {}
  },
)
