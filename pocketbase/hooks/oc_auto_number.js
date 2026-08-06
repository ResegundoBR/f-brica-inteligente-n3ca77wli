onRecordCreate((e) => {
  var record = e.record
  if (!record) {
    e.next()
    return
  }

  if (record.getString('oc_number')) {
    e.next()
    return
  }

  var SEED = 38896
  var maxNum = SEED - 1

  try {
    var all = $app.findRecordsByFilter('ordens_de_compra', 'oc_number != ""', '', 1000, 0)
    for (var i = 0; i < all.length; i++) {
      var raw = (all[i].getString('oc_number') || '').trim()
      if (/^\d+$/.test(raw)) {
        var num = parseInt(raw, 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
    }
  } catch (_) {}

  record.set('oc_number', String(maxNum + 1))
  e.next()
}, 'ordens_de_compra')
