import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { NoTranslate } from '@/components/NoTranslate'
import { MessageSquare, HelpCircle, Info, Loader2, Send, Check } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { MessageType, MessageSector, PcpOrder } from '@/types'
import { createOrderMessage } from '@/services/pcp-order-messages'
import { scheduleDebouncedReload } from '@/services/pcp-order-messages-store'
import { getUserSector } from '@/lib/message-sector'

export interface SeparationOpOption {
  orderId: string
  opNumber: string
}

export interface SeparationMessageModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Dados do componente sobre o qual a mensagem está sendo enviada */
  itemCode?: string
  itemDescription: string
  sectorName?: string
  /** OPs disponíveis para o item (do rateio / vinculadas ao setor) */
  opOptions: SeparationOpOption[]
  /** Callback opcional de sucesso */
  onSuccess?: () => void
}

export function SeparationMessageModal({
  open,
  onOpenChange,
  itemCode,
  itemDescription,
  sectorName,
  opOptions,
  onSuccess,
}: SeparationMessageModalProps) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [messageType, setMessageType] = useState<MessageType>('Pergunta')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  // Inicializar seleção de OPs quando o modal abre ou muda de item
  useEffect(() => {
    if (open) {
      setContent('')
      setMessageType('Pergunta')
      if (opOptions.length === 1) {
        // Se item tem apenas 1 OP, seleciona diretamente
        setSelectedOrderIds([opOptions[0].orderId])
      } else if (opOptions.length > 1) {
        // Se multi-OP, pré-seleciona todas ou a primeira para conveniência
        setSelectedOrderIds(opOptions.map((o) => o.orderId))
      } else {
        setSelectedOrderIds([])
      }
    }
  }, [open, opOptions])

  const toggleOpSelection = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      if (prev.includes(orderId)) {
        // Mantém pelo menos 1 selecionada se for a única marcada
        if (prev.length === 1) return prev
        return prev.filter((id) => id !== orderId)
      } else {
        return [...prev, orderId]
      }
    })
  }

  const handleSelectAllOps = () => {
    setSelectedOrderIds(opOptions.map((o) => o.orderId))
  }

  const handleSend = async () => {
    const trimmed = content.trim()
    if (!trimmed) {
      toast({
        title: 'Mensagem vazia',
        description: 'Digite o conteúdo da mensagem para o PCP.',
        variant: 'destructive',
      })
      return
    }

    if (selectedOrderIds.length === 0) {
      toast({
        title: 'Selecione pelo menos uma OP',
        description: 'Escolha a OP de destino para vincular à conversa.',
        variant: 'destructive',
      })
      return
    }

    const currentUserId = pb.authStore.record?.id
    if (!currentUserId) {
      toast({
        title: 'Usuário não autenticado',
        description: 'Faça login novamente para enviar mensagens.',
        variant: 'destructive',
      })
      return
    }

    setSending(true)
    try {
      const currentUser = pb.authStore.record
      // Setor do usuário ou fallback do setor da BOM ou 'Operador'
      const detectedSector = getUserSector(currentUser as any)
      const messageSector: MessageSector = detectedSector !== 'pcp' ? detectedSector : 'Operador'

      // Contexto automático do componente no cabeçalho da mensagem
      const componentPrefix = itemCode
        ? `[Componente: ${itemCode} - ${itemDescription}]`
        : `[Componente: ${itemDescription}]`
      const fullContent = `${componentPrefix}\n${trimmed}`

      const payloadStatus = messageType === 'Pergunta' ? 'Pendente' : undefined

      // Se múltiplas OPs foram selecionadas, cria uma mensagem em cada OP para entrar na conversa correspondente
      await Promise.all(
        selectedOrderIds.map((orderId) =>
          createOrderMessage({
            order_id: orderId,
            user_id: currentUserId,
            content: fullContent,
            sector: messageSector,
            type: messageType,
            status: payloadStatus,
            read: false,
          }),
        ),
      )

      // Agenda recarga em segundo plano do store central de mensagens
      scheduleDebouncedReload(200)

      const targetCount = selectedOrderIds.length
      toast({
        title: 'Mensagem enviada ao PCP!',
        description:
          targetCount === 1
            ? 'A mensagem foi registrada na conversa da OP e já está visível para o PCP responder.'
            : `A mensagem foi registrada na conversa de ${targetCount} OPs selecionadas para o PCP responder.`,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err: any) {
      console.error('Erro ao enviar mensagem da OP:', err)
      toast({
        title: 'Erro ao enviar mensagem',
        description: err.message || 'Não foi possível registrar a mensagem.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const isMultiOp = opOptions.length > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Mensagem para o PCP
              </DialogTitle>
              <DialogDescription className="text-xs">
                Envie dúvidas, correções de quantidade ou solicitações de alteração da BOM.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 overflow-y-auto pr-1 text-xs">
          {/* Card com os dados do componente em questão */}
          <div className="p-2.5 rounded-lg bg-muted/60 border space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide block">
              Componente da Separação:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {itemCode ? (
                <NoTranslate
                  as="span"
                  className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-muted text-foreground border"
                >
                  {itemCode}
                </NoTranslate>
              ) : (
                <span className="italic text-muted-foreground">s/ código</span>
              )}
              <NoTranslate as="span" className="font-semibold text-foreground text-xs">
                {itemDescription}
              </NoTranslate>
            </div>
            {sectorName && (
              <div className="text-[11px] text-muted-foreground pt-0.5">
                Setor: <strong>{sectorName}</strong>
              </div>
            )}
          </div>

          {/* Seleção de OPs destinatárias */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                {isMultiOp ? 'OP(s) Destinatária(s):' : 'OP Destinatária:'}
              </Label>
              {isMultiOp && (
                <button
                  type="button"
                  onClick={handleSelectAllOps}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Selecionar todas ({opOptions.length})
                </button>
              )}
            </div>

            {opOptions.length === 0 ? (
              <div className="text-muted-foreground italic text-[11px] p-2 bg-muted/40 rounded border">
                Nenhuma OP associada ao item.
              </div>
            ) : isMultiOp ? (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-muted/40 border">
                {opOptions.map((op) => {
                  const isSelected = selectedOrderIds.includes(op.orderId)
                  return (
                    <button
                      key={op.orderId}
                      type="button"
                      onClick={() => toggleOpSelection(op.orderId)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono font-medium transition-all border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-card text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      <span>
                        {op.opNumber.startsWith('OP') ? op.opNumber : `OP ${op.opNumber}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-muted/40 border">
                <Badge variant="secondary" className="font-mono text-xs px-2 py-0.5">
                  {opOptions[0].opNumber.startsWith('OP')
                    ? opOptions[0].opNumber
                    : `OP ${opOptions[0].opNumber}`}
                </Badge>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              {isMultiOp
                ? 'A mensagem será incluída na conversa da OP para o PCP responder.'
                : 'A mensagem será vinculada diretamente à conversa desta OP.'}
            </p>
          </div>

          {/* Tipo da Mensagem: Pergunta vs Informação */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Tipo da Mensagem:</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMessageType('Pergunta')}
                className={`p-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                  messageType === 'Pergunta'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-900 dark:text-amber-300 font-bold shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                <HelpCircle className="h-4 w-4 text-amber-600" />
                <span>Pergunta (requer resposta)</span>
              </button>

              <button
                type="button"
                onClick={() => setMessageType('Informação')}
                className={`p-2 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                  messageType === 'Informação'
                    ? 'bg-blue-500/15 border-blue-500 text-blue-900 dark:text-blue-300 font-bold shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                <Info className="h-4 w-4 text-blue-600" />
                <span>Apenas Informação</span>
              </button>
            </div>
          </div>

          {/* Campo de texto da mensagem */}
          <div className="space-y-1.5">
            <Label htmlFor="msgContent" className="text-xs font-semibold text-foreground">
              Mensagem para o PCP:
            </Label>
            <Textarea
              id="msgContent"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Ex: Esse produto não é mais usado, precisa tirar da OP. Ou: Esse componente não são mais 12 peças, apenas 4, favor atualizar."
              className="text-xs resize-none"
              autoFocus
            />
            {/* Exemplos de uso rápido */}
            <div className="flex flex-wrap gap-1 pt-1">
              <span className="text-[10px] text-muted-foreground block w-full">
                Sugestões rápidas:
              </span>
              <button
                type="button"
                onClick={() => setContent('Esse produto não é mais usado, precisa tirar da OP.')}
                className="text-[10px] px-2 py-0.5 rounded bg-muted/80 hover:bg-muted border text-muted-foreground hover:text-foreground transition-colors"
              >
                Não é mais usado (tirar da OP)
              </button>
              <button
                type="button"
                onClick={() =>
                  setContent('Quantidade na BOM divergente do projeto físico, favor atualizar.')
                }
                className="text-[10px] px-2 py-0.5 rounded bg-muted/80 hover:bg-muted border text-muted-foreground hover:text-foreground transition-colors"
              >
                Qtd na BOM divergente
              </button>
              <button
                type="button"
                onClick={() =>
                  setContent(
                    'Medida de corte ou especificação técnica com dúvida, favor verificar.',
                  )
                }
                className="text-[10px] px-2 py-0.5 rounded bg-muted/80 hover:bg-muted border text-muted-foreground hover:text-foreground transition-colors"
              >
                Dúvida na especificação
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold"
            onClick={handleSend}
            disabled={sending || !content.trim() || selectedOrderIds.length === 0}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Enviar para o PCP</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
