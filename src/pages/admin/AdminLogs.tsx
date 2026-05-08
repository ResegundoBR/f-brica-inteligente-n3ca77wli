import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import pb from '@/lib/pocketbase/client'
import { Log } from '@/types'

export default function AdminLogs() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLogs() {
      try {
        const records = await pb.collection('activity_logs').getFullList<Log>({
          sort: '-created',
          expand: 'user_id,product_id',
        })
        setLogs(records)
      } catch (error) {
        console.error('Error fetching logs', error)
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
  }, [])

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold">Log de Atividades</h1>
        <p className="text-muted-foreground">Trilha de auditoria e ações do sistema.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atividades Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Alvo/Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!logs || !Array.isArray(logs) || logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      Nenhum log encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log?.id || Math.random()}>
                      <TableCell className="font-mono text-xs">
                        {log?.created ? new Date(log.created).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell>
                        {log?.expand?.user_id?.name || log?.user_id || 'Sistema'}
                      </TableCell>
                      <TableCell className="font-medium">{log?.action || '-'}</TableCell>
                      <TableCell>
                        {log?.expand?.product_id?.name ||
                          log?.details?.target_user_name ||
                          log?.details?.target_user_email ||
                          log?.product_id ||
                          'N/A'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
