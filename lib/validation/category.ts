import { z } from 'zod'
import { CATEGORY_ICONS, COLOR_PALETTE } from '@/lib/categories'

export const categorySchema = z.object({
  name: z.string().trim().min(1, { error: 'Informe o nome da categoria.' }).max(40, { error: 'Use no máximo 40 caracteres.' }),
  kind: z.enum(['income', 'expense'], { error: 'Escolha o tipo.' }),
  parentId: z.uuid({ error: 'Categoria-mãe inválida.' }).nullable(),
  icon: z.enum(CATEGORY_ICONS, { error: 'Escolha um ícone.' }),
  color: z.enum(COLOR_PALETTE, { error: 'Escolha uma cor.' }),
})

/** Na edição o tipo não muda (o banco também impede). */
export const categoryUpdateSchema = categorySchema.omit({ kind: true })

export type CategoryOutput = z.output<typeof categorySchema>
export type CategoryFormInput = z.input<typeof categoryUpdateSchema>
export type CategoryUpdateOutput = z.output<typeof categoryUpdateSchema>
