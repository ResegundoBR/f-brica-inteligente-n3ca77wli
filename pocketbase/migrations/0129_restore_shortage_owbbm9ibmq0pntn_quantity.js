migrate(
  (app) => {
    try {
      const rec = app.findRecordById('material_shortages', 'owbbm9ibmq0pntn')
      if (rec) {
        rec.set('quantity', 1)
        const currentObs = rec.getString('observation') || ''
        const baseObs = currentObs.trim()
        const restorationNote =
          'Quantidade restaurada de 37 para 1 em 2026-09-24 — valor 37 era corrupção do diálogo de cotação (blur gravava total do grupo no registro individual)'

        let newObs = baseObs
        if (!newObs.includes('Quantidade restaurada de 37 para 1')) {
          newObs = newObs ? newObs + ' | ' + restorationNote : restorationNote
        }
        rec.set('observation', newObs)
        app.save(rec)
      }
    } catch (e) {
      console.log('Error restoring material_shortages owbbm9ibmq0pntn: ' + e)
    }
  },
  (app) => {
    // Revert se necessário
    try {
      const rec = app.findRecordById('material_shortages', 'owbbm9ibmq0pntn')
      if (rec) {
        rec.set('quantity', 37)
        app.save(rec)
      }
    } catch (_) {}
  },
)
