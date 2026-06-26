export function normalizeWhatsApp(input: string): string | null {
  const digits = input.replace(/\D/g, '')

  if (digits.length === 10) return `55${digits}`
  if (digits.length === 11) return `55${digits}`
  if (digits.length === 12) return digits
  if (digits.length === 13) return digits
  return null
}
