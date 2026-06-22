import { useEffect } from 'react'

export function useEmergencyStyles() {
  useEffect(() => {
    const style = document.createElement('style')
    style.innerHTML = `
      /* Neon Orange Alert Box for Blocked/Locked items */
      .alert-neon-orange {
        background-color: #ff5e00 !important;
        color: #ffffff !important;
        border: 1px solid #e05300 !important;
        box-shadow: 0 4px 15px rgba(255, 94, 0, 0.25) !important;
      }
      .alert-neon-orange * {
        color: #ffffff !important;
      }
      .alert-neon-orange svg {
        color: #ffffff !important;
        fill: currentColor;
      }
      
      /* Emergency Border Animation for both PcpKanban and PcpOperator */
      .is-emergency-card,
      [class*="border-emergency"] {
        animation: pulse-border-red 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
      }

      /* Kanban emergency styles (triggered by getOrderColor returning 'emergency') */
      [class*="border-emergency"] {
        border-color: #ef4444 !important;
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.5) !important;
      }
      [class*="bg-emergency"] {
        background-color: rgba(254, 226, 226, 0.6) !important;
      }
      .dark [class*="bg-emergency"] {
        background-color: rgba(69, 10, 10, 0.4) !important;
      }
      [class*="text-emergency"] {
        color: #ef4444 !important;
      }

      /* Kanban neon-orange styles (triggered by getOrderColor returning 'neon-orange') */
      [class*="border-neon-orange"] {
        border-color: #ff5e00 !important;
        box-shadow: 0 0 8px rgba(255, 94, 0, 0.3) !important;
      }
      [class*="bg-neon-orange"] {
        background-color: #ff5e00 !important;
      }
      [class*="text-neon-orange"] {
        color: #ff5e00 !important;
      }

      @keyframes pulse-border-red {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4), 0 0 12px rgba(239, 68, 68, 0.5);
        }
        50% {
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.0), 0 0 12px rgba(239, 68, 68, 0.1);
        }
      }
    `
    document.head.appendChild(style)

    const observer = new MutationObserver(() => {
      // 1. Style "Travado:" / "Gargalo:" alerts dynamically
      const alertBoxes = document.querySelectorAll(
        '[role="alert"], .bg-red-50, .bg-destructive\\/10, .border-destructive\\/50, .bg-red-100',
      )
      for (let i = 0; i < alertBoxes.length; i++) {
        const box = alertBoxes[i]
        if (
          box.textContent &&
          (box.textContent.includes('Travado:') || box.textContent.includes('Gargalo:'))
        ) {
          if (!box.classList.contains('alert-neon-orange')) {
            box.classList.add('alert-neon-orange')
            const icons = box.querySelectorAll('svg')
            icons.forEach((icon: any) => {
              icon.classList.remove(
                'text-red-600',
                'text-destructive',
                'text-red-500',
                'text-red-800',
              )
            })
          }
        }
      }

      // 2. Reorder cards to put Emergency items on top in Flex/Grid containers
      const emergencyCards = document.querySelectorAll(
        '.is-emergency-card, [class*="border-emergency"]',
      )
      emergencyCards.forEach((card: any) => {
        const parent = card.parentElement
        if (
          parent &&
          (window.getComputedStyle(parent).display === 'grid' ||
            window.getComputedStyle(parent).display === 'flex')
        ) {
          if (card.style.order !== '-1') card.style.order = '-1'
        }
      })
    })

    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    return () => {
      document.head.removeChild(style)
      observer.disconnect()
    }
  }, [])
}
