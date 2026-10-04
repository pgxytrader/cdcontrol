import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { defineConfig } from 'vitest/config'

function loadTestEnv(): Record<string, string> {
  try {
    return parseEnv(readFileSync('.env.test.local', 'utf8')) as Record<string, string>
  } catch {
    throw new Error(
      'Crie .env.test.local com NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY',
    )
  }
}

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    env: loadTestEnv(),
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
