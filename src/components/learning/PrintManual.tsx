import { LearningRecord } from '@/types'
import pb from '@/lib/pocketbase/client'

export function PrintManual({ record }: { record: LearningRecord }) {
  const pSteps =
    record.expand?.learning_steps_via_learning_id?.slice().sort((a, b) => a.order - b.order) || []

  return (
    <div className="print-area fixed inset-0 z-[9999] bg-white p-10 overflow-y-auto hidden print:block">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10 pb-6 border-b-2 border-gray-200">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">{record.title}</h1>
          <p className="text-lg text-gray-600">Manual de Procedimento Operacional</p>
          <div className="mt-4 text-sm text-gray-500">
            Criado por: {record.expand?.user_id?.name} em{' '}
            {new Date(record.created).toLocaleDateString()}
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Objetivo / Descrição</h2>
          <p className="text-lg text-gray-700 whitespace-pre-wrap leading-relaxed">
            {record.description}
          </p>
        </div>

        {record.evidence && (
          <div className="mb-12 text-center">
            <h2 className="text-xl font-bold mb-4 text-gray-800 text-left">Referência Visual</h2>
            <img
              src={pb.files.getUrl(record, record.evidence)}
              className="max-w-full h-auto max-h-[400px] object-contain mx-auto rounded border"
              alt="Evidência"
            />
          </div>
        )}

        <div className="space-y-12">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">Passo a Passo</h2>
          {pSteps.map((step, idx) => (
            <div key={step.id} className="flex gap-6 break-inside-avoid items-start">
              <div className="w-14 h-14 shrink-0 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-2xl font-bold border-4 border-white shadow-sm">
                {idx + 1}
              </div>
              <div className="flex-1 pt-2">
                <p className="text-xl text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {step.description}
                </p>
                {step.image && (
                  <img
                    src={pb.files.getUrl(step, step.image)}
                    className="mt-6 max-w-md rounded-lg border shadow-sm"
                    alt={`Passo ${idx + 1}`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
