migrate(
  (app) => {
    // 1. Atualizar os 3 registros presos de material_shortages:
    // - p6n422zl76e11xn (Disco Filme 250mm GR80): qty 3 -> status "Recebido", received_quantity 3, code REF-89ZMTX
    // - xtouo5ipk0zq9uk (Manta vermelha PV 115 F22): qty 7 -> status "Recebido", received_quantity 7, code REF-5ZWA2E
    // - jrgly3va9szk6fr (Cinta lixa KK772X): qty 3 -> status "Recebido", received_quantity 3, code REF-MTHMIQ

    const shortages = [
      { id: 'p6n422zl76e11xn', qty: 3, code: 'REF-89ZMTX' },
      { id: 'xtouo5ipk0zq9uk', qty: 7, code: 'REF-5ZWA2E' },
      { id: 'jrgly3va9szk6fr', qty: 3, code: 'REF-MTHMIQ' },
    ]

    for (const item of shortages) {
      try {
        const record = app.findRecordById('material_shortages', item.id)
        record.set('status', 'Recebido')
        record.set('received_quantity', item.qty)
        record.set('code', item.code)
        app.save(record)
      } catch (e) {
        console.log('Error updating shortage ' + item.id + ': ' + e)
      }
    }

    // 2. Corrigir o reason dos 3 movimentos em inventory_movements para incluir o ID da solicitação de origem:
    // - fiqpaomxqrqkmus -> p6n422zl76e11xn
    // - uaj2n2kaqh5fzp8 -> xtouo5ipk0zq9uk
    // - dumiwxt7qk3up19 -> jrgly3va9szk6fr

    const movements = [
      { id: 'fiqpaomxqrqkmus', shortageId: 'p6n422zl76e11xn' },
      { id: 'uaj2n2kaqh5fzp8', shortageId: 'xtouo5ipk0zq9uk' },
      { id: 'dumiwxt7qk3up19', shortageId: 'jrgly3va9szk6fr' },
    ]

    for (const mov of movements) {
      try {
        const record = app.findRecordById('inventory_movements', mov.id)
        record.set('reason', 'Recebimento de Material (IDs: ' + mov.shortageId + ')')
        app.save(record)
      } catch (e) {
        console.log('Error updating movement ' + mov.id + ': ' + e)
      }
    }
  },
  (app) => {
    const shortages = ['p6n422zl76e11xn', 'xtouo5ipk0zq9uk', 'jrgly3va9szk6fr']
    for (const id of shortages) {
      try {
        const record = app.findRecordById('material_shortages', id)
        record.set('status', 'Compra')
        record.set('received_quantity', 0)
        record.set('code', '')
        app.save(record)
      } catch (e) {}
    }

    const movements = ['fiqpaomxqrqkmus', 'uaj2n2kaqh5fzp8', 'dumiwxt7qk3up19']
    for (const id of movements) {
      try {
        const record = app.findRecordById('inventory_movements', id)
        record.set('reason', 'Recebimento de Material (IDs: )')
        app.save(record)
      } catch (e) {}
    }
  },
)
