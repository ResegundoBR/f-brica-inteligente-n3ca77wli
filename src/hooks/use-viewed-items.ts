import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY_PREFIX = 'viewed_items_'

export function useViewedItems(listKey: string) {
  const storageKey = `${STORAGE_KEY_PREFIX}${listKey}`
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        setViewedIds(new Set(JSON.parse(stored)))
      }
    } catch {
      // ignore
    }
  }, [storageKey])

  const markAsViewed = useCallback(
    (id: string) => {
      setViewedIds((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]))
        } catch {
          // ignore
        }
        return next
      })
    },
    [storageKey],
  )

  const isNew = useCallback((id: string) => !viewedIds.has(id), [viewedIds])

  return { viewedIds, markAsViewed, isNew }
}
