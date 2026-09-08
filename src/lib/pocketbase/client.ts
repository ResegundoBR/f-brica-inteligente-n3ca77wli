import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

/**
 * Desconecta e desmonta completamente a conexão SSE / cliente realtime atual
 * antes de qualquer reautenticação ou nova submissão.
 * Limpa o clientId para evitar o erro:
 * "The current and the previous request authorization don't match" (403)
 */
export async function teardownRealtimeClient(): Promise<void> {
  try {
    if (pb.realtime) {
      await pb.realtime.unsubscribe().catch(() => {})
      // Garante o fechamento do EventSource e reset de clientId
      if (typeof (pb.realtime as any).disconnect === 'function') {
        ;(pb.realtime as any).disconnect()
      } else {
        pb.realtime.clientId = ''
      }
    }
  } catch (err) {
    console.warn('[teardownRealtimeClient] Erro ao desmontar realtime:', err)
  }
}

let lastAuthRecordId: string | null = pb.authStore.record?.id ?? null

// Monitora alterações na authStore para desmontar realtime imediatamente
// sempre que o usuário deslogar ou trocar de conta
pb.authStore.onChange((_token, record) => {
  const nextId = record?.id ?? null
  if (lastAuthRecordId !== nextId) {
    lastAuthRecordId = nextId
    teardownRealtimeClient().catch(() => {})
  }
})

export default pb
