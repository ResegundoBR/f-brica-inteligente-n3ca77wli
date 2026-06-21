migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')
    col.addIndex('idx_material_shortages_code', false, 'code', '')
    col.addIndex('idx_material_shortages_description', false, 'description', '')
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('material_shortages')
    col.removeIndex('idx_material_shortages_code')
    col.removeIndex('idx_material_shortages_description')
    app.save(col)
  },
)
