'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ColorPicker } from '@/components/form/color-picker'
import { Field } from '@/components/form/field'
import { NativeSelect } from '@/components/form/native-select'
import { ResponsiveModal } from '@/components/layout/responsive-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createCategory, updateCategory } from '@/lib/actions/categories'
import { CATEGORY_ICONS, COLOR_PALETTE, type Category, type CategoryKind } from '@/lib/categories'
import { applyActionErrors } from '@/lib/forms'
import { cn } from '@/lib/utils'
import { categoryUpdateSchema, type CategoryFormInput, type CategoryUpdateOutput } from '@/lib/validation/category'
import { CategoryIcon } from './category-icon'

type CategoryFormProps = {
  kind: CategoryKind
  parents: Category[]
  categoryId?: string
  initial?: CategoryFormInput
  hasChildren?: boolean
  onDone: () => void
}

function CategoryForm({ kind, parents, categoryId, initial, hasChildren = false, onDone }: CategoryFormProps) {
  const router = useRouter()
  const form = useForm<CategoryFormInput, unknown, CategoryUpdateOutput>({
    resolver: zodResolver(categoryUpdateSchema),
    defaultValues: initial ?? { name: '', parentId: null, icon: 'circle-ellipsis', color: COLOR_PALETTE[0] },
  })
  const { errors, isSubmitting } = form.formState
  const color = useWatch({ control: form.control, name: 'color' })

  const onSubmit = form.handleSubmit(async (values) => {
    const result = categoryId ? await updateCategory(categoryId, values) : await createCategory({ ...values, kind })
    if (!result.ok) {
      applyActionErrors(form, result)
      return
    }
    toast.success(categoryId ? 'Categoria atualizada.' : 'Categoria criada.')
    router.refresh()
    onDone()
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2" noValidate>
      <Field id="category-name" label="Nome" error={errors.name?.message}>
        <Input
          id="category-name"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'category-name-error' : undefined}
          {...form.register('name')}
        />
      </Field>

      <Field id="category-parent" label="Categoria-mãe" error={errors.parentId?.message}>
        <Controller
          control={form.control}
          name="parentId"
          render={({ field }) => (
            <NativeSelect
              id="category-parent"
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              disabled={hasChildren}
            >
              <option value="">Nenhuma (categoria principal)</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </NativeSelect>
          )}
        />
      </Field>
      {hasChildren ? <p className="-mt-2 text-xs text-muted-foreground">Esta categoria tem subcategorias e não pode virar uma.</p> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Ícone</legend>
        <Controller
          control={form.control}
          name="icon"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Ícone" className="grid grid-cols-6 gap-2 sm:grid-cols-9">
              {CATEGORY_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  role="radio"
                  aria-checked={field.value === icon}
                  aria-label={icon}
                  onClick={() => field.onChange(icon)}
                  className={cn('rounded-full p-0.5', field.value === icon ? 'ring-2 ring-foreground' : '')}
                >
                  <CategoryIcon name={icon} color={color} />
                </button>
              ))}
            </div>
          )}
        />
        {errors.icon ? <p role="alert" className="text-sm text-expense">{errors.icon.message}</p> : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cor</legend>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => <ColorPicker label="Cor" value={field.value} onChange={field.onChange} />}
        />
      </fieldset>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}

type CategoryFormButtonProps = Omit<CategoryFormProps, 'onDone'> & { label: string; iconOnly?: boolean }

export function CategoryFormButton({ label, iconOnly = false, ...formProps }: CategoryFormButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {iconOnly ? (
        <Button variant="ghost" size="icon" aria-label={label} onClick={() => setOpen(true)}>
          <Pencil aria-hidden />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus aria-hidden />
          {label}
        </Button>
      )}
      <ResponsiveModal open={open} onOpenChange={setOpen} title={formProps.categoryId ? 'Editar categoria' : 'Nova categoria'}>
        {open ? <CategoryForm {...formProps} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  )
}
