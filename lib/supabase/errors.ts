export const GENERIC_ERROR = 'Algo deu errado. Tente novamente.'

const MESSAGES: Record<string, string> = {
  // Supabase Auth
  invalid_credentials: 'E-mail ou senha incorretos.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  user_banned: 'Este usuário está bloqueado.',
  // RPCs (supabase/migrations/*_fundacao.sql)
  NOT_AUTHENTICATED: 'Sua sessão expirou. Entre novamente.',
  NO_HOUSEHOLD: 'Você ainda não faz parte de uma casa.',
  ALREADY_MEMBER: 'Você já faz parte de uma casa.',
  INVALID_NAME: 'Nome inválido.',
  INVITE_NOT_FOUND: 'Código de convite não encontrado.',
  INVITE_USED: 'Este código já foi usado.',
  INVITE_EXPIRED: 'Este código expirou. Peça um novo.',
  HOUSEHOLD_FULL: 'Esta casa já tem 2 membros.',
}

/** Traduz erros do Supabase (Auth, PostgREST ou RPC) para uma mensagem em pt-BR. */
export function translateError(error: { code?: string | null; message?: string | null } | null | undefined): string {
  if (!error) return GENERIC_ERROR
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]
  if (error.message && MESSAGES[error.message]) return MESSAGES[error.message]
  return GENERIC_ERROR
}
