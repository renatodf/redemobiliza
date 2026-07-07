import { describe, it, expect } from 'vitest'
import { paginar } from './paginacao'

describe('paginar', () => {
  it('calcula skip/take e total de páginas', () => {
    expect(paginar(90, 1, 20)).toEqual({ paginaAtual: 1, totalPaginas: 5, skip: 0, take: 20 })
    expect(paginar(90, 3, 20)).toEqual({ paginaAtual: 3, totalPaginas: 5, skip: 40, take: 20 })
  })
  it('arredonda totalPaginas para cima', () => {
    expect(paginar(91, 1, 20).totalPaginas).toBe(5)
  })
  it('nunca retorna totalPaginas menor que 1', () => {
    expect(paginar(0, 1, 20).totalPaginas).toBe(1)
  })
  it('clampa página abaixo de 1 para 1', () => {
    expect(paginar(90, 0, 20).paginaAtual).toBe(1)
    expect(paginar(90, -5, 20).skip).toBe(0)
  })
  it('clampa página acima do total para o total', () => {
    expect(paginar(90, 99, 20).paginaAtual).toBe(5)
  })
})
