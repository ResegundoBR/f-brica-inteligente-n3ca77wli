import { Badge } from '@/components/ui/badge'
import { Sparkles } from 'lucide-react'

export function NovoBadge() {
  return (
    <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-[10px] px-1.5 py-0 h-5 gap-0.5">
      <Sparkles className="w-2.5 h-2.5" />
      Novo
    </Badge>
  )
}
