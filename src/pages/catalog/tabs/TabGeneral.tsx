import { Product } from '@/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '../CatalogList'
import { useAuth } from '@/hooks/use-auth'
import { FilePlus } from 'lucide-react'
import { useRef } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
          <div className="grid grid-cols-1 gap-4">
            <div
              className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center h-[120px] hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                multiple
                onChange={handleFileChange}
              />
              <FilePlus className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">Adicionar Arquivo</span>
              <span className="text-xs text-muted-foreground mt-1">
                Qualquer formato (PDF, JPG, DWG...)
              </span>
            </div>

            {(product.files?.length || 0) > 0 && (
              <div className="rounded-md border mt-2 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead className="w-[100px]">Tipo</TableHead>
                      <TableHead className="w-[100px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(product.files || []).map((file: any, idx: number) => {
                      const isFileObj = file instanceof File
                      const name = isFileObj
                        ? file.name
                        : typeof file === 'string'
                          ? file.split('_').slice(0, -1).join('_') || file
                          : `Arquivo ${idx + 1}`
                      const extMatch = name.match(/\.([^.]+)$/)
                      const ext = extMatch ? extMatch[1].toUpperCase() : 'OUTRO'
                      const url = isFileObj
                        ? URL.createObjectURL(file)
                        : pb.files.getUrl(product as any, file)

                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline font-medium flex items-center gap-2"
                            >
                              <span className="truncate max-w-[180px]" title={name}>
                                {name}
                              </span>
                              {isFileObj && (
                                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">
                                  Novo
                                </span>
                              )}
                            </a>
                          </TableCell>
                          <TableCell>
                            <span className="bg-muted px-2 py-1 rounded text-xs font-mono">
                              {ext}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              type="button"
                              className="text-destructive hover:text-destructive/80 text-xs font-medium"
                              onClick={(e) => {
                                e.preventDefault()
                                const newFiles = (product.files || []).filter((f) => f !== file)
                                setProduct({ ...product, files: newFiles })
                              }}
                            >
                              Remover
                            </button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
