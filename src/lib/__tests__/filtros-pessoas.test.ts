import { describe, it, expect } from 'vitest'
import { buildWherePessoas, aplicarFiltrosPosConsulta } from '../filtros-pessoas'

describe('buildWherePessoas', () => {
  it('sempre filtra por gabineteId e deletedAt null', () => {
    const where = buildWherePessoas('gab-1', {})
    expect(where.gabineteId).toBe('gab-1')
    expect(where.deletedAt).toBeNull()
  })

  it('adiciona id in quando idsRede é passado (escopo mobilizador)', () => {
    const where = buildWherePessoas('gab-1', {}, ['p1', 'p2'])
    expect(where.id).toEqual({ in: ['p1', 'p2'] })
  })

  it('não filtra por id quando idsRede não é passado (escopo admin)', () => {
    const where = buildWherePessoas('gab-1', {})
    expect(where.id).toBeUndefined()
  })

  it('adiciona filtro de segmento via relação', () => {
    const where = buildWherePessoas('gab-1', { segmentoId: 'seg-1' })
    expect(where.segmentos).toEqual({ some: { segmentoId: 'seg-1' } })
  })

  it('exige nascimento não nulo quando há filtro de idade ou aniversário', () => {
    const where = buildWherePessoas('gab-1', { aniversario: 'mes' })
    expect(where.nascimento).toEqual({ not: null })
  })

  it('não exige nascimento quando não há filtro de idade/aniversário', () => {
    const where = buildWherePessoas('gab-1', { genero: 'feminino' })
    expect(where.nascimento).toBeUndefined()
  })
})

describe('aplicarFiltrosPosConsulta', () => {
  const hoje = new Date(2026, 6, 15)
  const pessoas = [
    { id: '1', nascimento: new Date(1990, 6, 15) },
    { id: '2', nascimento: new Date(1980, 0, 1) },
    { id: '3', nascimento: null as Date | null },
  ]

  it('filtra por aniversário do dia', () => {
    const resultado = aplicarFiltrosPosConsulta(pessoas, { aniversario: 'dia' }, hoje)
    expect(resultado.map((p) => p.id)).toEqual(['1'])
  })

  it('exclui pessoas sem nascimento quando há filtro de aniversário', () => {
    const resultado = aplicarFiltrosPosConsulta(pessoas, { aniversario: 'mes' }, hoje)
    expect(resultado.find((p) => p.id === '3')).toBeUndefined()
  })

  it('sem filtros de aniversário/idade, mantém todo mundo (inclusive sem nascimento)', () => {
    const resultado = aplicarFiltrosPosConsulta(pessoas, {}, hoje)
    expect(resultado.length).toBe(3)
  })

  it('filtra por faixa de idade', () => {
    const resultado = aplicarFiltrosPosConsulta(pessoas, { idadeMin: '35', idadeMax: '37' }, hoje)
    expect(resultado.map((p) => p.id)).toEqual(['1'])
  })
})
