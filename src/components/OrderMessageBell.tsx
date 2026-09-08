import { Bell, BellOff, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IndicatorState } from '@/lib/message-sector'

interface OrderMessageBellProps {
  state: IndicatorState
  className?: string
  size?: 'sm' | 'md'
  pendingCount?: number
}

export function OrderMessageBell({
  state,
  className,
  size = 'md',
  pendingCount = 0,
}: OrderMessageBellProps) {
  if (state === 'none') return null

  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'

  if (state === 'gray') {
    return <BellOff className={cn(iconSize, 'text-gray-400 dark:text-gray-500', className)} />
  }

  // Red / Amber para perguntas pendentes
  if (state === 'red') {
    return (
      <span className="relative inline-flex items-center justify-center">
        <Bell className={cn(iconSize, 'text-amber-500 animate-pulse', className)} />
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-2 px-1 py-0 text-[8px] font-black rounded-full bg-amber-500 text-white">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </span>
    )
  }

  const stateClasses: Record<string, string> = {
    green: 'text-green-500 animate-pulse',
    blue: 'text-blue-500',
  }

  return <Bell className={cn(iconSize, stateClasses[state] || 'text-blue-500', className)} />
}
