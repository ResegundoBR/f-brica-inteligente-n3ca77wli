import React, { createContext, useContext, useState } from 'react'
import { User, Product, LearningRecord, Log, UserRole } from '@/types'

interface AppContextData {
  currentUser: User
  setCurrentUser: (user: User) => void
  users: User[]
  products: Product[]
  learningRecords: LearningRecord[]
  logs: Log[]
  updateProduct: (product: Product) => void
  addLog: (log: Omit<Log, 'id' | 'timestamp'>) => void
}

const mockUsers: User[] = [
  { id: '1', name: 'Admin Silva', email: 'admin@fabrica.com', role: 'Admin', active: true },
  {
    id: '2',
    name: 'João Registrador',
    email: 'joao@fabrica.com',
    role: 'Registrador',
    active: true,
  },
  { id: '3', name: 'Maria Revisora', email: 'maria@fabrica.com', role: 'Revisador', active: true },
]

const mockProducts: Product[] = [
  {
    id: 'P001',
    name: 'Válvula de Pressão X1',
    details: 'Válvula industrial alta pressão',
    status: 'Iniciado',
    lastUpdate: '2023-10-01',
    daysIdle: 6,
    processes: [],
    composition: [],
    checklist: ['Verificar vedação'],
    reviewPoints: [],
  },
  {
    id: 'P002',
    name: 'Eixo Motor B-22',
    details: 'Eixo de transmissão primária',
    status: 'Pendência',
    lastUpdate: '2023-10-05',
    daysIdle: 2,
    processes: [],
    composition: [],
    checklist: [],
    reviewPoints: [
      { id: 'r1', description: 'Cota de tolerância incorreta', resolved: null, observation: '' },
    ],
  },
  {
    id: 'P003',
    name: 'Painel de Controle Zeta',
    details: 'Gabinete elétrico principal',
    status: 'Validado',
    lastUpdate: '2023-10-10',
    daysIdle: 0,
    processes: [],
    composition: [],
    checklist: [],
    reviewPoints: [],
  },
]

const mockLearning: LearningRecord[] = [
  {
    id: 'L1',
    date: '2023-10-08',
    title: 'Solda TIG Avançada',
    description: 'Treinamento de solda em tubulações de aço inox.',
    validated: true,
    photos: ['https://img.usecurling.com/p/200/200?q=welding'],
  },
  {
    id: 'L2',
    date: '2023-10-10',
    title: 'Operação CNC',
    description: 'Programação básica de torno CNC.',
    validated: false,
    photos: ['https://img.usecurling.com/p/200/200?q=cnc%20machine'],
  },
]

const AppContext = createContext<AppContextData>({} as AppContextData)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User>(mockUsers[0])
  const [users] = useState<User[]>(mockUsers)
  const [products, setProducts] = useState<Product[]>(mockProducts)
  const [learningRecords] = useState<LearningRecord[]>(mockLearning)
  const [logs, setLogs] = useState<Log[]>([
    {
      id: '1',
      timestamp: '2023-10-10 08:00',
      user: 'Admin Silva',
      action: 'Login',
      target: 'Sistema',
    },
  ])

  const updateProduct = (updated: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  const addLog = (log: Omit<Log, 'id' | 'timestamp'>) => {
    setLogs((prev) => [
      { ...log, id: Date.now().toString(), timestamp: new Date().toISOString() },
      ...prev,
    ])
  }

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        users,
        products,
        learningRecords,
        logs,
        updateProduct,
        addLog,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
