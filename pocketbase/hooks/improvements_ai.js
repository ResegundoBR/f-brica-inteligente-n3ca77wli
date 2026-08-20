/// <reference path="../pb_data/types.d.ts" />

// Default status + initial actions_log entry when an improvement is created.
onRecordCreate((e) => {
  var record = e.record
  if (!record) {
    e.next()
    return
  }

  if (!record.getString('status')) {
    record.set('status', 'Identificado')
  }

  try {
    var raw = record.get('actions_log')
    var log = []
    if (raw) {
      if (typeof raw === 'string') {
        try {
          log = JSON.parse(raw) || []
        } catch (_) {
          log = []
        }
      } else if (Array.isArray(raw)) {
        log = raw
      }
    }
    if (!Array.isArray(log) || log.length === 0) {
      log = [
        {
          date: new Date().toISOString(),
          user: 'Sistema',
          action: 'Identificado',
          detail: 'Apontamento criado.',
        },
      ]
      record.set('actions_log', log)
    }
  } catch (_) {}

  e.next()
}, 'improvements')

// AI suggestion endpoint for the Central de Melhorias wizard / detail.
// POST /backend/v1/improvements/ai-suggestions
// body: { step: 'cause_analysis' | 'solution_ideas' | 'impact_validation', context: {...} }
routerAdd(
  'POST',
  '/backend/v1/improvements/ai-suggestions',
  (e) => {
    try {
      var body = e.requestInfo().body || {}
      var step = (body.step || '').trim()
      var ctx = body.context || {}

      var title = (ctx.title || '').trim()
      var description = (ctx.description || '').trim()
      var rootCause = (ctx.root_cause || '').trim()
      var solutionIdea = (ctx.solution_idea || '').trim()
      var category = (ctx.category || '').trim()
      var priority = (ctx.priority || '').trim()

      if (!step) {
        return e.badRequestError('Parâmetro "step" é obrigatório')
      }

      var systemPrompt =
        'Você é um especialista em melhoria contínua (PDCA + Kaizen) em ambiente de fábrica/indústria. ' +
        'Responda sempre em português do Brasil, com um tom prático, direto e voltado para o chão de fábrica. ' +
        'Seja específico e evite jargão genérico de consultoria.'

      var userPrompt = ''
      var contextBlock =
        'Contexto do apontamento de melhoria:\n' +
        '- Título: ' +
        (title || '(não informado)') +
        '\n' +
        '- Categoria: ' +
        (category || '(não informada)') +
        '\n' +
        '- Prioridade: ' +
        (priority || '(não informada)') +
        '\n' +
        '- Descrição do problema: ' +
        (description || '(não informada)') +
        '\n' +
        '- Causa provável: ' +
        (rootCause || '(não informada)') +
        '\n' +
        '- Ideia de solução: ' +
        (solutionIdea || '(não informada)') +
        '\n'

      if (step === 'cause_analysis') {
        userPrompt =
          contextBlock +
          '\nTarefa: sugira 3 causas raiz adicionais e prováveis para esse problema, pensando em fábrica/indústria. ' +
          'Considere pessoas, método, máquina, material, medida e meio ambiente (se aplicável). ' +
          'Retorne como uma lista numerada, com cada causa em até 2 linhas, sem comentários extras antes ou depois da lista.'
      } else if (step === 'solution_ideas') {
        userPrompt =
          contextBlock +
          '\nTarefa: sugira de 3 a 5 ações práticas de melhoria para resolver ou mitigar o problema descrito. ' +
          'Pense em ações viáveis no contexto de fábrica/indústria (ex.: ajuste de processo, ferramenta, treinamento, 5S, poka-yoke). ' +
          'Retorne como uma lista numerada, com cada ação em até 2 linhas, sem comentários extras antes ou depois da lista.'
      } else if (step === 'impact_validation') {
        userPrompt =
          contextBlock +
          '\nTarefa: avalie se o impacto esperado da resolução está claro e sugira 3 a 4 métricas/indicadores objetivos ' +
          'que poderiam ser acompanhados para medir o resultado na prática (ex.: retrabalho, tempo de ciclo, refugo, OTD). ' +
          'Retorne como uma lista numerada, com cada métrica em até 2 linhas, sem comentários extras antes ou depois da lista.'
      } else {
        return e.badRequestError('Parâmetro "step" inválido')
      }

      var reply
      try {
        reply = $ai.chat({
          model: 'fast',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        })
      } catch (aiErr) {
        console.log('improvements ai-suggestions error:', String(aiErr))
        return e.json(503, { error: 'Serviço de IA indisponível no momento.' })
      }

      var text = ''
      try {
        text = reply.choices[0].message.content
      } catch (_) {
        text = ''
      }

      return e.json(200, { suggestions: text })
    } catch (err) {
      console.log('improvements ai-suggestions fatal:', String(err))
      return e.json(500, { error: 'Erro interno: ' + String(err) })
    }
  },
  $apis.requireAuth(),
)
