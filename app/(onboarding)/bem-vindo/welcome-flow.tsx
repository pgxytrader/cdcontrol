'use client'

import { useState } from 'react'
import { DisplayNameForm } from '@/components/profile/display-name-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateHouseholdCard } from './create-household-card'
import { JoinHouseholdCard } from './join-household-card'

export function WelcomeFlow({ initialName }: { initialName: string | null }) {
  const [name, setName] = useState(initialName ?? '')
  const [editingName, setEditingName] = useState(!initialName)

  if (editingName) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Como você quer ser chamado(a)?</CardTitle>
        </CardHeader>
        <CardContent>
          <DisplayNameForm
            defaultValue={name}
            submitLabel="Continuar"
            onSaved={(saved) => {
              setName(saved)
              setEditingName(false)
            }}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Olá, <span className="font-medium text-foreground">{name}</span>!{' '}
        <button type="button" className="underline underline-offset-4" onClick={() => setEditingName(true)}>
          Alterar nome
        </button>
      </p>
      <CreateHouseholdCard suggestedName={`Casa de ${name}`} />
      <JoinHouseholdCard />
    </div>
  )
}
