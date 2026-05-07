migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('products')
    const field = col.fields.getByName('files')

    if (field) {
      field.mimeTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/octet-stream',
        'application/x-solidworks-part',
        'application/x-solidworks-assembly',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ]
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('products')
    const field = col.fields.getByName('files')

    if (field) {
      field.mimeTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/octet-stream',
        'application/x-solidworks-part',
        'application/x-solidworks-assembly',
      ]
      app.save(col)
    }
  },
)
