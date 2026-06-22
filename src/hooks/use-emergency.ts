import { useEffect, useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import { PcpOrder } from '@/types'
import { useRealtime } from './use-realtime'

export function useEmergencyStyles() {
  const prioritiesRef = useRef<Record<string, number>>({})

  const applyStyles = () => {
    const cards = document.querySelectorAll('.bg-card')
    cards.forEach((card) => {
      // Ignore elements with too much text to prevent matching giant dashboard panels instead of OP cards
      if ((card.textContent || '').length > 1500) return

      let matchedOpNum: string | null = null
      const text = card.textContent || ''

      Object.keys(prioritiesRef.current).forEach((opNum) => {
        let found = false
        if (/[a-zA-Z]/.test(opNum)) {
          found = new RegExp(`\\b${opNum}\\b`, 'i').test(text)
        } else {
          // Look for OP prefixes or the exact number if it appears distinct
          if (new RegExp(`(?:OP|#|Ordem|Pedido)\\s*[-]?\\s*${opNum}\\b`, 'i').test(text)) {
            found = true
          } else if (new RegExp(`\\b${opNum}\\b`).test(text)) {
            found = true
          }
        }
        if (found) matchedOpNum = opNum
      })

      if (!matchedOpNum) return

      const isEmergency = prioritiesRef.current[matchedOpNum] === 1

      if (isEmergency) {
        card.classList.add('emergency-card')
        if (!card.querySelector('.emergency-badge')) {
          const badge = document.createElement('span')
          badge.className =
            'emergency-badge absolute -top-3 -right-3 flex items-center px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded-full shadow-lg animate-pulse z-[60] pointer-events-none'
          badge.textContent = '🚨 EMERGÊNCIA'
          card.appendChild(badge)
          card.classList.add('relative')
          card.setAttribute('style', (card.getAttribute('style') || '') + '; order: -1 !important;')
        }
      } else {
        card.classList.remove('emergency-card')
        const badge = card.querySelector('.emergency-badge')
        if (badge) badge.remove()
        const style = card.getAttribute('style')
        if (style) {
          card.setAttribute('style', style.replace(/;\s*order:\s*-1\s*!important;/g, ''))
        }
      }

      if (!card.querySelector('.emergency-toggle')) {
        const btn = document.createElement('button')
        btn.className = `emergency-toggle absolute bottom-2 right-2 w-8 h-8 rounded-full transition-all z-50 text-lg hover:scale-110 flex items-center justify-center bg-background/80 backdrop-blur-sm border shadow-sm`
        btn.title = isEmergency ? 'Remover Emergência' : 'Marcar como Emergência'
        btn.innerHTML = isEmergency ? '🚨' : '⚠️'
        if (!isEmergency) {
          btn.classList.add('opacity-0', 'group-hover:opacity-100', 'grayscale')
        }
        btn.onclick = async (e) => {
          e.preventDefault()
          e.stopPropagation()
          try {
            const records = await pb
              .collection('pcp_orders')
              .getList<PcpOrder>(1, 1, { filter: `order_number = '${matchedOpNum}'` })
            if (records.items[0]) {
              const op = records.items[0]
              const newPriority = op.manual_priority === 1 ? 0 : 1
              await pb.collection('pcp_orders').update(op.id, { manual_priority: newPriority })
            }
          } catch (err) {
            console.error('Failed to toggle emergency', err)
          }
        }
        card.appendChild(btn)
        card.classList.add('group')
        card.classList.add('relative')
      } else {
        const btn = card.querySelector('.emergency-toggle') as HTMLButtonElement
        btn.innerHTML = isEmergency ? '🚨' : '⚠️'
        btn.title = isEmergency ? 'Remover Emergência' : 'Marcar como Emergência'
        if (isEmergency) {
          btn.classList.remove('opacity-0', 'group-hover:opacity-100', 'grayscale')
        } else {
          btn.classList.add('opacity-0', 'group-hover:opacity-100', 'grayscale')
        }
      }
    })
  }

  useEffect(() => {
    const fetchPriorities = async () => {
      try {
        const records = await pb.collection('pcp_orders').getFullList<PcpOrder>({
          fields: 'id,order_number,manual_priority',
        })
        const newPriorities: Record<string, number> = {}
        records.forEach((r) => {
          newPriorities[r.order_number] = r.manual_priority || 0
        })
        prioritiesRef.current = newPriorities
        applyStyles()
      } catch {
        /* intentionally ignored */
      }
    }

    fetchPriorities()

    const observer = new MutationObserver(() => {
      requestAnimationFrame(() => applyStyles())
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
    }
  }, [])

  useRealtime('pcp_orders', (e) => {
    if (e.action === 'update' || e.action === 'create') {
      const op = e.record as unknown as PcpOrder
      prioritiesRef.current[op.order_number] = op.manual_priority || 0
      applyStyles()
    } else if (e.action === 'delete') {
      const op = e.record as unknown as PcpOrder
      delete prioritiesRef.current[op.order_number]
      applyStyles()
    }
  })
}
