import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckSquare, Square, Tag } from 'lucide-react'
import { CategoryGroup } from '@/hooks/use-category-groups'

interface CategoryFilterChipsProps {
  categoryGroups: CategoryGroup[]
  selectedCategoryId: string | null
  onSelectCategory: (categoryId: string | null) => void
  onSelectCategoryItems: (itemIds: string[]) => void
  selectedIds: Set<string>
  actionLabel?: string
}

export function CategoryFilterChips({
  categoryGroups,
  selectedCategoryId,
  onSelectCategory,
  onSelectCategoryItems,
  selectedIds,
  actionLabel = 'Selecionar todos da categoria',
}: CategoryFilterChipsProps) {
  if (categoryGroups.length === 0) return null

  const totalItemsCount = categoryGroups.reduce((acc, g) => acc + g.totalItems, 0)
  const totalValueAll = categoryGroups.reduce((acc, g) => acc + g.totalValue, 0)

  return (
    <div className="bg-white dark:bg-slate-900 border rounded-xl p-3 shadow-sm space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Totalização por Categoria do Componente
          </span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>{categoryGroups.length} categorias</span>
          <span>•</span>
          <span>{totalItemsCount} itens</span>
          {totalValueAll > 0 && (
            <>
              <span>•</span>
              <span className="font-semibold text-foreground">
                R${' '}
                {totalValueAll.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* CHIPS DE FILTRO POR CATEGORIA */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <button
          type="button"
          onClick={() => onSelectCategory(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all shrink-0 ${
            selectedCategoryId === null
              ? 'bg-primary text-primary-foreground border-primary shadow-sm font-bold'
              : 'bg-muted/40 hover:bg-muted text-muted-foreground border-border'
          }`}
        >
          <span>Todas</span>
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 h-4 bg-background/50 text-foreground"
          >
            {totalItemsCount}
          </Badge>
        </button>

        {categoryGroups.map((group) => {
          const isSelected = selectedCategoryId === group.categoryId
          const groupItemIds = group.items.map((i) => i.id)
          const allGroupSelected =
            groupItemIds.length > 0 && groupItemIds.every((id) => selectedIds.has(id))
          const someGroupSelected =
            !allGroupSelected && groupItemIds.some((id) => selectedIds.has(id))

          return (
            <div key={group.categoryId} className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onSelectCategory(isSelected ? null : group.categoryId)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm font-bold ring-2 ring-primary/30'
                    : 'bg-muted/40 hover:bg-muted text-foreground border-border'
                }`}
              >
                <span>{group.categoryName}</span>
                <span className="text-[10px] opacity-80">({group.totalItems})</span>
                {group.totalValue > 0 && (
                  <span className="text-[10px] font-semibold opacity-90">
                    R$ {group.totalValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* AÇÃO EM LOTE PARA CATEGORIA SELECIONADA */}
      {selectedCategoryId !== null &&
        (() => {
          const activeGroup = categoryGroups.find((g) => g.categoryId === selectedCategoryId)
          if (!activeGroup) return null
          const groupItemIds = activeGroup.items.map((i) => i.id)
          const allGroupSelected =
            groupItemIds.length > 0 && groupItemIds.every((id) => selectedIds.has(id))

          return (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-primary">
                  Categoria &ldquo;{activeGroup.categoryName}&rdquo;:
                </span>
                <span className="text-muted-foreground">
                  {activeGroup.totalItems} itens • Total R${' '}
                  {activeGroup.totalValue.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <Button
                type="button"
                variant={allGroupSelected ? 'secondary' : 'default'}
                size="sm"
                onClick={() => onSelectCategoryItems(groupItemIds)}
                className="h-7 text-xs gap-1.5 font-semibold shadow-sm"
              >
                {allGroupSelected ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    Desmarcar {activeGroup.categoryName}
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5" />
                    {actionLabel} ({activeGroup.totalItems})
                  </>
                )}
              </Button>
            </div>
          )
        })()}
    </div>
  )
}
