import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OrderMessageBellProps {
  count: number
  className?: string
  size?: 'sm' | 'md'
}

export function OrderMessageBell({ count, className, size = 'md' }: OrderMessageBellProps) {
  if (count <= 0) return null

  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'
  const badgeSize =
    size === 'sm' ? 'min-w-[14px] h-[14px] text-[8px]' : 'min-w-[16px] h-[16px] text-[9px]'

  return (
    <span
      className={cn('relative inline-flex items-center', className)}
      title={`${count} mensagem(ns) não lida(s)`}
    >
      <Bell className={cn(iconSize, 'text-orange-500 animate-shake')} />
      <span
        className={cn(
          'absolute -top-1.5 -right-1.5 flex items-center justify-center px-0.5 rounded-full bg-red-500 text-white font-bold',
          badgeSize,
        )}
      >
        {count > 99 ? '99+' : count}
      </span>
    </span>
  )
}
