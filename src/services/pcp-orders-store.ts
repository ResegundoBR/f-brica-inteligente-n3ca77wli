import pb from '@/lib/pocketbase/client'
import { normalizeStage } from '@/lib/pcp-utils'

export type PcpOrderRecord = any

type Listener = (orders: PcpOrderRecord[]) => void

interface SharedOrdersState {
  orders: PcpOrderRecord[]
  loading: boolean
  error: string | null
  initialized: boolean
}

// Conjunto de IDs cujas alterações locais foram disparadas por este cliente recentemente
// para não re-buscar a coleção inteira em loop a cada evento realtime gerado por nós mesmos
const locallyUpdatedOrderIds = new Set<string>()

// Helper para ignorar temporariamente eventos realtime originados por nós
export function markOrderLocallyUpdated(id: string) {
  locallyUpdatedOrderIds.add(id)
  setTimeout(() => {
    locallyUpdatedOrderIds.delete(id)
  }, 4000)
}

// Timer de debounce para agrupar múltiplos eventos realtime em uma única requisição
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingReload = false
let activeFetchPromise: Promise<PcpOrderRecord[]> | null = null

// Backoff progressivo para 429 ou falhas temporárias de rede
const RATE_LIMIT_DELAYS = [3000, 7000, 15000, 30000]
let rateLimitRetryCount = 0
let rateLimitBlockedUntil = 0
let backoffTimer: ReturnType<typeof setTimeout> | null = null

// Cache em memória compartilhado
const state: SharedOrdersState = {
  orders: [],
  loading: false,
  error: null,
  initialized: false,
}

const listeners = new Set<Listener>()

function notifyListeners() {
  const currentList = state.orders
  listeners.forEach((listener) => {
    try {
      listener(currentList)
    } catch (err) {
      console.warn('[pcpOrdersSharedStore] Erro no listener:', err)
    }
  })
}

/**
 * Helper para verificar se um erro é 429 (Too Many Requests)
 */
export function isRateLimitError(err: any): boolean {
  if (!err) return false
  const status = err?.status || err?.statusCode || err?.response?.status
  if (status === 429) return true
  const msg = String(err?.message || err?.error || '')
  return msg.includes('429') || /too many requests/i.test(msg)
}

/**
 * Espera um delay em milissegundos
 */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Executa uma operação com PocketBase com retry e backoff automático em caso de 429
 */
export async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await operation()
    } catch (err: any) {
      attempt++
      if (isRateLimitError(err) && attempt <= maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500
        console.warn(
          `[withRateLimitRetry] 429 detectado. Tentativa ${attempt}/${maxRetries} após ${Math.round(delay)}ms`,
        )
        await sleep(delay)
        continue
      }
      throw err
    }
  }
}

/**
 * Busca todas as ordens com expand completo.
 * Blindagem: nunca quebra a tela com erro não tratado. Mantém dados em cache e agenda retry com backoff.
 */
export async function fetchAllPcpOrders(force: boolean = false): Promise<PcpOrderRecord[]> {
  // Se não estiver logado, não faz a requisição
  if (!pb.authStore.isValid && !pb.authStore.record) {
    state.orders = []
    state.loading = false
    state.error = null
    state.initialized = true
    notifyListeners()
    return []
  }

  // Se estivermos dentro da janela de espera de rate-limit (429), mantém dados e aguarda
  const now = Date.now()
  if (now < rateLimitBlockedUntil && !force) {
    return state.orders
  }

  // Se já há uma requisição em voo, reaproveita a mesma Promise
  if (activeFetchPromise && !force) {
    return activeFetchPromise
  }

  state.loading = true

  activeFetchPromise = (async () => {
    try {
      const records = await pb.collection('pcp_orders').getFullList({
        expand: 'product_id,client_id,operator_id,promised_by,bottleneck_by',
        sort: '-manual_priority,-created',
      })
      state.orders = records.map((r: any) => ({
        ...r,
        stage: normalizeStage(r.stage),
      }))
      state.initialized = true
      state.error = null
      rateLimitRetryCount = 0
      rateLimitBlockedUntil = 0
      notifyListeners()
      return records
    } catch (err: any) {
      const rateLimited = isRateLimitError(err)
      const delayIdx = Math.min(rateLimitRetryCount, RATE_LIMIT_DELAYS.length - 1)
      const nextDelay = RATE_LIMIT_DELAYS[delayIdx]
      rateLimitRetryCount += 1
      rateLimitBlockedUntil = Date.now() + nextDelay

      console.warn(
        `[pcpOrdersSharedStore] Busca suspensa (${rateLimited ? '429 Rate Limit' : 'Erro de rede'}). Próxima tentativa em ${Math.round(nextDelay / 1000)}s. Mantendo dados válidos em cache.`,
      )

      if (backoffTimer) clearTimeout(backoffTimer)
      backoffTimer = setTimeout(() => {
        backoffTimer = null
        if (listeners.size > 0 && pb.authStore.isValid) {
          fetchAllPcpOrders(true).catch(() => {})
        }
      }, nextDelay)

      // Mantém inicializado para não quebrar UI
      state.initialized = true
      state.error = rateLimited ? 'Servidor ocupado. Aguardando sincronização...' : null
      notifyListeners()
      return state.orders
    } finally {
      state.loading = false
      activeFetchPromise = null
    }
  })()

  return activeFetchPromise
}

/**
 * Agenda recarga com debounce para evitar rajadas ao receber múltiplos eventos realtime
 */
export function scheduleDebouncedOrdersReload(delayMs: number = 800) {
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
      fetchAllPcpOrders(true).catch(() => {})
    }
  }, delayMs)
}

/**
 * Atualiza o cache local imediatamente de forma otimista
 */
export function updateLocalPcpOrders(updater: (prev: PcpOrderRecord[]) => PcpOrderRecord[]) {
  state.orders = updater(state.orders)
  notifyListeners()
}

/**
 * Assina atualizações do store compartilhado
 */
export function subscribeToSharedPcpOrders(listener: Listener): () => void {
  listeners.add(listener)

  if (state.initialized) {
    try {
      listener(state.orders)
    } catch (err) {
      console.warn('[pcpOrdersSharedStore] Erro ao notificar subscriber:', err)
    }
  } else if (!state.loading) {
    fetchAllPcpOrders().catch(() => {})
  }

  return () => {
    listeners.delete(listener)
  }
}

/**
 * Retorna snapshot síncrono
 */
export function getSharedPcpOrdersSnapshot() {
  return {
    orders: state.orders,
    loading: state.loading,
    error: state.error,
    initialized: state.initialized,
  }
}

/**
 * Executa persistência em lote com controle de concorrência e delays graduais,
 * impedindo que dezenas de updates simultâneos disparem 429 no PocketBase.
 * Cada patch é executado com retry automático se receber 429.
 */
export async function persistSequentialOrderUpdates(
  items: { id: string; data: Record<string, any> }[],
  concurrency: number = 2,
  itemDelayMs: number = 80,
): Promise<{ success: boolean; errors: any[] }> {
  const errors: any[] = []
  if (items.length === 0) return { success: true, errors }

  // Marcar IDs para não disparar refetch pelo realtime
  items.forEach((item) => markOrderLocallyUpdated(item.id))

  // Normalizar stage no payload caso esteja presente
  const sanitizedItems = items.map((item) => {
    if (item.data && item.data.stage !== undefined) {
      return {
        ...item,
        data: {
          ...item.data,
          stage: normalizeStage(item.data.stage),
        },
      }
    }
    return item
  })

  // Executa em fila com concorrência limitada e pequeno throttle
  let index = 0
  async function worker() {
    while (index < sanitizedItems.length) {
      const current = sanitizedItems[index++]
      try {
        await withRateLimitRetry(
          () => pb.collection('pcp_orders').update(current.id, current.data),
          4,
          1000,
        )
      } catch (err) {
        console.error(`[persistSequentialOrderUpdates] Falha ao atualizar OP ${current.id}:`, err)
        errors.push({ id: current.id, error: err })
      }
      if (itemDelayMs > 0) {
        await sleep(itemDelayMs)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)

  return { success: errors.length === 0, errors }
}
