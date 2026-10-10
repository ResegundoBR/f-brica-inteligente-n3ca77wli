import { useState, useEffect, useMemo } from 'react'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Link2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowRight,
  Database,
  Search,
  ExternalLink,
} from 'lucide-react'
import { MasterComponent, Inventory, MaterialShortage } from '@/types'
import { NoTranslate } from '@/components/NoTranslate'
import { useToast } from '@/hooks/use-toast'
import { createMasterComponent, updateMasterComponent } from '@/services/components'
import { updateInventoryItem } from '@/services/inventory'

interface CadastralAuditData {
  inventoriesWithoutComponent: Inventory[]
  componentsWithoutInventory: MasterComponent[]
  shortagesWithUnmatchedCode: {
    shortage: MaterialShortage
    suggestedCode?: string
    suggestedDesc?: string
    suggestedComponentId?: string
    reason: string
  }[]
}

/**
 * Distância de Levenshtein para cálculo de similaridade entre strings
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d: number[][] = []

  for (let i = 0; i <= m; i++) d[i] = [i]
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost, // substitution
      )
    }
  }

  return d[m][n]
}

/**
 * Normaliza string removendo caracteres que causam typos clássicos (ex: l/o em posições numéricas)
 */
function normalizeTypoCode(code: string): string {
  return code.trim().replace(/[lI]/g, '1').replace(/[oO]/g, '0').toUpperCase()
}

export function UnificacaoCadastralPanel({ onDataChanged }: { onDataChanged?: () => void }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState<
    'inv_sem_comp' | 'comp_sem_inv' | 'shortages_unmatched'
  >('inv_sem_comp')

  const [components, setComponents] = useState<MasterComponent[]>([])
  const [inventoryList, setInventoryList] = useState<Inventory[]>([])
  const [shortages, setShortages] = useState<MaterialShortage[]>([])

  const [processingId, setProcessingId] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [comps, invs, shorts] = await Promise.all([
        pb.collection('components').getFullList<MasterComponent>({ sort: 'description' }),
        pb.collection('inventory').getFullList<Inventory>({ sort: 'description' }),
        pb.collection('material_shortages').getFullList<MaterialShortage>({
          sort: '-created',
          expand: 'order_id',
        }),
      ])
      setComponents(comps)
      setInventoryList(invs)
      setShortages(shorts)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar dados cadastrais',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Mapas para lookup
  const auditData = useMemo<CadastralAuditData>(() => {
    const compById = new Map<string, MasterComponent>()
    const compByCode = new Map<string, MasterComponent>()
    const compByDesc = new Map<string, MasterComponent>()

    components.forEach((c) => {
      compById.set(c.id, c)
      if (c.code) compByCode.set(c.code.trim().toUpperCase(), c)
      if (c.description) compByDesc.set(c.description.trim().toUpperCase(), c)
    })

    const invById = new Map<string, Inventory>()
    const invByCode = new Map<string, Inventory>()
    const invByComponentId = new Map<string, Inventory>()

    inventoryList.forEach((inv) => {
      invById.set(inv.id, inv)
      if (inv.code) invByCode.set(inv.code.trim().toUpperCase(), inv)
      if (inv.component_id) invByComponentId.set(inv.component_id, inv)
    })

    // 1. Inventários sem componente mestre vinculado ou com vínculo quebrado
    const inventoriesWithoutComponent = inventoryList.filter((inv) => {
      if (!inv.component_id) return true
      return !compById.has(inv.component_id)
    })

    // 2. Componentes cadastrados que não possuem registro de inventário vinculado
    const componentsWithoutInventory = components.filter((c) => {
      if (invByComponentId.has(c.id)) return false
      if (c.code && invByCode.has(c.code.trim().toUpperCase())) return false
      return true
    })

    // 3. Códigos de solicitação legados que não batem com nenhum cadastro
    const shortagesWithUnmatchedCode: CadastralAuditData['shortagesWithUnmatchedCode'] = []

    shortages.forEach((s) => {
      const sCode = (s.code || '').trim()
      if (!sCode) return // Solicitações sem código são texto livre legado

      const codeUpper = sCode.toUpperCase()
      const existsInComp = compByCode.has(codeUpper)
      const existsInInv = invByCode.has(codeUpper)

      if (!existsInComp && !existsInInv) {
        // Encontrar sugestão de código correto por similaridade:
        // Caso específico 1: Typos numéricos (05100l0105 -> 05100105)
        const typoCorrected = normalizeTypoCode(sCode)
        let matchedSuggestion: {
          code: string
          desc: string
          compId?: string
          reason: string
        } | null = null

        if (typoCorrected !== codeUpper) {
          if (compByCode.has(typoCorrected)) {
            const comp = compByCode.get(typoCorrected)!
            matchedSuggestion = {
              code: comp.code || typoCorrected,
              desc: comp.description,
              compId: comp.id,
              reason: `Correção de caractere ("l"/"o" -> dígitos) bate com cadastro mestre`,
            }
          } else if (invByCode.has(typoCorrected)) {
            const inv = invByCode.get(typoCorrected)!
            matchedSuggestion = {
              code: inv.code || typoCorrected,
              desc: inv.description,
              compId: inv.component_id,
              reason: `Correção de caractere ("l"/"o" -> dígitos) bate com estoque`,
            }
          }
        }

        // Caso 2: Similaridade por Levenshtein na lista de componentes existentes
        if (!matchedSuggestion) {
          let bestDist = Infinity
          let bestComp: MasterComponent | null = null

          for (const c of components) {
            if (!c.code) continue
            const dist = levenshteinDistance(codeUpper, c.code.trim().toUpperCase())
            if (dist <= 2 && dist < bestDist) {
              bestDist = dist
              bestComp = c
            }
          }

          if (bestComp) {
            matchedSuggestion = {
              code: bestComp.code || '',
              desc: bestComp.description,
              compId: bestComp.id,
              reason: `Similaridade de código (distância ${bestDist})`,
            }
          }
        }

        shortagesWithUnmatchedCode.push({
          shortage: s,
          suggestedCode: matchedSuggestion?.code,
          suggestedDesc: matchedSuggestion?.desc,
          suggestedComponentId: matchedSuggestion?.compId,
          reason: matchedSuggestion?.reason || 'Código não encontrado no cadastro unificado',
        })
      }
    })

    return {
      inventoriesWithoutComponent,
      componentsWithoutInventory,
      shortagesWithUnmatchedCode,
    }
  }, [components, inventoryList, shortages])

  // Ação 1: Criar Componente no Mestre a partir do Item de Inventário
  const handleCreateComponentForInventory = async (inv: Inventory) => {
    setProcessingId(inv.id)
    try {
      const newComp = await createMasterComponent({
        code: inv.code ? inv.code.trim() : undefined,
        description: inv.description,
        unit: inv.unit || 'un',
        source: 'inventory',
        min_quantity: inv.min_quantity || 0,
        active: true,
      })

      // Vincula o component_id no inventário
      await updateInventoryItem(inv.id, {
        component_id: newComp.id,
      })

      toast({
        title: 'Componente criado e vinculado',
        description: `O item "${inv.description}" agora possui cadastro mestre unificado.`,
      })

      await loadData()
      onDataChanged?.()
    } catch (err: any) {
      toast({
        title: 'Erro ao criar componente',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setProcessingId(null)
    }
  }

  // Ação 2: Vincular inventário a componente existente
  const handleLinkInventoryToComponent = async (invId: string, compId: string) => {
    setProcessingId(invId)
    try {
      await updateInventoryItem(invId, {
        component_id: compId,
      })

      toast({
        title: 'Vínculo cadastrado',
        description: 'Item de estoque vinculado com sucesso ao componente mestre.',
      })

      await loadData()
      onDataChanged?.()
    } catch (err: any) {
      toast({
        title: 'Erro ao vincular',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setProcessingId(null)
    }
  }

  // Ação 3: Corrigir código de solicitação legada com a sugestão
  const handleApplySuggestedCodeToShortage = async (
    shortageId: string,
    suggestedCode: string,
    suggestedDesc?: string,
  ) => {
    setProcessingId(shortageId)
    try {
      const payload: Record<string, any> = {
        code: suggestedCode.trim(),
      }
      if (suggestedDesc) {
        payload.description = suggestedDesc
      }

      await pb.collection('material_shortages').update(shortageId, payload)

      toast({
        title: 'Código corrigido na solicitação',
        description: `Código atualizado para "${suggestedCode}" com sucesso.`,
      })

      await loadData()
      onDataChanged?.()
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar código',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <Card className="border-blue-200 dark:border-blue-900 shadow-xs">
      <CardHeader className="pb-3 border-b bg-blue-50/40 dark:bg-blue-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="size-5 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Unificação Cadastral — Componentes &amp; Inventário
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-600 dark:text-slate-400">
              Garante que todo item do Inventário esteja ligado ao seu Componente mestre e audita
              códigos legados.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-2 shrink-0 h-8 text-xs font-semibold"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Reauditar Vínculos
          </Button>
        </div>

        {/* Resumo rápido dos contadores */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border flex items-center justify-between">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Estoque sem Componente:
            </span>
            <Badge
              variant={
                auditData.inventoriesWithoutComponent.length > 0 ? 'destructive' : 'secondary'
              }
              className="text-xs font-mono font-bold"
            >
              {auditData.inventoriesWithoutComponent.length}
            </Badge>
          </div>
          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border flex items-center justify-between">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Componentes sem Estoque:
            </span>
            <Badge variant="outline" className="text-xs font-mono font-bold">
              {auditData.componentsWithoutInventory.length}
            </Badge>
          </div>
          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border flex items-center justify-between">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Códigos Legados Inexistentes:
            </span>
            <Badge
              variant={
                auditData.shortagesWithUnmatchedCode.length > 0 ? 'destructive' : 'secondary'
              }
              className="text-xs font-mono font-bold"
            >
              {auditData.shortagesWithUnmatchedCode.length}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <Tabs
          value={activeSubTab}
          onValueChange={(v: any) => setActiveSubTab(v)}
          className="w-full space-y-4"
        >
          <TabsList className="grid grid-cols-3 w-full max-w-2xl">
            <TabsTrigger value="inv_sem_comp" className="text-xs gap-1.5">
              <span>Inventário sem Componente</span>
              {auditData.inventoriesWithoutComponent.length > 0 && (
                <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                  {auditData.inventoriesWithoutComponent.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="comp_sem_inv" className="text-xs gap-1.5">
              <span>Componentes sem Estoque</span>
              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                {auditData.componentsWithoutInventory.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="shortages_unmatched" className="text-xs gap-1.5">
              <span>Solicitações Desalinhadas</span>
              {auditData.shortagesWithUnmatchedCode.length > 0 && (
                <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                  {auditData.shortagesWithUnmatchedCode.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: INVENTÁRIO SEM COMPONENTE MESTRE */}
          <TabsContent value="inv_sem_comp" className="space-y-3">
            {auditData.inventoriesWithoutComponent.length === 0 ? (
              <div className="p-6 text-center rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200 space-y-1">
                <CheckCircle2 className="size-6 text-emerald-600 mx-auto" />
                <p className="text-sm font-semibold">
                  100% dos itens de Inventário estão vinculados!
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Todo registro do almoxarifado possui correspondência direta no Cadastro Mestre de
                  Componentes.
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Descrição no Inventário</th>
                      <th className="py-2.5 px-3">Saldo</th>
                      <th className="py-2.5 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {auditData.inventoriesWithoutComponent.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono font-medium notranslate">
                          <NoTranslate text={inv.code || 'S/ CÓDIGO'} />
                        </td>
                        <td className="py-2.5 px-3 notranslate">
                          <NoTranslate text={inv.description} />
                        </td>
                        <td className="py-2.5 px-3">
                          {inv.quantity} {inv.unit || 'un'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
                            disabled={processingId === inv.id}
                            onClick={() => handleCreateComponentForInventory(inv)}
                          >
                            <Plus className="size-3" />
                            Criar no Mestre &amp; Vincular
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ABA 2: COMPONENTES SEM ESTOQUE CADASTRADO */}
          <TabsContent value="comp_sem_inv" className="space-y-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 border rounded-lg text-xs text-slate-600 dark:text-slate-400">
              Estes componentes existem no Cadastro Mestre (para fichas técnicas do Catálogo e OPs),
              mas ainda não possuem linha física de saldo no Inventário.
            </div>
            <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Descrição Mestra</th>
                    <th className="py-2.5 px-3">Origem</th>
                    <th className="py-2.5 px-3">Estoque Mínimo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditData.componentsWithoutInventory.map((comp) => (
                    <tr key={comp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono font-medium notranslate">
                        <NoTranslate text={comp.code || '—'} />
                      </td>
                      <td className="py-2 px-3 notranslate">
                        <NoTranslate text={comp.description} />
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-[10px]">
                          {comp.source || 'catálogo'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        {comp.min_quantity || 0} {comp.unit || 'un'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ABA 3: SOLICITAÇÕES DESALINHADAS (CASO DE TYPO / TEXTO LIVRE LEGADO) */}
          <TabsContent value="shortages_unmatched" className="space-y-3">
            {auditData.shortagesWithUnmatchedCode.length === 0 ? (
              <div className="p-6 text-center rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200 space-y-1">
                <CheckCircle2 className="size-6 text-emerald-600 mx-auto" />
                <p className="text-sm font-semibold">Nenhuma solicitação com código desalinhado!</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Todos os códigos utilizados em solicitações de compras correspondem perfeitamente
                  ao Cadastro Unificado.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      Solicitações legadas com código não encontrado no cadastro unificado:
                    </p>
                    <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                      O sistema calculou sugestões por correção de typos conhecidos (ex: troca de
                      letras "l"/"o" por dígitos) e similaridade. Confirme manualmente cada
                      substituição.
                    </p>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold border-b">
                      <tr>
                        <th className="py-2.5 px-3">Código Atual</th>
                        <th className="py-2.5 px-3">Descrição da Solicitação</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Sugestão Detectada</th>
                        <th className="py-2.5 px-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {auditData.shortagesWithUnmatchedCode.map(
                        ({ shortage, suggestedCode, suggestedDesc, reason }) => (
                          <tr
                            key={shortage.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-2.5 px-3 font-mono font-bold text-red-600 dark:text-red-400 notranslate">
                              <NoTranslate text={shortage.code || 'S/ CÓDIGO'} />
                            </td>
                            <td className="py-2.5 px-3 notranslate">
                              <NoTranslate text={shortage.description} />
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline" className="text-[10px]">
                                {shortage.status}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3">
                              {suggestedCode ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1 font-mono font-bold text-emerald-600 dark:text-emerald-400 notranslate">
                                    <span>{suggestedCode}</span>
                                    {suggestedDesc && (
                                      <span className="text-[11px] font-normal text-slate-600 dark:text-slate-300">
                                        — {suggestedDesc}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500">{reason}</p>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">
                                  Sem sugestão automática
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {suggestedCode ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-emerald-500 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40 gap-1"
                                  disabled={processingId === shortage.id}
                                  onClick={() =>
                                    handleApplySuggestedCodeToShortage(
                                      shortage.id,
                                      suggestedCode,
                                      suggestedDesc,
                                    )
                                  }
                                >
                                  <ArrowRight className="size-3" />
                                  Aplicar Sugestão
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
