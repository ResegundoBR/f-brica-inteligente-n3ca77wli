import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Send } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { ProductProcessModel } from '@/types'

interface Props {
  process: ProductProcessModel
  productId: string
}

export function ProcessObservationCard({ process, productId }: Props) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [observation, setObservation] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!observation.trim()) {
      toast({ title: 'Digite uma observação', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      await pb.collection('revision_points').create({
        product_id: productId,
        user_id: user?.id,
        description: `[Processo: ${process.name}] ${observation.trim()}`,
        resolved: false,
      })
      toast({
        title: 'Observação enviada com sucesso!',
        description: 'A engenharia foi notificada.',
      })
      setObservation('')
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar observação',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const images = Array.isArray(process.image) ? process.image : process.image ? [process.image] : []

  return (
    <Card
      className="p-4 space-y-3"
      style={{ borderLeftColor: process.color || '#94a3b8', borderLeftWidth: '4px' }}
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
          {process.order || '-'}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">{process.name}</h4>
          {process.description && (
            <p className="text-sm text-muted-foreground mt-1">{process.description}</p>
          )}
        </div>
        {process.kanban_stage && (
          <Badge variant="outline" className="shrink-0 text-xs">
            {process.kanban_stage}
          </Badge>
        )}
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img: string, i: number) => (
            <img
              key={i}
              src={pb.files.getUrl(process, img) as string}
              alt={`Processo ${i + 1}`}
              className="w-16 h-16 object-cover rounded-md border"
            />
          ))}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t">
        <label className="text-xs font-medium text-muted-foreground">Observações da Fábrica</label>
        <Textarea
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          placeholder="Descreva discrepâncias, não conformidades ou dúvidas..."
          className="min-h-[70px] text-sm"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !observation.trim()}>
            <Send className="mr-2 h-3 w-3" /> {submitting ? 'Enviando...' : 'Enviar Observação'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
