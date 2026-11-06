import pb from '@/lib/pocketbase/client'

export type AlertSeverity = 'Crítica' | 'Alta' | 'Média' | 'Baixa'

export type AlertCategory =
  | 'Atrasado'
  | 'Parado'
  | 'Problema de Material'
  | 'Inconsistência'
  | 'Padrões Suspeitos'

export type AlertStatus = 'novo' | 'persistente' | 'resolvido'

export interface PcpAlertItem {
  id: string
  check_key: string
  category: AlertCategory
  entity_type: string
  entity_id: string
  entity_ref: string
  title: string
  time_info: string
  severity: AlertSeverity
  action_suggestion: string
  status?: AlertStatus
  details?: Record<string, unknown>
}

export interface PcpAlertConfig {
  id: string
  check_key: string
  title: string
  description: string
  category: string
  enabled: boolean
  params: Record<string, unknown>
  created?: string
  updated?: string
}

export interface PcpAlertRun {
  id: string
  started: string
  finished: string
  trigger_type: string
  summary: string
  created: string
  updated: string
  results?: {
    alerts: PcpAlertItem[]
    resolved_count: number
    resolved_alerts?: PcpAlertItem[]
    categorized_counts: Record<string, number>
    agent_summary?: string
  }
}

export interface RunAnalysisResponse {
  started: string
  finished: string
  trigger_type: string
  summary: string
  alerts: PcpAlertItem[]
  resolved_alerts: PcpAlertItem[]
  categorized_counts: Record<string, number>
  agent_summary: string
}

export const pcpAlertsService = {
  /**
   * Lista as configurações de alerta do catálogo
   */
  async getConfigs(): Promise<PcpAlertConfig[]> {
    const records = await pb.collection('pcp_alert_configs').getFullList({
      sort: 'title',
    })
    return records.map((r) => ({
      id: r.id,
      check_key: r.check_key,
      title: r.title,
      description: r.description,
      category: r.category,
      enabled: r.enabled,
      params: (r.params || {}) as Record<string, unknown>,
      created: r.created,
      updated: r.updated,
    }))
  },

  /**
   * Atualiza uma configuração de alerta (liga/desliga ou edita parâmetros)
   */
  async updateConfig(
    id: string,
    updates: {
      enabled?: boolean
      params?: Record<string, unknown>
      title?: string
      description?: string
    },
  ): Promise<PcpAlertConfig> {
    const res = await pb.send<{ success: boolean; data: PcpAlertConfig }>(
      `/backend/v1/pcp/alerts/configs/${id}`,
      {
        method: 'PATCH',
        body: updates,
      },
    )
    return res.data
  },

  /**
   * Dispara a análise completa de alertas no backend
   */
  async runAnalysis(): Promise<RunAnalysisResponse> {
    const res = await pb.send<{ success: boolean; data: RunAnalysisResponse }>(
      '/backend/v1/pcp/alerts/analyze',
      {
        method: 'POST',
      },
    )
    return res.data
  },

  /**
   * Obtém o histórico das últimas execuções de alerta
   */
  async getRunsHistory(limit = 10): Promise<PcpAlertRun[]> {
    const records = await pb.collection('pcp_alert_runs').getList(1, limit, {
      sort: '-created',
    })
    return records.items.map((r) => ({
      id: r.id,
      started: r.started,
      finished: r.finished,
      trigger_type: r.trigger_type,
      summary: r.summary,
      created: r.created,
      updated: r.updated,
      results: r.results as PcpAlertRun['results'],
    }))
  },
}
