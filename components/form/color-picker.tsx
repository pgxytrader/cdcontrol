'use client'

import { COLOR_LABELS, COLOR_PALETTE, type PaletteColor } from '@/lib/categories'
import { cn } from '@/lib/utils'

type ColorPickerProps = { value: string; onChange: (color: PaletteColor) => void; label: string }

export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={COLOR_LABELS[color]}
          onClick={() => onChange(color)}
          className={cn(
            'size-8 rounded-full border-2 transition-transform',
            value === color ? 'scale-110 border-foreground' : 'border-transparent',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )
}
