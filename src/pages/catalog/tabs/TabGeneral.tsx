import { Product } from '@/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '../CatalogList'
import { useAuth } from '@/hooks/use-auth'
import { FilePlus } from 'lucide-react'
import { useRef } from 'react'
import pb from '@/lib/pocketbase/client'

interface Props {
  product: Product
  setProduct: (p: Product) => void
}

export function TabGeneral({ product, setProduct }: Props) {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setProduct({ ...product, files: [...(product.files || []), ...Array.from(e.target.files)] })
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files) {
      setProduct({
        ...product,
        files: [...(product.files || []), ...Array.from(e.dataTransfer.files)],
      })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">
                Código do Produto <span className="text-destructive">*</span>
              </Label>
              <Input
                id="code"
                value={product.code || ''}
                onChange={(e) => setProduct({ ...product, code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">
                Nome do Produto <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={product.name || ''}
                onChange={(e) => setProduct({ ...product, name: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="details">Detalhes Técnicos</Label>
            <Textarea
              id="details"
              className="min-h-[120px]"
              value={product.description}
              onChange={(e) => setProduct({ ...product, description: e.target.value })}
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
          <Label>Arquivos do Produto</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div
              className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center h-[200px] hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileChange}
              />
              <FilePlus className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">Adicionar Imagem</span>
              <span className="text-xs text-muted-foreground mt-1">Apenas imagens</span>
            </div>

            {(product.files || []).map((file: any, idx: number) => {
              const isFileObj = file instanceof File
              const url = isFileObj
                ? URL.createObjectURL(file)
                : pb.files.getUrl(product as any, file)
              return (
                <div
                  key={idx}
                  className="border-2 border-border rounded-lg p-1 flex flex-col items-center justify-center h-[200px] bg-muted/20 relative group"
                >
                  {(isFileObj && file.type.startsWith('image/')) ||
                  (!isFileObj &&
                    typeof file === 'string' &&
                    file.match(/\.(jpeg|jpg|gif|png|webp)$/i)) ? (
                    <img
                      src={url}
                      alt={`Preview ${idx + 1}`}
                      className="h-full w-full object-contain rounded"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-2 w-full h-full overflow-hidden">
                      <FilePlus className="h-8 w-8 text-muted-foreground mb-2 shrink-0" />
                      <span className="text-xs text-muted-foreground break-all line-clamp-3">
                        {isFileObj ? file.name : file}
                      </span>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      className="bg-destructive text-destructive-foreground px-2 py-1 rounded text-xs font-medium"
                      onClick={(e) => {
                        e.stopPropagation()
                        const newFiles = [...(product.files || [])]
                        newFiles.splice(idx, 1)
                        setProduct({ ...product, files: newFiles })
                      }}
                    >
                      Remover
                    </button>
                  </div>
                  {isFileObj && (
                    <span className="text-[10px] font-medium absolute bottom-2 left-2 bg-primary/90 text-primary-foreground px-1.5 py-0.5 rounded">
                      Novo
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
