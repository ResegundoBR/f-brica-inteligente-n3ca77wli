/* General utility functions (exposes cn) */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges multiple class names into a single string
 * @param inputs - Array of class names
 * @returns Merged class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Classe CSS padrão que impede a tradução automática do navegador */
export const NOTRANSLATE_CLASS = 'notranslate'

/** Props HTML prontas para espalhar em elementos que não devem ser traduzidos */
export const noTranslateAttrs = {
  translate: 'no' as const,
}
