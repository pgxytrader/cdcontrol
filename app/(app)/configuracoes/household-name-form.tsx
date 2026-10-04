'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { renameHousehold } from '@/lib/actions/household'
import { applyActionErrors } from '@/lib/forms'
import { householdNameSchema, type HouseholdNameInput } from '@/lib/validation/household'

export function HouseholdNameForm({ defaultValue }: { defaultValue: string }) {
  const router = useRouter()
  const form = useForm<HouseholdNameInput>({
    resolver: zodResolver(householdNameSchema),
    defaultValues: { name: defaultValue },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await renameHousehold(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success('Nome da casa salvo.')
    router.refresh()
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="settings-household-name" label="Nome da casa" error={errors.name?.message}>
        <Input
          id="settings-household-name"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'settings-household-name-error' : undefined}
          {...form.register('name')}
        />
      </Field>
      <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}
