/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const shortages = app.findCollectionByNameOrId('material_shortages')

    let adminId = null
    try {
      const admin = app.findAuthRecordByEmail('users', 'reginaldo.segundo@planagroup.com.br')
      adminId = admin.id
    } catch (e) {}

    const itemDesc = 'Parafuso Sextavado M8'

    const historyData = [
      { supplier: 'Ferramentas & Cia', price: 1.5, date: '2026-04-10 10:00:00.000Z' },
      { supplier: 'Atacadão dos Parafusos', price: 1.45, date: '2026-05-15 14:00:00.000Z' },
      { supplier: 'Ferragens Express', price: 1.6, date: '2026-06-01 09:30:00.000Z' },
    ]

    for (const h of historyData) {
      try {
        app.findFirstRecordByData('material_shortages', 'observation', 'Seed data: ' + h.supplier)
      } catch (_) {
        const record = new Record(shortages)
        record.set('description', itemDesc)
        record.set('code', 'PRF-M8')
        record.set('quantity', 100)
        record.set('sector', 'Fabricação')
        record.set('status', 'Recebido')
        record.set('supplier', h.supplier)
        record.set('unit_price', h.price)
        record.set('purchase_date', h.date)
        record.set('priority', 'Sem pressa')
        record.set('request_type', 'Materiais')
        record.set('observation', 'Seed data: ' + h.supplier)
        if (adminId) record.set('requested_by', adminId)
        app.save(record)
      }
    }
  },
  (app) => {
    const q = app
      .db()
      .newQuery("DELETE FROM material_shortages WHERE observation LIKE 'Seed data: %'")
    q.execute()
  },
)
