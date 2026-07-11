import { describe, it, expect } from 'vitest'
import { buildWhereBancoTalentos } from '../filtros-banco-talentos'

describe('buildWhereBancoTalentos', () => {
  it('sempre exclui colocado=true', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.colocado).toBe(false)
  })

  it('sempre exige curriculoUrl não nulo', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.curriculoUrl).toEqual({ not: null })
  })

  it('sempre filtra por gabineteId via relação pessoa', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.pessoa.gabineteId).toBe('gab-1')
  })

  it('filtra por região via relação pessoa', () => {
    const where = buildWhereBancoTalentos('gab-1', { regiaoId: 'regiao-1' })
    expect(where.pessoa.regiaoId).toBe('regiao-1')
  })

  it('sem filtro de região, não aplica regiaoId', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.pessoa.regiaoId).toBeUndefined()
  })

  it('filtra por prioridade, convertendo string pra número', () => {
    const where = buildWhereBancoTalentos('gab-1', { prioridade: '2' })
    expect(where.prioridade).toBe(2)
  })

  it('sem filtro de prioridade, não aplica', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.prioridade).toBeUndefined()
  })

  it('filtra isPcd=true quando "sim"', () => {
    const where = buildWhereBancoTalentos('gab-1', { isPcd: 'sim' })
    expect(where.isPcd).toBe(true)
  })

  it('filtra isPcd=false quando "nao"', () => {
    const where = buildWhereBancoTalentos('gab-1', { isPcd: 'nao' })
    expect(where.isPcd).toBe(false)
  })

  it('sem filtro de PcD, não aplica', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.isPcd).toBeUndefined()
  })

  it('filtra por áreas via relação, quando há ao menos uma', () => {
    const where = buildWhereBancoTalentos('gab-1', { areaIds: ['area-1', 'area-2'] })
    expect(where.areas).toEqual({ some: { areaColocacaoId: { in: ['area-1', 'area-2'] } } })
  })

  it('lista de áreas vazia não aplica filtro de área', () => {
    const where = buildWhereBancoTalentos('gab-1', { areaIds: [] })
    expect(where.areas).toBeUndefined()
  })

  it('sem areaIds, não aplica filtro de área', () => {
    const where = buildWhereBancoTalentos('gab-1', {})
    expect(where.areas).toBeUndefined()
  })

  it('combina todos os filtros ao mesmo tempo', () => {
    const where = buildWhereBancoTalentos('gab-1', {
      areaIds: ['area-1'],
      prioridade: '1',
      isPcd: 'sim',
      regiaoId: 'regiao-1',
    })
    expect(where).toEqual({
      colocado: false,
      curriculoUrl: { not: null },
      pessoa: { gabineteId: 'gab-1', regiaoId: 'regiao-1' },
      prioridade: 1,
      isPcd: true,
      areas: { some: { areaColocacaoId: { in: ['area-1'] } } },
    })
  })
})
