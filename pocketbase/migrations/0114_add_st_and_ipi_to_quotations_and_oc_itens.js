migrate(
  (app) => {
    const quotationsCol = app.findCollectionByNameOrId('quotations')
    if (!quotationsCol.fields.getByName('st_value')) {
      quotationsCol.fields.add(new NumberField({ name: 'st_value', required: false }))
    }
    if (!quotationsCol.fields.getByName('ipi_value')) {
      quotationsCol.fields.add(new NumberField({ name: 'ipi_value', required: false }))
    }
    app.save(quotationsCol)

    const ocItensCol = app.findCollectionByNameOrId('ordem_compra_itens')
    if (!ocItensCol.fields.getByName('st_value')) {
      ocItensCol.fields.add(new NumberField({ name: 'st_value', required: false }))
    }
    if (!ocItensCol.fields.getByName('ipi_value')) {
      ocItensCol.fields.add(new NumberField({ name: 'ipi_value', required: false }))
    }
    app.save(ocItensCol)
  },
  (app) => {
    try {
      const quotationsCol = app.findCollectionByNameOrId('quotations')
      quotationsCol.fields.removeByName('st_value')
      quotationsCol.fields.removeByName('ipi_value')
      app.save(quotationsCol)
    } catch (_) {}

    try {
      const ocItensCol = app.findCollectionByNameOrId('ordem_compra_itens')
      ocItensCol.fields.removeByName('st_value')
      ocItensCol.fields.removeByName('ipi_value')
      app.save(ocItensCol)
    } catch (_) {}
  },
)
