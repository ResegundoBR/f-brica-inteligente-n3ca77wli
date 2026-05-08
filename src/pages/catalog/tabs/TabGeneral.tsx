import { Product } from '@/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '../CatalogList'
import { FilePlus, X, File as FileIcon } from 'lucide-react'
import { useRef } from 'react'
import pb from '@/lib/pocketbase/client'

interface Props {
  product: Product
  setProduct: (p: Product) => void
}

export function TabGeneral({ product, setProduct }: Props) {
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="code">
            Código do Produto <span className="text-destructive">*</span>
          </Label>
          <Input
            id="code"
            className="font-bold"
            value={product.code || ''}
            onChange={(e) => setProduct({ ...product, code: e.target.value })}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="name">
            Nome do Produto <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            className="font-bold uppercase"
            value={product.name || ''}
            onChange={(e) => setProduct({ ...product, name: e.target.value.toUpperCase() })}
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

      <div className="space-y-4 pt-4 border-t">
        <Label>Arquivos do Produto</Label>
        <div className="flex flex-wrap gap-4">
          {(product.files || []).map((file: any, idx: number) => {
            const isFileObj = file instanceof File
            const url = isFileObj
              ? URL.createObjectURL(file)
              : pb.files.getUrl(product as any, file)

            const isImage = isFileObj
              ? file.type.startsWith('image/')
              : typeof file === 'string' && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file)

            let slotLabel = ''
            if (idx === 0) slotLabel = 'Vista Explodida (Renderizada)'
            else if (idx === 1) slotLabel = 'Imagem Real'
            else slotLabel = `Anexo ${idx + 1}`

            return (
              <div
                key={idx}
                className="relative rounded-lg border overflow-hidden group w-40 h-40 bg-muted/30 flex-shrink-0"
              >
                {isImage ? (
                  <img src={url} alt={slotLabel} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-2 pb-8">
                    <FileIcon className="h-8 w-8 mb-2 opacity-50" />
                    <span
                      className="text-[10px] text-center truncate w-full px-1"
                      title={isFileObj ? file.name : file}
                    >
                      {isFileObj ? file.name : file}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-background/90 backdrop-blur-sm py-1.5 px-2 text-[10px] font-medium text-center truncate border-t">
                  {slotLabel}
                </div>
                <button
                  type="button"
                  className="absolute top-2 right-2 bg-destructive/90 text-destructive-foreground hover:bg-destructive rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const newFiles = (product.files || []).filter((f) => f !== file)
                    setProduct({ ...product, files: newFiles })
                  }}
                  title="Remover"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}

          <div
            className="border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center w-40 h-40 hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => e.preventDefault()}
          >
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              multiple
              accept="image/*"
              onChange={handleFileChange}
            />
            <FilePlus className="h-6 w-6 text-muted-foreground mb-2" />
            <span className="text-xs font-medium px-2">Adicionar</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <Label>Status Atual</Label>
        <div className="pt-1">
          <StatusBadge status={product.expand?.status || product.status} />
        </div>
      </div>
    </div>
  )
}
