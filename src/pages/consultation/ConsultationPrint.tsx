import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Printer, ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Product, ProductProcessModel } from '@/types'
import { Button } from '@/components/ui/button'

export default function ConsultationPrint() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [product, setProduct] = useState<Product | null>(null)
  const [processes, setProcesses] = useState<ProductProcessModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    let isMounted = true
    const fetchData = async () => {
      try {
        setLoading(true)
        const found = await pb.collection('products').getOne<Product>(id, {
          expand: 'status,owner,category',
        })
        const procs = await pb.collection('product_processes').getFullList<ProductProcessModel>({
          filter: `product_id="${id}"`,
          sort: 'order',
        })

        if (!isMounted) return
        setProduct(found)
        setProcesses(procs)
      } catch (err: any) {
        if (!isMounted) return
        console.error('Erro ao carregar dados para impressão:', err)
        setError(err?.message || 'Falha ao carregar produto para impressão.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()

    return () => {
      isMounted = false
    }
  }, [id])

  // Dispara window.print() automaticamente após carregamento dos dados e imagens
  useEffect(() => {
    if (!loading && product && !error) {
      // Pequeno timeout para garantir renderização do DOM e que fontes/layout estejam prontos
      const timer = setTimeout(() => {
        window.print()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [loading, product, error])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-slate-700">
        <Loader2 className="h-8 w-8 animate-spin text-slate-800 mb-3" />
        <p className="text-sm font-medium">Preparando documento para impressão...</p>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-slate-800">
        <AlertCircle className="h-10 w-10 text-red-600 mb-3" />
        <p className="text-base font-semibold mb-1">
          Não foi possível carregar a visualização de impressão
        </p>
        <p className="text-sm text-slate-500 mb-4">{error || 'Produto não encontrado.'}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(id ? `/consulta/${id}` : '/consulta')}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
        </Button>
      </div>
    )
  }

  const composition = product.data?.composition || []
  const statusName = product.expand?.status?.name || 'Não informado'
  const categoryName = product.expand?.category?.name || 'Não informada'
  const emissionDateFormatted = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const engineeringFiles = product.engineering_files || []
  const compositionFiles = product.composition_files || []

  // Filtra apenas processos com preenchimento relevante
  const isProcessFilled = (proc: ProductProcessModel) => {
    const hasDescription = Boolean(proc.description && proc.description.trim().length > 0)
    const hasImages = Array.isArray(proc.image)
      ? proc.image.length > 0
      : Boolean(proc.image && typeof proc.image === 'string' && proc.image.trim().length > 0)
    const hasHours = typeof proc.estimated_hours === 'number' && proc.estimated_hours > 0
    const hasDays = typeof proc.estimated_days === 'number' && proc.estimated_days > 0

    return hasDescription || hasImages || hasHours || hasDays
  }

  const displayProcesses = processes.filter(isProcessFilled)

  return (
    <div className="consulta-print-root min-h-screen bg-neutral-100 text-black print:bg-white print:p-0">
      {/* Barra de ações para visualização em tela (oculta na impressão) */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b border-neutral-300 px-6 py-3 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.history.length > 1) {
                window.close()
                // Se window.close não funcionar (não foi aberto via window.open ou bloqueado):
                navigate(`/consulta/${product.id}`)
              } else {
                navigate(`/consulta/${product.id}`)
              }
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
          </Button>
          <span className="text-xs sm:text-sm font-medium text-neutral-600">
            Visualização de Impressão A4 — Consulta Catálogo
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => window.print()}
            className="bg-neutral-900 text-white hover:bg-neutral-800"
          >
            <Printer className="h-4 w-4 mr-1.5" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      {/* Estilos CSS específicos de impressão A4 preto e branco */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm 12mm 15mm 12mm;
        }

        @media print {
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 11pt !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Oculta tudo que não faz parte da impressão */
          header, nav, aside, footer, .sidebar, [data-sidebar], button, input, textarea {
            display: none !important;
          }

          .consulta-print-root {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-container {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }

          .page-break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .page-break-before {
            break-before: page !important;
            page-break-before: always !important;
          }

          /* Repetição de cabeçalho de tabela em quebras de página */
          thead {
            display: table-header-group !important;
          }

          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Folha A4 centralizada no preview de tela, 100% na impressão */}
      <div className="print-container max-w-[210mm] mx-auto bg-white my-6 print:my-0 p-8 sm:p-10 print:p-0 shadow-lg print:shadow-none border border-neutral-200 print:border-none font-sans leading-relaxed text-black">
        {/* Cabeçalho do documento */}
        <div className="border-b-2 border-black pb-4 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <span className="text-[10px] font-bold tracking-widest uppercase text-neutral-600 block mb-0.5">
                Catálogo Técnico Industrial
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-black tracking-tight leading-tight">
                {product.name}
              </h1>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block border border-black px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-black">
                {statusName}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 mt-3 border-t border-neutral-300 text-xs">
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-semibold">
                Código
              </span>
              <span className="font-mono font-bold text-black text-sm">
                {product.code || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-semibold">
                Categoria
              </span>
              <span className="font-medium text-black">{categoryName}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-semibold">
                Status
              </span>
              <span className="font-medium text-black">{statusName}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-semibold">
                Emissão
              </span>
              <span className="font-mono text-black">{emissionDateFormatted}</span>
            </div>
          </div>

          {product.description && (
            <p className="mt-3 text-xs text-neutral-700 italic border-l-2 border-neutral-400 pl-2">
              {product.description}
            </p>
          )}
        </div>

        {/* Seção 1: Composição do Produto */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-black border-b border-black pb-0.5">
              1. Composição do Produto ({composition.length} itens)
            </h2>
          </div>

          {composition.length === 0 ? (
            <p className="text-xs text-neutral-500 italic py-2">
              Nenhum item de composição cadastrado.
            </p>
          ) : (
            <table className="w-full border-collapse text-left text-xs border border-black">
              <thead>
                <tr className="bg-neutral-200 text-black border-b border-black">
                  <th className="py-1.5 px-2 font-bold w-[45px] border-r border-neutral-300 text-center">
                    #
                  </th>
                  <th className="py-1.5 px-2 font-bold w-[100px] border-r border-neutral-300">
                    Código
                  </th>
                  <th className="py-1.5 px-2 font-bold border-r border-neutral-300">Descrição</th>
                  <th className="py-1.5 px-2 font-bold w-[65px] border-r border-neutral-300 text-center">
                    Qtd.
                  </th>
                  <th className="py-1.5 px-2 font-bold w-[110px]">Medida</th>
                </tr>
              </thead>
              <tbody>
                {composition.map((item, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-neutral-300 ${
                      idx % 2 === 1 ? 'bg-neutral-50 print:bg-neutral-100' : 'bg-white'
                    }`}
                  >
                    <td className="py-1.5 px-2 text-center border-r border-neutral-300 font-mono text-[11px]">
                      {item.index || idx + 1}
                    </td>
                    <td className="py-1.5 px-2 font-mono font-semibold border-r border-neutral-300 text-[11px]">
                      {item.code || '-'}
                    </td>
                    <td className="py-1.5 px-2 border-r border-neutral-300 leading-snug">
                      {item.description || '-'}
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-neutral-300 font-mono">
                      {String(item.quantity ?? '-')}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-[11px] whitespace-nowrap">
                      {item.measurements || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Seção 2: Processos de Fabricação */}
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black border-b border-black pb-0.5 mb-3">
            2. Processos de Fabricação ({displayProcesses.length} etapas)
          </h2>

          {displayProcesses.length === 0 ? (
            <p className="text-xs text-neutral-500 italic py-2">
              Nenhum processo preenchido cadastrado para este produto.
            </p>
          ) : (
            <div className="space-y-4">
              {displayProcesses.map((proc, pIdx) => {
                const images = Array.isArray(proc.image)
                  ? proc.image
                  : proc.image
                    ? [proc.image]
                    : []

                return (
                  <div
                    key={proc.id || pIdx}
                    className="page-break-inside-avoid border border-neutral-400 p-3 bg-white"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-neutral-300 pb-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center h-6 w-6 rounded-full border border-black font-bold text-xs bg-black text-white shrink-0">
                          {proc.order || pIdx + 1}
                        </span>
                        <h3 className="font-bold text-sm text-black">{proc.name}</h3>
                      </div>
                      <div className="text-right text-[11px] text-neutral-600 font-mono shrink-0">
                        {proc.kanban_stage && (
                          <span className="border border-neutral-400 px-1.5 py-0.5 rounded mr-2">
                            {proc.kanban_stage}
                          </span>
                        )}
                        {(proc.estimated_hours || proc.estimated_days) && (
                          <span>
                            {proc.estimated_hours ? `${proc.estimated_hours}h` : ''}
                            {proc.estimated_hours && proc.estimated_days ? ' / ' : ''}
                            {proc.estimated_days ? `${proc.estimated_days}d` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {proc.description && (
                      <p className="text-xs text-black leading-relaxed whitespace-pre-wrap mb-3">
                        {proc.description}
                      </p>
                    )}

                    {/* Imagens do processo: dimensionadas sem cortar, permitindo quebra de página se necessário */}
                    {images.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-neutral-200">
                        <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-2">
                          Registros Visuais ({images.length})
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {images.map((img: string, iIdx: number) => {
                            const imgUrl = pb.files.getUrl(proc, img) as string
                            return (
                              <div
                                key={iIdx}
                                className="page-break-inside-avoid border border-neutral-300 p-1 bg-white rounded-sm"
                              >
                                <img
                                  src={imgUrl}
                                  alt={`${proc.name} - Imagem ${iIdx + 1}`}
                                  className="w-full h-auto max-h-[160mm] object-contain mx-auto block"
                                  loading="eager"
                                />
                                <span className="block text-[9px] text-neutral-500 font-mono text-center mt-1 truncate">
                                  {img}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Seção 3: Arquivos de Engenharia e Composição */}
        <section className="page-break-inside-avoid mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-black border-b border-black pb-0.5 mb-2">
            3. Documentos e Arquivos Anexos
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Arquivos de Engenharia */}
            <div className="border border-neutral-400 p-3 bg-white">
              <span className="font-bold block text-black mb-1.5 pb-1 border-b border-neutral-200">
                Arquivos de Engenharia ({engineeringFiles.length})
              </span>
              {engineeringFiles.length === 0 ? (
                <p className="text-neutral-500 italic text-[11px]">Nenhum arquivo anexado.</p>
              ) : (
                <ul className="space-y-1.5">
                  {engineeringFiles.map((file: any, fIdx: number) => {
                    const fileName =
                      typeof file === 'string' ? file : file?.name || `Arquivo ${fIdx + 1}`
                    const fileUrl = pb.files.getUrl(product, fileName) as string
                    return (
                      <li key={fIdx} className="border-b border-neutral-200 pb-1">
                        <span className="font-medium text-black block truncate" title={fileName}>
                          • {fileName}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-500 break-all block">
                          {fileUrl}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Arquivos de Composição */}
            <div className="border border-neutral-400 p-3 bg-white">
              <span className="font-bold block text-black mb-1.5 pb-1 border-b border-neutral-200">
                Arquivos de Composição ({compositionFiles.length})
              </span>
              {compositionFiles.length === 0 ? (
                <p className="text-neutral-500 italic text-[11px]">Nenhum arquivo anexado.</p>
              ) : (
                <ul className="space-y-1.5">
                  {compositionFiles.map((file: any, fIdx: number) => {
                    const fileName =
                      typeof file === 'string' ? file : file?.name || `Arquivo ${fIdx + 1}`
                    const fileUrl = pb.files.getUrl(product, fileName) as string
                    return (
                      <li key={fIdx} className="border-b border-neutral-200 pb-1">
                        <span className="font-medium text-black block truncate" title={fileName}>
                          • {fileName}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-500 break-all block">
                          {fileUrl}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Rodapé fixo / padrão da página */}
        <div className="page-break-inside-avoid border-t-2 border-black pt-3 mt-6 text-neutral-600 text-[10px] flex items-center justify-between">
          <div className="font-semibold text-black">Consulta Catálogo Técnico — Fábrica</div>
          <div className="font-mono text-neutral-500">
            Produto: {product.code || product.name} | Emissão: {emissionDateFormatted}
          </div>
        </div>
      </div>
    </div>
  )
}
