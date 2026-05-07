export type UserRole = 'Registrador' | 'Revisador' | 'Admin'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
}

export type ProductStatus = 'Iniciado' | 'Revisão' | 'Validado' | 'Pendência'

export interface Process {
  id: string
  name: string
  details: string
}

export interface CompositionItem {
  id: string
  code: string
  description: string
  quantity: number
  measurements: string
}

export interface ReviewPoint {
  id: string
  description: string
  resolved: boolean | null // null = not checked, true = V, false = X
  observation: string
}

export interface Product {
  id: string
  name: string
  details: string
  status: ProductStatus
  lastUpdate: string
  daysIdle: number
  processes: Process[]
  composition: CompositionItem[]
  checklist: string[]
  reviewPoints: ReviewPoint[]
}

export interface LearningRecord {
  id: string
  date: string
  title: string
  description: string
  validated: boolean
  photos: string[]
}

export interface Log {
  id: string
  timestamp: string
  user: string
  action: string
  target: string
}
