migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_messages')

    // 1. Expandir sector: Comercial, Acabamento, Fabricação, Montagem, Expedição, Operador (preservado para compatibilidade)
    col.fields.removeByName('sector')
    col.fields.add(
      new SelectField({
        name: 'sector',
        values: ['Comercial', 'Acabamento', 'Fabricação', 'Montagem', 'Expedição', 'Operador'],
        maxSelect: 1,
      }),
    )

    // 2. Adicionar campo type: Pergunta / Informação
    if (!col.fields.getByName('type')) {
      col.fields.add(
        new SelectField({
          name: 'type',
          values: ['Pergunta', 'Informação'],
          maxSelect: 1,
        }),
      )
    }

    // 3. Adicionar campo status: Pendente / Respondida
    if (!col.fields.getByName('status')) {
      col.fields.add(
        new SelectField({
          name: 'status',
          values: ['Pendente', 'Respondida'],
          maxSelect: 1,
        }),
      )
    }

    // 4. Adicionar auto-relação reply_to para vincular respostas a perguntas
    if (!col.fields.getByName('reply_to')) {
      col.fields.add(
        new RelationField({
          name: 'reply_to',
          collectionId: col.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }

    app.save(col)

    // 5. Migração de dados existentes:
    try {
      const messages = app.findRecordsByFilter('pcp_order_messages', '', 'created', 0, 0)
      for (const msg of messages) {
        let changed = false
        const content = msg.getString('content') || ''
        const currentType = msg.getString('type')
        const currentStatus = msg.getString('status')
        const currentSector = msg.getString('sector')

        if (!currentType) {
          const isQuestion = content.includes('?')
          msg.set('type', isQuestion ? 'Pergunta' : 'Informação')
          if (isQuestion && !currentStatus) {
            msg.set('status', 'Respondida')
          }
          changed = true
        }

        const userId = msg.getString('user_id')
        if (userId && (!currentSector || currentSector === 'Operador')) {
          try {
            const sender = app.findRecordById('users', userId)
            const roleId = sender.getString('role')
            if (roleId) {
              const role = app.findRecordById('roles', roleId)
              const roleName = (role.getString('name') || '').toLowerCase()
              if (roleName.includes('acabamento')) {
                msg.set('sector', 'Acabamento')
                changed = true
              } else if (roleName.includes('montagem')) {
                msg.set('sector', 'Montagem')
                changed = true
              } else if (roleName.includes('expedição') || roleName.includes('expedicao')) {
                msg.set('sector', 'Expedição')
                changed = true
              } else if (roleName.includes('comercial')) {
                msg.set('sector', 'Comercial')
                changed = true
              } else if (roleName.includes('fabric')) {
                msg.set('sector', 'Fabricação')
                changed = true
              }
            }
          } catch (_) {}
        }

        if (changed) {
          app.save(msg)
        }
      }
    } catch (_) {}
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_order_messages')
    col.fields.removeByName('reply_to')
    col.fields.removeByName('status')
    col.fields.removeByName('type')
    app.save(col)
  },
)
