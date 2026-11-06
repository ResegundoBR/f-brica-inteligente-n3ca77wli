migrate(
  (app) => {
    // 1. Criar pcp_alert_configs
    let alertConfigsCol
    try {
      alertConfigsCol = app.findCollectionByNameOrId('pcp_alert_configs')
    } catch (_) {
      alertConfigsCol = null
    }

    if (!alertConfigsCol) {
      alertConfigsCol = new Collection({
        name: 'pcp_alert_configs',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'check_key', type: 'text', required: true },
          { name: 'title', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'category', type: 'text' },
          { name: 'enabled', type: 'bool' },
          { name: 'params', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_pcp_alert_configs_check_key ON pcp_alert_configs (check_key)',
        ],
      })
      app.save(alertConfigsCol)
    }

    // 2. Criar pcp_alert_runs
    let alertRunsCol
    try {
      alertRunsCol = app.findCollectionByNameOrId('pcp_alert_runs')
    } catch (_) {
      alertRunsCol = null
    }

    if (!alertRunsCol) {
      alertRunsCol = new Collection({
        name: 'pcp_alert_runs',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'started', type: 'date' },
          { name: 'finished', type: 'date' },
          { name: 'trigger_type', type: 'text' },
          { name: 'results', type: 'json' },
          { name: 'summary', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_pcp_alert_runs_created ON pcp_alert_runs (created DESC)'],
      })
      app.save(alertRunsCol)
    }

    // 3. Seed inicial do catálogo de verificações (7 verificações do item 3)
    const initialChecks = [
      {
        check_key: 'ops_atrasadas',
        title: 'OPs atrasadas',
        description:
          'Ordens de Produção em aberto com data de entrega ou data prometida vencida além da tolerância.',
        category: 'Atrasado',
        enabled: true,
        params: { tolerance_days: 2 },
      },
      {
        check_key: 'ops_paradas_sem_movimentacao',
        title: 'OPs paradas sem movimentação',
        description:
          'OPs em andamento sem movimentação ou log recente além do limite de dias configurado.',
        category: 'Parado',
        enabled: true,
        params: { idle_days: 3 },
      },
      {
        check_key: 'solicitacoes_sem_cotacao',
        title: 'Solicitações de compra sem cotação',
        description:
          'Faltas de materiais em aberto há mais tempo que o teto configurado sem fornecedor cotado.',
        category: 'Problema de Material',
        enabled: true,
        params: { max_hours: 24 },
      },
      {
        check_key: 'cotacoes_sem_pedido',
        title: 'Cotações sem pedido de compra',
        description:
          'Materiais com cotação finalizada mas ainda sem Ordem de Compra emitida há mais de N horas.',
        category: 'Inconsistência',
        enabled: true,
        params: { max_hours: 48 },
      },
      {
        check_key: 'faltas_sem_compra',
        title: 'Faltas em aberto sem compra associada',
        description:
          'Faltas marcadas na separação ou apontadas pelo operador que continuam pendentes sem nenhuma ordem de compra.',
        category: 'Problema de Material',
        enabled: true,
        params: {},
      },
      {
        check_key: 'recebimentos_parciais_pendentes',
        title: 'Recebimentos parciais pendentes',
        description:
          'Ordens de compra ou materiais recebidos parcialmente parados aguardando saldo restante.',
        category: 'Inconsistência',
        enabled: true,
        params: { max_days: 5 },
      },
      {
        check_key: 'baixas_retroativas_pendentes',
        title: 'Baixas retroativas aguardando aprovação',
        description:
          'Solicitações de baixa retroativa pendentes de revisão de Suprimentos há mais tempo que o limite.',
        category: 'Inconsistência',
        enabled: true,
        params: { max_hours: 24 },
      },
    ]

    const configsRecordCol = app.findCollectionByNameOrId('pcp_alert_configs')
    for (let i = 0; i < initialChecks.length; i++) {
      const item = initialChecks[i]
      let existing = null
      try {
        existing = app.findFirstRecordByFilter('pcp_alert_configs', 'check_key = {:key}', {
          key: item.check_key,
        })
      } catch (_) {
        existing = null
      }

      if (!existing) {
        const rec = new Record(configsRecordCol)
        rec.set('check_key', item.check_key)
        rec.set('title', item.title)
        rec.set('description', item.description)
        rec.set('category', item.category)
        rec.set('enabled', item.enabled)
        rec.set('params', item.params)
        app.save(rec)
      }
    }
  },
  (app) => {
    try {
      const runs = app.findCollectionByNameOrId('pcp_alert_runs')
      if (runs) app.delete(runs)
    } catch (_) {}
    try {
      const configs = app.findCollectionByNameOrId('pcp_alert_configs')
      if (configs) app.delete(configs)
    } catch (_) {}
  },
)
