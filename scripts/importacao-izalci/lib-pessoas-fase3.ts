import { normalizeWhatsApp } from '../../src/lib/whatsapp'

export type TelefoneMongo = {
  id: string
  tipo: 'cellphone' | 'landline'
  numeroCru: string
}

export type TelefonesEscolhidos = {
  whatsapp: string | null
  telefoneFixo: string | null
  extras: string[]
}

export function escolherTelefones(telefones: TelefoneMongo[]): TelefonesEscolhidos {
  const ordenados = [...telefones].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const normalizados = ordenados
    .map((t) => ({ ...t, normalizado: normalizeWhatsApp(t.numeroCru) }))
    .filter((t): t is TelefoneMongo & { normalizado: string } => t.normalizado !== null)

  const celulares = normalizados.filter((t) => t.tipo === 'cellphone')
  const fixos = normalizados.filter((t) => t.tipo === 'landline')

  const whatsapp =
    celulares.length > 0
      ? celulares[celulares.length - 1].normalizado
      : fixos.length > 0
        ? fixos[fixos.length - 1].normalizado
        : null

  const telefoneFixo = fixos.length > 0 ? fixos[fixos.length - 1].normalizado : null

  const usados = new Set([whatsapp, telefoneFixo].filter((v): v is string => v !== null))
  const extrasSet = new Set<string>()
  for (const t of normalizados) {
    if (!usados.has(t.normalizado)) extrasSet.add(t.normalizado)
  }

  return { whatsapp, telefoneFixo, extras: Array.from(extrasSet) }
}

const LUAR_ID = '6063a6ccc3e599000464eaa7'

export function ehPessoaDummyDoLuar(pessoa: { createdById: string | null; email: string | null; nome: string }): boolean {
  if (pessoa.createdById !== LUAR_ID) return false
  const emailLower = (pessoa.email ?? '').toLowerCase()
  const nomeLower = pessoa.nome.toLowerCase()
  return (
    emailLower.includes('legislapp') ||
    emailLower.includes('teste') ||
    nomeLower.includes('teste') ||
    nomeLower.includes('luar')
  )
}

const GENERO_POR_TAG_ID: Record<string, string> = {
  '5c82c37a24a225000460301f': 'feminino',
  '5c82c37a24a2250004603016': 'masculino',
}

const RELIGIAO_POR_TAG_ID: Record<string, string> = {
  '5c82c2c724a2250004602f24': 'CATÓLICA APOSTÓLICA ROMANA',
}

export function decodificarGenero(genderId: string | null): string | null {
  return genderId ? (GENERO_POR_TAG_ID[genderId] ?? null) : null
}

export function decodificarReligiao(religionId: string | null): string | null {
  return religionId ? (RELIGIAO_POR_TAG_ID[religionId] ?? null) : null
}

export function normalizarNome(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export function registrarWhatsappUnico(usados: Set<string>, numero: string): boolean {
  if (usados.has(numero)) return false
  usados.add(numero)
  return true
}

export function resolverNomeCatalogo(labelBruto: string, merges: Record<string, string>): string {
  return merges[labelBruto] ?? labelBruto
}

export function validarNascimento(v: unknown): Date | null {
  if (!(v instanceof Date)) return null
  const ano = v.getUTCFullYear()
  const anoAtual = new Date().getUTCFullYear()
  if (ano < 1900 || ano > anoAtual) return null
  return v
}
