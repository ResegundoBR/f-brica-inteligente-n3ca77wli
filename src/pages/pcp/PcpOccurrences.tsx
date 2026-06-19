import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'

export default function PcpOccurrences() {
  const [logs, setLogs] = useState<any[]>([])
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      let filter = `action = 'Parado'`
      if (startDate) {
        filter += ` && created >= '${startDate} 00:00:00'`
      }
      if (endDate) {
        filter += ` && created <= '${endDate} 23:59:59'`
      }
      const records = await pb.collection('pcp_order_logs').getFullList({
        filter,
        sort: '-created',
        expand: 'order_id,order_id.product_id,user_id',
      })
      setLogs(records)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Histórico de Gargalos</h1>
          <p className="text-muted-foreground">
            Relatório de ocorrências e motivos de parada das OPs.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtre as ocorrências por período.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <Button onClick={fetchLogs} disabled={loading}>
              {loading ? 'Buscando...' : 'Filtrar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ocorrências Registradas ({logs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>OP</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Detalhes Adicionais</TableHead>
                  <TableHead>Operador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  let motivo = 'Desconhecido'
                  let detalhes = log.details || ''

                  if (log.details?.includes('Motivo:')) {
                    const parts = log.details.split('|')
                    motivo = parts[0]?.replace('Motivo:', '')?.trim() || ''
                    detalhes =
                      parts.length > 1
                        ? parts.slice(1).join('|').replace('Detalhes:', '').trim()
                        : ''
                  } else {
                    motivo = log.expand?.order_id?.bottleneck_reason || log.action
                  }

                  const produto = log.expand?.order_id?.expand?.product_id?.name || 'Item Especial'

                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.created), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.expand?.order_id?.order_number}
                      </TableCell>
                      <TableCell>{produto}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.stage}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{motivo}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate" title={detalhes}>
                        {detalhes || '-'}
                      </TableCell>
                      <TableCell>{log.expand?.user_id?.name || 'Sistema'}</TableCell>
                    </TableRow>
                  )
                })}
                {logs.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      Nenhuma ocorrência encontrada para o período selecionado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
