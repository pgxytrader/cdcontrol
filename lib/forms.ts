import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'
import type { ActionFailure } from '@/lib/action-result'

/** Aplica os erros retornados por uma Server Action nos campos do formulário e mostra um toast. */
export function applyActionErrors<T extends FieldValues>(
  form: { setError: UseFormSetError<T> },
  failure: ActionFailure,
): void {
  for (const [field, messages] of Object.entries(failure.fieldErrors ?? {})) {
    const message = messages?.[0]
    if (message) form.setError(field as Path<T>, { message })
  }
  toast.error(failure.error)
}
