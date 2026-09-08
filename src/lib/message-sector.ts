import type { User, Role } from '@/types'
import {
  Briefcase,
  Sparkles,
  Hammer,
  Wrench,
  Truck,
  HardHat,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'

export type MessageSector =
  | 'Comercial'
  | 'Acabamento'
  | 'Fabricação'
  | 'Montagem'
  | 'Expedição'
  | 'Operador'

export type MessageChannel = MessageSector

export const SECTOR_OPTIONS: MessageSector[] = [
  'Comercial',
  'Acabamento',
  'Fabricação',
  'Montagem',
  'Expedição',
]

export interface SectorVisualMeta {
  label: string
  icon: LucideIcon
  color: string
  bubbleBgOwn: string
  bubbleBgOther: string
  bubbleBorder: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
  lightBg: string
}

export const SECTOR_VISUALS: Record<MessageSector, SectorVisualMeta> = {
  Comercial: {
    label: 'Comercial',
    icon: Briefcase,
    color: '#0284c7', // sky-600
    bubbleBgOwn: 'bg-sky-600 text-white',
    bubbleBgOther:
      'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-800 text-foreground',
    bubbleBorder: 'border-l-sky-500',
    badgeBg: 'bg-sky-100 dark:bg-sky-950/50',
    badgeText: 'text-sky-800 dark:text-sky-300',
    badgeBorder: 'border-sky-300 dark:border-sky-800',
    lightBg: 'bg-sky-50 dark:bg-sky-950/30',
  },
  Acabamento: {
    label: 'Acabamento',
    icon: Sparkles,
    color: '#9333ea', // purple-600
    bubbleBgOwn: 'bg-purple-600 text-white',
    bubbleBgOther:
      'bg-purple-50 dark:bg-purple-950/60 border-purple-300 dark:border-purple-800 text-foreground',
    bubbleBorder: 'border-l-purple-500',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/50',
    badgeText: 'text-purple-800 dark:text-purple-300',
    badgeBorder: 'border-purple-300 dark:border-purple-800',
    lightBg: 'bg-purple-50 dark:bg-purple-950/30',
  },
  Fabricação: {
    label: 'Fabricação',
    icon: Hammer,
    color: '#ea580c', // orange-600
    bubbleBgOwn: 'bg-orange-600 text-white',
    bubbleBgOther:
      'bg-orange-50 dark:bg-orange-950/60 border-orange-300 dark:border-orange-800 text-foreground',
    bubbleBorder: 'border-l-orange-500',
    badgeBg: 'bg-orange-100 dark:bg-orange-950/50',
    badgeText: 'text-orange-800 dark:text-orange-300',
    badgeBorder: 'border-orange-300 dark:border-orange-800',
    lightBg: 'bg-orange-50 dark:bg-orange-950/30',
  },
  Montagem: {
    label: 'Montagem',
    icon: Wrench,
    color: '#16a34a', // green-600
    bubbleBgOwn: 'bg-emerald-600 text-white',
    bubbleBgOther:
      'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-foreground',
    bubbleBorder: 'border-l-emerald-500',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/50',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    badgeBorder: 'border-emerald-300 dark:border-emerald-800',
    lightBg: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  Expedição: {
    label: 'Expedição',
    icon: Truck,
    color: '#0d9488', // teal-600
    bubbleBgOwn: 'bg-teal-600 text-white',
    bubbleBgOther:
      'bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-800 text-foreground',
    bubbleBorder: 'border-l-teal-500',
    badgeBg: 'bg-teal-100 dark:bg-teal-950/50',
    badgeText: 'text-teal-800 dark:text-teal-300',
    badgeBorder: 'border-teal-300 dark:border-teal-800',
    lightBg: 'bg-teal-50 dark:bg-teal-950/30',
  },
  Operador: {
    label: 'Operador',
    icon: HardHat,
    color: '#64748b', // slate-500
    bubbleBgOwn: 'bg-slate-700 text-white',
    bubbleBgOther:
      'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-foreground',
    bubbleBorder: 'border-l-slate-500',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeText: 'text-slate-800 dark:text-slate-300',
    badgeBorder: 'border-slate-300 dark:border-slate-700',
    lightBg: 'bg-slate-50 dark:bg-slate-900/40',
  },
}

export const SECTOR_LABELS: Record<string, string> = {
  pcp: 'PCP',
  Comercial: 'Comercial',
  Acabamento: 'Acabamento',
  Fabricação: 'Fabricação',
  Montagem: 'Montagem',
  Expedição: 'Expedição',
  Operador: 'Operador',
}

/**
 * Detecta o setor do usuário a partir da role e perfil
 */
export function getRoleSector(role: Role | undefined | null): MessageSector | 'pcp' {
  if (!role) return 'pcp'
  const roleName = (role.name || '').toLowerCase()

  if (roleName.includes('acabamento')) return 'Acabamento'
  if (roleName.includes('montagem')) return 'Montagem'
  if (roleName.includes('expedição') || roleName.includes('expedicao')) return 'Expedição'
  if (roleName.includes('fabric')) return 'Fabricação'
  if (roleName.includes('comercial') || role.access_commercial || role.access_visao_comercial) {
    return 'Comercial'
  }

  if (role.access_operator) return 'Operador'
  return 'pcp'
}

export function getUserSector(user: User | null | undefined): MessageSector | 'pcp' {
  if (!user) return 'pcp'
  return getRoleSector(user.expand?.role)
}

/**
 * Retorna o canal/setor específico do usuário.
 * Se for gestor PCP/Admin, retorna null (visão de todos os canais).
 */
export function getUserChannel(user: User | null | undefined): MessageSector | null {
  if (!user) return null
  if (isPcpManager(user)) return null
  const sector = getUserSector(user)
  if (sector === 'pcp') return null
  return sector
}

export function isPcpManager(user: User | null | undefined): boolean {
  if (!user) return false
  const role = user.expand?.role
  if (!role) {
    return user.role === 'admin' || user.email === 'reginaldo.segundo@planagroup.com.br'
  }
  return (
    !!role.access_pcp ||
    !!role.access_painel_controle ||
    role.name === 'admin' ||
    role.name === 'Administrador' ||
    user.email === 'reginaldo.segundo@planagroup.com.br'
  )
}

export function isPcpSender(msg: any): boolean {
  const userExpand = msg?.expand?.user_id
  if (!userExpand) return false
  const role = userExpand.expand?.role
  if (!role) {
    return userExpand.role === 'admin' || userExpand.email === 'reginaldo.segundo@planagroup.com.br'
  }
  return (
    !!role.access_pcp ||
    !!role.access_painel_controle ||
    role.name === 'admin' ||
    role.name === 'Administrador' ||
    userExpand.email === 'reginaldo.segundo@planagroup.com.br'
  )
}

export function getMessageSenderSector(msg: any): MessageSector | 'pcp' {
  if (isPcpSender(msg)) return 'pcp'
  if (msg?.sector) return msg.sector
  const userExpand = msg?.expand?.user_id
  if (!userExpand) return 'pcp'
  return getRoleSector(userExpand.expand?.role)
}

export type IndicatorState = 'none' | 'blue' | 'green' | 'gray' | 'red'
