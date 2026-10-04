'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { joinHousehold } from '@/lib/actions/household'
import { applyActionErrors } from '@/lib/forms'
import { inviteCodeSchema, type InviteCodeInput, type InviteCodeOutput } from '@/lib/validation/household'

export function JoinHouseholdCard() {
  const router = useRouter()
  const [navigating, setNavigating] = useState(false)
  const form = useForm<InviteCodeInput, unknown, InviteCodeOutput>({
    resolver: zodResolver(inviteCodeSchema),
    defaultValues: { code: '' },
  })
  const { errors, isSubmitting } = form.formState
  const busy = isSubmitting || navigating

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await joinHousehold(values)
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
        <CardTitle>Tenho um código de convite</CardTitle>
        <CardDescription>Peça o código de 6 caracteres a quem criou a casa.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="invite-code" label="Código" error={errors.code?.message}>
            <Input
              id="invite-code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              className="font-mono uppercase tracking-[0.3em]"
              aria-invalid={Boolean(errors.code)}
              aria-describedby={errors.code ? 'invite-code-error' : undefined}
              {...form.register('code')}
            />
          </Field>
          <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar na casa'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
