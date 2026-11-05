migrate(
  (app) => {
    const costsCol = app.findCollectionByNameOrId('pcp_order_costs')
    const catField = costsCol.fields.getByName('category')
    if (catField) {
      costsCol.fields.removeByName('category')
      costsCol.fields.add(new TextField({ name: 'category', required: false }))
      app.save(costsCol)
    }
  },
  (app) => {
    // Reverter para select padrão se necessário
    const costsCol = app.findCollectionByNameOrId('pcp_order_costs')
    const catField = costsCol.fields.getByName('category')
    if (catField && catField.type === 'text') {
      costsCol.fields.removeByName('category')
      costsCol.fields.add(
        new SelectField({
          name: 'category',
          required: true,
          values: [
            'Material',
            'Insumo',
            'Mão de Obra',
            'Terceirização',
            'Impostos',
            'Comissão',
            'RT',
            'Frete',
            'Outros',
          ],
          maxSelect: 1,
        }),
      )
      app.save(costsCol)
    }
  },
)
