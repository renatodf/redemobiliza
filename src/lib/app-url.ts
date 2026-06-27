import { headers } from 'next/headers'

// Lê o host real da requisição (via Traefik/proxy) em vez de depender de
// NEXT_PUBLIC_APP_URL, que é assado no bundle em build-time e pode ter localhost.
export function getAppUrl(): string {
  const h = headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('host') ?? ''
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_APP_URL ?? ''
}
