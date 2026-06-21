export interface Role {
  id: string
  name: string
  description: string
  active: boolean
  access_dashboard?: boolean
  access_catalog?: boolean
  access_learning?: boolean
  access_users?: boolean
  access_pcp?: boolean
  access_operator?: boolean
  access_commercial?: boolean
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

export interface CompositionCategory {
  id: string
  name: string
  created: string
  updated: string
}

export interface Process {
  id: string
  name: string
  details: string
}

export interface CompositionItem {
  id: string
  index?: string
  code: string
  description: string
  quantity: number | string
  measurements: string
  etapa?: string
  category_id?: string
  buy_or_make?: 'buy' | 'make'
  supplier_id?: string
  unit_cost?: number
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

export interface RevisionHistoryModel {
  id: string
  revision_point_id: string
  user_id: string
  action: string
  created: string
  updated: string
  expand?: { user_id?: User }
}

export interface PcpOrder {
  id: string
  order_number: string
  op_number?: string
  client_name: string
  product_id?: string
  status: string
  stage: string
  annex?: string
  bottleneck_reason?: string
  delivery_date: string
  started_at?: string
  finished_at?: string
  operator_id?: string
  client_id: string
  quantity: number | string
  bottleneck_details?: string
  op_type: string
  manual_product_name?: string
  observations?: string
  observation_sector?: string
  outsourcing_data?: OutsourcingData[]
  created: string
  updated: string
  expand?: any
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
  category?: string
  files: any[]
  engineering_files?: any[]
  composition_files?: any[]
  owner: string
  data: ProductData
  created: string
  updated: string
  expand?: { owner?: User; status?: ProductStatusModel; category?: CompositionCategory }
}

export interface LearningStepComment {
  id: string
  step_id: string
  user_id: string
  content: string
  created: string
  updated: string
  expand?: {
    user_id?: User
  }
}

export interface LearningStep {
  id: string
  learning_id: string
  description: string
  image?: string
  order: number
  created: string
  updated: string
  expand?: {
    learning_step_comments_via_step_id?: LearningStepComment[]
  }
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
  expand?: {
    user_id?: User
    learning_steps_via_learning_id?: LearningStep[]
  }
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

export interface Client {
  id: string
  name: string
  created: string
  updated: string
}

export interface OutsourcingData {
  supplier: string
  service: string
  expected_date: string
}

export interface PcpOrder {
  id: string
  order_number: string
  client_name: string
  client_id?: string
  quantity: number
  product_id?: string
  is_special: boolean
  status: 'Fila' | 'Em Andamento' | 'Parado' | 'Concluído'
  stage:
    | 'Separação'
    | 'Cotação'
    | 'Compra'
    | 'Retirada'
    | 'Aguardando'
    | 'Corte'
    | 'Dobra'
    | 'Calandra'
    | 'Solda'
    | 'Acab. Solda'
    | 'Furação'
    | 'Rosca'
    | 'Concreto'
    | 'Terceirização'
    | 'Preparação'
    | 'Pintura'
    | 'Verniz'
    | 'Retoques'
    | 'Montagem'
    | 'Qualidade'
    | 'Embalagem'
    | 'Suprimentos'
    | 'Fabricação'
    | 'Acabamento'
    | 'Expedição'
  annex?: string
  outsourcing_data?: OutsourcingData[]
  bottleneck_reason: 'Nenhum' | 'Falta de Material' | 'Dúvida Técnica' | 'Sobrecarga'
  bottleneck_details?: string
  observations?: string
  observation_sector?: 'Fabricação' | 'Acabamento' | 'Montagem' | 'Projetos' | ''
  delivery_date: string
  started_at?: string
  finished_at?: string
  operator_id?: string
  created: string
  updated: string
  expand?: {
    product_id?: Product
    operator_id?: User
    client_id?: Client
  }
}

export interface PcpOrderObservation {
  id: string
  order_id: string
  sector: 'Fabricação' | 'Acabamento' | 'Montagem' | 'Projetos'
  content: string
  created: string
  updated: string
  expand?: {
    order_id?: PcpOrder
  }
}

export interface MaterialShortage {
  id: string
  order_id?: string
  description: string
  code: string
  quantity: number
  sector: string
  status: 'Pendente' | 'Liberado_Estoque' | 'Cotação' | 'Compra' | 'Recebido' | 'Cancelado'
  supplier?: string
  expected_date?: string
  observation?: string
  priority?: 'Sem pressa' | 'Próximos dias' | 'Urgente'
  request_type?: 'Ferramentas' | 'Materiais' | 'Produtos' | 'Insumos'
  created: string
  updated: string
  expand?: {
    order_id?: PcpOrder
  }
}
