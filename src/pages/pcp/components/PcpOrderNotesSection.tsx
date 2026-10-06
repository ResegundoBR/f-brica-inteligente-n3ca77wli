import React, { useEffect, useState, useCallback } from 'react'
import { format, isValid } from 'date-fns'
import { FileText, Loader2, Plus, StickyNote } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import type { PcpOrderNote } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { NoTranslate } from '@/components/NoTranslate'

interface PcpOrderNotesSectionProps {
  orderId: string
}

export const PcpOrderNotesSection: React.FC<PcpOrderNotesSectionProps> = ({ orderId }) => {
  const { user } = useAuth()
  const { toast } = useToast()

  const [notes, setNotes] = useState<PcpOrderNote[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchNotes = useCallback(async () => {
    if (!orderId) {
      setNotes([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const records = await pb.collection('pcp_order_notes').getFullList<PcpOrderNote>({
        filter: `order_id = "${orderId}"`,
        sort: '-created',
        expand: 'created_by',
      })
      setNotes(records)
    } catch (err) {
      console.error('Erro ao buscar anotações da OP:', err)
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as anotações.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [orderId, toast])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleAddNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || submitting) return

    try {
      setSubmitting(true)
      const created = await pb.collection('pcp_order_notes').create<PcpOrderNote>(
        {
          order_id: orderId,
          content: trimmed,
          created_by: user?.id || null,
        },
        {
          expand: 'created_by',
        },
      )

      // Inclusão otimista com o objeto criado expandido
      // Caso expand não venha preenchido e user exista, podemos montar fallback
      const enriched: PcpOrderNote = {
        ...created,
        expand: created.expand?.created_by
          ? created.expand
          : {
              ...created.expand,
              created_by: user ? (user as any) : undefined,
            },
      }

      setNotes((prev) => [enriched, ...prev])
      setContent('')
      toast({
        title: 'Anotação adicionada',
        description: 'Registro gravado com sucesso.',
      })
    } catch (err) {
      console.error('Erro ao salvar anotação da OP:', err)
      toast({
        title: 'Erro ao gravar anotação',
        description: 'Não foi possível salvar a anotação. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const formatNoteDate = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return isValid(d) ? format(d, 'dd/MM/yyyy HH:mm') : '-'
  }

  return (
    <div className="col-span-2 mt-4 space-y-3 p-3.5 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="size-4 text-amber-600 dark:text-amber-400" />
          <h4 className="font-semibold text-sm text-foreground">Anotações</h4>
          <Badge variant="secondary" className="text-xs h-5 px-1.5 font-normal">
            {notes.length}
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        <Textarea
          placeholder="Digite uma anotação, ponto discutido ou informação importante para esta OP..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={submitting}
          className="min-h-[70px] resize-y text-xs sm:text-sm notranslate bg-background"
          translate="no"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              handleAddNote()
            }
          }}
        />
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            Pressione <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] border">Ctrl</kbd> +{' '}
            <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] border">Enter</kbd> para salvar
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => handleAddNote()}
            disabled={!content.trim() || submitting}
            className="h-8 text-xs gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Plus className="size-3.5" />
                Adicionar
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="pt-2 border-t space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            Carregando anotações...
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground space-y-1 bg-muted/20 rounded-md border border-dashed border-muted">
            <FileText className="size-6 text-muted-foreground/50 mb-1" />
            <p className="text-xs font-medium">Nenhuma anotação cadastrada para esta OP.</p>
            <p className="text-[11px] text-muted-foreground/80 max-w-xs">
              Use o campo acima para manter o histórico de alinhamentos e observações livres da OP.
            </p>
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2.5">
            {notes.map((note) => {
              const authorName =
                note.expand?.created_by?.name ||
                note.expand?.created_by?.email ||
                'Usuário não identificado'
              return (
                <div
                  key={note.id}
                  className="p-3 rounded-md text-xs sm:text-sm border bg-slate-50/70 dark:bg-slate-900/40 text-foreground flex flex-col gap-1.5 shadow-sm"
                >
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/50 pb-1">
                    <span className="font-medium text-foreground/90 truncate max-w-[60%]">
                      {authorName}
                    </span>
                    <span className="shrink-0 font-mono text-[10px]">
                      {formatNoteDate(note.created)}
                    </span>
                  </div>
                  <NoTranslate
                    as="div"
                    className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground"
                  >
                    {note.content}
                  </NoTranslate>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
export default PcpOrderNotesSection
