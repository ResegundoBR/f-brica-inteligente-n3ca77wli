import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar, Trash2 } from 'lucide-react'

interface PromisedDateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentDate?: string | null
  currentNote?: string | null
  opIdentifier: string
  isEmergencyContext?: boolean
  onConfirm: (data: { promised_date: string | null; promised_note: string }) => Promise<void>
}

export function PromisedDateModal({
  open,
  onOpenChange,
  currentDate,
  currentNote,
  opIdentifier,
  isEmergencyContext = false,
  onConfirm,
}: PromisedDateModalProps) {
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // Normalizar formato da data para YYYY-MM-DD para o <input type="date">
      const initialDate = currentDate ? currentDate.split('T')[0].split(' ')[0] : ''
      setDate(initialDate)
      setNote(currentNote || '')
      setError(null)
    }
  }, [open, currentDate, currentNote])

  const handleSubmit = async (clear = false) => {
    if (clear) {
      setSubmitting(true)
      try {
        await onConfirm({ promised_date: null, promised_note: '' })
        onOpenChange(false)
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (!date) {
      setError('A data prometida é obrigatória.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await onConfirm({
        promised_date: date,
        promised_note: note.trim(),
      })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
            <span className="text-xl">🎯</span>
            {isEmergencyContext ? 'Definir Prazo Máximo da Emergência' : 'Definir Data Prometida'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEmergencyContext ? (
              <>
                Ao ativar <strong className="text-red-600">🚨 Emergência</strong> na OP{' '}
                <span className="font-semibold text-foreground">{opIdentifier}</span>, é obrigatório
                informar a data máxima para finalização.
              </>
            ) : (
              <>
                Informe a nova data combinada com o cliente ou prazo renegociado para{' '}
                <span className="font-semibold text-foreground">{opIdentifier}</span>. O prazo
                original da OP é preservado para histórico de atrasos.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit(false)
          }}
          className="space-y-4 py-2"
        >
          <div className="space-y-1.5">
            <Label
              htmlFor="promised-date"
              className="text-xs font-semibold flex items-center gap-1.5"
            >
              <Calendar className="size-3.5 text-primary" />
              Data Prometida / Máxima *
            </Label>
            <Input
              id="promised-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                if (error) setError(null)
              }}
              required
              className="h-10 text-sm"
              autoFocus
            />
            {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="promised-note" className="text-xs font-semibold">
              Observação / Motivo (opcional)
            </Label>
            <Textarea
              id="promised-note"
              placeholder="Ex.: Combinado com cliente via WhatsApp; aguardando pintura especial..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="text-xs resize-none"
            />
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            {!isEmergencyContext && currentDate && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={submitting}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 sm:mr-auto"
                onClick={() => handleSubmit(true)}
              >
                <Trash2 className="size-3.5 mr-1" />
                Remover data prometida
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !date}
              className={isEmergencyContext ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
            >
              {submitting ? 'Salvando...' : 'Salvar Data Prometida'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
