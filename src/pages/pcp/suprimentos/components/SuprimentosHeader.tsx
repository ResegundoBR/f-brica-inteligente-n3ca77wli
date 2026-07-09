import { type ComponentType, type ReactNode } from 'react'

interface SuprimentosHeaderProps {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  action?: ReactNode
}

export function SuprimentosHeader({
  title,
  description,
  icon: Icon,
  action,
}: SuprimentosHeaderProps) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
          <Icon className="size-8 text-blue-600" /> {title}
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">{description}</p>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
