'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn } from '@/lib/actions/auth'
import { applyActionErrors } from '@/lib/forms'
import { loginSchema, type LoginInput } from '@/lib/validation/auth'

export function LoginForm() {
  const router = useRouter()
  const [navigating, setNavigating] = useState(false)
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState
  const busy = isSubmitting || navigating

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await signIn(values)
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    setNavigating(true)
    router.replace('/inicio')
    router.refresh()
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="email" label="E-mail" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...form.register('email')}
        />
      </Field>
      <Field id="password" label="Senha" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...form.register('password')}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}
