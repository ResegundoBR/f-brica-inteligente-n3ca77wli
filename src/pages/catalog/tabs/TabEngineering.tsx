import { UploadCloud, FileText, Download, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Product } from '@/types'
import { useRef, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface Props {
  product: Product
  setProduct: (p: Product) => void
}

export function TabEngineering({ product, setProduct }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setProduct({
        ...product,
        engineering_files: [...(product.engineering_files || []), ...Array.from(e.target.files)],
      })
    }
  }

  const allFiles = product.engineering_files || []
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null)

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
                  <div className="p-2 bg-primary/10 rounded flex-shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex flex-col max-w-[150px] sm:max-w-[300px]">
                    {(() => {
                      const name =
                        file instanceof File
                          ? file.name
                          : typeof file === 'string'
                            ? file
                            : 'Arquivo'
                      const url =
                        file instanceof File
                          ? URL.createObjectURL(file)
                          : typeof file === 'string'
                            ? pb.files.getUrl(product as any, file)
                            : ''

                      return name.toLowerCase().endsWith('.pdf') ? (
                        <span
                          className="text-sm font-medium truncate cursor-pointer hover:underline text-primary"
                          onClick={() => setPreviewFile({ url, name })}
                        >
                          {name}
                        </span>
                      ) : (
                        <a
                          className="text-sm font-medium truncate hover:underline text-primary"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {name}
                        </a>
                      )
                    })()}
                    <p className="text-xs text-muted-foreground">
                      {file instanceof File
                        ? `${(file.size / 1024).toFixed(1)} KB`
                        : 'Arquivo Salvo'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="hidden sm:flex flex-col items-center px-4 border-l border-r border-border">
                    <span className="text-[10px] text-muted-foreground uppercase">Tipo</span>
                    <span className="text-sm font-medium uppercase text-primary">
                      {file instanceof File
                        ? file.name.split('.').pop()
                        : typeof file === 'string'
                          ? file.split('.').pop()
                          : '-'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={
                          file instanceof File
                            ? URL.createObjectURL(file)
                            : typeof file === 'string'
                              ? pb.files.getUrl(product as any, file)
                              : ''
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        download={
                          file instanceof File
                            ? file.name
                            : typeof file === 'string'
                              ? file
                              : 'Arquivo'
                        }
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        const newFiles = [...allFiles]
                        newFiles.splice(i, 1)
                        setProduct({ ...product, engineering_files: newFiles })
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <DialogTitle className="truncate" title={previewFile?.name}>
                {previewFile?.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Visualização de documento PDF
              </DialogDescription>
            </div>
            {previewFile && (
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" asChild>
                  <a href={previewFile.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Nova Guia
                  </a>
                </Button>
                <Button size="sm" asChild>
                  <a href={previewFile.url} download={previewFile.name}>
                    <Download className="w-4 h-4 mr-2" />
                    Baixar
                  </a>
                </Button>
              </div>
            )}
          </DialogHeader>
          <div className="flex-1 w-full h-full min-h-0 bg-muted/20 rounded-md overflow-hidden border mt-2 relative">
            {previewFile && (
              <object
                data={`${previewFile.url}#toolbar=0`}
                type="application/pdf"
                className="w-full h-full border-0 absolute inset-0 z-10"
              >
                <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-6 text-center bg-background absolute inset-0 z-20">
                  <FileText className="w-16 h-16 text-muted-foreground/30 mb-2" />
                  <p className="font-medium text-foreground text-lg">
                    Não foi possível carregar a pré-visualização
                  </p>
                  <p className="text-sm max-w-[400px]">
                    Seu navegador pode estar bloqueando o PDF ou não possui um visualizador nativo
                    suportado.
                  </p>
                  <div className="flex gap-3 mt-4">
                    <Button variant="outline" asChild>
                      <a href={previewFile.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Abrir em Nova Guia
                      </a>
                    </Button>
                    <Button asChild>
                      <a href={previewFile.url} download={previewFile.name}>
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Arquivo
                      </a>
                    </Button>
                  </div>
                </div>
              </object>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
