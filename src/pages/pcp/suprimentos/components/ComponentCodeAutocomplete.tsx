import { useState, useEffect, useRef, useId } from 'react'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  searchMasterComponents,
  validateUnifiedCodeExists,
  UnifiedCatalogEntry,
} from '@/services/components'

export interface ComponentSuggestion {
  code: string
  description: string
  unit?: string
}

interface ComponentCodeAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelectSuggestion: (item: ComponentSuggestion) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
  autoFocus?: boolean
  showUnregisteredHint?: boolean
  /**
   * Alinhamento do dropdown:
   * - 'start': alinhado à esquerda do input (padrão)
   * - 'left': pode expandir para a direita com min-w-[320px] ou [380px]
   */
  dropdownAlign?: 'start' | 'end'
}

export function ComponentCodeAutocomplete({
  value,
  onChange,
  onSelectSuggestion,
  placeholder = '-',
  className,
  inputClassName,
  disabled,
  autoFocus,
  showUnregisteredHint = true,
  dropdownAlign = 'start',
}: ComponentCodeAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<ComponentSuggestion[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null)
  const [checkingCode, setCheckingCode] = useState(false)

  // Último valor selecionado ou validado como cadastrado para evitar re-validar desnecessariamente
  const lastSelectedCodeRef = useRef<string | null>(null)

  // Debounced search when typing (>= 2 characters)
  useEffect(() => {
    const term = value.trim()

    if (term.length < 2) {
      setSuggestions([])
      setIsOpen(false)
      setLoading(false)
      setIsRegistered(null)
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchMasterComponents(term, 20)
        // Mapear para ComponentSuggestion e remover duplicatas de código
        const mapped: ComponentSuggestion[] = []
        const seen = new Set<string>()

        for (const item of results) {
          const itemCode = (item.code || '').trim()
          const itemDesc = (item.description || '').trim()
          if (!itemCode && !itemDesc) continue

          const key = `${itemCode.toUpperCase()}_${itemDesc.toUpperCase()}`
          if (seen.has(key)) continue
          seen.add(key)

          mapped.push({
            code: itemCode,
            description: itemDesc,
            unit: item.unit || 'un',
          })
        }

        setSuggestions(mapped)
        setIsOpen(mapped.length > 0)
        setHighlightedIndex(mapped.length > 0 ? 0 : -1)

        // Se o código digitado bate exatamente com algum resultado, é cadastrado
        const exactMatch = mapped.some((m) => m.code && m.code.toUpperCase() === term.toUpperCase())

        if (exactMatch) {
          setIsRegistered(true)
        } else {
          // Checar se existe no cadastro unificado via validateUnifiedCodeExists
          setCheckingCode(true)
          try {
            const check = await validateUnifiedCodeExists(term)
            setIsRegistered(check.exists)
          } catch {
            setIsRegistered(false)
          } finally {
            setCheckingCode(false)
          }
        }
      } catch (err) {
        console.warn('[ComponentCodeAutocomplete] Erro na busca:', err)
        setSuggestions([])
        setIsOpen(false)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [value])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (item: ComponentSuggestion) => {
    lastSelectedCodeRef.current = item.code || item.description
    onChange(item.code || '')
    onSelectSuggestion(item)
    setIsRegistered(true)
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true)
        setHighlightedIndex(0)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev + 1 >= suggestions.length ? 0 : prev + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev - 1 < 0 ? suggestions.length - 1 : prev - 1))
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault()
        handleSelect(suggestions[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    }
  }

  const cleanVal = value.trim()
  const showHint =
    showUnregisteredHint &&
    cleanVal.length >= 2 &&
    !loading &&
    !checkingCode &&
    isRegistered === false

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsRegistered(null)
          }}
          onFocus={() => {
            if (suggestions.length > 0 && cleanVal.length >= 2) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn('notranslate font-mono text-xs pr-6', inputClassName)}
          translate="no"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
        />
        {loading && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <Loader2 className="w-3 h-3 animate-spin" />
          </span>
        )}
      </div>

      {showHint && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 leading-tight font-sans notranslate">
          item sem cadastro — lançamento manual
        </p>
      )}

      {isOpen && suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className={cn(
            'absolute z-50 top-full mt-1 min-w-[280px] sm:min-w-[360px] max-w-[92vw] max-h-56 overflow-y-auto overflow-x-hidden',
            'rounded-md border bg-popover text-popover-foreground shadow-lg divide-y divide-border/60',
            dropdownAlign === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {suggestions.map((item, idx) => {
            const isHighlighted = idx === highlightedIndex
            return (
              <button
                key={`${item.code}-${idx}`}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 text-xs transition-colors flex items-start justify-between gap-2 notranslate',
                  isHighlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(item)
                }}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {item.code ? (
                      <span className="font-mono font-semibold text-[11px] text-primary shrink-0">
                        {item.code}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic shrink-0">
                        (sem cód.)
                      </span>
                    )}
                    {item.unit && (
                      <span className="text-[10px] px-1 py-0.2 rounded bg-muted text-muted-foreground uppercase font-mono shrink-0">
                        {item.unit}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[11px] text-foreground/90 line-clamp-2 leading-snug mt-0.5 break-words"
                    title={item.description}
                  >
                    {item.description}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
