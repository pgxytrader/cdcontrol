'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateDisplayName } from '@/lib/actions/profile'
import { applyActionErrors } from '@/lib/forms'
import { displayNameSchema, type DisplayNameInput } from '@/lib/validation/household'

type DisplayNameFormProps = {
  defaultValue: string
  submitLabel?: string
  onSaved?: (displayName: string) => void
}

export function DisplayNameForm({ defaultValue, submitLabel = 'Salvar', onSaved }: DisplayNameFormProps) {
  const router = useRouter()
  const form = useForm<DisplayNameInput>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { displayName: defaultValue },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateDisplayName(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success('Nome salvo.')
    router.refresh()
    onSaved?.(values.displayName)
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="display-name" label="Seu nome" error={errors.displayName?.message}>
        <Input
          id="display-name"
          autoComplete="given-name"
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={errors.displayName ? 'display-name-error' : undefined}
          {...form.register('displayName')}
        />
      </Field>
      <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : submitLabel}
      </Button>
    </form>
  )
}
