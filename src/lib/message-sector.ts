import type { User, Role } from '@/types'

export type MessageSector = 'comercial' | 'pcp' | 'operator'

export const SECTOR_LABELS: Record<MessageSector, string> = {
  pcp: 'PCP',
  comercial: 'Comercial',
  operator: 'Operador',
}

export function getRoleSector(role: Role | undefined | null): MessageSector {
  if (!role) return 'pcp'
  if (role.access_commercial) return 'comercial'
  if (role.access_pcp) return 'pcp'
  if (role.access_operator) return 'operator'
  return 'pcp'
}

export function getUserSector(user: User | null | undefined): MessageSector {
  if (!user) return 'pcp'
  return getRoleSector(user.expand?.role)
}

export function getMessageSenderSector(msg: any): MessageSector {
  const userExpand = msg?.expand?.user_id
  if (!userExpand) return 'pcp'
  const role = userExpand.expand?.role
  return getRoleSector(role)
}

export type IndicatorState = 'none' | 'blue' | 'green' | 'gray'
