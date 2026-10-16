migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ordem_compra_itens')
    if (!col.fields.getByName('received_quantity')) {
      col.fields.add(
        new NumberField({
          name: 'received_quantity',
          required: false,
          onlyInt: false,
        }),
      )
      app.save(col)
      console.log('Campo received_quantity adicionado a ordem_compra_itens')
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('ordem_compra_itens')
    if (col.fields.getByName('received_quantity')) {
      col.fields.removeByName('received_quantity')
      app.save(col)
    }
  },
)
