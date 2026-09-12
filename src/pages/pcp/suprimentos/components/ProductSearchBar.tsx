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
      // Busca unificada com agregação de estoque no mestre (apenas ativos)
      searchUnifiedComponentsWithStock('', 200, { includeInactive: false }).catch(() => []),
      pb
        .collection('components')
        .getFullList<{ id: string; code?: string; description?: string }>({
          filter: 'active = false',
          fields: 'id,code,description',
        })
        .catch(() => []),
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
      .then(([unifiedComponents, inactiveComponents, inv, shorts]) => {
        if (cancelled) return
        const list: SearchProductItem[] = []
        const seen = new Set<string>()

        const inactiveKeySet = new Set<string>()
        inactiveComponents.forEach((ic) => {
          if (ic.code) inactiveKeySet.add(`code:${ic.code.trim().toLowerCase()}`)
          if (ic.description) inactiveKeySet.add(`desc:${ic.description.trim().toLowerCase()}`)
        })

        const isInactive = (code?: string, desc?: string) => {
          if (code && inactiveKeySet.has(`code:${code.trim().toLowerCase()}`)) return true
          if (desc && inactiveKeySet.has(`desc:${desc.trim().toLowerCase()}`)) return true
          return false
        }

        // 1. Prioridade máxima: Cadastro mestre unificado ativo (searchUnifiedComponentsWithStock)
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

        // 2. Itens do estoque legados não referenciados no mestre (excluindo inativos)
        for (const item of inv) {
          const c = (item.code || '').trim().toLowerCase()
          const d = (item.description || '').trim().toLowerCase()
          const key = c ? `c:${c}` : `d:${d}`
          if (!seen.has(key) && !isInactive(item.code, item.description)) {
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

        // 3. Itens de material shortages históricos (excluindo inativos)
        for (const s of shorts) {
          const c = (s.code || '').trim().toLowerCase()
          const d = (s.description || '').trim().toLowerCase()
          const key = c ? `c:${c}` : `d:${d}`
          if (!seen.has(key) && (s.description || s.code) && !isInactive(s.code, s.description)) {
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
        <div className="absolute right-0 top-full mt-1 z-50 w-full min-w-[340px] sm:min-w-[480px] md:min-w-[540px] max-w-[95vw] bg-white dark:bg-slate-900 rounded-md border shadow-xl max-h-80 overflow-y-auto overflow-x-hidden divide-y dark:divide-slate-800">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10 flex items-center justify-between border-b dark:border-slate-800">
            <span>Dossiê / Ficha do Produto ({filtered.length})</span>
            <span className="text-[10px] text-muted-foreground font-normal hidden sm:inline">
              Clique para abrir a ficha
            </span>
          </div>
          {filtered.map((item, idx) => {
            const hasStock =
              item.quantity !== undefined &&
              item.quantity !== null &&
              item.quantity > 0 &&
              !item.isCatalogOnly
            const stockQty = item.quantity ?? 0
            const unit = item.inventoryItem?.unit || 'un'
            return (
              <div
                key={idx}
                onClick={() => handleSelect(item)}
                title={item.description}
                className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors"
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className="font-medium text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug break-words text-xs sm:text-sm"
                    title={item.description}
                  >
                    {item.description}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {item.code ? `Cód: ${item.code}` : 'Sem código'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {hasStock ? (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {stockQty} {unit}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground font-normal whitespace-nowrap">
                      sem estoque
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[11px] text-blue-600 hover:text-blue-700 shrink-0"
                  >
                    <FileText className="size-3 mr-1" /> Ficha
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isOpen && searchTerm.trim() && filtered.length === 0 && (
        <div className="absolute right-0 top-full mt-1 z-50 w-full min-w-[320px] sm:min-w-[400px] max-w-[95vw] bg-white dark:bg-slate-900 rounded-md border shadow-lg p-3 text-center text-xs text-muted-foreground overflow-x-hidden">
          Nenhum produto correspondente a &ldquo;{searchTerm}&rdquo;.
        </div>
      )}
    </div>
  )
}
