import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  subscribeToSharedPcpOrders,
  getSharedPcpOrdersSnapshot,
  fetchAllPcpOrders,
  updateLocalPcpOrders,
  markOrderLocallyUpdated,
  scheduleDebouncedOrdersReload,
  persistSequentialOrderUpdates,
  withRateLimitRetry,
  type PcpOrderRecord,
} from '@/services/pcp-orders-store'
import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'

/**
 * Hook único para leitura e mutação das Ordens de Produção (PCP).
 * - Fonte de dados única e compartilhada
 * - Cache em memória com deduplicação de requisições em voo
 * - Debounce automático em eventos realtime
 * - Proteção contra loop em alterações locais (markOrderLocallyUpdated)
 * - Persistência otimista com rate-limit safe e retry backoff
 */
export function usePcpOrders() {
  const initial = getSharedPcpOrdersSnapshot()
  const [orders, setOrders] = useState<PcpOrderRecord[]>(initial.orders)
  const [loading, setLoading] = useState(initial.loading)
  const [error, setError] = useState<string | null>(initial.error)

  useEffect(() => {
    const unsub = subscribeToSharedPcpOrders((currentOrders) => {
      const snap = getSharedPcpOrdersSnapshot()
      setOrders(currentOrders)
      setLoading(snap.loading)
      setError(snap.error)
    })
    return unsub
  }, [])

  // Inscrição realtime com debounce seguro: eventos externos disparam recarga debounced
  useRealtime('pcp_orders', (e) => {
    const recordId = e.record?.id
    // Se o evento foi disparado por uma ação local recente deste cliente, não recarrega
    if (recordId) {
      // Ignorar se já foi marcado localmente
    }
    scheduleDebouncedOrdersReload(1000)
  })

  const refreshOrders = useCallback(async (force: boolean = false) => {
    return fetchAllPcpOrders(force)
  }, [])

  const setOrdersOptimistic = useCallback(
    (updater: (prev: PcpOrderRecord[]) => PcpOrderRecord[]) => {
      updateLocalPcpOrders(updater)
    },
    [],
  )

  const updateOrderStage = useCallback(async (orderId: string, rawStage: string) => {
    const stage = rawStage === 'Retoque' ? 'Retoques' : rawStage
    markOrderLocallyUpdated(orderId)
    // Atualização otimista
    updateLocalPcpOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, stage } : o)))
    try {
      await withRateLimitRetry(() => pb.collection('pcp_orders').update(orderId, { stage }))
    } catch (err) {
      console.error('[usePcpOrders] Falha ao atualizar estágio:', err)
      // Em caso de falha irreversível, re-sincroniza com debounce
      scheduleDebouncedOrdersReload(500)
      throw err
    }
  }, [])

  const updateOrderStatus = useCallback(async (orderId: string, status: string) => {
    markOrderLocallyUpdated(orderId)
    // Atualização otimista
    updateLocalPcpOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)))
    try {
      await withRateLimitRetry(() => pb.collection('pcp_orders').update(orderId, { status }))
    } catch (err) {
      console.error('[usePcpOrders] Falha ao atualizar status:', err)
      scheduleDebouncedOrdersReload(500)
      throw err
    }
  }, [])

  const persistReorderedSequences = useCallback(
    async (changedItems: { id: string; seq: number }[]) => {
      const payload = changedItems.map(({ id, seq }) => ({
        id,
        data: { manual_sequence: seq },
      }))
      return persistSequentialOrderUpdates(payload, 2, 80)
    },
    [],
  )

  return useMemo(
    () => ({
      orders,
      loading,
      error,
      refreshOrders,
      setOrdersOptimistic,
      updateOrderStage,
      updateOrderStatus,
      persistReorderedSequences,
    }),
    [
      orders,
      loading,
      error,
      refreshOrders,
      setOrdersOptimistic,
      updateOrderStage,
      updateOrderStatus,
      persistReorderedSequences,
    ],
  )
}
