import pb from '@/lib/pocketbase/client'

export interface SeparationAuditLogPayload {
  orderIds: string[]
  opNumbers?: string[]
  action: 'Separação - Falta Parcial' | 'Separação - Substituição de Componente'
  itemOriginal: {
    code: string
    description: string
    quantityRequested: number
    unit?: string
    cutMeasurement?: string | null
  }
  separatedQuantity?: number
  shortageQuantity?: number
  substitute?: {
    code: string
    description: string
    quantity: number
    unit?: string
  } | null
  operatorName?: string
  notes?: string
}

/**
 * Registra logs de auditoria em pcp_order_logs para todas as OPs envolvidas.
 * Mantém estrutura de detalhes legível tanto em texto puro quanto com dados estruturados.
 */
export async function logSeparationAction(payload: SeparationAuditLogPayload): Promise<void> {
  const currentUserId = pb.authStore.record?.id
  const operator =
    payload.operatorName || pb.authStore.record?.name || pb.authStore.record?.email || 'Operador'

  const nowIso = new Date().toISOString()
  const dateFormatted = new Date().toLocaleString('pt-BR')

  const targetOrderIds = Array.from(new Set(payload.orderIds.filter(Boolean)))

  // Se não houver order_ids mas tivermos opNumbers, tentar localizar
  if (targetOrderIds.length === 0 && payload.opNumbers && payload.opNumbers.length > 0) {
    try {
      const cleanOps = payload.opNumbers.map((o) => o.replace(/^OP\s*/i, '').trim())
      const filter = cleanOps.map((op) => `op_number = "${op}"`).join(' || ')
      if (filter) {
        const found = await pb.collection('pcp_orders').getFullList({
          filter,
          fields: 'id',
        })
        found.forEach((f: any) => targetOrderIds.push(f.id))
      }
    } catch (e) {
      console.warn('Erro ao resolver order_ids a partir de op_numbers:', e)
    }
  }

  if (targetOrderIds.length === 0) {
    return
  }

  // Montar detalhes legíveis
  let detailsText = ''
  if (payload.action === 'Separação - Falta Parcial') {
    const orig = payload.itemOriginal
    const sep = payload.separatedQuantity ?? 0
    const falta = payload.shortageQuantity ?? 0
    const u = orig.unit || 'UN'
    const corte = orig.cutMeasurement ? ` (Corte: ${orig.cutMeasurement})` : ''

    detailsText = [
      `Falta Parcial registrada por ${operator} em ${dateFormatted}:`,
      `• Item: ${orig.code ? `[${orig.code}] ` : ''}${orig.description}${corte}`,
      `• Solicitado total: ${orig.quantityRequested} ${u}`,
      `• Separado no estoque: ${sep} ${u}`,
      `• Faltante (solicitação em Suprimentos): ${falta} ${u}`,
      payload.notes ? `• Observação: ${payload.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  } else if (payload.action === 'Separação - Substituição de Componente') {
    const orig = payload.itemOriginal
    const sub = payload.substitute
    const u = orig.unit || 'UN'
    const corte = orig.cutMeasurement ? ` (Corte: ${orig.cutMeasurement})` : ''

    detailsText = [
      `Substituição de Componente registrada por ${operator} em ${dateFormatted}:`,
      `• Item original: ${orig.code ? `[${orig.code}] ` : ''}${orig.description}${corte} (${orig.quantityRequested} ${u})`,
      sub
        ? `• Substituto oficial: [${sub.code}] ${sub.description} (${sub.quantity} ${sub.unit || u})`
        : '• Substituto selecionado',
      `• Item original marcado como substituído (sem solicitação de compra).`,
      payload.notes ? `• Observação: ${payload.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  // Grava para cada OP envolvida
  for (const orderId of targetOrderIds) {
    try {
      await pb.collection('pcp_order_logs').create({
        order_id: orderId,
        user_id: currentUserId || null,
        stage: 'Separação',
        action: payload.action,
        details: detailsText,
      })
    } catch (err) {
      console.error(`Erro ao gravar log de separação para OP ${orderId}:`, err)
    }
  }
}
