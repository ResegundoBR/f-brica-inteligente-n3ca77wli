import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'suprimentos_viewed_requests'

function getViewedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveViewedIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    /* intentionally ignored */
  }
}

export function useNewRequests() {
  const [viewedIds, setViewedIds] = useState<Set<string>>(getViewedIds)

  useEffect(() => {
    const handler = () => setViewedIds(getViewedIds())
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const markAsViewed = useCallback((id: string) => {
    setViewedIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      saveViewedIds(next)
      return next
    })
  }, [])

  const isNew = useCallback((id: string) => !viewedIds.has(id), [viewedIds])

  return { isNew, markAsViewed }
}
