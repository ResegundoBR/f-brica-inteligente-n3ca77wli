import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DeliveryDeadlineCheckResult } from './delivery-deadline-risk'

interface QuotationDeadlineWarningProps {
  checkResult: DeliveryDeadlineCheckResult
  className?: string
  compact?: boolean
}

export function QuotationDeadlineWarning({
  checkResult,
  className,
  compact = false,
}: QuotationDeadlineWarningProps) {
  if (!checkResult.hasRisk || !checkResult.mostUrgentOp) return null

  const isUrgent = checkResult.urgencyLevel === 'urgent'
  const { opNumber, daysUntilDue, isPastDue } = checkResult.mostUrgentOp
  const days = checkResult.deliveryDays

  if (compact) {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors',
          isUrgent
            ? 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
            : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
          className,
        )}
      >
        <AlertTriangle
          className={cn('size-3.5 shrink-0', isUrgent ? 'text-red-600' : 'text-amber-600')}
        />
        <span>
          Entrega em {days}d &gt; OP{' '}
          <span className="font-mono font-bold notranslate" translate="no">
            {opNumber}
          </span>{' '}
          ({isPastDue ? 'vencida' : daysUntilDue === 0 ? 'vence hoje' : `vence em ${daysUntilDue}d`}
          )
        </span>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border p-2.5 text-xs transition-colors flex items-start gap-2 animate-fade-in',
        isUrgent
          ? 'bg-red-50/90 border-red-300 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200'
          : 'bg-amber-50/90 border-amber-300 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200',
        className,
      )}
    >
      <AlertTriangle
        className={cn(
          'size-4 shrink-0 mt-0.5',
          isUrgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
        )}
      />
      <div className="flex-1 leading-snug">
        <p className="font-semibold flex items-center gap-1 flex-wrap">
          <span>⚠ Entrega prevista em {days} dias, mas a OP</span>
          <span
            className="font-mono font-bold px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 notranslate"
            translate="no"
          >
            {opNumber}
          </span>
          <span>
            {isPastDue
              ? `já está vencida há ${Math.abs(daysUntilDue)} dia(s)`
              : daysUntilDue === 0
                ? 'vence hoje'
                : `vence em ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'}`}{' '}
            — risco de atraso
          </span>
        </p>
        <p className="text-[11px] opacity-85 mt-0.5">
          Aviso informativo não bloqueante: a compra pode prosseguir normalmente conforme avaliação
          do comprador.
        </p>
      </div>
    </div>
  )
}
