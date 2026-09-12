import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, FileText } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import type { Inventory, MaterialShortage } from '@/types'
import { searchUnifiedComponentsWithStock } from '@/services/components'
import { cn } from '@/lib/utils'

export interface SearchProductItem {
  id?: string
  code: string
  description: string
  quantity?: number
  source?: string
  inventoryItem?: Inventory
  isCatalogOnly?: boolean
}

interface ProductSearchBarProps {
  onSelectProduct: (product: SearchProductItem) => void
  placeholder?: string
  className?: string
  inputClassName?: string
}

export function ProductSearchBar({
  onSelectProduct,
  placeholder = 'Pesquisar produto por código ou descrição...',
  className,
  inputClassName,
}: ProductSearchBarProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<SearchProductItem[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      // Busca unificada com agregação de estoque no mestre
      searchUnifiedComponentsWithStock('', 200).catch(() => []),
      pb
        .collection('inventory')
        .getFullList<Inventory>({ sort: 'description' })
        .catch(() => [] as Inventory[]),
      pb
        .collection('material_shortages')
        .getFullList<MaterialShortage>({
          fields: 'id,code,description',
        })
        .catch(() => [] as MaterialShortage[]),
    ])
      .then(([unifiedComponents, inv, shorts]) => {
        if (cancelled) return
        const list: SearchProductItem[] = []
        const seen = new Set<string>()

        // 1. Prioridade máxima: Cadastro mestre unificado (searchUnifiedComponentsWithStock)
        for (const comp of unifiedComponents) {
          const c = (comp.code || '').trim().toLowerCase()
          const d = (comp.description || '').trim().toLowerCase()
          const key = c ? `c:${c}` : `d:${d}`

          if (!seen.has(key)) {
            seen.add(key)
            const matchedInv = comp.inventory_id
              ? inv.find((i) => i.id === comp.inventory_id)
              : inv.find(
                  (i) =>
                    (comp.code && i.code && i.code.trim().toLowerCase() === c) ||
                    (comp.description && i.description && i.description.trim().toLowerCase() === d),
                )

            const hasStock = comp.has_stock && comp.stock_quantity !== undefined
            const isCatalogOnly = !hasStock

            list.push({
              id: comp.inventory_id || comp.id,
              code: comp.code || '',
              description: comp.description,
              quantity: comp.stock_quantity,
              source: isCatalogOnly ? 'Catálogo' : 'Estoque',
              inventoryItem: matchedInv,
              isCatalogOnly,
            })
          }
        }

        // 2. Itens do estoque legados não referenciados no mestre
        for (const item of inv) {
          const c = (item.code || '').trim().toLowerCase()
          const d = (item.description || '').trim().toLowerCase()
          const key = c ? `c:${c}` : `d:${d}`
          if (!seen.has(key)) {
            seen.add(key)
            const hasStock = item.quantity !== undefined && item.quantity !== null
            list.push({
              id: item.id,
              code: item.code || '',
              description: item.description || '',
              quantity: item.quantity,
              source: 'Estoque',
              inventoryItem: item,
              isCatalogOnly: !hasStock,
            })
          }
        }

        // 3. Itens de material shortages históricos
        for (const s of shorts) {
          const c = (s.code || '').trim().toLowerCase()
          const d = (s.description || '').trim().toLowerCase()
          const key = c ? `c:${c}` : `d:${d}`
          if (!seen.has(key) && (s.description || s.code)) {
            seen.add(key)
            list.push({
              id: s.id,
              code: s.code || '',
              description: s.description || '',
              source: 'Histórico',
              isCatalogOnly: true,
            })
          }
        }

        setItems(list)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = items
    .filter((item) => {
      if (!searchTerm.trim()) return false
      const term = searchTerm.toLowerCase().trim()
      const matchCode = item.code ? item.code.toLowerCase().includes(term) : false
      const matchDesc = item.description ? item.description.toLowerCase().includes(term) : false
      return matchCode || matchDesc
    })
    .slice(0, 10)

  const handleSelect = (item: SearchProductItem) => {
    onSelectProduct(item)
    setSearchTerm('')
    setIsOpen(false)
  }

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (searchTerm.trim()) setIsOpen(true)
          }}
          placeholder={placeholder}
          className={cn(
            'pl-8 pr-8 h-9 text-xs sm:text-sm bg-white dark:bg-slate-900',
            inputClassName,
          )}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('')
              setIsOpen(false)
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 rounded-md border shadow-lg max-h-64 overflow-y-auto divide-y dark:divide-slate-800">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-slate-50 dark:bg-slate-800/50">
            Dossiê / Ficha do Produto ({filtered.length})
          </div>
          {filtered.map((item, idx) => (
            <div
              key={idx}
              onClick={() => handleSelect(item)}
              className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs transition-colors"
            >
              <div className="flex flex-col pr-2">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {item.description}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {item.code ? `Código: ${item.code}` : 'Sem código cadastrado'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {item.source && (
                  <Badge
                    variant={item.source === 'Estoque' ? 'default' : 'outline'}
                    className={`text-[9px] px-1.5 py-0 ${
                      item.source === 'Estoque'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-transparent'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {item.source}
                  </Badge>
                )}
                {item.quantity !== undefined && item.quantity !== null && !item.isCatalogOnly ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
                  >
                    Saldo: {item.quantity}
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="text-[9px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 font-normal"
                  >
                    somente catálogo, sem estoque
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px] text-blue-600 hover:text-blue-700"
                >
                  <FileText className="size-3 mr-1" /> Ficha
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isOpen && searchTerm.trim() && filtered.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 rounded-md border shadow-lg p-3 text-center text-xs text-muted-foreground">
          Nenhum produto correspondente a &ldquo;{searchTerm}&rdquo;.
        </div>
      )}
    </div>
  )
}
