'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createHousehold } from '@/lib/actions/household'
import { applyActionErrors } from '@/lib/forms'
import { householdNameSchema, type HouseholdNameInput } from '@/lib/validation/household'

export function CreateHouseholdCard({ suggestedName }: { suggestedName: string }) {
  const router = useRouter()
  const [navigating, setNavigating] = useState(false)
  const form = useForm<HouseholdNameInput>({
    resolver: zodResolver(householdNameSchema),
    defaultValues: { name: suggestedName },
  })
  const { errors, isSubmitting } = form.formState
  const busy = isSubmitting || navigating

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createHousehold(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    setNavigating(true)
    router.replace('/inicio')
    router.refresh()
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar nossa casa</CardTitle>
        <CardDescription>Você será o dono(a) e poderá convidar seu par em Configurações.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="household-name" label="Nome da casa" error={errors.name?.message}>
            <Input
              id="household-name"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'household-name-error' : undefined}
              {...form.register('name')}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Criando…' : 'Criar casa'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
