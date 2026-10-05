'use client'

import { useRouter } from 'next/navigation'
import { NativeSelect } from '@/components/form/native-select'
import { propertyHref, type PropertyQuery } from '@/lib/property-filters'

type PropertyHeaderProps = {
  properties: { id: string; name: string }[]
  propertyId: string
  query: PropertyQuery
  actions: React.ReactNode
}

/** Nome (ou seletor, com mais de um imóvel) e os botões de ação. */
export function PropertyHeader({ properties, propertyId, query, actions }: PropertyHeaderProps) {
  const router = useRouter()
  const current = properties.find((property) => property.id === propertyId)
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {properties.length > 1 ? (
        <NativeSelect
          aria-label="Imóvel"
          className="sm:max-w-xs"
          value={propertyId}
          onChange={(event) => router.push(propertyHref(query, { propertyId: event.target.value, filters: {} }))}
        >
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <p className="min-w-0 truncate text-lg font-medium">{current?.name}</p>
      )}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}
