migrate(
  (app) => {
    // PARTE 1 — Reabertura e consolidação de registros contaminados na distribuição da OP 433 (kiw4h2ovwt2x7ic)
    // Caso real: distribuição de 12 PC do código 05090003 (SOQUETE BASE E27 P/ ABAJUR) destinadas à OP 433/2026 (kiw4h2ovwt2x7ic)
    // marcou indevidamente como "Recebido" registros de outras rodadas no mesmo segundo (14:52 de 09/10):
    // zj88qu8aeetsr2v (3 PC, OPs 000517/000518), u5yjg1tvwy4k9nf (3 PC, mesmas OPs) e 9ffgoe2pj97a1k3 (6 PC, OPs 000529–000533/000536).
    // As peças físicas foram todas para a OP 433; esses registros NÃO foram atendidos fisicamente.

    const dateStr = '09/10/2026'
    const revertReason =
      'Revertido para Compra — marcado indevidamente pelo sistema na distribuição da OP 433 (registro kiw4h2ovwt2x7ic).'

    // 1. Registro 9ffgoe2pj97a1k3 (6 PC, OPs 000529–000533/000536):
    // Reabrir: status='Compra', received_quantity=0, limpar received_by e distributed_by, supplier='Eletrorastro'.
    try {
      const rec = app.findRecordById('material_shortages', '9ffgoe2pj97a1k3')
      rec.set('status', 'Compra')
      rec.set('received_quantity', 0)
      rec.set('received_by', '')
      rec.set('distributed_by', '')
      rec.set('supplier', 'Eletrorastro')
      const currentObs = rec.getString('observation') || ''
      if (!currentObs.includes('distribuição da OP 433')) {
        rec.set('observation', currentObs ? currentObs + ' | ' + revertReason : revertReason)
      }
      app.save(rec)
    } catch (e) {
      console.log('Error reverting 9ffgoe2pj97a1k3: ' + e)
    }

    // 2. Registros duplicados de 3 PC das mesmas OPs 000517/000518:
    // Mais antigo: u5yjg1tvwy4k9nf (created 2026-09-28 11:34:36) -> PERMANECE EM ABERTO ('Compra')
    // Mais recente: zj88qu8aeetsr2v (created 2026-10-07 20:49:03) -> FICA 'Cancelado' por duplicidade

    // Reabrir u5yjg1tvwy4k9nf (mais antigo)
    try {
      const recOlder = app.findRecordById('material_shortages', 'u5yjg1tvwy4k9nf')
      recOlder.set('status', 'Compra')
      recOlder.set('received_quantity', 0)
      recOlder.set('received_by', '')
      recOlder.set('distributed_by', '')
      recOlder.set('supplier', 'Eletrorastro')
      const currentObs = recOlder.getString('observation') || ''
      const olderNote =
        revertReason +
        ' Mantido em aberto como registro original das OPs 000517/000518 (duplicado zj88qu8aeetsr2v cancelado).'
      if (!currentObs.includes('distribuição da OP 433')) {
        recOlder.set('observation', currentObs ? currentObs + ' | ' + olderNote : olderNote)
      }
      app.save(recOlder)
    } catch (e) {
      console.log('Error reverting u5yjg1tvwy4k9nf: ' + e)
    }

    // Cancelar zj88qu8aeetsr2v (mais recente) por duplicidade
    try {
      const recNewer = app.findRecordById('material_shortages', 'zj88qu8aeetsr2v')
      recNewer.set('status', 'Cancelado')
      recNewer.set('received_quantity', 0)
      recNewer.set('received_by', '')
      recNewer.set('distributed_by', '')
      recNewer.set('supplier', 'Eletrorastro')
      const currentObs = recNewer.getString('observation') || ''
      const cancelNote =
        'Consolidado/cancelado por duplicidade em ' +
        dateStr +
        ' — registro original u5yjg1tvwy4k9nf. (Marcado indevidamente pelo sistema na distribuição de kiw4h2ovwt2x7ic e revertido).'
      if (!currentObs.includes('Consolidado/cancelado por duplicidade')) {
        recNewer.set('observation', currentObs ? currentObs + ' | ' + cancelNote : cancelNote)
      }
      app.save(recNewer)
    } catch (e) {
      console.log('Error cancelling duplicate zj88qu8aeetsr2v: ' + e)
    }

    // 3. Confirmar que hofo0yl08ge4201 permanece intacto em aberto (status 'Compra')
    try {
      const recHofo = app.findRecordById('material_shortages', 'hofo0yl08ge4201')
      if (recHofo.getString('status') !== 'Compra') {
        recHofo.set('status', 'Compra')
        app.save(recHofo)
      }
    } catch (e) {
      console.log('Error checking hofo0yl08ge4201: ' + e)
    }

    // 4. Limpeza e correção dos movimentos de inventário indevidos gerados às 14:52 de 09/10/2026
    // Movimentos de Saída para os registros contaminados (jyuuvd7wz7wz9l9, esgngk02wgng9n6, up0h7ajoopockre)
    // E ajuste do saldo do item de inventário 05090003
    try {
      const wrongMovements = ['jyuuvd7wz7wz9l9', 'esgngk02wgng9n6', 'up0h7ajoopockre']
      for (let i = 0; i < wrongMovements.length; i++) {
        try {
          const m = app.findRecordById('inventory_movements', wrongMovements[i])
          app.delete(m)
        } catch (_) {}
      }

      // Ajusta o saldo do estoque 05090003 (id 55ludav8w35268k)
      // Entrada foi de 12 un (kiw4h2ovwt2x7ic) e Saída real foi de 12 un para a OP 433 (itkngnl52feq3xa)
      // Portanto o saldo após esta operação deve ser 0 (não -12)
      try {
        const inv = app.findRecordById('inventory', '55ludav8w35268k')
        if (inv.getInt('quantity') === -12) {
          inv.set('quantity', 0)
          app.save(inv)
        }
      } catch (_) {}
    } catch (e) {
      console.log('Error cleaning inventory movements: ' + e)
    }

    // 5. Limpeza das mensagens de OP indevidas geradas às 14:52 de 09/10/2026
    try {
      const wrongMessages = ['mxommxgmqllp70f', 'svsbvhsvie40sut', 'gzu7sqwot14eztr']
      for (let i = 0; i < wrongMessages.length; i++) {
        try {
          const msg = app.findRecordById('pcp_order_messages', wrongMessages[i])
          app.delete(msg)
        } catch (_) {}
      }
    } catch (e) {
      console.log('Error cleaning order messages: ' + e)
    }
  },
  (app) => {
    // Reversão da migration se necessário
  },
)
