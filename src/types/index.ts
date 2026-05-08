export interface Role {
  id: string
  name: string
  description: string
  active: boolean
  access_dashboard?: boolean
  access_catalog?: boolean
  access_learning?: boolean
  access_users?: boolean
}

export interface ProductStatusModel {
  id: string
  name: string
  color: string
  active: boolean
}

export interface User {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  must_change_password?: boolean
  access_start_time?: string
  access_end_time?: string
  access_days?: number[]
  expand?: { role?: Role }
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

export interface RevisionPointModel {
  id: string
  product_id: string
  user_id: string
  description: string
  resolved: boolean
  notes: string
  files?: string[]
  created: string
  updated: string
  expand?: { user_id?: User; product_id?: Product }
}

export interface RevisionNoteModel {
  id: string
  revision_point_id: string
  user_id: string
  content: string
  created: string
  updated: string
  expand?: { user_id?: User }
}

export interface ProductProcessModel {
  id: string
  product_id: string
  name: string
  description: string
  image?: string | string[]
  order: number
  color?: string
  created: string
  updated: string
}

export interface Product {
  id: string
  code: string
  name: string
  description: string
  status: string
  files: any[]
  engineering_files?: any[]
  composition_files?: any[]
  owner: string
  data: ProductData
  created: string
  updated: string
  expand?: { owner?: User; status?: ProductStatusModel }
}

export interface LearningRecord {
  id: string
  user_id: string
  title: string
  description: string
  evidence: string
  validated?: boolean
  created: string
  updated: string
  expand?: { user_id?: User }
}

export interface Log {
  id: string
  created: string
  product_id: string
  user_id: string
  action: string
  details: any
  expand?: { user_id?: User; product_id?: Product }
}
