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
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sliders, CheckCircle2, Loader2, Info } from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'
import type { SeparationAuditItem } from '@/services/pcp-separation-bom-audit'

interface AdjustShortageQuantityModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: SeparationAuditItem | null
  separationSeq?: number
  separationTitle?: string
  onSuccess: () => void
}

export function AdjustShortageQuantityModal({
  open,
  onOpenChange,
  item,
  separationSeq,
  separationTitle,
  onSuccess,
}: AdjustShortageQuantityModalProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [adjustedQty, setAdjustedQty] = useState<number>(0)

  // Identificar o registro existente prioritário de material_shortages
  const existingShortage =
    item?.existingShortages && item.existingShortages.length > 0 ? item.existingShortages[0] : null

  const currentQuantity = existingShortage ? Number(existingShortage.quantity) || 0 : 0
  const currentReceived = existingShortage ? Number(existingShortage.received_quantity) || 0 : 0
  const expectedMissing = item
    ? Math.round((item.expectedQuantity - item.separatedQuantity) * 10000) / 10000
    : 0

  const suggestedQuantity =
    currentReceived > 0
      ? Math.max(expectedMissing, currentReceived + (item ? item.difference : 0))
      : expectedMissing

  // Resetar ao abrir
  useEffect(() => {
    if (item) {
      setAdjustedQty(suggestedQuantity)
    }
  }, [item, suggestedQuantity])

  if (!item) return null

  const handleConfirmAdjust = async () => {
    if (!existingShortage) {
      toast({
        title: 'Registro não localizado',
        description: 'Não foi encontrado o registro de falta correspondente em material_shortages.',
        variant: 'destructive',
      })
      return
    }

    if (adjustedQty <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'A quantidade ajustada deve ser maior que zero.',
        variant: 'destructive',
      })
      return
    }

    if (currentReceived > 0 && adjustedQty < currentReceived) {
      toast({
        title: 'Quantidade menor que o já recebido',
        description: `O registro já possui ${currentReceived} ${item.unit} recebido(s). A quantidade total não pode ser inferior ao recebido.`,
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const userLabel = user?.name || user?.email || 'Auditoria BOM'
      const nowStr =
        new Date().toLocaleDateString('pt-BR') +
        ' ' +
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      const sepLabel = separationSeq
        ? `Separação #${separationSeq}`
        : separationTitle || 'Separação'

      const auditObs = `Ajustado via Auditoria BOM (${sepLabel}) por ${userLabel} em ${nowStr}: Qtd anterior ${currentQuantity} → ${adjustedQty} (Esperado ${item.expectedQuantity} - Separado ${item.separatedQuantity}, Recebido mantido em ${currentReceived})`
      const fullObs = existingShortage.observation
        ? `${existingShortage.observation} | ${auditObs}`
        : auditObs

      // Atualizar o registro existente SEM NUNCA DUPLICAR
      await pb.collection('material_shortages').update(existingShortage.id, {
        quantity: adjustedQty,
        observation: fullObs,
      })

      toast({
        title: 'Quantidade ajustada com sucesso!',
        description: `O registro ${existingShortage.id} foi atualizado para ${adjustedQty} ${item.unit} com observação de auditoria preservada.`,
      })

      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      console.error('Erro ao ajustar quantidade da falta:', err)
      toast({
        title: 'Erro ao ajustar quantidade',
        description: err.message || 'Falha ao atualizar o registro no banco de dados.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Sliders className="size-5" />
            Ajustar Quantidade da Solicitação de Falta
          </DialogTitle>
          <DialogDescription className="text-xs">
            Esta ação atualiza o registro de falta <strong>já existente</strong> no banco de dados
            para cobrir a demanda completa da BOM, sem nunca duplicar registros.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Alerta de Auditoria */}
          <Alert className="bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 text-xs py-2">
            <Info className="size-4 text-amber-600 shrink-0" />
            <AlertDescription className="text-slate-700 dark:text-slate-300 ml-2">
              Classificação: <strong>FALTA A MENOR</strong>. A solicitação existente foi registrada
              com quantidade insuficiente para cobrir o que falta ser separado.
            </AlertDescription>
          </Alert>

          {/* Dados do Item e Registro Existente */}
          <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/60 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <span className="text-muted-foreground block text-[11px]">Componente</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 notranslate">
                  <NoTranslate text={item.code} />
                </span>
                <span className="ml-2 font-medium text-slate-700 dark:text-slate-300 notranslate">
                  <NoTranslate text={item.description} />
                </span>
              </div>
              <Badge variant="outline" className="font-semibold">
                {item.sector}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2 rounded bg-white dark:bg-slate-950 border">
                <span className="text-[10px] text-muted-foreground block uppercase font-semibold">
                  Esperado (BOM)
                </span>
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                  {item.expectedQuantity} {item.unit}
                </span>
              </div>

              <div className="p-2 rounded bg-white dark:bg-slate-950 border">
                <span className="text-[10px] text-muted-foreground block uppercase font-semibold">
                  Separado Real
                </span>
                <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                  {item.separatedQuantity} {item.unit}
                </span>
              </div>

              <div className="p-2 rounded bg-white dark:bg-slate-950 border">
                <span className="text-[10px] text-muted-foreground block uppercase font-semibold">
                  Falta Registrada Atual
                </span>
                <span className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400">
                  {currentQuantity} {item.unit}
                </span>
              </div>
            </div>

            {existingShortage && (
              <div className="pt-2 text-[11px] text-slate-600 dark:text-slate-400 border-t space-y-1">
                <div className="flex items-center justify-between">
                  <span>ID do Registro Existente:</span>
                  <code className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {existingShortage.id}
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span>Status Atual no Hub:</span>
                  <Badge variant="secondary" className="text-[10px] py-0">
                    {existingShortage.status}
                  </Badge>
                </div>
                {currentReceived > 0 && (
                  <div className="flex items-center justify-between font-semibold text-blue-600 dark:text-blue-400">
                    <span>Quantidade já Recebida (preservada):</span>
                    <span>
                      {currentReceived} {item.unit}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Campo de Ajuste de Quantidade */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="adjust-qty"
                className="text-xs font-bold text-slate-800 dark:text-slate-200"
              >
                Nova Quantidade Total da Solicitação:
              </Label>
              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                Sugerido: {suggestedQuantity} {item.unit}
              </span>
            </div>
            <div className="relative">
              <Input
                id="adjust-qty"
                type="number"
                step="0.01"
                min={currentReceived > 0 ? currentReceived : 0.01}
                value={adjustedQty}
                onChange={(e) => setAdjustedQty(Number(e.target.value) || 0)}
                className="font-mono font-bold text-base h-10"
              />
              <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-mono">
                {item.unit}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A quantidade atual ({currentQuantity} {item.unit}) será atualizada para{' '}
              <strong>
                {adjustedQty} {item.unit}
              </strong>
              . O histórico conterá a observação de auditoria automática.
            </p>
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
            onClick={handleConfirmAdjust}
            disabled={submitting || !existingShortage || adjustedQty <= 0}
            className="text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5 font-semibold"
          >
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Confirmar Ajuste para {adjustedQty} {item.unit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
