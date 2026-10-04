import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from './database.types'
import { supabaseEnv } from './env'

const PUBLIC_PATHS = new Set(['/login'])

/** Renova a sessão do Supabase e aplica os redirecionamentos de autenticação. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(supabaseEnv.url, supabaseEnv.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        // Respostas que gravam cookies de sessão não podem ser cacheadas por CDN
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // Não coloque código entre createServerClient e getClaims: isso pode deslogar usuários aleatoriamente.
  const { data } = await supabase.auth.getClaims()
  const isLoggedIn = Boolean(data?.claims)
  const isPublic = PUBLIC_PATHS.has(request.nextUrl.pathname)

  if (!isLoggedIn && !isPublic) return redirectKeepingCookies(request, response, '/login')
  if (isLoggedIn && isPublic) return redirectKeepingCookies(request, response, '/inicio')

  return response
}

function redirectKeepingCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''
  const redirect = NextResponse.redirect(url)
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  response.headers.forEach((value, key) => {
    if (['cache-control', 'expires', 'pragma'].includes(key)) redirect.headers.set(key, value)
  })
  return redirect
}
