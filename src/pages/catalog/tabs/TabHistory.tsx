import { useEffect, useState } from 'react'
import { Product, Log } from '@/types'
import pb from '@/lib/pocketbase/client'
import { format } from 'date-fns'
import { Clock, User, Search } from 'lucide-react'
import { useRealtime } from '@/hooks/use-realtime'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const HighlightText = ({ text, term }: { text: string; term: string }) => {
  if (!term || !text) return <>{text}</>
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export function TabHistory({ product }: { product: Product }) {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [userFilter, setUserFilter] = useState('all')

  const fetchLogs = async () => {
    if (!product.id || product.id === 'novo') {
      setLoading(false)
      return
    }

    try {
      const result = await pb.collection('activity_logs').getFullList<Log>({
        filter: `product_id = '${product.id}'`,
        sort: '-created',
        expand: 'user_id',
      })
      setLogs(result)
    } catch (err) {
      console.error('Failed to fetch history', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [product.id])

  useRealtime('activity_logs', (e) => {
    if (e.record.product_id === product.id) {
      fetchLogs()
    }
  })

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Carregando histórico...</div>
  }

  const allUsers = Array.from(
    new Map(
      logs.filter((l) => l.expand?.user_id).map((l) => [l.expand!.user_id!.id, l.expand!.user_id!]),
    ).values(),
  )

  const filteredLogs = logs.filter((log) => {
    const matchesUser = userFilter === 'all' || log.user_id === userFilter
    if (!matchesUser) return false

    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      log.action.toLowerCase().includes(term) ||
      (log.expand?.user_id?.name || log.expand?.user_id?.email || 'Sistema')
        .toLowerCase()
        .includes(term)
    )
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">Histórico de Atividades</h3>
          <p className="text-sm text-muted-foreground">
            Acompanhe todas as alterações e atualizações de status deste produto.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
          {allUsers.length > 0 && (
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os usuários</SelectItem>
                {allUsers.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar no histórico..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/20">
          Nenhum registro de histórico encontrado.
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/20">
          Nenhum registro encontrado para a busca "{searchTerm}".
        </div>
      ) : (
        <div className="relative border-l ml-3 pl-6 space-y-6 mt-6">
          {filteredLogs.map((log) => {
            const actionLower = log.action.toLowerCase()
            const isValidated = actionLower.includes('validado')
            const dateFormatted = log.created
              ? format(new Date(log.created), 'dd/MM/yyyy HH:mm')
              : 'N/A'
            const userName = log.expand?.user_id?.name || log.expand?.user_id?.email || 'Sistema'

            return (
              <div key={log.id} className="relative">
                <div
                  className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-background ${
                    isValidated ? 'bg-green-500' : 'bg-primary'
                  }`}
                />
                <div className="flex flex-col gap-1">
                  <p
                    className={`text-sm font-medium ${isValidated ? 'text-green-600 dark:text-green-500' : ''}`}
                  >
                    <HighlightText text={log.action} term={searchTerm} />
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />{' '}
                      <HighlightText text={userName} term={searchTerm} />
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {dateFormatted}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
