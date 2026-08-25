/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('improvements')
    if (!col.fields.getByName('sector')) {
      col.fields.add(
        new SelectField({
          name: 'sector',
          required: false,
          maxSelect: 1,
          values: [
            'Embalagem',
            'Expedição',
            'Montagem',
            'Limpeza',
            'Fabricação',
            'Acabamento',
            'Concreto',
          ],
        }),
      )
      col.addIndex('idx_improvements_sector', false, 'sector', '')
      app.save(col)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('improvements')
      col.removeIndex('idx_improvements_sector')
      col.fields.removeByName('sector')
      app.save(col)
    } catch (_) {}
  },
)
