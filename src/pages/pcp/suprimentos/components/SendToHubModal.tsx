import React, { useState } from 'react'
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
import { Send, CheckCircle2, AlertTriangle, Loader2, Info } from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { upsertMaterialShortage } from '@/services/material-shortages'
import type { SeparationAuditItem } from '@/services/pcp-separation-bom-audit'

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
  onSuccess: () => void
}

export function SendToHubModal({
  open,
  onOpenChange,
  targetItems,
  onSuccess,
}: SendToHubModalProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  // 'single': Uma única solicitação com setor consolidado/geral
  // 'by_sector': Solicitações separadas por setor
  const [groupingMode, setGroupingMode] = useState<'single' | 'by_sector'>('by_sector')

  if (!targetItems || targetItems.length === 0) return null

  // Itens válidos (com diferença > 0)
  const validItems = targetItems.filter((t) => t.item.difference > 0)

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
            errors.push(`${item.code}: ${itemErr.message || 'Falha ao gravar'}`)
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

            let opDiff = Math.round(item.difference * ratio * 10000) / 10000
            if (isLast) {
              // Ajusta arredondamento na última parcela para fechar exatamente a diferença total
              opDiff = Math.round((item.difference - allocatedDiffAcc) * 10000) / 10000
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
              errors.push(
                `${item.code} (OP ${op.opNumber}): ${itemErr.message || 'Falha ao gravar'}`,
              )
            }
          }
        }
      }

      if (errors.length > 0) {
        toast({
          title: 'Envio parcial ao Hub',
          description: `${createdCount + updatedCount} processados com sucesso, mas ${errors.length} falharam.`,
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
                        <NoTranslate text={target.item.code} />
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
            disabled={submitting || validItems.length === 0}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 font-semibold"
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Confirmar e Enviar {validItems.length} item(ns) ao Hub
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
