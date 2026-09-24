migrate(
  (app) => {
    // 1. MIGRATION DE LIMPEZA
    // - Cancelar (status 'Cancelado', NUNCA deletar) os duplicados:
    //   * qa46a85l7y2b34d (Cabo slim duplicado da OP 4c3vmqit9t02i5b)
    //   * Para os pares do soquete, manter o MAIS ANTIGO de cada OP e cancelar o mais recente:
    //     - OP w21dv1izpa7vz0a: mais antigo é owbbm9ibmq0pntn (15:45), cancelar o mais recente bz5o15k767vrqf5 (18:17)
    //     - OP j1rywr50r0xticv: mais antigo é rwszhhy714twx1e (15:42), cancelar o mais recente 4bl9bj82abeidbi (18:13 / 15:43)
    // - Como a OP 13966/435 (4c3vmqit9t02i5b) está CONCLUÍDA, cancelar TAMBÉM o Cabo slim original sqzeqai79ml8jy0 com observação 'OP concluída — solicitação órfã'.
    // - Observação nos cancelados: 'Consolidado/cancelado por duplicidade em 24/09/2026 — registro original [id]'
    // - NÃO tocar em registros Recebidos.
    // - NÃO alterar automaticamente as quantidades dos restantes (85, 5, 4, 1 etc). Apenas registrar na observação de cada um que DIVERGIR da respectiva pcp_order_materials:
    //   'Atenção: BOM da OP pede X un — validar quantidade com PCP' (X = quantidade da BOM).

    // Data formatada para registro
    const dateStr = '24/09/2026'

    // Cancelar Cabo slim duplicado: qa46a85l7y2b34d (original sqzeqai79ml8jy0)
    try {
      const rec = app.findRecordById('material_shortages', 'qa46a85l7y2b34d')
      if (rec.getString('status') !== 'Recebido') {
        rec.set('status', 'Cancelado')
        const currentObs = rec.getString('observation') || ''
        const cancelObs =
          'Consolidado/cancelado por duplicidade em ' +
          dateStr +
          ' — registro original sqzeqai79ml8jy0'
        rec.set('observation', currentObs ? currentObs + ' | ' + cancelObs : cancelObs)
        app.save(rec)
      }
    } catch (e) {
      console.log('Error canceling qa46a85l7y2b34d: ' + e)
    }

    // Cancelar Cabo slim original sqzeqai79ml8jy0 (pois a OP 13966/435 já está concluída)
    try {
      const rec = app.findRecordById('material_shortages', 'sqzeqai79ml8jy0')
      if (rec.getString('status') !== 'Recebido') {
        rec.set('status', 'Cancelado')
        const currentObs = rec.getString('observation') || ''
        const cancelObs = 'OP concluída — solicitação órfã'
        rec.set('observation', currentObs ? currentObs + ' | ' + cancelObs : cancelObs)
        app.save(rec)
      }
    } catch (e) {
      console.log('Error canceling sqzeqai79ml8jy0: ' + e)
    }

    // Cancelar soquete mais recente da OP w21dv1izpa7vz0a: bz5o15k767vrqf5 (manter owbbm9ibmq0pntn)
    try {
      const rec = app.findRecordById('material_shortages', 'bz5o15k767vrqf5')
      if (rec.getString('status') !== 'Recebido') {
        rec.set('status', 'Cancelado')
        const currentObs = rec.getString('observation') || ''
        const cancelObs =
          'Consolidado/cancelado por duplicidade em ' +
          dateStr +
          ' — registro original owbbm9ibmq0pntn'
        rec.set('observation', currentObs ? currentObs + ' | ' + cancelObs : cancelObs)
        app.save(rec)
      }
    } catch (e) {
      console.log('Error canceling bz5o15k767vrqf5: ' + e)
    }

    // Cancelar soquete mais recente da OP j1rywr50r0xticv: 4bl9bj82abeidbi (manter rwszhhy714twx1e)
    try {
      const rec = app.findRecordById('material_shortages', '4bl9bj82abeidbi')
      if (rec.getString('status') !== 'Recebido') {
        rec.set('status', 'Cancelado')
        const currentObs = rec.getString('observation') || ''
        const cancelObs =
          'Consolidado/cancelado por duplicidade em ' +
          dateStr +
          ' — registro original rwszhhy714twx1e'
        rec.set('observation', currentObs ? currentObs + ' | ' + cancelObs : cancelObs)
        app.save(rec)
      }
    } catch (e) {
      console.log('Error canceling 4bl9bj82abeidbi: ' + e)
    }

    // Tratar observações de divergência nos registros mantidos em aberto:
    // Para OP w21dv1izpa7vz0a, o soquete 05090003 mantido é owbbm9ibmq0pntn (qtd 1).
    // A BOM pede 2 PC (pcp_order_materials d2t1dc5okalpscc tem quantity: 2).
    // Como 1 != 2, adicionar observação: 'Atenção: BOM da OP pede 2 un — validar quantidade com PCP'
    try {
      const rec = app.findRecordById('material_shortages', 'owbbm9ibmq0pntn')
      if (rec.getString('status') !== 'Cancelado' && rec.getString('status') !== 'Recebido') {
        const currentObs = rec.getString('observation') || ''
        const alertObs = 'Atenção: BOM da OP pede 2 un — validar quantidade com PCP'
        if (!currentObs.includes('BOM da OP pede')) {
          rec.set('observation', currentObs ? currentObs + ' | ' + alertObs : alertObs)
          app.save(rec)
        }
      }
    } catch (e) {
      console.log('Error updating observation for owbbm9ibmq0pntn: ' + e)
    }

    // Verificar os outros soquetes ativos e verificar se têm pcp_order_materials correspondente para alertar divergência
    // rwszhhy714twx1e (OP j1rywr50r0xticv, qtd 4)
    // pvja5jo8r1l36bv (OP e3v5wj60fkxknk4, qtd 5)
    // Buscar se há pcp_order_materials para o código 05090003 nessas OPs
    const remainingShortages = [
      { id: 'rwszhhy714twx1e', orderId: 'j1rywr50r0xticv', code: '05090003' },
      { id: 'pvja5jo8r1l36bv', orderId: 'e3v5wj60fkxknk4', code: '05090003' },
    ]

    for (const rem of remainingShortages) {
      try {
        const shortageRec = app.findRecordById('material_shortages', rem.id)
        if (
          shortageRec.getString('status') === 'Cancelado' ||
          shortageRec.getString('status') === 'Recebido'
        ) {
          continue
        }
        // Buscar pcp_order_materials
        const matFilter =
          "order_id = '" +
          rem.orderId +
          "' && (code = '" +
          rem.code +
          "' || description ~ 'Soquete')"
        const mats = app.findRecordsByFilter('pcp_order_materials', matFilter, '', 1, 0)
        if (mats && mats.length > 0) {
          const bomQty = mats[0].getFloat('quantity')
          if (bomQty !== shortageRec.getFloat('quantity')) {
            const currentObs = shortageRec.getString('observation') || ''
            const alertObs =
              'Atenção: BOM da OP pede ' + bomQty + ' un — validar quantidade com PCP'
            if (!currentObs.includes('BOM da OP pede')) {
              shortageRec.set('observation', currentObs ? currentObs + ' | ' + alertObs : alertObs)
              app.save(shortageRec)
            }
          }
        }
      } catch (e) {
        console.log('Check remaining divergence error: ' + e)
      }
    }
  },
  (app) => {
    // Reverter status se necessário (não crítico)
  },
)
