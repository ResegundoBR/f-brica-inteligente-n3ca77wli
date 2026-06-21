import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { Client } from '@/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface PcpFiltersProps {
  opType: string
  setOpType: (v: string) => void
  client: string
  setClient: (v: string) => void
  deadline: string
  setDeadline: (v: string) => void
}

export function PcpFilters({
  opType,
  setOpType,
  client,
  setClient,
  deadline,
  setDeadline,
}: PcpFiltersProps) {
  const [clients, setClients] = useState<Client[]>([])

  useEffect(() => {
    pb.collection('clients').getFullList({ sort: 'name' }).then(setClients).catch(console.error)
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={opType} onValueChange={setOpType}>
        <SelectTrigger className="w-[160px] bg-background">
          <SelectValue placeholder="Tipo de OP" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os Tipos</SelectItem>
          <SelectItem value="Linha">Linha</SelectItem>
          <SelectItem value="Especial">Especial</SelectItem>
          <SelectItem value="Assistência">Assistência</SelectItem>
        </SelectContent>
      </Select>

      <Select value={client} onValueChange={setClient}>
        <SelectTrigger className="w-[200px] bg-background">
          <SelectValue placeholder="Cliente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os Clientes</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={deadline} onValueChange={setDeadline}>
        <SelectTrigger className="w-[180px] bg-background">
          <SelectValue placeholder="Prazo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Qualquer Prazo</SelectItem>
          <SelectItem value="hoje">Hoje</SelectItem>
          <SelectItem value="amanha">Amanhã</SelectItem>
          <SelectItem value="prox-3d">Próx. 3 dias</SelectItem>
          <SelectItem value="esta-semana">Esta Semana</SelectItem>
          <SelectItem value="prox-semana">Próxima Semana</SelectItem>
          <SelectItem value="prox-15d">Próximos 15 dias</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
