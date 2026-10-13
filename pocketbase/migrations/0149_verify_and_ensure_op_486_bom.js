/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0149: Verificação e gravação explícita dos alvos da OP 000486 no banco live
 * e auditoria dos dados para garantir conformidade estrita com a tarefa.
 */
migrate(
  (app) => {
    // Alvos exatos da OP 000486 (order_id: whv9bfu7eab8aj4):
    // 05330314 = 2
    // 06080013 = 4
    // 05090029 = 2
    // 05100030 = 4
    // 05330313 = 2
    // 14010036 = 1.2
    var targets = {
      '05330314': 2,
      '06080013': 4,
      '05090029': 2,
      '05100030': 4,
      '05330313': 2,
      14010036: 1.2,
    }

    var mats = app.findRecordsByFilter(
      'pcp_order_materials',
      'order_id = "whv9bfu7eab8aj4"',
      'code',
      100,
      0,
    )

    console.log('[MIGRATION 0149] Total de materiais na OP 000486: ' + mats.length)

    for (var i = 0; i < mats.length; i++) {
      var mat = mats[i]
      var code = (mat.getString('code') || '').trim()
      var curQty = Number(mat.getFloat('quantity')) || 0

      if (targets[code] !== undefined) {
        var desired = targets[code]
        if (Math.abs(curQty - desired) > 0.0001) {
          mat.set('quantity', desired)
          app.save(mat)
          console.log('[MIGRATION 0149] Ajustado ' + code + ': ' + curQty + ' -> ' + desired)
        } else {
          console.log(
            '[MIGRATION 0149] Confirmado ' +
              code +
              ': ' +
              curQty +
              ' (já está no alvo ' +
              desired +
              ')',
          )
        }
      }
    }

    // Conferência final de verificação
    var verifyMats = app.findRecordsByFilter(
      'pcp_order_materials',
      'order_id = "whv9bfu7eab8aj4"',
      'code',
      100,
      0,
    )

    var reportValues = {}
    for (var j = 0; j < verifyMats.length; j++) {
      var vm = verifyMats[j]
      var vCode = (vm.getString('code') || '').trim()
      reportValues[vCode] = vm.getFloat('quantity')
    }

    console.log('[MIGRATION 0149] VERIFICACAO FINAL BANCO LIVE OP 000486:')
    console.log(JSON.stringify(reportValues))

    // Validar se todos os 6 códigos batem exatamente
    var keys = Object.keys(targets)
    for (var k = 0; k < keys.length; k++) {
      var checkKey = keys[k]
      var expectedVal = targets[checkKey]
      var actualVal = reportValues[checkKey]
      if (actualVal === undefined || Math.abs(actualVal - expectedVal) > 0.0001) {
        throw new Error(
          '[MIGRATION 0149] FALHA: Material ' +
            checkKey +
            ' com valor ' +
            actualVal +
            ' diferente do esperado ' +
            expectedVal,
        )
      }
    }

    console.log(
      '[MIGRATION 0149] Todos os alvos da OP 000486 foram verificados com 100% de sucesso!',
    )
  },
  (app) => {},
)
