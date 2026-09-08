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
export function useRealtime<TRecord extends RecordModel = RecordModel>(
  collectionName: string,
  callback: (data: RecordSubscription<TRecord>) => void,
  enabled: boolean = true,
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    let unsubscribeFn: (() => Promise<void>) | undefined
    let retryTimeoutId: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    let retryCount = 0
    const retryDelays = [5000, 15000, 30000]
    const maxRetries = 3

    function subscribeWithBackoff() {
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
          }
        })
        .catch((err: any) => {
          if (cancelled) return
          const status = err?.status || err?.statusCode || err?.response?.status
          const msg = String(err?.message || '')
          const is429 = status === 429 || /too many requests/i.test(msg)

          if (is429 && retryCount < maxRetries) {
            const delay = retryDelays[retryCount] || 30000
            retryCount += 1
            retryTimeoutId = setTimeout(subscribeWithBackoff, delay)
          }
        })
    }

    subscribeWithBackoff()

    return () => {
      cancelled = true
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId)
      }
      if (unsubscribeFn) {
        unsubscribeFn().catch(() => {})
      }
    }
  }, [collectionName, enabled])
}

export default useRealtime
