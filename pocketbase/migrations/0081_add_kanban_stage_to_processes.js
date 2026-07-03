migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('product_processes')
    if (!col.fields.getByName('kanban_stage')) {
      col.fields.add(
        new SelectField({
          name: 'kanban_stage',
          values: [
            'Separação',
            'Cotação',
            'Compra',
            'Retirada',
            'Aguardando',
            'Corte',
            'Dobra',
            'Calandra',
            'Solda',
            'Acab. Solda',
            'Furação',
            'Rosca',
            'Concreto',
            'Terceirização',
            'Preparação',
            'Pintura',
            'Verniz',
            'Retoques',
            'Montagem',
            'Qualidade',
            'Embalagem',
            'Suprimentos',
            'Fabricação',
            'Acabamento',
            'Expedição',
            'Projetos',
          ],
          maxSelect: 1,
        }),
      )
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('product_processes')
    col.fields.removeByName('kanban_stage')
    app.save(col)
  },
)
