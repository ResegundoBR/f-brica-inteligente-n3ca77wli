import type { User, Role } from '@/types'

export type MessageSector = 'comercial' | 'pcp' | 'operator'
export type MessageChannel = 'Comercial' | 'Operador'

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

export function isPcpManager(user: User | null | undefined): boolean {
  if (!user) return false
  const role = user.expand?.role
  if (!role) return false
  return (
    !!role.access_pcp ||
    !!role.access_painel_controle ||
    role.name === 'admin' ||
    role.name === 'Administrador'
  )
}

export function getUserChannel(user: User | null | undefined): MessageChannel | null {
  if (!user) return null
  const role = user.expand?.role
  if (!role) return null
  if (role.access_commercial) return 'Comercial'
  if (role.access_operator) return 'Operador'
  return null
}

export function isPcpSender(msg: any): boolean {
  const userExpand = msg?.expand?.user_id
  if (!userExpand) return false
  const role = userExpand.expand?.role
  if (!role) return false
  return (
    !!role.access_pcp ||
    !!role.access_painel_controle ||
    role.name === 'admin' ||
    role.name === 'Administrador'
  )
}

export type IndicatorState = 'none' | 'blue' | 'green' | 'gray'
