import { type ComponentType, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface SuprimentosHeaderProps {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  action?: ReactNode
}

const suprimentosTabs = [
  { label: 'Solicitações', href: '/pcp/suprimentos/solicitacoes' },
  { label: 'Cotações', href: '/pcp/suprimentos/cotacoes' },
  { label: 'Compras', href: '/pcp/suprimentos/compras' },
  { label: 'Ordens de Compra', href: '/pcp/suprimentos/ordens-compra' },
  { label: 'Recebimento', href: '/pcp/suprimentos/recebimento' },
  { label: 'Destino de Materiais', href: '/pcp/suprimentos/destino-materiais' },
  { label: 'Estoque', href: '/pcp/suprimentos/estoque' },
  { label: 'Terceirização', href: '/pcp/suprimentos/terceirizacao' },
  { label: 'Fornecedores', href: '/pcp/suprimentos/fornecedores' },
]

export function SuprimentosHeader({
  title,
  description,
  icon: Icon,
  action,
}: SuprimentosHeaderProps) {
  const location = useLocation()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <Icon className="size-8 text-blue-600" /> {title}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">{description}</p>
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <nav className="flex gap-1 flex-wrap border-b border-slate-200 dark:border-slate-800 pb-px">
        {suprimentosTabs.map((tab) => {
          const isActive = location.pathname === tab.href
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                'px-3 py-2 rounded-t-md text-sm font-medium transition-colors border-b-2 -mb-px',
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
