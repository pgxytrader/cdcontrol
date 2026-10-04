import { z } from 'zod'

export type ActionFailure = {
  ok: false
  error: string
  fieldErrors?: Record<string, string[] | undefined>
}

export type ActionResult<T = null> = { ok: true; data: T } | ActionFailure

export function invalidInput(error: z.ZodError): ActionFailure {
  return {
    ok: false,
    error: 'Verifique os campos destacados.',
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
  }
}
