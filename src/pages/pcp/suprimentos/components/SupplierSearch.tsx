import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { searchSuppliers } from '@/services/suppliers'
import type { Supplier } from '@/types'

interface SupplierSearchProps {
  value: string
  onChange: (value: string) => void
}

export function SupplierSearch({ value, onChange }: SupplierSearchProps) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<Supplier[]>([])
  const [showResults, setShowResults] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length > 0) {
        try {
          const suppliers = await searchSuppliers(query)
          setResults(suppliers)
          setShowResults(true)
        } catch {
          setResults([])
        }
      } else {
        setResults([])
        setShowResults(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(e.target.value)
          }}
          onFocus={() => results.length > 0 && setShowResults(true)}
          className="h-8 text-sm pl-7"
          placeholder="Buscar fornecedor..."
        />
      </div>
      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {results.map((s) => (
            <button
              key={s.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              onClick={() => {
                onChange(s.name)
                setQuery(s.name)
                setShowResults(false)
              }}
            >
              {s.name}
              {s.contact_name && (
                <span className="text-xs text-muted-foreground ml-2">— {s.contact_name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
