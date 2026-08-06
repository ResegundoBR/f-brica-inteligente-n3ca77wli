import { useState, useEffect } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MaterialShortage } from '@/types'
import { format, parseISO, isValid } from 'date-fns'
import { Edit3 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { toast } from 'sonner'

interface ComprasTableProps {
  items: MaterialShortage[]
  onEditSupplier: (item: MaterialShortage) => void
}

export function ComprasTable({ items, onEditSupplier }: ComprasTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingQty, setEditingQty] = useState<string | null>(null)
  const [qtyValue, setQtyValue] = useState('')

  useEffect(() => {
    setSelectedIds(new Set())
  }, [items])

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map((i) => i.id)))
  }

  const handleSaveQty = async (id: string) => {
    try {
      await pb.collection('material_shortages').update(id, { quantity: Number(qtyValue) })
      toast.success('Quantidade atualizada')
    } catch {
      toast.error('Erro ao atualizar quantidade')
    }
    setEditingQty(null)
  }

  const isOverdue = (date?: string) => {
    if (!date) return false
    const d = parseISO(date)
    return isValid(d) && d < new Date(new Date().toDateString())
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={selectedIds.size === items.length && items.length > 0}
                onCheckedChange={toggleAll}
              />
            </TableHead>
            <TableHead className="w-[70px]">Data</TableHead>
            <TableHead className="w-[70px]">Código</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right w-[70px]">Qtde</TableHead>
            <TableHead className="text-right w-[70px]">Recebido</TableHead>
            <TableHead className="w-[130px]">Fornecedor</TableHead>
            <TableHead className="text-right w-[90px]">Preço</TableHead>
            <TableHead className="w-[90px]">Previsão</TableHead>
            <TableHead className="w-[60px]">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.id}
              className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => toggle(item.id)}
                />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {format(parseISO(item.created), 'dd/MM/yy')}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{item.code || '-'}</TableCell>
              <TableCell className="font-medium text-sm">{item.description}</TableCell>
              <TableCell className="text-right text-sm">
                {editingQty === item.id ? (
                  <Input
                    type="number"
                    value={qtyValue}
                    onChange={(e) => setQtyValue(e.target.value)}
                    onBlur={() => handleSaveQty(item.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveQty(item.id)}
                    className="h-7 w-16 text-xs"
                    autoFocus
                  />
                ) : (
                  <span
                    className="cursor-pointer hover:text-blue-600"
                    onClick={() => {
                      setEditingQty(item.id)
                      setQtyValue(String(item.quantity))
                    }}
                  >
                    {item.quantity}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                {item.received_quantity || 0}
              </TableCell>
              <TableCell className="text-sm">
                <button
                  className="text-left hover:underline text-blue-600 truncate max-w-[120px] block"
                  onClick={() => onEditSupplier(item)}
                >
                  {item.supplier || '— Definir —'}
                </button>
              </TableCell>
              <TableCell className="text-right text-sm">
                {item.unit_price
                  ? `R$ ${Number(item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : '-'}
              </TableCell>
              <TableCell
                className={`text-xs ${isOverdue(item.expected_date) ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}
              >
                {item.expected_date ? format(parseISO(item.expected_date), 'dd/MM/yy') : '-'}
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => onEditSupplier(item)}
                >
                  <Edit3 className="size-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
