import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Layers,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Check,
  ShieldAlert,
  Loader2,
  HelpCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { NoTranslate } from '@/components/NoTranslate'
import { useToast } from '@/hooks/use-toast'
import { safeUnwrapJson } from '@/lib/safe-json'
import { useAuth } from '@/hooks/use-auth'

export interface FractionalCompositionItem {
  key: string // productId + ':::' + componentCode + ':::' + index
  productId: string
  productCode: string
  productName: string
  componentIndex: number
  code: string
  description: string
  unit: string
  currentQuantity: number
  suggestedQuantity: number
  etapa?: string
}

/**
 * Verifica se a unidade é estritamente contável / PC (não linear nem a granel)
 */
function isStrictlyPieceUnit(unitStr?: string): boolean {
  const u = (unitStr || '').trim().toUpperCase()
  if (!u) return false
  // Exclusão estrita de unidades lineares/contínuas
  if (
    u === 'MT' ||
    u === 'M' ||
    u === 'MTR' ||
    u === 'METRO' ||
    u === 'METROS' ||
    u === 'KG' ||
    u === 'G' ||
    u === 'L' ||
    u === 'LT' ||
    u === 'LITRO' ||
    u === 'LITROS' ||
    u === 'ML' ||
    u === 'M2' ||
    u === 'M²' ||
    u === 'M3' ||
    u === 'M³'
  ) {
    return false
  }

  return (
    u === 'PC' ||
    u === 'PÇ' ||
    u === 'PECA' ||
    u === 'PEÇA' ||
    u === 'UN' ||
    u === 'UND' ||
    u === 'UNID' ||
    u === 'UNIDADE' ||
    u === 'CJ' ||
    u === 'CONJ' ||
    u === 'CONJUNTO' ||
    u === 'PAR' ||
    u === 'PARES' ||
    u === 'KIT' ||
    u === 'RL' ||
    u === 'ROLO' ||
    u === 'CX' ||
    u === 'CAIXA' ||
    u === 'PT' ||
    u === 'PCT' ||
    u === 'PACOTE'
  )
}

export function FractionalCompositionsPanel({ onDataChanged }: { onDataChanged?: () => void }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [items, setItems] = useState<FractionalCompositionItem[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // Carrega todos os produtos e componentes e faz varredura completa
  const scanCompositions = async () => {
    setLoading(true)
    try {
      // 1. Carregar componentes mestre para verificar a unidade real cadastrada
      const compList = await pb.collection('components').getFullList<{
        id: string
        code: string
        description: string
        unit: string
      }>({ fields: 'id,code,description,unit' })

      const unitByCode = new Map<string, string>()
      compList.forEach((c) => {
        if (c.code) {
          unitByCode.set(c.code.trim().toUpperCase(), (c.unit || '').trim().toUpperCase())
        }
      })

      // 2. Carregar produtos
      const productList = await pb.collection('products').getFullList<{
        id: string
        code: string
        name: string
        data: any
      }>({ fields: 'id,code,name,data', sort: 'name' })

      const detected: FractionalCompositionItem[] = []

      for (const prod of productList) {
        const pData = safeUnwrapJson<any>(prod.data)
        if (!pData || !Array.isArray(pData.composition)) continue

        pData.composition.forEach((c: any, idx: number) => {
          const compCode = (c.code || '').trim()
          if (!compCode) return

          // Determinar unidade: priorizar a cadastrada na collection 'components' se existir
          const masterUnit = unitByCode.get(compCode.toUpperCase())
          const resolvedUnit = masterUnit || (c.unit || 'UN').trim().toUpperCase()

          // Unidades fracionadas em MT/M/KG são legítimas! Bug é apenas em unidades PC/peça.
          if (!isStrictlyPieceUnit(resolvedUnit)) {
            return
          }

          const rawQty =
            typeof c.quantity === 'number'
              ? c.quantity
              : parseFloat(String(c.quantity).replace(',', '.'))
          if (isNaN(rawQty) || rawQty <= 0) return

          // Verifica se há fração (não é número inteiro)
          const isFraction = Math.floor(rawQty) !== rawQty
          if (isFraction) {
            const suggested = Math.ceil(rawQty)
            detected.push({
              key: `${prod.id}:::${compCode}:::${idx}`,
              productId: prod.id,
              productCode: prod.code || '',
              productName: prod.name || 'Produto sem nome',
              componentIndex: idx,
              code: compCode,
              description: c.description || '',
              unit: resolvedUnit,
              currentQuantity: rawQty,
              suggestedQuantity: suggested,
              etapa: c.etapa,
            })
          }
        })
      }

      setItems(detected)
      // Selecionar todos por padrão para conveniência do gestor
      setSelectedKeys(new Set(detected.map((d) => d.key)))
    } catch (err: any) {
      console.error('[FRACTIONAL COMPOSITIONS] Erro ao varrer composições:', err)
      toast({
        title: 'Erro ao escanear composições',
        description: err.message || 'Falha ao buscar produtos ou componentes no banco.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    scanCompositions()
  }, [])

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    if (!term) return items
    return items.filter(
      (it) =>
        it.productName.toLowerCase().includes(term) ||
        it.productCode.toLowerCase().includes(term) ||
        it.code.toLowerCase().includes(term) ||
        it.description.toLowerCase().includes(term),
    )
  }, [items, searchTerm])

  const toggleSelectRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedKeys.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedKeys(new Set())
    } else {
      setSelectedKeys(new Set(filteredItems.map((it) => it.key)))
    }
  }

  // Aplicação da correção com auditoria
  const handleApplyCorrections = async () => {
    const targets = filteredItems.filter((it) => selectedKeys.has(it.key))
    if (targets.length === 0) {
      toast({
        title: 'Nenhum item selecionado',
        description: 'Selecione pelo menos um componente para aplicar o arredondamento.',
      })
      return
    }

    setSaving(true)
    const userLabel = user?.name || user?.email || 'Gestor'
    let updatedProductsCount = 0
    let updatedItemsCount = 0

    try {
      // Agrupar itens por produto para atualizar atomicamente
      const byProduct = new Map<string, FractionalCompositionItem[]>()
      targets.forEach((it) => {
        const list = byProduct.get(it.productId) || []
        list.push(it)
        byProduct.set(it.productId, list)
      })

      for (const [productId, compItems] of byProduct.entries()) {
        // Leitura LIVE do banco antes de salvar para evitar sobrescrita cega
        const freshProd = await pb.collection('products').getOne(productId)
        const pData = safeUnwrapJson<any>(freshProd.data) || {}
        const compList = Array.isArray(pData.composition) ? pData.composition : []

        let prodChanged = false
        const auditLogLines: string[] = []

        compItems.forEach((target) => {
          // Localizar o item na composição atual por código ou índice
          let c = compList[target.componentIndex]
          if (!c || (c.code || '').trim() !== target.code) {
            c = compList.find((ci: any) => (ci.code || '').trim() === target.code)
          }

          if (c) {
            const oldVal = c.quantity
            c.quantity = String(target.suggestedQuantity)
            prodChanged = true
            updatedItemsCount++
            auditLogLines.push(
              `Item ${target.code} (${target.description}): ${oldVal} ${target.unit} → ${target.suggestedQuantity} ${target.unit}`,
            )
          }
        })

        if (prodChanged) {
          pData.composition = compList

          // Adicionar ao histórico/observação de auditoria se aplicável
          if (!pData.audit_history) pData.audit_history = []
          pData.audit_history.push({
            date: new Date().toISOString(),
            user: userLabel,
            action: 'Correção de quantidades fracionárias em itens PC (arredondamento Math.ceil)',
            details: auditLogLines,
          })

          await pb.collection('products').update(productId, {
            data: pData,
          })
          updatedProductsCount++
        }
      }

      toast({
        title: 'Correção de composições concluída!',
        description: `${updatedItemsCount} componente(s) em ${updatedProductsCount} produto(s) arredondados para número inteiro com sucesso e registrados na auditoria.`,
      })

      await scanCompositions()
      onDataChanged?.()
    } catch (err: any) {
      console.error('[APPLY CORRECTIONS] Erro ao gravar composições:', err)
      toast({
        title: 'Erro ao aplicar correções',
        description: err.message || 'Falha ao atualizar produtos no banco.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-amber-200 dark:border-amber-900 shadow-xs">
      <CardHeader className="pb-3 border-b bg-amber-50/40 dark:bg-amber-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-600 dark:text-amber-400" />
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Composições com Fração em Peças (PC)
                <Badge
                  variant={items.length > 0 ? 'destructive' : 'secondary'}
                  className="font-mono text-xs font-bold"
                >
                  {items.length} pendente(s)
                </Badge>
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
              Varre o cadastro de produtos (<code>products.data.composition</code>) identificando
              componentes de unidade <strong>PC / peça</strong> com quantidade fracionária (geradas
              por divisão indevida na importação de PDF). Permite ao gestor confirmar o
              arredondamento para cima (<code>Math.ceil</code>).
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={scanCompositions}
              disabled={loading || saving}
              className="gap-2 h-8 text-xs font-semibold"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              Reescanear Banco
            </Button>

            {items.length > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={handleApplyCorrections}
                disabled={loading || saving || selectedKeys.size === 0}
                className="gap-1.5 h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Aplicar Correção ({selectedKeys.size})
              </Button>
            )}
          </div>
        </div>

        {/* Alerta de regra de negócio */}
        <Alert className="mt-3 bg-amber-100/60 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-xs py-2">
          <HelpCircle className="size-4 text-amber-700 dark:text-amber-300" />
          <AlertDescription className="text-amber-900 dark:text-amber-200 ml-2">
            <strong>Regra de Integridade:</strong> Unidades lineares (<strong>MT</strong>, metro,
            cabo, barra, tubo) possuem frações legítimas e são estritamente preservadas. Somente
            peças contáveis (<strong>PC</strong>) são listadas e corrigidas para cima.
          </AlertDescription>
        </Alert>

        {/* Barra de busca */}
        <div className="pt-3">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <Input
              placeholder="Buscar por produto, código ou componente..."
              className="pl-9 text-xs h-8 bg-white dark:bg-slate-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-10 text-slate-400 gap-2">
            <RefreshCw className="size-6 animate-spin text-amber-500" />
            <p className="text-xs">Varrendo composições no banco de dados...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2 text-emerald-600 dark:text-emerald-400">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-full">
              <CheckCircle2 className="size-8" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Nenhuma composição com fração em peças (PC)
            </h4>
            <p className="text-xs text-muted-foreground max-w-md">
              Todas as composições de produtos cadastrados contêm quantidades inteiras para itens PC
              ou frações estritamente válidas para materiais lineares (MT).
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-semibold border-b text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">
                      <Checkbox
                        checked={
                          selectedKeys.size === filteredItems.length && filteredItems.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                        aria-label="Selecionar todos"
                      />
                    </th>
                    <th className="py-2.5 px-3 min-w-[200px]">Produto</th>
                    <th className="py-2.5 px-3 w-[120px]">Código</th>
                    <th className="py-2.5 px-3 min-w-[240px]">Componente / Descrição</th>
                    <th className="py-2.5 px-3 w-[90px] text-center">Unidade</th>
                    <th className="py-2.5 px-3 w-[110px] text-right">Qtd Atual</th>
                    <th className="py-2.5 px-3 w-[120px] text-right font-bold text-emerald-600 dark:text-emerald-400">
                      Sugerido (Teto)
                    </th>
                    <th className="py-2.5 px-3 w-[100px] text-center">Setor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredItems.map((item) => {
                    const isSelected = selectedKeys.has(item.key)

                    return (
                      <tr
                        key={item.key}
                        onClick={() => toggleSelectRow(item.key)}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                        }`}
                      >
                        <td
                          className="py-2.5 px-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectRow(item.key)}
                            aria-label={`Selecionar ${item.code}`}
                          />
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100 notranslate">
                          <div>
                            <NoTranslate text={item.productName} />
                          </div>
                          {item.productCode && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              Cód: {item.productCode}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200 notranslate whitespace-nowrap">
                          <NoTranslate text={item.code} />
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 notranslate">
                          <NoTranslate text={item.description} />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge variant="outline" className="text-[10px] py-0 font-bold">
                            {item.unit}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-red-600 dark:text-red-400 font-bold whitespace-nowrap">
                          {item.currentQuantity} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-black whitespace-nowrap">
                          {item.suggestedQuantity} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[10px] text-slate-500 font-medium">
                            {item.etapa || 'FABRICAÇÃO'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <strong>{selectedKeys.size}</strong> de {filteredItems.length} componente(s)
                selecionado(s).
              </span>
              <span>
                A correção grava o valor arredondado diretamente na composição do produto com log de
                auditoria.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
