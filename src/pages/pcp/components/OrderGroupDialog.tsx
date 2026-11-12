import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { NoTranslate } from '@/components/NoTranslate'

/**
 * Dialog "Agrupar em um Grupo" da Rentabilidade Especiais.
 * - Campo vazio + confirmar = REMOVE a etiqueta (desagrupa).
 * - Nome preenchido = grava `order_group` igual em todas as OPs selecionadas.
 * Sugerido como nome inicial: rótulo comum (ex.: "Associação — Living + Concept").
 */
export function OrderGroupDialog({
  open,
  onOpenChange,
  selectedCount,
  initialName = '',
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  /** Nome atual do grupo (quando todas as OPs selecionadas já têm a mesma etiqueta) */
  initialName?: string
  onConfirm: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const trimmed = name.trim()
  const isRemoval = trimmed === ''

  const handleConfirm = async () => {
    setSubmitting(true)
    setError('')
    try {
      await onConfirm(trimmed)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gravar o grupo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isRemoval ? (
              <>
                Remover agrupamento de <NoTranslate>{selectedCount}</NoTranslate> OP
                {selectedCount > 1 ? 's' : ''}
              </>
            ) : (
              <>
                Agrupar <NoTranslate>{selectedCount}</NoTranslate> OP
                {selectedCount > 1 ? 's' : ''} em um Grupo
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isRemoval
              ? 'Deixe o campo vazio para remover a etiqueta de grupo das OPs selecionadas. Elas voltam a aparecer como linhas individuais no modo Por Grupo.'
              : 'As OPs selecionadas passam a ser consolidadas como um único negócio no modo "Por Grupo", com custos lançados no grupo. Deixe o campo vazio para remover a etiqueta.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="order-group-name" className="text-xs font-semibold">
            Nome do Grupo
          </Label>
          <Input
            id="order-group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Associação — Living + Concept"
            className="h-9 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !submitting) {
                e.preventDefault()
                handleConfirm()
              }
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button size="sm" disabled={submitting} onClick={handleConfirm}>
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {isRemoval ? 'Remover etiqueta' : 'Agrupar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
