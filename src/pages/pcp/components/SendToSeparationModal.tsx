import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Package, Send, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { CompiledMaterialItem } from '@/services/pcp-programacao'
import { createSeparation, SeparationItem } from '@/services/material-separations'
import { createProgramacao, ProgramacaoOrderItem } from '@/services/pcp-programacoes'
import { PcpOrder } from '@/types'
import { toast } from '@/hooks/use-toast'

interface SendToSeparationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  compiledItems: CompiledMaterialItem[]
  selectedOps: string[]
  selectedOrderIds: string[]
  selectedOrders?: PcpOrder[]
  onSuccess?: () => void
}

export function SendToSeparationModal({
  open,
  onOpenChange,
  compiledItems,
  selectedOps,
  selectedOrderIds,
  selectedOrders = [],
  onSuccess,
}: SendToSeparationModalProps) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const defaultTitle = `Separação - ${selectedOps.length} OPs (${new Date().toLocaleDateString('pt-BR')})`

  const handleConfirm = async () => {
    if (!compiledItems.length) {
      toast({
        title: 'Nenhum item para separar',
        description: 'A lista consolidada de materiais está vazia.',
        variant: 'destructive',
      })
      return
    }

    try {
      setLoading(true)

      // 1. Preparar lista de pedidos no formato exigido:
      // 'Número do pedido — Nome do cliente — Nome do Produto / OP'
      const programacaoOrdersList: ProgramacaoOrderItem[] = selectedOrders.map((ord) => {
        const orderNum = ord.order_number || '-'
        const clientName = ord.expand?.client_id?.name || ord.client_name || 'Cliente não informado'
        const productName =
          ord.op_type === 'Assistência'
            ? ord.manual_product_name || 'Assistência Técnica'
            : ord.op_type === 'Especial'
              ? ord.manual_product_name || 'Produto Especial'
              : ord.expand?.product_id?.name || 'Produto sem nome'
        const opNum = ord.op_number ? `OP ${ord.op_number}` : 'Sem OP'

        const formattedLabel = `${orderNum} — ${clientName} — ${productName} / ${opNum}`

        return {
          order_id: ord.id,
          order_number: orderNum,
          client_name: clientName,
          product_name: productName,
          op_number: ord.op_number || '',
          quantity: ord.quantity || 1,
          formatted_label: formattedLabel,
        }
      })

      const items: SeparationItem[] = compiledItems.map((item, index) => {
        const orderIds =
          item.orderIds && item.orderIds.length > 0 ? item.orderIds : selectedOrderIds
        return {
          id: `item-${index}-${item.key}`,
          code: item.code,
          description: item.description,
          total_quantity: item.totalQuantity,
          unit: item.unit,
          cut_measurement: item.cutMeasurement || null,
          op_numbers: item.orderNumbers,
          order_ids: orderIds,
          status: 'pendente' as const,
        }
      })

      // 2. Criar a separação preliminar
      const createdSep = await createSeparation({
        title: title.trim() || defaultTitle,
        op_numbers: selectedOps,
        order_ids: selectedOrderIds,
        items,
        notes: notes.trim(),
      })

      // 3. Gravar a Programação oficial atrelada à rodada de separação
      const createdProg = await createProgramacao({
        orders_list: programacaoOrdersList,
        compiled_items: compiledItems,
        separation_id: createdSep.id,
        notes: notes.trim(),
      })

      toast({
        title: `${createdProg.name} Criada!`,
        description: `Programação oficial registrada e rodada de separação enviada ao Portal do Operador (${items.length} itens, ${selectedOps.length} OPs).`,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      console.error('Erro ao enviar para separação:', err)
      toast({
        title: 'Erro ao enviar',
        description: 'Não foi possível registrar a rodada de separação.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Enviar para Separação de Materiais</DialogTitle>
              <DialogDescription>Confirmação de envio para o Portal do Operador</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 overflow-hidden flex flex-col">
          {/* Card com resumo das OPs e Itens */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border">
            <div>
              <span className="text-xs text-muted-foreground font-medium block">
                OPs Selecionadas
              </span>
              <span className="text-2xl font-bold text-foreground">{selectedOps.length}</span>
              <div className="flex flex-wrap gap-1 mt-1 max-h-16 overflow-y-auto">
                {selectedOps.map((op) => (
                  <Badge key={op} variant="outline" className="text-xs font-mono">
                    OP {op}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground font-medium block">
                Total de Itens Consolidados
              </span>
              <span className="text-2xl font-bold text-primary">{compiledItems.length}</span>
              <span className="text-xs text-muted-foreground block mt-1">
                Materiais agrupados por código/medida
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title" className="text-xs font-medium">
              Identificação da Rodada (opcional)
            </Label>
            <Input
              id="title"
              placeholder={defaultTitle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-xs font-medium">
              Observações para o Operador (opcional)
            </Label>
            <Input
              id="notes"
              placeholder="Ex.: Rodada prioritária para início de montagem amanhã"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Prévia dos itens que serão enviados */}
          <div className="flex-1 min-h-0 flex flex-col border rounded-lg overflow-hidden">
            <div className="bg-muted px-3 py-2 border-b flex justify-between items-center text-xs font-semibold text-muted-foreground">
              <span>Prévia dos Materiais ({compiledItems.length})</span>
              <span>Qtd Total</span>
            </div>
            <ScrollArea className="flex-1 max-h-48 p-2">
              <div className="space-y-1.5 text-xs">
                {compiledItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
                  >
                    <div className="space-y-0.5 max-w-[75%]">
                      <div className="flex items-center gap-2">
                        {item.code ? (
                          <span className="font-mono font-medium text-foreground">{item.code}</span>
                        ) : (
                          <span className="text-muted-foreground italic">s/ código</span>
                        )}
                        <span className="text-muted-foreground text-[11px] truncate">
                          {item.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>OPs: {item.orderNumbers.join(', ')}</span>
                        {item.cutMeasurement && (
                          <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                            Corte: {item.cutMeasurement}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-foreground">
                        {item.totalQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}{' '}
                        {item.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex items-start gap-2 p-2.5 rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs border border-emerald-500/20">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
            <div>
              Ao clicar em <strong>Confirmar e Enviar</strong>, será gravada uma{' '}
              <strong>Programação oficial</strong> numerada sequencialmente com status{' '}
              <strong>Em produção</strong> e a rodada será enviada para o Portal do Operador.
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleConfirm}
            disabled={loading || !compiledItems.length}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando Rodada...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Confirmar e Enviar para Separação
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
