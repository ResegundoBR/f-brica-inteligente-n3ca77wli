migrate(
  (app) => {
    var targetStatuses = [
      {
        matchNames: ['falta docs', 'iniciado', 'rascunho'],
        newName: 'Falta Docs',
        color: 'warning',
      },
      {
        matchNames: ['pronto p/ revisão', 'pronto p/ revisao', 'revisão', 'revisao'],
        newName: 'Pronto p/ Revisão',
        color: 'orange',
      },
      {
        matchNames: [
          'rev fábrica',
          'rev fabrica',
          'ajuste/pendência',
          'ajuste/pendencia',
          'pendência',
          'pendencia',
        ],
        newName: 'Rev Fábrica',
        color: 'purple',
      },
      {
        matchNames: ['validado'],
        newName: 'Validado',
        color: 'success',
      },
    ]

    var allStatuses = app.findRecordsByFilter('product_statuses', '1=1', '', 1000, 0)

    for (var i = 0; i < targetStatuses.length; i++) {
      var target = targetStatuses[i]
      var found = null

      for (var j = 0; j < allStatuses.length; j++) {
        if (target.matchNames.indexOf(allStatuses[j].getString('name').toLowerCase()) !== -1) {
          found = allStatuses[j]
          break
        }
      }

      if (!found) {
        for (var k = 0; k < allStatuses.length; k++) {
          if (allStatuses[k].getString('name').toLowerCase() === target.newName.toLowerCase()) {
            found = allStatuses[k]
            break
          }
        }
      }

      if (found) {
        found.set('name', target.newName)
        found.set('color', target.color)
        app.save(found)
      } else {
        var col = app.findCollectionByNameOrId('product_statuses')
        var record = new Record(col)
        record.set('name', target.newName)
        record.set('color', target.color)
        record.set('active', true)
        app.save(record)
      }
    }
  },
  (app) => {
    var reverts = [
      { name: 'Falta Docs', oldName: 'Falta Docs', oldColor: '#FFEB3B' },
      { name: 'Pronto p/ Revisão', oldName: 'Pronto p/ Revisão', oldColor: '#FF9800' },
      { name: 'Rev Fábrica', oldName: 'Ajuste/Pendência', oldColor: '#9C27B0' },
      { name: 'Validado', oldName: 'Validado', oldColor: '#4CAF50' },
    ]

    var allStatuses = app.findRecordsByFilter('product_statuses', '1=1', '', 1000, 0)
    for (var i = 0; i < reverts.length; i++) {
      var revert = reverts[i]
      for (var j = 0; j < allStatuses.length; j++) {
        if (allStatuses[j].getString('name') === revert.name) {
          allStatuses[j].set('name', revert.oldName)
          allStatuses[j].set('color', revert.oldColor)
          app.save(allStatuses[j])
        }
      }
    }
  },
)
