function checkAndResolve(orderId) {
  if (!orderId) return
  const resolvedStatuses = ['Recebido', 'Liberado_Estoque', 'Cancelado']
  const shortages = $app.findRecordsByFilter(
    'material_shortages',
    "order_id = '" + orderId + "'",
    '',
    1000,
    0,
  )
  const allResolved = shortages.every((s) => resolvedStatuses.includes(s.getString('status')))

  if (allResolved) {
    try {
      const order = $app.findRecordById('pcp_orders', orderId)
      if (order.getString('bottleneck_reason') === 'Falta de Material') {
        order.set('bottleneck_reason', 'Nenhum')
        order.set('bottleneck_details', 'Materiais recebidos/liberados (Baixa automática)')
        if (order.getString('status') === 'Parado') {
          order.set('status', order.getString('started_at') ? 'Em Andamento' : 'Fila')
        }
        $app.save(order)

        const log = new Record($app.findCollectionByNameOrId('pcp_order_logs'))
        log.set('order_id', orderId)
        log.set('action', 'Gargalo Resolvido (Automático)')
        log.set(
          'details',
          'Todos os materiais faltantes foram recebidos ou liberados pelo PCP/Suprimentos.',
        )
        log.set('stage', order.getString('stage'))
        $app.save(log)
      }
    } catch (err) {
      console.log('Error resolving order bottleneck automatically', err.message)
    }
  }
}

onRecordAfterUpdateSuccess((e) => {
  const newStatus = e.record.getString('status')
  const oldStatus = e.record.original().getString('status')
  if (newStatus === oldStatus) return e.next()
  checkAndResolve(e.record.getString('order_id'))
  return e.next()
}, 'material_shortages')

onRecordAfterDeleteSuccess((e) => {
  checkAndResolve(e.record.getString('order_id'))
  return e.next()
}, 'material_shortages')
