migrate(
  (app) => {
    // 1. Recalcular e garantir que status 'Respondida' só exista para perguntas
    // que efetivamente possuem uma resposta com reply_to apontando para elas.
    try {
      const allQuestions = app.findRecordsByFilter(
        'pcp_order_messages',
        "type = 'Pergunta'",
        'created',
        0,
        0,
      )

      for (const q of allQuestions) {
        // Busca se existe alguma mensagem de resposta que tenha reply_to = q.id
        const replies = app.findRecordsByFilter(
          'pcp_order_messages',
          `reply_to = '${q.id}'`,
          'created',
          1,
          0,
        )

        const hasValidReply = replies.length > 0
        const desiredStatus = hasValidReply ? 'Respondida' : 'Pendente'

        if (q.getString('status') !== desiredStatus) {
          q.set('status', desiredStatus)
          app.save(q)
        }
      }
    } catch (err) {
      console.warn('Erro ao sincronizar status de perguntas:', err)
    }
  },
  () => {},
)
