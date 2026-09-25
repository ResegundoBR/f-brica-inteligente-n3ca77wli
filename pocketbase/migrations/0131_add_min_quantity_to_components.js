migrate(
  (app) => {
    // 1. Adicionar campo 'min_quantity' (number, opcional, decimal suportado) na coleção 'components'
    const componentsCol = app.findCollectionByNameOrId('components')
    if (!componentsCol.fields.getByName('min_quantity')) {
      componentsCol.fields.add(
        new NumberField({
          name: 'min_quantity',
          required: false,
          onlyInt: false,
        }),
      )
      app.save(componentsCol)
    }

    // 2. Garantir que a coleção 'inventory' também aceita decimal no min_quantity
    const inventoryCol = app.findCollectionByNameOrId('inventory')
    const invMinField = inventoryCol.fields.getByName('min_quantity')
    if (invMinField) {
      invMinField.onlyInt = false
      app.save(inventoryCol)
    }

    // 3. Migrar níveis já cadastrados em pcp_material_min_levels para components e inventory
    try {
      const minLevelRecords = app.findRecordsByFilter(
        'pcp_material_min_levels',
        '',
        'created',
        0,
        0,
      )
      for (let i = 0; i < minLevelRecords.length; i++) {
        const rec = minLevelRecords[i]
        const code = (rec.getString('material_code') || '').trim()
        const minVal = rec.getFloat('min_level') || rec.getInt('min_level') || 0

        if (!code || minVal <= 0) continue

        // Atualizar components correspondente(s)
        try {
          const comps = app.findRecordsByFilter(
            'components',
            `code = "${code.replace(/["'\\]/g, '')}"`,
            '',
            0,
            0,
          )
          for (let c = 0; c < comps.length; c++) {
            comps[c].set('min_quantity', minVal)
            app.save(comps[c])
          }
        } catch (_) {}

        // Atualizar inventory correspondente(s)
        try {
          const invs = app.findRecordsByFilter(
            'inventory',
            `code = "${code.replace(/["'\\]/g, '')}"`,
            '',
            0,
            0,
          )
          for (let v = 0; v < invs.length; v++) {
            invs[v].set('min_quantity', minVal)
            app.save(invs[v])
          }
        } catch (_) {}
      }
    } catch (_) {}

    // 4. Também sincronizar quaisquer min_quantity já existentes em inventory para components se components não tiver ainda
    try {
      const invWithMin = app.findRecordsByFilter('inventory', 'min_quantity > 0', '', 0, 0)
      for (let j = 0; j < invWithMin.length; j++) {
        const inv = invWithMin[j]
        const code = (inv.getString('code') || '').trim()
        const minVal = inv.getFloat('min_quantity') || inv.getInt('min_quantity') || 0
        if (!code || minVal <= 0) continue

        try {
          const comps = app.findRecordsByFilter(
            'components',
            `code = "${code.replace(/["'\\]/g, '')}"`,
            '',
            0,
            0,
          )
          for (let k = 0; k < comps.length; k++) {
            const currentMin =
              comps[k].getFloat('min_quantity') || comps[k].getInt('min_quantity') || 0
            if (!currentMin) {
              comps[k].set('min_quantity', minVal)
              app.save(comps[k])
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const componentsCol = app.findCollectionByNameOrId('components')
      if (componentsCol.fields.getByName('min_quantity')) {
        componentsCol.fields.removeByName('min_quantity')
        app.save(componentsCol)
      }
    } catch (_) {}
  },
)
