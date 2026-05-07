import { useState } from 'react'
import { Product, Process } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const defaultProcessTypes = [
  'Corte',
  'Desbaste',
  'Dobra',
  'Calandra',
  'Solda',
  'Acabamento Solda',
  'Furo',
  'Rosca',
]

export function TabProcesses({
  product,
  setProduct,
}: {
  product: Product
  setProduct: (p: Product) => void
}) {
  const [showOtherInput, setShowOtherInput] = useState(false)
  const [newProcessName, setNewProcessName] = useState('')

  const toggleProcess = (name: string) => {
    const exists = (product.processes || []).find((p) => p.name === name)
    if (exists) {
      setProduct({
        ...product,
        processes: (product.processes || []).filter((p) => p.name !== name),
      })
    } else {
      setProduct({
        ...product,
        processes: [...(product.processes || []), { id: Date.now().toString(), name, details: '' }],
      })
    }
  }

  const addOtherProcess = () => {
    if (!newProcessName.trim()) return
    toggleProcess(newProcessName)
    setNewProcessName('')
    setShowOtherInput(false)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <Label>Seleção de Processos de Fabricação</Label>
        <div className="flex flex-wrap gap-2">
          {defaultProcessTypes.map((pt) => {
            const isSelected = product.processes?.some((p) => p.name === pt)
            return (
              <Button
                key={pt}
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => toggleProcess(pt)}
              >
                {pt}
              </Button>
            )
          })}
          <Button variant="outline" onClick={() => setShowOtherInput(!showOtherInput)}>
            Outros...
          </Button>
        </div>
        {showOtherInput && (
          <div className="flex gap-2 max-w-sm mt-2 animate-fade-in-down">
            <Input
              placeholder="Nome do novo processo..."
              value={newProcessName}
              onChange={(e) => setNewProcessName(e.target.value)}
            />
            <Button onClick={addOtherProcess}>Adicionar</Button>
          </div>
        )}
      </div>

      {(product.processes?.length ?? 0) > 0 && (
        <div className="space-y-4 pt-4 border-t">
          <Label className="text-base">Detalhamento dos Processos</Label>
          <div className="grid gap-4">
            {product.processes?.map((proc, idx) => (
              <div
                key={proc.id}
                className="p-4 border rounded-md bg-slate-50/50 dark:bg-muted/10 relative"
              >
                <div className="absolute -left-3 top-4 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </div>
                <Label className="mb-2 block">{proc.name}</Label>
                <Textarea
                  placeholder={`Descreva os detalhes para o processo de ${proc.name}...`}
                  value={proc.details}
                  onChange={(e) => {
                    const newProcs = [...(product.processes || [])]
                    if (newProcs[idx]) {
                      newProcs[idx].details = e.target.value
                      setProduct({ ...product, processes: newProcs })
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
