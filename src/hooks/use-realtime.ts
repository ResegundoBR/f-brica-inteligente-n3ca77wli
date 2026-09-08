import { useEffect, useRef, useState } from 'react'
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
  /**
   * Chamado quando a assinatura em tempo real é estabelecida ou restabelecida com sucesso,
   * permitindo recarregar os dados para sincronizar com eventuais eventos perdidos.
   */
  onReconnect?: () => void
}

export function useRealtime<TRecord extends RecordModel = RecordModel>(
  collectionName: string,
  callback: (data: RecordSubscription<TRecord>) => void,
  enabledOrOptions: boolean | UseRealtimeOptions = true,
) {
  const options: UseRealtimeOptions =
    typeof enabledOrOptions === 'boolean' ? { enabled: enabledOrOptions } : enabledOrOptions

  const enabled = options.enabled ?? true
  const onReconnect = options.onReconnect

  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const onReconnectRef = useRef(onReconnect)
  onReconnectRef.current = onReconnect

  // Monitora alterações de autenticação (token / usuário) para forçar resubscribe
  const [authKey, setAuthKey] = useState<string>(() => {
    return `${pb.authStore.token}_${pb.authStore.record?.id ?? 'guest'}`
  })

  useEffect(() => {
    const unsubAuth = pb.authStore.onChange((token, record) => {
      setAuthKey(`${token}_${record?.id ?? 'guest'}`)
    })
    return () => {
      unsubAuth()
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    let unsubscribeFn: (() => Promise<void>) | undefined
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let retryCount = 0
    let hasSubscribedOnce = false

    const subscribeWithRetry = () => {
      if (cancelled) return

      pb.collection<TRecord>(collectionName)
        .subscribe('*', (e) => {
          callbackRef.current(e)
        })
        .then((fn) => {
          if (cancelled) {
            fn().catch(() => {})
          } else {
            unsubscribeFn = fn
            retryCount = 0
            // Se já tínhamos tentado antes ou reconectamos após troca de auth / queda,
            // dispara onReconnect para recarregar os dados
            if (hasSubscribedOnce || authKey) {
              try {
                onReconnectRef.current?.()
              } catch (err) {
                console.error(`[useRealtime] Erro no onReconnect de '${collectionName}':`, err)
              }
            }
            hasSubscribedOnce = true
          }
        })
        .catch((err) => {
          console.error(
            `[useRealtime] Erro ao assinar a coleção '${collectionName}' (tentativa ${retryCount + 1}):`,
            err,
          )
          if (cancelled) return

          // Backoff exponencial simples: 1s, 2s, 4s, até máx 10s
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000)
          retryCount++
          retryTimer = setTimeout(() => {
            subscribeWithRetry()
          }, delay)
        })
    }

    subscribeWithRetry()

    return () => {
      cancelled = true
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
      if (unsubscribeFn) {
        unsubscribeFn().catch((err) => {
          console.warn(`[useRealtime] Aviso ao desinscrever de '${collectionName}':`, err)
        })
      }
    }
  }, [collectionName, enabled, authKey])
}

export default useRealtime
