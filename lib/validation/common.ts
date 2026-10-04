import { z } from 'zod'

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Data de calendário AAAA-MM-DD que existe de verdade. */
export const isoDateSchema = z
  .string({ error: 'Informe uma data válida.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Informe uma data válida.' })
  .refine(isRealDate, { error: 'Informe uma data válida.' })

export const uuidSchema = z.uuid({ error: 'Identificador inválido.' })
