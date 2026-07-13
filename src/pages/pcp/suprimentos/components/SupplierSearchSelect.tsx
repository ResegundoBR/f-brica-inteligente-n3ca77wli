import { useState, useEffect } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, Plus, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSuppliers, Supplier } from '@/services/suppliers'

interface SupplierSearchSelectProps {
  value: string
  onChange: (value: string) => void
  onQuickAdd?: () => void
  refreshKey?: number
}

export function SupplierSearchSelect({
  value,
  onChange,
  onQuickAdd,
  refreshKey = 0,
}: SupplierSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  useEffect(() => {
    getSuppliers()
      .then(setSuppliers)
      .catch(() => {})
  }, [refreshKey])

  return (
    <div className="flex gap-2 items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn('flex-1 justify-between font-normal', !value && 'text-muted-foreground')}
          >
            {value || 'Selecione...'}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar fornecedor..." />
            <CommandList>
              <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
              <CommandGroup>
                {suppliers.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.name}
                    onSelect={() => {
                      onChange(s.name)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn('mr-2 size-4', value === s.name ? 'opacity-100' : 'opacity-0')}
                    />
                    {s.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {onQuickAdd && (
        <Button type="button" variant="outline" size="icon" onClick={onQuickAdd}>
          <Plus className="size-4" />
        </Button>
      )}
    </div>
  )
}
