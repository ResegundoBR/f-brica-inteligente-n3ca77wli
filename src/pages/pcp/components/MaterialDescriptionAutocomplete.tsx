import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { Input } from '@/components/ui/input'
import type { Product, MaterialShortage } from '@/types'
import { getMasterComponents } from '@/services/components'

interface Suggestion {
  code: string
  desc: string
  source?: 'Estoque' | 'Catálogo' | 'Histórico' | string
  stock_quantity?: number
  has_stock?: boolean
  unit?: string
}

interface MaterialDescriptionAutocompleteProps {
  productId?: string
  value: string
  onChange: (value: string) => void
  onCodeChange: (code: string) => void
  placeholder?: string
  id?: string
  inputClassName?: string
}

let suggestionsCache: Suggestion[] | null = null
let suggestionsPromise: Promise<Suggestion[]> | null = null

function fetchAllSuggestions(): Promise<Suggestion[]> {
  if (suggestionsCache) return Promise.resolve(suggestionsCache)
  if (suggestionsPromise) return suggestionsPromise
  suggestionsPromise = Promise.all([
    getMasterComponents().catch(() => []),
    pb
      .collection('inventory')
      .getFullList<{
        id: string
        code?: string
        description?: string
        quantity?: number
        unit?: string
        component_id?: string
      }>()
      .catch(() => []),
    pb
      .collection('products')
      .getFullList<Product>()
      .catch(() => [] as Product[]),
    pb
      .collection('material_shortages')
      .getFullList<MaterialShortage>({
        fields: 'code,description',
      })
      .catch(() => [] as MaterialShortage[]),
  ])
    .then(([components, inventoryItems, prods, shorts]) => {
      const all: Suggestion[] = []

      // Lookup do inventário para saber saldo/unidade em tempo hábil
      const invByCompId = new Map<
        string,
        { quantity?: number; unit?: string; code?: string; description?: string }
      >()
      const invByCode = new Map<
        string,
        { quantity?: number; unit?: string; code?: string; description?: string }
      >()
      const invByDesc = new Map<
        string,
        { quantity?: number; unit?: string; code?: string; description?: string }
      >()

      inventoryItems.forEach((inv) => {
        if (inv.component_id) invByCompId.set(inv.component_id, inv)
        if (inv.code) invByCode.set(inv.code.toLowerCase().trim(), inv)
        if (inv.description) invByDesc.set(inv.description.toLowerCase().trim(), inv)
      })

      // 1. Mestre de componentes (prioridade primária unificada)
      components.forEach((comp) => {
        if (comp.description) {
          const invMatch =
            invByCompId.get(comp.id) ||
            (comp.code ? invByCode.get(comp.code.toLowerCase().trim()) : undefined) ||
            invByDesc.get(comp.description.toLowerCase().trim())

          const hasStock =
            !!invMatch &&
            invMatch.quantity !== undefined &&
            invMatch.quantity !== null &&
            invMatch.quantity > 0
          all.push({
            code: comp.code || invMatch?.code || '',
            desc: comp.description,
            stock_quantity: invMatch?.quantity,
            has_stock: hasStock,
            unit: comp.unit || invMatch?.unit || 'un',
          })
        }
      })

      // 2. Inventário restante (caso haja itens não cadastrados em components)
      inventoryItems.forEach((inv) => {
        if (inv.description) {
          const hasStock = inv.quantity !== undefined && inv.quantity !== null && inv.quantity > 0
          all.push({
            code: inv.code || '',
            desc: inv.description,
            stock_quantity: inv.quantity,
            has_stock: hasStock,
            unit: inv.unit || 'un',
          })
        }
      })

      // 3. Composição de produtos (compatibilidade aditiva)
      prods.forEach((p) => {
        if (p.data?.composition) {
          p.data.composition.forEach((c: any) => {
            if (c.description) {
              const invMatch =
                (c.code ? invByCode.get(c.code.toLowerCase().trim()) : undefined) ||
                invByDesc.get(c.description.toLowerCase().trim())
              const hasStock =
                !!invMatch &&
                invMatch.quantity !== undefined &&
                invMatch.quantity !== null &&
                invMatch.quantity > 0
              all.push({
                code: c.code || invMatch?.code || '',
                desc: c.description,
                stock_quantity: invMatch?.quantity,
                has_stock: hasStock,
                unit: invMatch?.unit || 'un',
              })
            }
          })
        }
      })

      // 4. Faltas anteriores
      shorts.forEach((s) => {
        if (s.description) {
          const invMatch =
            (s.code ? invByCode.get(s.code.toLowerCase().trim()) : undefined) ||
            invByDesc.get(s.description.toLowerCase().trim())
          const hasStock =
            !!invMatch &&
            invMatch.quantity !== undefined &&
            invMatch.quantity !== null &&
            invMatch.quantity > 0
          all.push({
            code: s.code || invMatch?.code || '',
            desc: s.description,
            stock_quantity: invMatch?.quantity,
            has_stock: hasStock,
            unit: invMatch?.unit || 'un',
          })
        }
      })

      const seen = new Set<string>()
      const unique = all.filter((c) => {
        const key = `${(c.code || '').toLowerCase()}|${c.desc.toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      suggestionsCache = unique
      return unique
    })
    .catch(() => {
      suggestionsPromise = null
      return [] as Suggestion[]
    })
  return suggestionsPromise
}

const productCompositionCache = new Map<string, Suggestion[]>()

function fetchProductComposition(productId: string): Promise<Suggestion[]> {
  if (productCompositionCache.has(productId)) {
    return Promise.resolve(productCompositionCache.get(productId)!)
  }
  return pb
    .collection('products')
    .getOne<Product>(productId)
    .then((p) => {
      const comp = ((p.data?.composition as any[]) || [])
        .map((c) => ({ code: c.code || '', desc: c.description || '' }))
        .filter((c) => c.desc)
      productCompositionCache.set(productId, comp)
      return comp
    })
    .catch(() => [] as Suggestion[])
}

export function MaterialDescriptionAutocomplete({
  productId,
  value,
  onChange,
  onCodeChange,
  placeholder = 'Descrição do material',
  id,
  inputClassName,
}: MaterialDescriptionAutocompleteProps) {
  const [focused, setFocused] = useState(false)
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([])
  const [opComponents, setOpComponents] = useState<Suggestion[]>([])

  useEffect(() => {
    fetchAllSuggestions().then(setAllSuggestions)
  }, [])

  useEffect(() => {
    if (!productId) {
      setOpComponents([])
      return
    }
    fetchProductComposition(productId).then(setOpComponents)
  }, [productId])

  const combined = useMemo(() => {
    const opDescSet = new Set(opComponents.map((c) => c.desc))
    const remaining = allSuggestions.filter((s) => !opDescSet.has(s.desc))
    return [...opComponents, ...remaining]
  }, [opComponents, allSuggestions])

  const filtered = useMemo(() => {
    if (!value.trim()) return combined
    const lower = value.toLowerCase()
    return combined.filter(
      (s) =>
        s.desc.toLowerCase().includes(lower) || (s.code && s.code.toLowerCase().includes(lower)),
    )
  }, [value, combined])

  const showDropdown = focused && filtered.length > 0

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 min-w-[340px] sm:min-w-[480px] max-w-[95vw] max-h-64 overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-xl divide-y divide-border/60">
          {filtered.slice(0, 30).map((s, i) => {
            const hasStock =
              s.has_stock ||
              (s.stock_quantity !== undefined && s.stock_quantity !== null && s.stock_quantity > 0)
            const stockQty = s.stock_quantity ?? 0
            const stockUnit = s.unit || 'un'
            return (
              <button
                key={i}
                type="button"
                title={s.desc}
                className="w-full text-left px-3 py-2 text-xs sm:text-sm hover:bg-accent/80 transition-colors flex items-center justify-between gap-3"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onCodeChange(s.code)
                  onChange(s.desc)
                  setFocused(false)
                }}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className="font-medium text-foreground line-clamp-2 leading-snug break-words"
                    title={s.desc}
                  >
                    {s.desc}
                  </span>
                  {s.code && (
                    <span className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      Cód: {s.code}
                    </span>
                  )}
                </div>

                <div className="shrink-0 flex items-center">
                  {hasStock ? (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {stockQty} {stockUnit}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground font-normal whitespace-nowrap">
                      sem estoque
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}{' '}
    </div>
  )
}
