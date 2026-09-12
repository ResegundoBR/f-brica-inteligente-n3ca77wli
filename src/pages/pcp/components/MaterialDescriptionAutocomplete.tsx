import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { Input } from '@/components/ui/input'
import type { Product, MaterialShortage, MasterComponent } from '@/types'

interface Suggestion {
  code: string
  desc: string
  source?: string
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
    pb
      .collection('components')
      .getFullList<MasterComponent>({
        sort: 'description',
      })
      .catch(() => [] as MasterComponent[]),
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
    .then(([components, prods, shorts]) => {
      const all: Suggestion[] = []

      // 1. Mestre de componentes (prioridade primária unificada)
      components.forEach((comp) => {
        if (comp.description) {
          all.push({
            code: comp.code || '',
            desc: comp.description,
            source:
              comp.source === 'catalog'
                ? 'Catálogo'
                : comp.source === 'inventory'
                  ? 'Estoque'
                  : 'Mestre',
          })
        }
      })

      // 2. Composição de produtos (compatibilidade aditiva)
      prods.forEach((p) => {
        if (p.data?.composition) {
          p.data.composition.forEach((c: any) => {
            if (c.description) {
              all.push({ code: c.code || '', desc: c.description, source: 'Catálogo' })
            }
          })
        }
      })

      // 3. Faltas anteriores
      shorts.forEach((s) => {
        if (s.description) {
          all.push({ code: s.code || '', desc: s.description, source: 'Histórico' })
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
        <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.slice(0, 30).map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
              onMouseDown={(e) => {
                e.preventDefault()
                onCodeChange(s.code)
                onChange(s.desc)
                setFocused(false)
              }}
            >
              {s.code && (
                <span className="text-muted-foreground font-mono text-xs shrink-0 bg-muted px-1.5 py-0.5 rounded">
                  {s.code}
                </span>
              )}
              <span className="flex-1 truncate">{s.desc}</span>
              {s.source && (
                <span className="text-[10px] text-muted-foreground shrink-0 uppercase tracking-wider font-semibold border border-border px-1 rounded">
                  {s.source}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
