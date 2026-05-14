import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { ChevronUp, ChevronDown, Edit2, X, MessageSquare } from 'lucide-react'
import { LearningStep } from '@/types'
import pb from '@/lib/pocketbase/client'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'

interface Props {
  step: LearningStep
  idx: number
  isFirst: boolean
  isLast: boolean
  onMove: (stepId: string, direction: 'up' | 'down') => void
}

export function LearningStepCard({ step, idx, isFirst, isLast, onMove }: Props) {
  const { user: currentUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [editDesc, setEditDesc] = useState(step.description)
  const [editFile, setEditFile] = useState<File | null>(null)

  const [expandedComments, setExpandedComments] = useState(false)
  const [commentText, setCommentText] = useState('')

  const comments =
    step.expand?.learning_step_comments_via_step_id
      ?.slice()
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()) || []

  const handleSaveEdit = async () => {
    try {
      const formData = new FormData()
      formData.append('description', editDesc)
      if (editFile) formData.append('image', editFile)
      await pb.collection('learning_steps').update(step.id, formData)
      setEditing(false)
      toast.success('Etapa atualizada')
    } catch (e) {
      toast.error('Erro ao atualizar etapa')
    }
  }

  const handlePostComment = async () => {
    if (!commentText.trim()) return
    try {
      await pb.collection('learning_step_comments').create({
        step_id: step.id,
        user_id: currentUser?.id,
        content: commentText.trim(),
      })
      setCommentText('')
    } catch (e) {
      toast.error('Erro ao postar comentário')
    }
  }

  if (editing) {
    return (
      <div className="relative flex items-start group">
        <div className="flex flex-col items-center shrink-0 w-8 h-8 rounded-full bg-primary/10 border-2 border-background text-primary text-xs font-bold justify-center z-10 mr-4">
          {idx + 1}
        </div>
        <div className="flex-1 border border-primary/40 rounded-lg p-4 bg-primary/5 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold text-sm text-primary">Editando Etapa {idx + 1}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setEditing(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            className="mb-3 text-sm min-h-[80px]"
          />
          <div className="flex flex-col gap-2 mb-4">
            <span className="text-xs font-semibold text-muted-foreground">
              Nova Imagem (opcional)
            </span>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setEditFile(e.target.files?.[0] || null)}
              className="text-xs h-9"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveEdit}>
              Salvar Alterações
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex items-start group">
      <div className="flex flex-col items-center shrink-0 w-8 h-8 rounded-full bg-primary/10 border-2 border-background text-primary text-xs font-bold justify-center z-10 mr-4">
        {idx + 1}
      </div>
      <div className="flex-1 border rounded-lg p-4 bg-background shadow-sm relative group/card flex flex-col">
        <div className="absolute right-2 top-2 opacity-0 group-hover/card:opacity-100 transition-opacity flex bg-background/80 backdrop-blur rounded border shadow-sm z-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onMove(step.id, 'up')}
            disabled={isFirst}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onMove(step.id, 'down')}
            disabled={isLast}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setEditing(true)
              setEditDesc(step.description)
              setEditFile(null)
            }}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex-1">
            <p className="text-sm whitespace-pre-wrap">{step.description}</p>
          </div>
          {step.image && (
            <div className="w-full md:w-32 h-32 rounded-md overflow-hidden bg-muted/50 shrink-0">
              <img
                src={pb.files.getUrl(step, step.image)}
                alt={`Passo ${idx + 1}`}
                className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                onClick={() => window.open(pb.files.getUrl(step, step.image!), '_blank')}
              />
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-border/40">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => setExpandedComments(!expandedComments)}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            {comments.length} {comments.length === 1 ? 'Comentário' : 'Comentários'}
          </Button>

          {expandedComments && (
            <div className="mt-3 space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar className="w-6 h-6 mt-0.5">
                    <AvatarImage
                      src={pb.files.getUrl(c.expand?.user_id, c.expand?.user_id?.avatar)}
                    />
                    <AvatarFallback className="text-[10px]">
                      {c.expand?.user_id?.name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted/40 rounded-md p-2 text-sm flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs">
                        {c.expand?.user_id?.name || 'Usuário'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.created).toLocaleString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{c.content}</p>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 items-center pt-1">
                <Input
                  placeholder="Escreva um comentário..."
                  className="h-8 text-sm"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePostComment()
                  }}
                />
                <Button size="sm" className="h-8" onClick={handlePostComment}>
                  Enviar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
