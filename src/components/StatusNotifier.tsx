import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { ProductStatusModel } from '@/types'

export function StatusNotifier() {
  const prevStatuses = useRef<Record<string, string>>({})
  const statusesRef = useRef<Record<string, ProductStatusModel>>({})

  useEffect(() => {
    // Load initial statuses of products
    pb.collection('products')
      .getFullList({ fields: 'id,status,name' })
      .then((products) => {
        const map: Record<string, string> = {}
        products.forEach((p) => {
          map[p.id] = p.status
        })
        prevStatuses.current = map
      })
      .catch(() => {})

    // Load available statuses
    pb.collection('product_statuses')
      .getFullList<ProductStatusModel>()
      .then((statuses) => {
        const map: Record<string, ProductStatusModel> = {}
        statuses.forEach((s) => {
          map[s.id] = s
        })
        statusesRef.current = map
      })
      .catch(() => {})
  }, [])

  useRealtime('products', (e) => {
    if (e.action === 'update') {
      const record = e.record
      const prevStatusId = prevStatuses.current[record.id]

      if (prevStatusId && prevStatusId !== record.status) {
        const newStatus = statusesRef.current[record.status]
        if (newStatus) {
          const sName = newStatus.name.toLowerCase()
          if (
            sName === 'em revisão' ||
            sName === 'em revisao' ||
            sName === 'devolvido' ||
            sName === 'validado'
          ) {
            toast.info(`Atualização de Status`, {
              description: `O produto "${record.name}" mudou para: ${newStatus.name}`,
            })
          }
        }
      }

      // Update our ref
      prevStatuses.current[record.id] = record.status
    } else if (e.action === 'create') {
      prevStatuses.current[e.record.id] = e.record.status
    }
  })

  return null
}
