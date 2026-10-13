import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Send, CheckCircle2, AlertTriangle, Loader2, Info, PlusCircle } from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { upsertMaterialShortage } from '@/services/material-shortages'
import {
  fetchUnifiedCatalogMap,
  validateUnifiedCodesBatch,
  findMaterialInfoFromPcpOrders,
  type UnifiedCatalogEntry,
} from '@/services/components'
import { getComponentCategories } from '@/services/component-categories'
import { CreateComponentDialog } from './CreateComponentDialog'
import type { SeparationAuditItem } from '@/services/pcp-separation-bom-audit'
import type { ComponentCategory, MasterComponent } from '@/types'

export interface SendToHubTargetItem {
  separationId: string
  separationTitle: string
  separationSeq?: number
  item: SeparationAuditItem
}

interface SendToHubModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetItems: SendToHubTargetItem[]
  catalogMap?: Map<string, UnifiedCatalogEntry>
  onSuccess: () => void
}

export function SendToHubModal({
  open,
  onOpenChange,
  targetItems,
  catalogMap: parentCatalogMap,
  onSuccess,
}: SendToHubModalProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [checkingCodes, setCheckingCodes] = useState(false)
  // 'single': Uma única solicitação com setor consolidado/geral
  // 'by_sector': Solicitações separadas por setor
  const [groupingMode, setGroupingMode] = useState<'single' | 'by_sector'>('by_sector')

  // Mapeamento de status cadastral por código: true = cadastrado, false = ausente
  const [codeRegisteredMap, setCodeRegisteredMap] = useState<Record<string, boolean>>({})

  // Estado para cadastro do componente ausente via CreateComponentDialog
  const [registerModalOpen, setRegisterModalOpen] = useState(false)
  const [categories, setCategories] = useState<ComponentCategory[]>([])
  const [registerInitialValues, setRegisterInitialValues] = useState<{
    code: string
    description: string
    unit: string
    source: 'catalog'
  } | null>(null)
  const [loadingComponentData, setLoadingComponentData] = useState(false)

  // Itens válidos (com diferença > 0)
  const validItems = targetItems ? targetItems.filter((t) => t.item.difference > 0) : []

  // Carregar categorias de componentes uma vez
  useEffect(() => {
    getComponentCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  // Verificar quais códigos de materiais existem no cadastro unificado em lote (zero N+1)
  const checkCodesRegistration = async (overrideCatalog?: Map<string, UnifiedCatalogEntry>) => {
    if (!open || validItems.length === 0) return
    setCheckingCodes(true)
    const newMap: Record<string, boolean> = {}

    try {
      const distinctCodes = Array.from(
        new Set(validItems.map((t) => (t.item.code || '').trim()).filter(Boolean)),
      )
      const catalog = overrideCatalog || parentCatalogMap || (await fetchUnifiedCatalogMap())
      const batchResult = await validateUnifiedCodesBatch(distinctCodes, catalog)
      for (const [code, status] of batchResult.entries()) {
        newMap[code] = status.exists
      }
      setCodeRegisteredMap(newMap)
    } catch (err) {
      console.warn('Erro ao checar cadastro de códigos:', err)
    } finally {
      setCheckingCodes(false)
    }
  }

  useEffect(() => {
    if (open) {
      checkCodesRegistration(parentCatalogMap)
    } else {
      setCodeRegisteredMap({})
    }
  }, [open, targetItems, parentCatalogMap])

  // Itens não cadastrados
  const unmappedItems = validItems.filter((t) => {
    const c = (t.item.code || '').trim()
    return c && codeRegisteredMap[c] === false
  })

  // Agrupados únicos para alerta
  const unmappedUniqueCodes = Array.from(
    new Set(unmappedItems.map((t) => (t.item.code || '').trim())),
  ).map((code) => {
    const item = unmappedItems.find((t) => (t.item.code || '').trim() === code)?.item
    return {
      code,
      description: item?.description || '',
      unit: item?.unit || 'PC',
    }
  })

  // Abrir diálogo de cadastro para um código específico ausente
  const handleOpenRegisterComponent = async (
    code: string,
    fallbackDesc?: string,
    fallbackUnit?: string,
  ) => {
    setLoadingComponentData(true)
    try {
      const pcpData = await findMaterialInfoFromPcpOrders(code)
      setRegisterInitialValues({
        code: pcpData.code || code,
        description: pcpData.description || fallbackDesc || '',
        unit: pcpData.unit || fallbackUnit || 'PC',
        source: 'catalog',
      })
      setRegisterModalOpen(true)
    } catch (err: any) {
      console.error('Erro ao buscar dados de pcp_order_materials:', err)
      setRegisterInitialValues({
        code,
        description: fallbackDesc || '',
        unit: fallbackUnit || 'PC',
        source: 'catalog',
      })
      setRegisterModalOpen(true)
    } finally {
      setLoadingComponentData(false)
    }
  }

  const handleComponentCreated = async (newComp: MasterComponent) => {
    toast({
      title: 'Componente cadastrado com sucesso!',
      description: `O código "${newComp.code}" foi registrado no cadastro unificado com origem catalog.`,
    })
    const compCode = (newComp.code || '').trim()
    if (compCode) {
      setCodeRegisteredMap((prev) => ({
        ...prev,
        [compCode]: true,
      }))
    }
    // Revalidar os códigos imediatamente em lote
    await checkCodesRegistration()
  }

  if (!targetItems || targetItems.length === 0) return null

  // Agrupamento por setor
  const itemsBySector = validItems.reduce<Record<string, SendToHubTargetItem[]>>((acc, t) => {
    const sec = t.item.sector || 'MONTAGEM'
    if (!acc[sec]) acc[sec] = []
    acc[sec].push(t)
    return acc
  }, {})

  const sectorsCount = Object.keys(itemsBySector).length

  const handleConfirmSend = async () => {
    if (validItems.length === 0) {
      toast({
        title: 'Nenhum item com diferença',
        description: 'Todos os itens selecionados já possuem diferença zerada.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    let createdCount = 0
    let updatedCount = 0
    const errors: string[] = []

    try {
      const userLabel = user?.name || user?.email || 'Auditoria BOM'

      for (const target of validItems) {
        const { item, separationSeq, separationTitle, separationId } = target
        const sepDisplay = separationSeq ? `#${separationSeq}` : separationId

        // Referência das OPs de origem
        const opRefs = item.involvedOps
          .map((op) => `OP ${op.opNumber} (${op.itemQuantity} ${item.unit})`)
          .join(', ')

        // Observação mandatória conforme especificação:
        // 'Auditoria BOM — separação #N' + referência das OPs de origem
        const auditObs = `Auditoria BOM — separação ${sepDisplay} | Origem: ${opRefs || 'OPs da separação'}`

        // Setor conforme o modo escolhido
        const chosenSector =
          groupingMode === 'by_sector' ? item.sector || 'MONTAGEM' : 'Suprimentos'

        // Se houver apenas 1 OP envolvida: vincula diretamente a order_id dessa OP
        // Se houver mais de 1 OP envolvida: cria um registro para cada OP rateando a diferença proporcionalmente
        // à demanda da OP, e vincula todos através de um batch_id compartilhado (padrão de compra em lote do sistema).
        if (item.involvedOps.length <= 1) {
          const singleOrderId = item.involvedOps[0]?.orderId || undefined
          try {
            const res = await upsertMaterialShortage(
              {
                order_id: singleOrderId,
                code: item.code,
                description: item.description,
                quantity: item.difference,
                sector: chosenSector,
                status: 'Pendente',
                request_type: 'Materiais',
                priority: 'Sem pressa',
                requested_by: user?.id,
                observation: auditObs,
              },
              userLabel,
              { accumulateQty: true },
            )

            if (res.isNew) {
              createdCount++
            } else {
              updatedCount++
            }
          } catch (itemErr: any) {
            console.error(`Erro ao criar solicitação para item ${item.code}:`, itemErr)
            const errMsg =
              itemErr?.data?.code?.message ||
              itemErr?.data?.message ||
              itemErr.message ||
              'Falha ao gravar'
            errors.push(`Código [${item.code}] - ${item.description}: ${errMsg}`)
          }
        } else {
          // Múltiplas OPs: ratear a diferença proporcionalmente à demanda de cada OP envolvida
          const totalInvolvedDemand = item.involvedOps.reduce(
            (acc, op) => acc + (op.itemQuantity || 0),
            0,
          )
          const batchId = `lote_audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
          let allocatedDiffAcc = 0

          for (let opIdx = 0; opIdx < item.involvedOps.length; opIdx++) {
            const op = item.involvedOps[opIdx]
            const isLast = opIdx === item.involvedOps.length - 1

            // Proporção da OP sobre a demanda total
            const ratio =
              totalInvolvedDemand > 0
                ? (op.itemQuantity || 0) / totalInvolvedDemand
                : 1 / item.involvedOps.length

            let opDiff: number
            const unitUpper = (item.unit || '').trim().toUpperCase()
            const isPiece =
              unitUpper === 'PC' ||
              unitUpper === 'PÇ' ||
              unitUpper === 'PECA' ||
              unitUpper === 'PEÇA' ||
              unitUpper === 'UN' ||
              unitUpper === 'UND'

            if (isPiece) {
              // Em itens de unidade PC/UN, cada OP recebe quantidade inteira arredondada para cima
              opDiff = Math.ceil(item.difference * ratio)
            } else {
              opDiff = Math.round(item.difference * ratio * 10000) / 10000
              if (isLast) {
                // Ajusta arredondamento na última parcela para fechar exatamente a diferença total em unidades fracionárias
                opDiff = Math.round((item.difference - allocatedDiffAcc) * 10000) / 10000
              }
            }
            allocatedDiffAcc += opDiff

            if (opDiff <= 0) continue

            const opSpecificObs = `Auditoria BOM — separação ${sepDisplay} | Origem: OP ${op.opNumber} (${op.itemQuantity} ${item.unit}) de ${item.difference} ${item.unit} total rateado | Demais OPs: ${opRefs}`

            try {
              const res = await upsertMaterialShortage(
                {
                  order_id: op.orderId,
                  batch_id: batchId,
                  code: item.code,
                  description: item.description,
                  quantity: opDiff,
                  sector: chosenSector,
                  status: 'Pendente',
                  request_type: 'Materiais',
                  priority: 'Sem pressa',
                  requested_by: user?.id,
                  observation: opSpecificObs,
                },
                userLabel,
                { accumulateQty: true },
              )

              if (res.isNew) {
                createdCount++
              } else {
                updatedCount++
              }
            } catch (itemErr: any) {
              console.error(
                `Erro ao criar solicitação rateada para OP ${op.opNumber} do item ${item.code}:`,
                itemErr,
              )
              const errMsg =
                itemErr?.data?.code?.message ||
                itemErr?.data?.message ||
                itemErr.message ||
                'Falha ao gravar'
              errors.push(
                `Código [${item.code}] - ${item.description} (OP ${op.opNumber}): ${errMsg}`,
              )
            }
          }
        }
      }

      if (errors.length > 0) {
        // Exibir descrição e código detalhados dos itens que falharam
        const detailedErrorList = errors.slice(0, 3).join('; ')
        const moreCount = errors.length > 3 ? ` (+${errors.length - 3} outros)` : ''

        toast({
          title: `Falha no envio ao Hub (${errors.length} falharam)`,
          description: `${createdCount + updatedCount} processados com sucesso. Falharam: ${detailedErrorList}${moreCount}`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Enviado ao Hub de Suprimentos com sucesso!',
          description: `${createdCount + updatedCount} item(ns) encaminhado(s) para a Fila de Triagem do Hub (${createdCount} novo(s), ${updatedCount} vinculado(s) sem duplicidade).`,
        })
      }

      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      console.error('Falha geral ao enviar para o Hub:', err)
      toast({
        title: 'Erro ao enviar ao Hub',
        description: err.message || 'Ocorreu um erro ao processar as solicitações.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
            <Send className="size-5" />
            Enviar ao Hub de Suprimentos — Confirmação
          </DialogTitle>
          <DialogDescription className="text-xs">
            Esta ação criará ou atualizará solicitações de compra na{' '}
            <strong>Fila de Entrada &amp; Triagem</strong> do Hub (/pcp/suprimentos/hub) com a
            quantidade da diferença apontada na auditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Alerta de Verificação Cadastral Pré-Envio */}
          {checkingCodes ? (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-slate-50 text-xs text-slate-600">
              <Loader2 className="size-3.5 animate-spin text-indigo-600" />
              <span>Verificando códigos contra o Cadastro Unificado de Componentes...</span>
            </div>
          ) : unmappedUniqueCodes.length > 0 ? (
            <Alert className="bg-amber-50/70 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800 text-xs py-2.5">
              <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="ml-2 space-y-2 w-full">
                <AlertDescription className="text-amber-900 dark:text-amber-200 font-medium leading-relaxed">
                  <strong>Atenção:</strong>{' '}
                  {unmappedUniqueCodes.length === 1
                    ? 'O código abaixo não existe'
                    : `${unmappedUniqueCodes.length} códigos não existem`}{' '}
                  no Cadastro Unificado de Componentes e{' '}
                  <span className="underline font-semibold">
                    será bloqueado pelo hook do servidor
                  </span>{' '}
                  ao enviar ao Hub. Cadastre o componente antes de prosseguir com o envio:
                </AlertDescription>

                <div className="divide-y divide-amber-200 dark:divide-amber-800/60 rounded border border-amber-200 dark:border-amber-800 bg-white/70 dark:bg-slate-950/70 p-2 space-y-2">
                  {unmappedUniqueCodes.map((unmapped) => (
                    <div
                      key={unmapped.code}
                      className="pt-1.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="text-xs">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 mr-2 notranslate">
                          {unmapped.code}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300 notranslate">
                          {unmapped.description} ({unmapped.unit})
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleOpenRegisterComponent(
                            unmapped.code,
                            unmapped.description,
                            unmapped.unit,
                          )
                        }
                        disabled={submitting || loadingComponentData}
                        className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 gap-1 font-semibold shrink-0"
                      >
                        <PlusCircle className="size-3 text-amber-600 dark:text-amber-400" />
                        Cadastrar componente
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </Alert>
          ) : (
            <div className="flex items-center gap-2 p-2 rounded-lg border border-emerald-200 bg-emerald-50/50 text-[11px] text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>Todos os códigos de materiais estão validados no Cadastro Unificado.</span>
            </div>
          )}

          {/* Informação sobre anti-duplicidade e regra de gravação */}
          <Alert className="bg-indigo-50/50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800 text-xs py-2">
            <Info className="size-4 text-indigo-600" />
            <AlertDescription className="text-slate-700 dark:text-slate-300 ml-2">
              A trava anti-duplicidade <code>upsertMaterialShortage</code> é respeitada: se já
              houver solicitação aberta para o mesmo código/OP, a quantidade será somada com
              histórico de auditoria preservado.
            </AlertDescription>
          </Alert>

          {/* Opção de lote: única solicitação ou por setor */}
          {validItems.length > 1 && (
            <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 space-y-2">
              <Label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Opção de Organização no Hub:
              </Label>
              <RadioGroup
                value={groupingMode}
                onValueChange={(val: 'single' | 'by_sector') => setGroupingMode(val)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"
              >
                <div className="flex items-center space-x-2 border rounded-md p-2 bg-white dark:bg-slate-950 cursor-pointer">
                  <RadioGroupItem value="by_sector" id="mode-sector" />
                  <label htmlFor="mode-sector" className="cursor-pointer">
                    <span className="font-semibold block">
                      Solicitações por Setor ({sectorsCount} setores)
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Mantém o setor original do item (Montagem, Fabricação, etc.)
                    </span>
                  </label>
                </div>
                <div className="flex items-center space-x-2 border rounded-md p-2 bg-white dark:bg-slate-950 cursor-pointer">
                  <RadioGroupItem value="single" id="mode-single" />
                  <label htmlFor="mode-single" className="cursor-pointer">
                    <span className="font-semibold block">Solicitação Unificada (Suprimentos)</span>
                    <span className="text-[11px] text-muted-foreground">
                      Direciona todos os itens em lote para o setor Suprimentos
                    </span>
                  </label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Lista com o que exatamente será criado */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Itens que serão encaminhados ({validItems.length}):</span>
              <span className="text-[11px] text-muted-foreground">
                Status inicial: Pendente (Fila de Triagem)
              </span>
            </div>

            <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b text-[11px] font-semibold sticky top-0">
                  <tr>
                    <th className="py-2 px-2.5">Código</th>
                    <th className="py-2 px-2.5">Descrição</th>
                    <th className="py-2 px-2.5">Setor</th>
                    <th className="py-2 px-2.5 text-right">Qtd (Diferença)</th>
                    <th className="py-2 px-2.5">Separação / OPs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {validItems.map((target, idx) => (
                    <tr key={`${target.item.code}-${idx}`} className="hover:bg-slate-50/60">
                      <td className="py-2 px-2.5 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap notranslate">
                        <div className="flex items-center gap-1.5">
                          <NoTranslate text={target.item.code} />
                          {codeRegisteredMap[target.item.code] === false && (
                            <Badge
                              variant="destructive"
                              className="text-[9px] py-0 px-1 bg-amber-600 text-white"
                              title="Código não cadastrado no Cadastro Unificado"
                            >
                              Não cadastrado
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td
                        className="py-2 px-2.5 max-w-[200px] truncate notranslate"
                        title={target.item.description}
                      >
                        <NoTranslate text={target.item.description} />
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px] py-0">
                          {groupingMode === 'by_sector' ? target.item.sector : 'Suprimentos'}
                        </Badge>
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                        +{target.item.difference} {target.item.unit}
                      </td>
                      <td
                        className="py-2 px-2.5 text-[11px] text-slate-500 max-w-[150px] truncate"
                        title={target.item.involvedOps.map((o) => `OP ${o.opNumber}`).join(', ')}
                      >
                        {target.separationSeq ? `Sep #${target.separationSeq}` : 'Sep'} ·{' '}
                        {target.item.involvedOps.length} OP(s)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirmSend}
            disabled={submitting || validItems.length === 0 || unmappedUniqueCodes.length > 0}
            className={`text-xs gap-1.5 font-semibold ${
              unmappedUniqueCodes.length > 0
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-slate-800'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
            title={
              unmappedUniqueCodes.length > 0
                ? 'Cadastre os componentes ausentes antes de enviar ao Hub'
                : 'Enviar solicitações ao Hub'
            }
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {unmappedUniqueCodes.length > 0
              ? `Bloqueado (${unmappedUniqueCodes.length} código(s) ausente(s))`
              : `Confirmar e Enviar ${validItems.length} item(ns) ao Hub`}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Diálogo de Cadastro com Pré-Preenchimento e Confirmação do Gestor */}
      <CreateComponentDialog
        open={registerModalOpen}
        onOpenChange={setRegisterModalOpen}
        categories={categories}
        initialValues={registerInitialValues || undefined}
        onCreated={handleComponentCreated}
      />
    </Dialog>
  )
}
