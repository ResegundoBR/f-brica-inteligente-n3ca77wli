export type UserRole = 'registrator' | 'reviewer' | 'admin'
export type ProductStatus = 'rascunho' | 'revisao' | 'pendencia' | 'validado'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  must_change_password?: boolean
}

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
  resolved: boolean | null
  observation: string
}

export interface ProductData {
  processes: Process[]
  composition: CompositionItem[]
  checklist: string[]
  reviewPoints: ReviewPoint[]
}

export interface Product {
  id: string
  name: string
  description: string
  status: ProductStatus
  files: string[]
  owner: string
  data: ProductData
  created: string
  updated: string
  expand?: { owner?: User }
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
  created: string
  user_id: string
  action: string
  details: any
  expand?: { user_id?: User; product_id?: Product }
}
