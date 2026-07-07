export function mapPapelParaTipoConta(papel: string | null | undefined): 'Administrador' | 'Mobilizador' | '—' {
  if (papel === 'admin') return 'Administrador'
  if (papel === 'mobilizador') return 'Mobilizador'
  return '—'
}
