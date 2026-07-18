import { describe, it, expect } from 'vitest'
import { montarObservacao, resolverAreaIdsUnicos } from './lib-banco-talentos-fase4'

describe('montarObservacao', () => {
  it('ambos vazios retorna null', () => {
    expect(montarObservacao('', '')).toBeNull()
  })

  it('só whoIndicate preenchido', () => {
    expect(montarObservacao('Indicado por João', '')).toBe('Indicado por João')
  })

  it('só observation preenchido', () => {
    expect(montarObservacao('', 'Currículo em análise')).toBe('Currículo em análise')
  })

  it('ambos preenchidos concatenam com separador', () => {
    expect(montarObservacao('Indicado por João', 'Currículo em análise')).toBe('Indicado por João; Currículo em análise')
  })

  it('espaços nas pontas são removidos antes de decidir se está vazio', () => {
    expect(montarObservacao('   ', '  ')).toBeNull()
    expect(montarObservacao('  Indicado  ', '')).toBe('Indicado')
  })
})

describe('resolverAreaIdsUnicos', () => {
  it('sem roleIds retorna vazio', () => {
    expect(resolverAreaIdsUnicos([], new Map(), new Map())).toEqual([])
  })

  it('resolve role -> label -> id da área', () => {
    const labelsDeCargo = new Map([['role1', 'Atendente']])
    const areaIdPorNome = new Map([['atendente', 'area-1']])
    expect(resolverAreaIdsUnicos(['role1'], labelsDeCargo, areaIdPorNome)).toEqual(['area-1'])
  })

  it('role sem label conhecida é ignorada', () => {
    const labelsDeCargo = new Map<string, string>()
    const areaIdPorNome = new Map([['atendente', 'area-1']])
    expect(resolverAreaIdsUnicos(['role-desconhecida'], labelsDeCargo, areaIdPorNome)).toEqual([])
  })

  it('label sem área correspondente no catálogo é ignorada', () => {
    const labelsDeCargo = new Map([['role1', 'Cargo Inexistente']])
    const areaIdPorNome = new Map([['atendente', 'area-1']])
    expect(resolverAreaIdsUnicos(['role1'], labelsDeCargo, areaIdPorNome)).toEqual([])
  })

  it('duas roles diferentes resolvendo pro mesmo id de área são deduplicadas', () => {
    const labelsDeCargo = new Map([
      ['role1', 'Atendente'],
      ['role2', 'ATENDENTE'],
    ])
    const areaIdPorNome = new Map([['atendente', 'area-1']])
    expect(resolverAreaIdsUnicos(['role1', 'role2'], labelsDeCargo, areaIdPorNome)).toEqual(['area-1'])
  })
})
