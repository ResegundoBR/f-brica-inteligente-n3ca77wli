/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0159: Adiciona campo opcional confirmed_large na collection inventory_movements.
 * Utilizado para permitir saídas que excedam 10x o saldo atual quando expressamente confirmadas no frontend.
 */

migrate(
  (app) => {
    var collection = app.findCollectionByNameOrId('inventory_movements')
    var existingField = null
    try {
      existingField = collection.fields.getByName('confirmed_large')
    } catch (_) {}

    if (!existingField) {
      collection.fields.addAt(
        collection.fields.length,
        new BoolField({
          name: 'confirmed_large',
          required: false,
        }),
      )
      app.save(collection)
      console.log('[MIGRATION 0159] Campo confirmed_large adicionado a inventory_movements.')
    }
  },
  (app) => {
    try {
      var collection = app.findCollectionByNameOrId('inventory_movements')
      var field = collection.fields.getByName('confirmed_large')
      if (field) {
        collection.fields.removeByName('confirmed_large')
        app.save(collection)
      }
    } catch (_) {}
  },
)
