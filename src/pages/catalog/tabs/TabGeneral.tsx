import { Product } from '@/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '../CatalogList'
import { useAuth } from '@/hooks/use-auth'
import { ImagePlus } from 'lucide-react'

interface Props {
  product: Product
  setProduct: (p: Product) => void
}

export function TabGeneral({ product, setProduct }: Props) {
  const { user } = useAuth()
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Nome do Produto <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={product.name}
              onChange={(e) => setProduct({ ...product, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="details">Detalhes Técnicos</Label>
            <Textarea
              id="details"
              className="min-h-[120px]"
              value={product.details}
              onChange={(e) => setProduct({ ...product, details: e.target.value })}
              placeholder="Informações adicionais do produto..."
            />
          </div>
          <div className="space-y-2">
            <Label>Status Atual</Label>
            <div className="pt-1">
              <StatusBadge status={product.expand?.status || product.status} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Label>Imagens do Produto</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center h-[200px] hover:bg-muted/50 transition-colors cursor-pointer">
              <ImagePlus className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">Renderização / Vista Explodida</span>
              <span className="text-xs text-muted-foreground mt-1">Arraste ou clique</span>
            </div>
            <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center h-[200px] hover:bg-muted/50 transition-colors cursor-pointer bg-muted/20">
              <img
                src="https://img.usecurling.com/p/200/200?q=industrial%20part"
                alt="Real"
                className="h-full w-full object-cover rounded opacity-80 mix-blend-multiply"
              />
              <span className="text-xs font-medium absolute bg-background/80 px-2 py-1 rounded">
                Foto Real
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
