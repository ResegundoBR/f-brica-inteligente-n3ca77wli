import pb from '@/lib/pocketbase/client'
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

// Configuração do Polling Periódico Leve (substitui a assinatura SSE/realtime que causava rajadas de 429)
// Intervalo padrão de 45 segundos (timer global único, não por componente)
const POLLING_INTERVAL_MS = 45000

// Delays de backoff progressivo para 429 ou falhas de rede: 30s -> 60s -> 120s
const RATE_LIMIT_DELAYS = [30000, 60000, 120000]
let rateLimitRetryCount = 0
let rateLimitBlockedUntil = 0
let backoffTimer: ReturnType<typeof setTimeout> | null = null
let pollingTimer: ReturnType<typeof setInterval> | null = null

const state: SharedMessagesState = {
  messages: [],
  loading: false,
  error: null,
  initialized: false,
}

const listeners = new Set<Listener>()
let currentAuthUserId: string | null = pb.authStore.record?.id ?? null

function notifyListeners() {
  const currentList = state.messages
  listeners.forEach((listener) => {
    try {
      listener(currentList)
    } catch (err) {
      console.warn('[pcpOrderMessagesShared] Aviso no listener:', err)
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
 * BLINDAGEM TOTAL: Nunca lança erro não tratado para a UI nem expõe banner de erro.
 * Se falhar ou der 429, mantém silenciosamente os últimos dados válidos em cache
 * e agenda nova tentativa com backoff progressivo.
 */
export async function fetchAllOrderMessages(force: boolean = false): Promise<PcpOrderMessage[]> {
  // Se não estiver logado, zera tudo sem erro
  if (!pb.authStore.isValid && !pb.authStore.record) {
    state.messages = []
    state.loading = false
    state.error = null
    state.initialized = true
    notifyListeners()
    return []
  }

  // Se estivermos dentro da janela de espera de rate-limit (429), mantém dados e aguarda
  const now = Date.now()
  if (now < rateLimitBlockedUntil && !force) {
    const remainingSec = Math.ceil((rateLimitBlockedUntil - now) / 1000)
    console.warn(`[pcpOrderMessagesShared] Backoff ativo. Próxima checagem em ${remainingSec}s`)
    return state.messages
  }

  // Se já há uma requisição em voo, reaproveita a mesma Promise
  if (activeFetchPromise && !force) {
    return activeFetchPromise
  }

  state.loading = true

  activeFetchPromise = (async () => {
    try {
      const records = await pb.collection('pcp_order_messages').getFullList<PcpOrderMessage>({
        sort: '-created',
        expand: 'user_id.role,order_id.client_id,reply_to.user_id',
      })
      state.messages = records
      state.initialized = true
      state.error = null
      // Sucesso: reseta backoff de 429
      rateLimitRetryCount = 0
      rateLimitBlockedUntil = 0
      notifyListeners()
      return records
    } catch (err: any) {
      // Blindagem: apenas log discreto em console.warn
      const rateLimited = isRateLimitError(err)
      const delayIdx = Math.min(rateLimitRetryCount, RATE_LIMIT_DELAYS.length - 1)
      const nextDelay = RATE_LIMIT_DELAYS[delayIdx]
      rateLimitRetryCount += 1
      rateLimitBlockedUntil = Date.now() + nextDelay

      console.warn(
        `[pcpOrderMessagesShared] Checagem adiada (${rateLimited ? '429 Rate Limit' : 'Falha na rede'}). Tentativa em ${Math.round(nextDelay / 1000)}s. Mantendo dados válidos em cache.`,
      )

      // Agenda tentativa de re-sincronização via backoff
      if (backoffTimer) clearTimeout(backoffTimer)
      backoffTimer = setTimeout(() => {
        backoffTimer = null
        if (listeners.size > 0 && pb.authStore.isValid) {
          fetchAllOrderMessages(true).catch(() => {})
        }
      }, nextDelay)

      // Sempre mantém os últimos dados válidos em cache, inicializado = true para não travar a UI
      state.initialized = true
      state.error = null
      notifyListeners()

      // Retorna os dados em cache em vez de lançar exceção para a UI
      return state.messages
    } finally {
      state.loading = false
      activeFetchPromise = null
    }
  })()

  return activeFetchPromise
}

/**
 * Agenda uma recarga com debounce (500ms) para agrupar ações do usuário sem gerar rajadas
 */
export function scheduleDebouncedReload(delayMs: number = 500) {
  // Se estiver em backoff de 429, respeita a janela de espera
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
 * Impedindo que a alteração de leitura gere tempestade de requisições
 */
export async function markMessagesAsReadLocallyAndRemote(ids: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
  if (uniqueIds.length === 0) return

  // 1. Registra no Set de supressão
  uniqueIds.forEach((id) => locallyMarkedReadIds.add(id))

  // 2. Atualização otimista imediata no estado em memória para resposta instantânea na UI
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
  try {
    await Promise.allSettled(
      uniqueIds.map((id) => pb.collection('pcp_order_messages').update(id, { read: true })),
    )
  } catch (err) {
    console.warn('[pcpOrderMessagesShared] Erro discreto ao atualizar leitura:', err)
  }
}

/**
 * Gerenciador do Timer Global Único de Polling Leve (a cada 45s)
 * O timer só roda se houver ao menos um listener ativo e usuário logado.
 */
function ensureGlobalPollingTimer() {
  if (pollingTimer) return
  if (typeof window === 'undefined') return

  pollingTimer = setInterval(() => {
    // Só busca se houver componentes escutando e usuário autenticado
    if (listeners.size === 0) return
    if (!pb.authStore.isValid && !pb.authStore.record) return

    // Se estiver em backoff ativo de 429, pula este ciclo de polling
    if (Date.now() < rateLimitBlockedUntil) {
      return
    }

    // Busca periódica leve
    fetchAllOrderMessages(false).catch(() => {})
  }, POLLING_INTERVAL_MS)
}

function stopGlobalPollingTimer() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

/**
 * Desmonta timers e limpa recursos do store compartilhado.
 * Mantido como export compatível para teardowns em logout/troca de usuário.
 */
export async function teardownSharedRealtimeSubscription(): Promise<void> {
  if (backoffTimer) {
    clearTimeout(backoffTimer)
    backoffTimer = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  pendingReload = false
  stopGlobalPollingTimer()
}

// Monitora alterações de autenticação (troca de conta ou logout)
if (typeof window !== 'undefined') {
  pb.authStore.onChange(async (_token, record) => {
    const nextId = record?.id ?? null
    if (currentAuthUserId !== nextId) {
      currentAuthUserId = nextId
      // 1. Limpa timers anteriores
      await teardownSharedRealtimeSubscription()

      // 2. Limpa cache e estado anterior
      state.initialized = false
      state.messages = []
      state.error = null
      locallyMarkedReadIds.clear()
      rateLimitRetryCount = 0
      rateLimitBlockedUntil = 0

      // 3. Se houver usuário logado e subscribers ativos, inicia polling e primeira carga
      if (nextId && listeners.size > 0) {
        ensureGlobalPollingTimer()
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
    if (listeners.size > 0 && pb.authStore.isValid) {
      ensureGlobalPollingTimer()
      fetchAllOrderMessages(true).catch(() => {})
    }
  })
}

/**
 * Assina atualizações da fonte compartilhada de mensagens.
 * Ativa o polling global único de 45 segundos se ainda não estiver ativo.
 * Retorna a função de unsubscribe.
 */
export function subscribeToSharedMessages(listener: Listener): () => void {
  listeners.add(listener)
  ensureGlobalPollingTimer()

  // Se já temos dados carregados ou inicializados, notifica imediatamente
  if (state.initialized) {
    try {
      listener(state.messages)
    } catch (err) {
      console.warn('[pcpOrderMessagesShared] Aviso ao notificar subscriber:', err)
    }
  } else if (!state.loading) {
    // Inicia a primeira carga compartilhada
    fetchAllOrderMessages().catch(() => {})
  }

  return () => {
    listeners.delete(listener)
    // Se não houver mais nenhum componente escutando, pausa o timer de polling
    if (listeners.size === 0) {
      stopGlobalPollingTimer()
    }
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
