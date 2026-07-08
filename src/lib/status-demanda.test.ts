import { describe, it, expect } from 'vitest'
import { statusDemandaPill, foiAtendidaPill } from './status-demanda'

describe('statusDemandaPill', () => {
  it('atendida -> CONCLUÍDO verde', () => {
    expect(statusDemandaPill('atendida')).toEqual({ label: 'CONCLUÍDO', corClasse: 'bg-[#6E9924] text-white' })
  })
  it('aberta -> PENDENTE amarelo', () => {
    expect(statusDemandaPill('aberta')).toEqual({ label: 'PENDENTE', corClasse: 'bg-[#CBB100] text-white' })
  })
  it('expirada -> PENDENTE amarelo', () => {
    expect(statusDemandaPill('expirada')).toEqual({ label: 'PENDENTE', corClasse: 'bg-[#CBB100] text-white' })
  })
  it('nao_atendida -> NÃO ATENDIDA vermelho', () => {
    expect(statusDemandaPill('nao_atendida')).toEqual({ label: 'NÃO ATENDIDA', corClasse: 'bg-[#B80000] text-white' })
  })
})

describe('foiAtendidaPill', () => {
  it('atendida -> SIM verde', () => {
    expect(foiAtendidaPill('atendida')).toEqual({ label: 'SIM', corClasse: 'bg-[#6E9924] text-white' })
  })
  it('nao_atendida -> NÃO vermelho', () => {
    expect(foiAtendidaPill('nao_atendida')).toEqual({ label: 'NÃO', corClasse: 'bg-[#B80000] text-white' })
  })
  it('aberta -> — cinza', () => {
    expect(foiAtendidaPill('aberta')).toEqual({ label: '—', corClasse: 'bg-gray-100 text-gray-500' })
  })
})
