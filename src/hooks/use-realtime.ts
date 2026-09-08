import { useEffect, useRef } from 'react'
import type { RecordModel, RecordSubscription } from 'pocketbase'

import pb from '@/lib/pocketbase/client'

/**
 * Hook for real-time subscriptions to a PocketBase collection.
 * ALWAYS use this hook instead of subscribing inline.
 * Uses the per-listener UnsubscribeFunc so multiple components
 * can safely subscribe to the same collection without conflicts.
 *
 * Generic over the record type: pass your collection's interface as
 * `useRealtime<MyRecord>(...)` to get a typed subscription payload
 * instead of `unknown`.
 */
export interface UseRealtimeOptions {
  enabled?: boolean
  onReconnect?: () => void
}

export function useRealtime<TRecord extends RecordModel = RecordModel>(
  collectionName: string,
  callback: (data: RecordSubscription<TRecord>) => void,
  optionsOrEnabled: boolean | UseRealtimeOptions = true,
) {
  const options: UseRealtimeOptions =
    typeof optionsOrEnabled === 'boolean' ? { enabled: optionsOrEnabled } : optionsOrEnabled

  const { enabled = true, onReconnect } = options

  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const onReconnectRef = useRef(onReconnect)
  onReconnectRef.current = onReconnect

  const hasSubscribedOnceRef = useRef(false)
  const currentAuthIdRef = useRef<string | null>(pb.authStore.record?.id ?? null)

  useEffect(() => {
    if (!enabled) return

    let unsubscribeFn: (() => Promise<void>) | undefined
    let cancelled = false

    // Monitora troca real de autenticação
    const unsubscribeAuth = pb.authStore.onChange((_token, record) => {
      const nextId = record?.id ?? null
      if (currentAuthIdRef.current !== nextId) {
        currentAuthIdRef.current = nextId
        // Troca real de conta: dispara onReconnect se já tínhamos uma inscrição
        if (hasSubscribedOnceRef.current && onReconnectRef.current) {
          try {
            onReconnectRef.current()
          } catch (err) {
            console.error('[useRealtime] Erro em onReconnect na troca de conta:', err)
          }
        }
      }
    })

    // Monitora queda e retorno real de conexão da rede/navegador
    const handleOnline = () => {
      if (hasSubscribedOnceRef.current && onReconnectRef.current) {
        try {
          onReconnectRef.current()
        } catch (err) {
          console.error('[useRealtime] Erro em onReconnect no evento online:', err)
        }
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
    }

    pb.collection<TRecord>(collectionName)
      .subscribe('*', (e) => {
        callbackRef.current(e)
      })
      .then((fn) => {
        if (cancelled) {
          fn().catch(() => {})
        } else {
          unsubscribeFn = fn
          // Marcar que a primeira inscrição foi concluída com sucesso.
          // NOTA: NÃO chamar onReconnect na primeira inscrição!
          hasSubscribedOnceRef.current = true
        }
      })
      .catch((err) => {
        console.warn(`[useRealtime] Erro ao assinar ${collectionName}:`, err)
      })

    return () => {
      cancelled = true
      unsubscribeAuth()
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
      }
      if (unsubscribeFn) {
        unsubscribeFn().catch(() => {})
      }
    }
  }, [collectionName, enabled])
}

export default useRealtime
