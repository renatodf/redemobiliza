const CONCLUIDO = { label: 'CONCLUÍDO', corClasse: 'bg-[#6E9924] text-white' }
const PENDENTE = { label: 'PENDENTE', corClasse: 'bg-[#CBB100] text-white' }
const NAO_ATENDIDA = { label: 'NÃO ATENDIDA', corClasse: 'bg-[#B80000] text-white' }

export function statusDemandaPill(status: string): { label: string; corClasse: string } {
  if (status === 'atendida') return CONCLUIDO
  if (status === 'nao_atendida') return NAO_ATENDIDA
  return PENDENTE
}

export function foiAtendidaPill(status: string): { label: string; corClasse: string } {
  if (status === 'atendida') return { label: 'SIM', corClasse: 'bg-[#6E9924] text-white' }
  if (status === 'nao_atendida') return { label: 'NÃO', corClasse: 'bg-[#B80000] text-white' }
  return { label: '—', corClasse: 'bg-gray-100 text-gray-500' }
}
