import { describe, it, expect } from 'vitest'
import { buildWhereDemandas } from '../filtros-demandas'

describe('buildWhereDemandas', () => {
  it('sempre filtra por gabineteId e deletedAt null', () => {
    const where = buildWhereDemandas('gab-1', {})
    expect(where.gabineteId).toBe('gab-1')
    expect(where.deletedAt).toBeNull()
  })

  it('adiciona responsavelId quando passado (escopo mobilizador)', () => {
    const where = buildWhereDemandas('gab-1', {}, 'pessoa-1')
    expect(where.responsavelId).toBe('pessoa-1')
  })

  it('não filtra por responsavelId quando não passado (escopo admin)', () => {
    const where = buildWhereDemandas('gab-1', {})
    expect(where.responsavelId).toBeUndefined()
  })

  it('filtra por área', () => {
    const where = buildWhereDemandas('gab-1', { areaId: 'area-1' })
    expect(where.areaId).toBe('area-1')
  })

  it('filtra por status "atendida" diretamente', () => {
    const where = buildWhereDemandas('gab-1', { status: 'atendida' })
    expect(where.status).toBe('atendida')
  })

  it('filtra por status "nao_atendida" diretamente', () => {
    const where = buildWhereDemandas('gab-1', { status: 'nao_atendida' })
    expect(where.status).toBe('nao_atendida')
  })

  it('agrupa "pendente" em aberta + expirada', () => {
    const where = buildWhereDemandas('gab-1', { status: 'pendente' })
    expect(where.status).toEqual({ in: ['aberta', 'expirada'] })
  })

  it('ignora status fora do enum esperado', () => {
    // @ts-expect-error valor inválido de propósito, pra testar o runtime
    const where = buildWhereDemandas('gab-1', { status: 'lixo' })
    expect(where.status).toBeUndefined()
  })

  it('sem filtro de status, não aplica nenhum', () => {
    const where = buildWhereDemandas('gab-1', {})
    expect(where.status).toBeUndefined()
  })

  it('filtra por região do solicitante via relação', () => {
    const where = buildWhereDemandas('gab-1', { regiaoId: 'regiao-1' })
    expect(where.solicitante).toEqual({ regiaoId: 'regiao-1' })
  })

  it('sem filtro de região, não aplica relação de solicitante', () => {
    const where = buildWhereDemandas('gab-1', {})
    expect(where.solicitante).toBeUndefined()
  })

  it('combina todos os filtros ao mesmo tempo', () => {
    const where = buildWhereDemandas(
      'gab-1',
      { areaId: 'area-1', status: 'pendente', regiaoId: 'regiao-1' },
      'pessoa-1'
    )
    expect(where).toEqual({
      gabineteId: 'gab-1',
      deletedAt: null,
      responsavelId: 'pessoa-1',
      areaId: 'area-1',
      status: { in: ['aberta', 'expirada'] },
      solicitante: { regiaoId: 'regiao-1' },
    })
  })
})
