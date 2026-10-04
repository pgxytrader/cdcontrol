import { Label } from '@/components/ui/label'

type FieldProps = {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}

/** Label + controle + mensagem de erro. O controle deve usar aria-describedby={`${id}-error`} quando houver erro. */
export function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-expense">
          {error}
        </p>
      ) : null}
    </div>
  )
}
