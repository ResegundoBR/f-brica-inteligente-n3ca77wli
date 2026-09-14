import pb from '@/lib/pocketbase/client'
import { formatLocalDate } from '@/lib/pcp-utils'

interface SetPromisedDateOptions {
  orderId: string
  orderNumber?: string
  opNumber?: string
  currentPromisedDate?: string | null
  newPromisedDate: string | null // YYYY-MM-DD or null
  note?: string
  userId?: string
  userName?: string
  alsoSetEmergency?: boolean // se ativou emergência ao mesmo tempo
}

function formatDateDisplay(dateStr?: string | null): string {
  if (!dateStr) return 'nenhuma'
  return formatLocalDate(dateStr)
}

export async function setPromisedDateOnOrder({
  orderId,
  currentPromisedDate,
  newPromisedDate,
  note = '',
  userId,
  userName = 'Administrador',
  alsoSetEmergency,
}: SetPromisedDateOptions) {
  const nowIso = new Date().toISOString()

  const cleanDate = newPromisedDate ? newPromisedDate.trim().split('T')[0].split(' ')[0] : ''
  const payload: Record<string, any> = {
    promised_date: cleanDate ? `${cleanDate} 12:00:00.000Z` : '',
    promised_note: note || '',
  }

  if (newPromisedDate) {
    payload.promised_by = userId || ''
    payload.promised_at = nowIso
  } else {
    payload.promised_by = ''
    payload.promised_at = ''
  }

  if (alsoSetEmergency !== undefined) {
    payload.manual_priority = alsoSetEmergency ? 1 : 0
  }

  const updatedRecord = await pb.collection('pcp_orders').update(orderId, payload)

  // Auditoria em pcp_order_logs
  try {
    const oldDisplay = formatDateDisplay(currentPromisedDate)
    const newDisplay = formatDateDisplay(newPromisedDate)
    const actionText = newPromisedDate
      ? alsoSetEmergency
        ? 'Emergência ativada com Data Prometida'
        : 'Data Prometida definida'
      : 'Data Prometida removida'

    let details = `Data anterior: ${oldDisplay} → Nova data: ${newDisplay}`
    if (note) {
      details += ` | Motivo/Nota: "${note}"`
    }
    if (alsoSetEmergency) {
      details += ' | Urgência: Emergência 🚨'
    }

    await pb.collection('pcp_order_logs').create({
      order_id: orderId,
      user_id: userId || null,
      stage: updatedRecord.stage || '',
      action: actionText,
      details,
    })
  } catch (err) {
    console.error('Falha ao registrar log de data prometida:', err)
  }

  return updatedRecord
}
