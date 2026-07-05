import { Bell, BellOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IndicatorState } from '@/lib/message-sector'

interface OrderMessageBellProps {
  state: IndicatorState
  className?: string
  size?: 'sm' | 'md'
}

export function OrderMessageBell({ state, className, size = 'md' }: OrderMessageBellProps) {
  if (state === 'none') return null

  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'

  if (state === 'gray') {
    return <BellOff className={cn(iconSize, 'text-gray-400 dark:text-gray-500', className)} />
  }

  const stateClasses: Record<string, string> = {
    green: 'text-green-500 animate-pulse',
    blue: 'text-blue-500',
  }

  return <Bell className={cn(iconSize, stateClasses[state], className)} />
}
