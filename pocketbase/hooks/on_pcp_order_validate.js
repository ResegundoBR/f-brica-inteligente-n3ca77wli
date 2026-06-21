onRecordValidate((e) => {
  const orderNum = e.record.getString('order_number')
  if (orderNum && orderNum.includes('///')) {
    const parts = orderNum.split('///')
    e.record.set('order_number', parts[0])
    e.record.set('op_number', parts[1])
  }
  e.next()
}, 'pcp_orders')
