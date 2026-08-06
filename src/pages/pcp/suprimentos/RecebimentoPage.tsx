import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MaterialShortage } from '@/types'
import { PackageCheck, CheckCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { SuprimentosHeader } from './components/SuprimentosHeader'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function RecebimentoPage() {
  const [shortages, setShortages] = useState<MaterialShortage[]>([])
  const [receiveInputs, setReceiveInputs] = useState<Record<string, string>>({})
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const { toast } = useToast()

  const fetchShortages = async () => {
    try {
      const res = await pb.collection('material_shortages').getFullList<MaterialShortage>({
        filter: 'status = "Compra" || status = "Recebido_Parcial"',
        sort: '-created',
        expand: 'order_id,requested_by',
      })
      const activePending = res.filter((item) => {
        const total = Number(item.quantity) || 0
        const received = Number(item.received_quantity) || 0
        return total === 0 || received < total
      })
      setShortages(activePending)
    } catch {
      /* ignored */
    }
  }

  useEffect(() => {
    fetchShortages()
  }, [])

  useRealtime('material_shortages', fetchShortages)

  const handleReceive = async (item: MaterialShortage) => {
    const inputVal = receiveInputs[item.id]
    if (!inputVal) {
      toast({
        title: 'Erro',
        description: 'Informe a quantidade recebida.',
        variant: 'destructive',
      })
      return
    }
    const numQty = Number(inputVal)
    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast({ title: 'Erro', description: 'Quantidade inválida.', variant: 'destructive' })
      return
    }

    const currentReceived = Number(item.received_quantity) || 0
    const total = Number(item.quantity) || 0
    const newReceivedQty = currentReceived + numQty

    if (total > 0 && newReceivedQty > total) {
      toast({
        title: 'Erro',
        description: `A quantidade recebida (${newReceivedQty}) excede o total solicitado (${total}).`,
        variant: 'destructive',
      })
      return
    }

    const newStatus = total > 0 && newReceivedQty >= total ? 'Recebido' : 'Recebido_Parcial'
    const enteredCode = (codeInputs[item.id] ?? item.code ?? '').trim()
    const resolvedCode = enteredCode || `REF-${item.id.slice(-6).toUpperCase()}`

    setLoading((prev) => ({ ...prev, [item.id]: true }))
    try {
      await pb.collection('material_shortages').update(item.id, {
        received_quantity: newReceivedQty,
        status: newStatus,
        code: resolvedCode,
      })

      toast({
        title: 'Recebimento confirmado',
        description: `${numQty} unidade(s) recebidas. Total: ${newReceivedQty}/${total}.`,
      })

      setReceiveInputs((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      setCodeInputs((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      fetchShortages()
    } catch (err: unknown) {
      toast({ title: 'Erro', description: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  const summary = {
    total: shortages.length,
    partial: shortages.filter((s) => s.status === 'Recebido_Parcial').length,
    purchase: shortages.filter((s) => s.status === 'Compra').length,
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-slate-50 min-h-[calc(100vh-4rem)] dark:bg-slate-950">
      <SuprimentosHeader
        title="Recebimento"
        description="Confira o recebimento físico de materiais e atualize o estoque automaticamente."
        icon={PackageCheck}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Aguardando Recebimento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Em Compra</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{summary.purchase}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recebimento Parcial</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{summary.partial}</p>
          </CardContent>
        </Card>
      </div>

      {shortages.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
          Nenhum item aguardando recebimento no momento.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
              <TableRow>
                <TableHead className="w-[120px]">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right w-[80px]">Qtde Total</TableHead>
                <TableHead className="text-right w-[110px]">Recebido</TableHead>
                <TableHead className="w-[140px]">Fornecedor</TableHead>
                <TableHead className="w-[110px]">Previsão</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[190px]">Receber</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shortages.map((item) => {
                const received = Number(item.received_quantity) || 0
                const total = Number(item.quantity) || 0
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.code ? (
                        <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">
                          {item.code}
                        </span>
                      ) : (
                        <Input
                          placeholder="Cod. opcional"
                          className="h-7 w-24 text-xs"
                          value={codeInputs[item.id] ?? ''}
                          onChange={(e) =>
                            setCodeInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{item.description}</TableCell>
                    <TableCell className="text-right font-semibold">{total}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'font-bold',
                          received > 0 && received < total && 'text-amber-600',
                        )}
                      >
                        {received}
                      </span>
                      <span className="text-xs text-muted-foreground"> / {total}</span>
                    </TableCell>
                    <TableCell className="text-xs">{item.supplier || '-'}</TableCell>
                    <TableCell className="text-xs">
                      {item.expected_date
                        ? format(parseISO(item.expected_date), 'dd/MM/yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'whitespace-nowrap',
                          item.status === 'Recebido_Parcial' &&
                            'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
                          item.status === 'Compra' &&
                            'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
                        )}
                      >
                        {item.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Qtde"
                          className="h-8 w-20 text-sm"
                          value={receiveInputs[item.id] || ''}
                          onChange={(e) =>
                            setReceiveInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          className="h-8 bg-green-600 hover:bg-green-700 text-white"
                          disabled={loading[item.id]}
                          onClick={() => handleReceive(item)}
                        >
                          <CheckCircle className="size-3.5 mr-1" />
                          Confirmar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
