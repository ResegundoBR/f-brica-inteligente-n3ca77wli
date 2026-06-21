import { useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function OutsourcingPanel({ op }: { op: any }) {
  const [supplier, setSupplier] = useState('')
  const [service, setService] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [loading, setLoading] = useState(false)

  const isTerceirizacao = op?.stage === 'Terceirização'
  const outsourcingData = Array.isArray(op?.outsourcing_data) ? op.outsourcing_data : []
  const hasOutsourcing = outsourcingData.length > 0

  if (!op || (!isTerceirizacao && !hasOutsourcing)) return null

  const handleAdd = async () => {
    if (!supplier || !service || !expectedDate) return
    setLoading(true)
    try {
      const newData = [...outsourcingData, { supplier, service, expected_date: expectedDate }]
      await pb.collection('pcp_orders').update(op.id, { outsourcing_data: newData })
      setSupplier('')
      setService('')
      setExpectedDate('')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (idx: number) => {
    setLoading(true)
    try {
      const newData = outsourcingData.filter((_, i) => i !== idx)
      await pb.collection('pcp_orders').update(op.id, { outsourcing_data: newData })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="col-span-2 mt-4 space-y-4 p-4 bg-slate-50 dark:bg-slate-900 border rounded-md">
      <h4 className="font-semibold text-sm">Serviços Terceirizados</h4>
      <div className="space-y-2">
        {outsourcingData.map((item: any, idx: number) => (
          <div
            key={idx}
            className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 border rounded text-sm"
          >
            <div>
              <p className="font-medium">
                {item.service}{' '}
                <span className="font-normal text-muted-foreground">- {item.supplier}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Previsão: {format(parseISO(item.expected_date), 'dd/MM/yyyy')}
              </p>
            </div>
            {isTerceirizacao && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(idx)}
                disabled={loading}
                className="text-red-500 hover:text-red-700"
              >
                Remover
              </Button>
            )}
          </div>
        ))}
        {outsourcingData.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum serviço terceirizado registrado.</p>
        )}
      </div>
      {isTerceirizacao && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 pt-4 border-t">
          <div>
            <Label className="text-xs">Fornecedor</Label>
            <Input
              className="h-8 text-xs"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Serviço</Label>
            <Input
              className="h-8 text-xs"
              value={service}
              onChange={(e) => setService(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Previsão</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={loading || !supplier || !service || !expectedDate}
            >
              Adicionar Serviço
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
