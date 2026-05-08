import { UploadCloud, FileText, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Product } from '@/types'
import { useRef } from 'react'

interface Props {
  product: Product
  setProduct: (p: Product) => void
}

export function TabEngineering({ product, setProduct }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setProduct({ ...product, files: [...(product.files || []), ...Array.from(e.target.files)] })
    }
  }

  const allFiles = product.files || []

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/20 p-4 rounded-lg border">
        <div>
          <h3 className="text-lg font-medium">Arquivos Técnicos</h3>
          <p className="text-sm text-muted-foreground">
            Anexe manuais, PDFs, arquivos SolidWorks (.sldprt, .sldasm).
          </p>
        </div>
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          multiple
          onChange={handleFileChange}
        />
        <Button onClick={() => fileInputRef.current?.click()} className="shrink-0">
          <UploadCloud className="mr-2 h-4 w-4" /> Selecionar Arquivos
        </Button>
      </div>

      {allFiles.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium">Arquivos Anexados ({allFiles.length})</h4>
          <div className="grid gap-3">
            {allFiles.map((file: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 border rounded-md bg-card"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {file instanceof File
                        ? file.name
                        : typeof file === 'string'
                          ? file
                          : 'Arquivo'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {file instanceof File
                        ? `${(file.size / 1024).toFixed(1)} KB`
                        : 'Arquivo Salvo'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => {
                      const newFiles = [...allFiles]
                      newFiles.splice(i, 1)
                      setProduct({ ...product, files: newFiles })
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
