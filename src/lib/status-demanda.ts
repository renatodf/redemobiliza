const CONCLUIDO = { label: 'CONCLUÍDO', corClasse: 'bg-green-100 text-green-800' }
const PENDENTE = { label: 'PENDENTE', corClasse: 'bg-yellow-100 text-yellow-800' }
const NAO_ATENDIDA = { label: 'NÃO ATENDIDA', corClasse: 'bg-red-100 text-red-800' }

export function statusDemandaPill(status: string): { label: string; corClasse: string } {
  if (status === 'atendida') return CONCLUIDO
  if (status === 'nao_atendida') return NAO_ATENDIDA
  return PENDENTE
}

export function foiAtendidaPill(status: string): { label: string; corClasse: string } {
  if (status === 'atendida') return { label: 'SIM', corClasse: 'bg-green-100 text-green-800' }
  if (status === 'nao_atendida') return { label: 'NÃO', corClasse: 'bg-red-100 text-red-800' }
  return { label: '—', corClasse: 'bg-gray-100 text-gray-500' }
}
