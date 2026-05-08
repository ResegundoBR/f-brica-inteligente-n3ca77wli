import { useEffect, useState } from 'react'
import { Product, Log } from '@/types'
import pb from '@/lib/pocketbase/client'
import { format } from 'date-fns'
import { Clock, User } from 'lucide-react'

export function TabHistory({ product }: { product: Product }) {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!product.id || product.id === 'novo') {
      setLoading(false)
      return
    }

    const fetchLogs = async () => {
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

    fetchLogs()
  }, [product.id])

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Carregando histórico...</div>
  }

  if (logs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        Nenhum registro de histórico encontrado.
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h3 className="text-lg font-medium">Histórico de Atividades</h3>
        <p className="text-sm text-muted-foreground">
          Acompanhe todas as alterações e atualizações de status deste produto.
        </p>
      </div>

      <div className="relative border-l ml-3 pl-6 space-y-6">
        {logs.map((log) => {
          const actionLower = log.action.toLowerCase()
          const isValidated = actionLower.includes('validado')
          const dateFormatted = log.created
            ? format(new Date(log.created), 'dd/MM/yyyy HH:mm')
            : 'N/A'
          const userName = log.expand?.user_id?.name || 'Sistema'

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
                  {log.action}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {userName}
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
    </div>
  )
}
