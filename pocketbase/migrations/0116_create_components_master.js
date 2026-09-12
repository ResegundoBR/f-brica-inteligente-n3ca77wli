migrate(
  (app) => {
    // 1. Criar a coleção 'components'
    // code, description, unit, active, source
    let componentsCol
    try {
      componentsCol = app.findCollectionByNameOrId('components')
    } catch (_) {
      componentsCol = new Collection({
        name: 'components',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'code', type: 'text', required: false },
          { name: 'description', type: 'text', required: true },
          { name: 'unit', type: 'text', required: false },
          { name: 'active', type: 'bool', required: false },
          {
            name: 'source',
            type: 'select',
            required: false,
            values: ['inventory', 'catalog', 'manual', 'imported'],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_components_code ON components (code)',
          'CREATE INDEX idx_components_description ON components (description)',
          'CREATE INDEX idx_components_active ON components (active)',
        ],
      })
      app.save(componentsCol)
    }

    // 2. Adicionar campo 'component_id' na coleção 'inventory' para referenciar o mestre
    // Modo estritamente ADITIVO: o código e a descrição de inventory continuam intactos!
    const inventoryCol = app.findCollectionByNameOrId('inventory')
    if (!inventoryCol.fields.getByName('component_id')) {
      inventoryCol.fields.add(
        new RelationField({
          name: 'component_id',
          collectionId: componentsCol.id,
          required: false,
          maxSelect: 1,
        }),
      )
      app.save(inventoryCol)
    }

    // 3. Popular 'components' a partir do 'inventory' atual e associar component_id no inventory
    const inventoryRecords = app.findRecordsByFilter('inventory', '', 'created', 0, 0)
    for (let i = 0; i < inventoryRecords.length; i++) {
      const inv = inventoryRecords[i]
      const invCode = (inv.getString('code') || '').trim()
      const invDesc = (inv.getString('description') || '').trim()
      const invUnit = (inv.getString('unit') || 'un').trim()

      if (!invDesc && !invCode) continue

      let compRec = null
      if (invCode) {
        try {
          compRec = app.findFirstRecordByData('components', 'code', invCode)
        } catch (_) {}
      }

      if (!compRec && invDesc) {
        try {
          compRec = app.findFirstRecordByData('components', 'description', invDesc)
        } catch (_) {}
      }

      if (!compRec) {
        compRec = new Record(componentsCol)
        compRec.set('code', invCode)
        compRec.set('description', invDesc)
        compRec.set('unit', invUnit || 'un')
        compRec.set('active', true)
        compRec.set('source', 'inventory')
        app.save(compRec)
      }

      if (!inv.getString('component_id')) {
        inv.set('component_id', compRec.id)
        app.save(inv)
      }
    }

    // 4. Importar componentes que existem só na composição do Catálogo Técnico (products.data.composition)
    // Marcados como 'catalog' (somente catálogo, sem estoque).
    // A composição dos produtos NÃO é alterada.
    const productRecords = app.findRecordsByFilter('products', '', 'created', 0, 0)

    for (let p = 0; p < productRecords.length; p++) {
      const prod = productRecords[p]
      // No PocketBase v0.26 / goja, para campo JSON:
      // prod.get('data') ou prod.getRaw('data') ou prod.getString('data')
      let compList = null
      let rawData = prod.get('data')

      if (rawData) {
        // Se já for objeto JS
        if (typeof rawData === 'object' && rawData !== null) {
          if (Array.isArray(rawData.composition)) {
            compList = rawData.composition
          } else if (rawData.composition && typeof rawData.composition === 'object') {
            // Em Goja, arrays podem se comportar como objetos indexados
            compList = rawData.composition
          }
        } else if (typeof rawData === 'string') {
          try {
            const parsed = JSON.parse(rawData)
            if (parsed && parsed.composition) compList = parsed.composition
          } catch (_) {}
        }
      }

      // Se ainda não pegou, tenta getString('data')
      if (!compList) {
        const strData = prod.getString('data')
        if (strData) {
          try {
            const parsed = JSON.parse(strData)
            if (parsed && parsed.composition) compList = parsed.composition
          } catch (_) {}
        }
      }

      if (!compList) continue

      // Itera sobre compList (suportando array ou objeto indexado)
      const count = compList.length !== undefined ? compList.length : Object.keys(compList).length
      for (let c = 0; c < count; c++) {
        const item = compList[c] || compList[String(c)]
        if (!item) continue

        let itemCode = ''
        let itemDesc = ''
        let itemUnit = ''

        if (typeof item === 'object') {
          itemCode = (item.code || '').trim()
          itemDesc = (item.description || '').trim()
          itemUnit = (item.unit || 'un').trim()
        }

        if (!itemDesc && !itemCode) continue

        let existingComp = null
        if (itemCode) {
          try {
            existingComp = app.findFirstRecordByData('components', 'code', itemCode)
          } catch (_) {}
        }
        if (!existingComp && itemDesc) {
          try {
            existingComp = app.findFirstRecordByData('components', 'description', itemDesc)
          } catch (_) {}
        }

        if (!existingComp) {
          const newComp = new Record(componentsCol)
          newComp.set('code', itemCode)
          newComp.set('description', itemDesc)
          newComp.set('unit', itemUnit || 'un')
          newComp.set('active', true)
          newComp.set('source', 'catalog')
          app.save(newComp)
        }
      }
    }
  },
  (app) => {
    try {
      const inventoryCol = app.findCollectionByNameOrId('inventory')
      if (inventoryCol.fields.getByName('component_id')) {
        inventoryCol.fields.removeByName('component_id')
        app.save(inventoryCol)
      }
    } catch (_) {}

    try {
      const componentsCol = app.findCollectionByNameOrId('components')
      app.delete(componentsCol)
    } catch (_) {}
  },
)
