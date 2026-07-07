import { describe, it, expect } from 'vitest'
import { statusDemandaPill, foiAtendidaPill } from './status-demanda'

describe('statusDemandaPill', () => {
  it('atendida -> CONCLUÍDO verde', () => {
    expect(statusDemandaPill('atendida')).toEqual({ label: 'CONCLUÍDO', corClasse: 'bg-green-100 text-green-800' })
  })
  it('aberta -> PENDENTE amarelo', () => {
    expect(statusDemandaPill('aberta')).toEqual({ label: 'PENDENTE', corClasse: 'bg-yellow-100 text-yellow-800' })
  })
  it('expirada -> PENDENTE amarelo', () => {
    expect(statusDemandaPill('expirada')).toEqual({ label: 'PENDENTE', corClasse: 'bg-yellow-100 text-yellow-800' })
  })
  it('nao_atendida -> NÃO ATENDIDA vermelho', () => {
    expect(statusDemandaPill('nao_atendida')).toEqual({ label: 'NÃO ATENDIDA', corClasse: 'bg-red-100 text-red-800' })
  })
})

describe('foiAtendidaPill', () => {
  it('atendida -> SIM verde', () => {
    expect(foiAtendidaPill('atendida')).toEqual({ label: 'SIM', corClasse: 'bg-green-100 text-green-800' })
  })
  it('nao_atendida -> NÃO vermelho', () => {
    expect(foiAtendidaPill('nao_atendida')).toEqual({ label: 'NÃO', corClasse: 'bg-red-100 text-red-800' })
  })
  it('aberta -> — cinza', () => {
    expect(foiAtendidaPill('aberta')).toEqual({ label: '—', corClasse: 'bg-gray-100 text-gray-500' })
  })
})
