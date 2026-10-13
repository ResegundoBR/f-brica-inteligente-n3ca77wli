migrate(
  (app) => {
    console.log(
      '[MIGRATION 0153] Cadastrando componentes 05200212, 05310072, 05320012 no cadastro unificado...',
    )

    const componentsCol = app.findCollectionByNameOrId('components')

    const itemsToSeed = [
      {
        code: '05200212',
        description: 'BUCHA ACABAMENTO PENDENTE UPSIDE',
        unit: 'PC',
        source: 'catalog',
        active: true,
      },
      {
        code: '05310072',
        description: 'PRENSA CABO Ø15X30MM - ALUMINIO',
        unit: 'PC',
        source: 'catalog',
        active: true,
      },
      {
        code: '05320012',
        description: 'REPUXO ALUMINIO Ø145MM - CURVATURA Ø200MM',
        unit: 'PC',
        source: 'catalog',
        active: true,
      },
    ]

    for (let i = 0; i < itemsToSeed.length; i++) {
      const item = itemsToSeed[i]
      const filter = "code = '" + item.code.replace(/'/g, "''") + "'"
      const existing = app.findRecordsByFilter('components', filter, '', 1, 0)

      if (existing && existing.length > 0) {
        console.log(
          '[MIGRATION 0153] Componente ' +
            item.code +
            ' já existe. Garantindo ativo e source catalog...',
        )
        const rec = existing[0]
        rec.set('active', true)
        rec.set('source', 'catalog')
        if (!rec.getString('description')) {
          rec.set('description', item.description)
        }
        if (!rec.getString('unit')) {
          rec.set('unit', item.unit)
        }
        app.save(rec)
      } else {
        console.log(
          '[MIGRATION 0153] Criando componente ' + item.code + ' (' + item.description + ')...',
        )
        const newRec = new Record(componentsCol)
        newRec.set('code', item.code)
        newRec.set('description', item.description)
        newRec.set('unit', item.unit)
        newRec.set('source', item.source)
        newRec.set('active', item.active)
        newRec.set('min_quantity', 0)
        app.save(newRec)
      }
    }

    console.log('[MIGRATION 0153] Concluído cadastro dos 3 componentes no cadastro unificado.')
  },
  (app) => {
    console.log(
      '[MIGRATION 0153] Revertendo cadastro dos componentes 05200212, 05310072, 05320012...',
    )
    const codes = ['05200212', '05310072', '05320012']
    for (let i = 0; i < codes.length; i++) {
      const filter = "code = '" + codes[i].replace(/'/g, "''") + "'"
      const existing = app.findRecordsByFilter('components', filter, '', 1, 0)
      if (existing && existing.length > 0) {
        app.delete(existing[0])
      }
    }
  },
)
