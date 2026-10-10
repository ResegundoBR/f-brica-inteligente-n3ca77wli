migrate(
  (app) => {
    console.log('[MIGRATION 0144] Iniciando Etapa 4: Unificação Cadastral...')

    const componentsCol = app.findCollectionByNameOrId('components')
    const inventoryCol = app.findCollectionByNameOrId('inventory')

    // 1. Garantir que o campo component_id existe na coleção inventory de forma aditiva
    let compIdField = inventoryCol.fields.getByName('component_id')
    if (!compIdField) {
      console.log('[MIGRATION 0144] Adicionando campo component_id em inventory...')
      inventoryCol.fields.add(
        new RelationField({
          name: 'component_id',
          collectionId: componentsCol.id,
          maxSelect: 1,
          cascadeDelete: false,
          required: false,
        }),
      )
      app.save(inventoryCol)
    }

    // 2. Buscar todos os componentes existentes indexados por código normalizado
    const allComponents = app.findRecordsByFilter('components', '', '', 5000, 0)
    const compByCode = new Map()
    const compByDesc = new Map()

    for (let c = 0; c < allComponents.length; c++) {
      const comp = allComponents[c]
      const cCode = (comp.getString('code') || '').trim().toUpperCase()
      const cDesc = (comp.getString('description') || '').trim().toUpperCase()
      if (cCode && !compByCode.has(cCode)) {
        compByCode.set(cCode, comp)
      }
      if (cDesc && !compByDesc.has(cDesc)) {
        compByDesc.set(cDesc, comp)
      }
    }

    // 3. Processar todos os itens do inventário
    const allInventory = app.findRecordsByFilter('inventory', '', '', 5000, 0)
    let linkedExistingCount = 0
    let createdComponentCount = 0
    let alreadyLinkedCount = 0

    for (let i = 0; i < allInventory.length; i++) {
      const inv = allInventory[i]
      const currentCompId = (inv.getString('component_id') || '').trim()

      if (currentCompId) {
        // Já possui vínculo válido?
        try {
          const linkedRec = app.findRecordById('components', currentCompId)
          if (linkedRec) {
            alreadyLinkedCount++
            continue
          }
        } catch (_) {
          // Vínculo quebrado/órfão, tentaremos re-vincular abaixo
        }
      }

      const invCode = (inv.getString('code') || '').trim().toUpperCase()
      const invDesc = (inv.getString('description') || '').trim()
      const invDescUpper = invDesc.toUpperCase()
      const invUnit = (inv.getString('unit') || '').trim() || 'un'
      const invMin = Number(inv.getFloat('min_quantity')) || 0

      let matchedComp = null
      if (invCode && compByCode.has(invCode)) {
        matchedComp = compByCode.get(invCode)
      } else if (invDescUpper && compByDesc.has(invDescUpper)) {
        matchedComp = compByDesc.get(invDescUpper)
      }

      if (matchedComp) {
        // Encontrou correspondência no cadastro mestre: preenche vínculo
        inv.set('component_id', matchedComp.id)
        app.save(inv)
        linkedExistingCount++
      } else {
        // Código de inventário SEM componente cadastrado:
        // Criar o componente no cadastro mestre a partir dos dados do inventário (código, descrição, unidade, estoque mínimo)
        // Marcado como criado pela unificação (source = 'inventory', observation = '[Etapa 4] Criado pela unificação cadastral...')
        const newComp = new Record(componentsCol)
        newComp.set('code', inv.getString('code') ? inv.getString('code').trim() : '')
        newComp.set('description', invDesc)
        newComp.set('unit', invUnit)
        newComp.set('min_quantity', invMin)
        newComp.set('source', 'inventory')
        newComp.set('active', true)
        newComp.set(
          'observation',
          '[Etapa 4] Criado pela unificação cadastral a partir do Inventário',
        )

        app.save(newComp)
        createdComponentCount++

        // Atualiza indexadores em memória
        if (invCode) compByCode.set(invCode, newComp)
        if (invDescUpper) compByDesc.set(invDescUpper, newComp)

        // Preenche o vínculo no inventário
        inv.set('component_id', newComp.id)
        app.save(inv)
        linkedExistingCount++
      }
    }

    console.log(
      `[MIGRATION 0144] Unificação concluída: ${allInventory.length} inventários processados. Já vinculados: ${alreadyLinkedCount}. Vinculados/atualizados: ${linkedExistingCount}. Novos componentes criados no mestre: ${createdComponentCount}.`,
    )
  },
  (app) => {
    console.log('[MIGRATION 0144] Reversão da migration 0144 (aditiva, sem exclusão destrutiva).')
  },
)
