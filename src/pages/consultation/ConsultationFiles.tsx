import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Download } from 'lucide-react'
import pb from '@/lib/pocketbase/client'

interface Props {
  files: any[]
  record: any
  label: string
}

export function ConsultationFiles({ files, record, label }: Props) {
  if (!files || files.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {label} ({files.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {files.map((file: any, i: number) => {
          const name = typeof file === 'string' ? file : file?.name || 'Arquivo'
          const url = pb.files.getUrl(record, name) as string
          return (
            <div key={i} className="flex items-center gap-3 p-2 border rounded-md">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline truncate flex-1"
              >
                {name}
              </a>
              <Button variant="ghost" size="icon" asChild>
                <a href={url} download={name}>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
