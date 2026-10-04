import { z } from 'zod'

export const MAX_HOUSEHOLD_MEMBERS = 2

/** Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L). Igual ao da função SQL create_invite. */
export const INVITE_CODE_REGEX = /^[A-HJKMNP-Z2-9]{6}$/

export function normalizeInviteCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: 'Informe seu nome.' })
    .max(60, { error: 'Use no máximo 60 caracteres.' }),
})

export const householdNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Informe o nome da casa.' })
    .max(80, { error: 'Use no máximo 80 caracteres.' }),
})

export const inviteCodeSchema = z.object({
  code: z
    .string()
    .transform(normalizeInviteCode)
    .pipe(z.string().regex(INVITE_CODE_REGEX, { error: 'O código tem 6 caracteres, entre letras e números.' })),
})

export type DisplayNameInput = z.input<typeof displayNameSchema>
export type HouseholdNameInput = z.input<typeof householdNameSchema>
export type InviteCodeInput = z.input<typeof inviteCodeSchema>
export type InviteCodeOutput = z.output<typeof inviteCodeSchema>
