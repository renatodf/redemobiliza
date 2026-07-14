import { describe, it, expect } from 'vitest'
import { temFiltroAtivo, CAMPOS_FILTRO_PESSOAS } from '../filtros-ativos'

describe('temFiltroAtivo', () => {
  it('retorna false quando nenhum filtro está presente', () => {
    expect(temFiltroAtivo({})).toBe(false)
  })

  it('retorna false quando só periodo está presente', () => {
    expect(temFiltroAtivo({ periodo: '7dias' })).toBe(false)
  })

  it('retorna false quando só idade/aniversário estão presentes (fora de escopo)', () => {
    expect(temFiltroAtivo({ idadeMin: '18', idadeMax: '30', aniversario: 'mes' })).toBe(false)
  })

  it('retorna true quando regiaoId está presente', () => {
    expect(temFiltroAtivo({ regiaoId: 'abc' })).toBe(true)
  })

  it('retorna true quando redeDeId está presente (inclusive "raiz")', () => {
    expect(temFiltroAtivo({ redeDeId: 'raiz' })).toBe(true)
  })

  it('retorna true quando um filtro reconhecido é combinado com periodo', () => {
    expect(temFiltroAtivo({ periodo: 'hoje', genero: 'feminino' })).toBe(true)
  })

  it('ignora valores vazios (string vazia não conta como filtro ativo)', () => {
    expect(temFiltroAtivo({ regiaoId: '' })).toBe(false)
  })
})

describe('CAMPOS_FILTRO_PESSOAS', () => {
  it('inclui exatamente os 7 campos esperados', () => {
    expect([...CAMPOS_FILTRO_PESSOAS].sort()).toEqual(
      ['escolaridade', 'genero', 'profissaoId', 'redeDeId', 'regiaoId', 'religiao', 'segmentoId'].sort()
    )
  })
})
