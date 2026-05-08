migrate(
  (app) => {
    const revisionPoints = app.findRecordsByFilter('revision_points', "notes != ''", '', 10000, 0)
    const revisionNotesCol = app.findCollectionByNameOrId('revision_notes')

    for (const point of revisionPoints) {
      const notes = point.getString('notes')
      if (notes) {
        const record = new Record(revisionNotesCol)
        record.set('revision_point_id', point.id)
        record.set('user_id', point.getString('user_id'))
        record.set('content', notes)
        app.save(record)
      }
    }
  },
  (app) => {
    // Not removing data automatically on rollback to avoid destructive data loss.
  },
)
