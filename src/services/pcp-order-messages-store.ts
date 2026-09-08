import pb, { teardownRealtimeClient } from '@/lib/pocketbase/client'
import type { PcpOrderMessage } from '@/types'

type Listener = (messages: PcpOrderMessage[]) => void

interface SharedMessagesState {
  messages: PcpOrderMessage[]
  loading: boolean
  error: string | null
  initialized: boolean
}

// Conjunto de IDs cujos updates locais de leitura foram disparados por este cliente
// e cujos eventos realtime correspondentes (action === 'update' onde read passou para true)
// NÃO devem disparar nova recarga de mensagens.
const locallyMarkedReadIds = new Set<string>()

// Gerencia debounce para agrupar múltiplos eventos realtime em uma única requisição getFullList
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingReload = false
let activeFetchPromise: Promise<PcpOrderMessage[]> | null = null

// Controle de backoff para 429 Too Many Requests
// Delays crescentes especificados: 5s -> 15s -> 30s com limite de 3 tentativas
const RATE_LIMIT_DELAYS = [5000, 15000, 30000]
const MAX_RATE_LIMIT_RETRIES = 3
let rateLimitRetryCount = 0
let rateLimitBlockedUntil = 0
let rateLimitTimer: ReturnType<typeof setTimeout> | null = null

const state: SharedMessagesState = {
  messages: [],
  loading: false,
  error: null,
  initialized: false,
}

const listeners = new Set<Listener>()
let realtimeUnsubscribe: (() => Promise<void>) | null = null
let isSubscribing = false
let currentAuthUserId: string | null = pb.authStore.record?.id ?? null

function notifyListeners() {
  const currentList = state.messages
  listeners.forEach((listener) => {
    try {
      listener(currentList)
    } catch (err) {
      console.error('[pcpOrderMessagesShared] Erro no listener:', err)
    }
  })
}

/**
 * Helper para verificar se um erro é 429 (Too Many Requests)
 */
function isRateLimitError(err: any): boolean {
  if (!err) return false
  const status = err?.status || err?.statusCode || err?.response?.status
  if (status === 429) return true
  const msg = String(err?.message || err?.error || '')
  return msg.includes('429') || /too many requests/i.test(msg)
}

/**
 * Busca todas as mensagens de pcp_order_messages no PocketBase
 */
export async function fetchAllOrderMessages(force: boolean = false): Promise<PcpOrderMessage[]> {
  // Se não estiver logado, zera tudo
  if (!pb.authStore.isValid && !pb.authStore.record) {
    state.messages = []
    state.loading = false
    state.error = null
    state.initialized = true
    notifyListeners()
    return []
  }

  // Se estivermos dentro da janela de espera de rate-limit (429), bloqueia novas chamadas imediatas
  const now = Date.now()
  if (now < rateLimitBlockedUntil && !force) {
    const remainingSec = Math.ceil((rateLimitBlockedUntil - now) / 1000)
    console.warn(`[pcpOrderMessagesShared] Bloqueio por 429 ativo. Aguarde ${remainingSec}s...`)
    return state.messages
  }

  // Se já há uma requisição em voo, reaproveita a mesma Promise para evitar tempestade
  if (activeFetchPromise && !force) {
    return activeFetchPromise
  }

  state.loading = true
  state.error = null

  activeFetchPromise = (async () => {
    try {
      const records = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        sort: '-created',
        expand: 'user_id.role,order_id.client_id,reply_to.user_id',
      })
      state.messages = records
      state.initialized = true
      state.error = null
      // Sucesso: reseta contador de 429
      rateLimitRetryCount = 0
      rateLimitBlockedUntil = 0
      notifyListeners()
      return records
    } catch (err: any) {
      console.error('[pcpOrderMessagesShared] Erro ao carregar mensagens:', err)

      if (isRateLimitError(err)) {
        if (rateLimitRetryCount < MAX_RATE_LIMIT_RETRIES) {
          const delay = RATE_LIMIT_DELAYS[rateLimitRetryCount] || 30000
          rateLimitRetryCount += 1
          rateLimitBlockedUntil = Date.now() + delay
          const seconds = Math.round(delay / 1000)
          state.error = `Limite de requisições excedido. Nova tentativa em ${seconds}s (tentativa ${rateLimitRetryCount}/${MAX_RATE_LIMIT_RETRIES})...`
          notifyListeners()

          if (rateLimitTimer) clearTimeout(rateLimitTimer)
          rateLimitTimer = setTimeout(() => {
            rateLimitTimer = null
            fetchAllOrderMessages(true).catch(() => {})
          }, delay)
        } else {
          state.error =
            'Muitas requisições ao servidor. Aguarde alguns instantes antes de atualizar.'
          notifyListeners()
        }
      } else {
        state.error = err?.message || 'Falha ao sincronizar mensagens'
        notifyListeners()
      }

      throw err
    } finally {
      state.loading = false
      activeFetchPromise = null
    }
  })()

  return activeFetchPromise
}

/**
 * Agenda uma recarga com debounce (300ms) para agrupar rajadas de eventos
 */
export function scheduleDebouncedReload(delayMs: number = 300) {
  // Se estiver em backoff de 429, respeita a espera
  if (Date.now() < rateLimitBlockedUntil) {
    return
  }

  pendingReload = true
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    if (pendingReload) {
      pendingReload = false
      fetchAllOrderMessages(true).catch(() => {})
    }
  }, delayMs)
}

/**
 * Marca localmente IDs como lidos e envia o PATCH ao PocketBase
 * Impedindo que a alteração de leitura dispare um loop de recargas
 */
export async function markMessagesAsReadLocallyAndRemote(ids: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
  if (uniqueIds.length === 0) return

  // 1. Registra no Set de supressão de eventos realtime
  uniqueIds.forEach((id) => locallyMarkedReadIds.add(id))

  // 2. Atualiza otimista imediata no estado em memória para resposta instantânea na UI
  const idSet = new Set(uniqueIds)
  let hadChange = false
  const updatedMessages = state.messages.map((m) => {
    if (idSet.has(m.id) && !m.read) {
      hadChange = true
      return { ...m, read: true }
    }
    return m
  })

  if (hadChange) {
    state.messages = updatedMessages
    notifyListeners()
  }

  // 3. Executa as atualizações na base de dados
  // Sem chamar fetchAllOrderMessages ao final (já está otimista)
  try {
    await Promise.allSettled(
      uniqueIds.map((id) => pb.collection('pcp_order_messages').update(id, { read: true })),
    )
  } catch (err) {
    console.warn('[pcpOrderMessagesShared] Erro ao atualizar status de lida:', err)
  }
}

/**
 * Verifica se um evento realtime é uma simples alteração de marcação de leitura (PATCH read: true)
 * Se for apenas leitura ou se o ID foi marcado localmente por este cliente,
 * aplica a mutação de forma otimista local sem disparar nova requisição HTTP.
 */
function handleRealtimeEvent(e: { action: string; record: PcpOrderMessage }) {
  const { action, record } = e
  const recordId = record?.id

  // Se for ação de update
  if (action === 'update' && recordId) {
    // Caso 1: ID está no nosso Set de atualizações locais de leitura
    if (locallyMarkedReadIds.has(recordId)) {
      // Já manipulamos localmente. Atualiza o registro em memória caso ainda não esteja
      state.messages = state.messages.map((m) =>
        m.id === recordId ? { ...m, ...record, read: true } : m,
      )
      notifyListeners()
      // Mantém no set por um tempo para evitar rajadas e depois limpa
      setTimeout(() => locallyMarkedReadIds.delete(recordId), 5000)
      return
    }

    // Caso 2: Se foi atualizado apenas o campo read para true por qualquer cliente
    // (compara com a mensagem atual em memória se temos ela)
    const existing = state.messages.find((m) => m.id === recordId)
    if (existing && !existing.read && record.read) {
      // Apenas mudou de não lido para lido! Atualiza em memória diretamente
      // sem gerar tempestade de getFullList
      state.messages = state.messages.map((m) =>
        m.id === recordId ? { ...m, ...record, read: true } : m,
      )
      notifyListeners()
      return
    }
  }

  // Se for criação de nova mensagem ou alteração estrutural (ex: nova pergunta, resposta vinculada, etc.):
  // agenda recarga com debounce para agrupar múltiplos eventos em 1 única requisição
  scheduleDebouncedReload(300)
}

/**
 * Inicializa a assinatura singleton do PocketBase para pcp_order_messages
 */
async function ensureRealtimeSubscription() {
  if (realtimeUnsubscribe || isSubscribing) return
  if (!pb.authStore.isValid && !pb.authStore.record) return

  isSubscribing = true
  try {
    const unsub = await pb.collection<PcpOrderMessage>('pcp_order_messages').subscribe('*', (e) => {
      handleRealtimeEvent(e as any)
    })
    realtimeUnsubscribe = unsub
  } catch (err: any) {
    console.warn('[pcpOrderMessagesShared] Erro na assinatura realtime:', err)
    if (isRateLimitError(err)) {
      if (rateLimitRetryCount < MAX_RATE_LIMIT_RETRIES) {
        const delay = RATE_LIMIT_DELAYS[rateLimitRetryCount] || 30000
        rateLimitRetryCount += 1
        rateLimitBlockedUntil = Date.now() + delay
        if (rateLimitTimer) clearTimeout(rateLimitTimer)
        rateLimitTimer = setTimeout(() => {
          rateLimitTimer = null
          ensureRealtimeSubscription().catch(() => {})
        }, delay)
      }
    }
  } finally {
    isSubscribing = false
  }
}

/**
 * Desmonta completamente a assinatura realtime do store compartilhado
 */
export async function teardownSharedRealtimeSubscription(): Promise<void> {
  if (rateLimitTimer) {
    clearTimeout(rateLimitTimer)
    rateLimitTimer = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  pendingReload = false

  if (realtimeUnsubscribe) {
    const fn = realtimeUnsubscribe
    realtimeUnsubscribe = null
    try {
      await fn()
    } catch {
      /* ignore */
    }
  }

  // Desmonta conexão SSE geral do cliente para garantir novo client id
  await teardownRealtimeClient()
}

// Monitora alterações de autenticação (troca de conta ou logout)
if (typeof window !== 'undefined') {
  pb.authStore.onChange(async (_token, record) => {
    const nextId = record?.id ?? null
    if (currentAuthUserId !== nextId) {
      currentAuthUserId = nextId
      // 1. Desmonta completamente a assinatura e conexão realtime antiga antes de qualquer coisa
      await teardownSharedRealtimeSubscription()

      // 2. Limpa cache e estado anterior
      state.initialized = false
      state.messages = []
      state.error = null
      locallyMarkedReadIds.clear()
      rateLimitRetryCount = 0
      rateLimitBlockedUntil = 0

      // 3. Se houver usuário logado e subscribers ativos, recria conexão e recarrega dados
      if (nextId && listeners.size > 0) {
        await ensureRealtimeSubscription()
        fetchAllOrderMessages(true).catch(() => {})
      } else {
        notifyListeners()
      }
    }
  })

  // Ao reconectar rede online após queda real
  window.addEventListener('online', () => {
    rateLimitRetryCount = 0
    rateLimitBlockedUntil = 0
    ensureRealtimeSubscription().catch(() => {})
    fetchAllOrderMessages(true).catch(() => {})
  })
}

/**
 * Assina atualizações da fonte compartilhada de mensagens.
 * Retorna a função de unsubscribe.
 */
export function subscribeToSharedMessages(listener: Listener): () => void {
  listeners.add(listener)
  ensureRealtimeSubscription().catch(() => {})

  // Se já temos dados carregados ou inicializados, notifica imediatamente
  if (state.initialized) {
    try {
      listener(state.messages)
    } catch (err) {
      console.error('[pcpOrderMessagesShared] Erro ao notificar novo subscriber:', err)
    }
  } else if (!state.loading) {
    // Inicia a primeira carga compartilhada
    fetchAllOrderMessages().catch(() => {})
  }

  return () => {
    listeners.delete(listener)
  }
}

/**
 * Retorna snapshot síncrono do estado compartilhado
 */
export function getSharedMessagesSnapshot() {
  return {
    messages: state.messages,
    loading: state.loading,
    error: state.error,
    initialized: state.initialized,
  }
}
