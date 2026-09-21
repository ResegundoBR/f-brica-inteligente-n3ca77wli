import React from 'react'
import { cn } from '@/lib/utils'

export interface NoTranslateProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType
  children?: React.ReactNode
  className?: string
  [key: string]: any
}

/**
 * Componente que impede a tradução automática do navegador em textos críticos
 * como códigos/SKUs, descrições de materiais/produtos, unidades, quantidades e medidas de corte.
 *
 * Utiliza o atributo translate="no" e a classe "notranslate" reconhecida pelo Google Translate e Chrome/Safari.
 */
export const NoTranslate: React.FC<NoTranslateProps> = ({
  as: Component = 'span',
  children,
  className,
  ...props
}) => {
  const Comp = Component as any
  return (
    <Comp translate="no" className={cn('notranslate', className)} {...props}>
      {children}
    </Comp>
  )
}

/**
 * Helper de classes para adicionar translate="no" e notranslate em qualquer className
 */
export const NOTRANSLATE_CLASS = 'notranslate'

/**
 * Propriedades HTML padrão para bloquear tradução em qualquer tag existente
 */
export const noTranslateProps = {
  translate: 'no' as const,
  className: 'notranslate',
}
