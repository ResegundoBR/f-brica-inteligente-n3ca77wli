import React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'

interface UserActionBadgeProps {
  user?: {
    id?: string
    name?: string
    avatar?: string
    email?: string
  } | null
  prefix?: string // e.g. "por", "Solicitado por", "Recebido por", "Separado por"
  date?: string | Date | null
  showTime?: boolean
  className?: string
  compact?: boolean // se verdadeiro, só primeiro nome
  fallbackText?: string
}

function formatBadgeDate(dateVal: string | Date, showTime?: boolean): string {
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal
    if (isNaN(d.getTime())) return ''
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    if (showTime) {
      const hours = String(d.getHours()).padStart(2, '0')
      const mins = String(d.getMinutes()).padStart(2, '0')
      return `${day}/${month} ${hours}:${mins}`
    }
    return `${day}/${month}`
  } catch {
    return ''
  }
}

export function UserActionBadge({
  user,
  prefix = 'por',
  date,
  showTime = false,
  className,
  compact = true,
  fallbackText,
}: UserActionBadgeProps) {
  if (!user && !date && !fallbackText) {
    return null
  }

  const rawName = user?.name || user?.email?.split('@')[0] || ''
  const displayName = compact && rawName ? rawName.split(' ')[0] : rawName
  const initials = displayName ? displayName.slice(0, 2).toUpperCase() : '?'
  const dateFormatted = date ? formatBadgeDate(date, showTime) : ''

  const avatarUrl =
    user?.id && user?.avatar
      ? pb.files.getURL({ id: user.id, collectionName: 'users' }, user.avatar, { thumb: '64x64' })
      : undefined

  if (!rawName && !avatarUrl && !dateFormatted) {
    if (fallbackText) {
      return (
        <span className={cn('text-xs text-muted-foreground inline-flex items-center', className)}>
          {fallbackText}
        </span>
      )
    }
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-muted-foreground font-normal leading-none',
        className,
      )}
      title={
        rawName ? `${prefix} ${rawName}${dateFormatted ? ` em ${dateFormatted}` : ''}` : undefined
      }
    >
      {rawName && (
        <Avatar className="h-4 w-4 shrink-0 border border-slate-200 dark:border-slate-700">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={rawName} />}
          <AvatarFallback className="text-[9px] font-semibold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {initials}
          </AvatarFallback>
        </Avatar>
      )}
      <span className="truncate">
        {prefix ? `${prefix} ` : ''}
        {displayName && <strong className="font-medium text-foreground/80">{displayName}</strong>}
        {displayName && dateFormatted && ' · '}
        {dateFormatted && <span className="text-muted-foreground/90">{dateFormatted}</span>}
      </span>
    </span>
  )
}

export default UserActionBadge
