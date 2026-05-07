import { UploadCloud, FileText, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TabEngineering() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center bg-muted/30">
        <UploadCloud className="h-10 w-10 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-1">Importar Arquivos Técnicos</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          Arraste e solte manuais, PDFs, arquivos SolidWorks (.sldprt, .sldasm) aqui.
        </p>
        <Button variant="secondary">Selecionar Arquivos</Button>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium">Arquivos Anexados</h4>
        <div className="grid gap-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 border rounded-md bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Manual_Montagem_v{i}.pdf</p>
                  <p className="text-xs text-muted-foreground">Adicionado em 10/10/2023</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
