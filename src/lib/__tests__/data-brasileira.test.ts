import { describe, it, expect } from 'vitest'
import { parseDataBrasileira, formatarDataBrasileira } from '../data-brasileira'

describe('parseDataBrasileira', () => {
  it('parseia data válida com zero à esquerda', () => {
    expect(parseDataBrasileira('05/03/1990')).toEqual(new Date(1990, 2, 5))
  })

  it('parseia data válida sem zero à esquerda', () => {
    expect(parseDataBrasileira('5/3/1990')).toEqual(new Date(1990, 2, 5))
  })

  it('rejeita dia inválido (32)', () => {
    expect(parseDataBrasileira('32/01/2000')).toBeNull()
  })

  it('rejeita 31 de fevereiro (overflow de mês)', () => {
    expect(parseDataBrasileira('31/02/2000')).toBeNull()
  })

  it('rejeita mês inválido (13)', () => {
    expect(parseDataBrasileira('10/13/2000')).toBeNull()
  })

  it('rejeita formato ISO (errado para este parser)', () => {
    expect(parseDataBrasileira('2000-01-10')).toBeNull()
  })

  it('rejeita string vazia', () => {
    expect(parseDataBrasileira('')).toBeNull()
  })

  it('rejeita texto qualquer', () => {
    expect(parseDataBrasileira('não é uma data')).toBeNull()
  })
})

describe('formatarDataBrasileira', () => {
  it('formata Date para DD/MM/AAAA com zero à esquerda', () => {
    expect(formatarDataBrasileira(new Date(1990, 2, 5))).toBe('05/03/1990')
  })

  it('retorna string vazia para null', () => {
    expect(formatarDataBrasileira(null)).toBe('')
  })

  it('retorna string vazia para undefined', () => {
    expect(formatarDataBrasileira(undefined)).toBe('')
  })

  it('roundtrip: formatar depois parsear retorna a mesma data', () => {
    const original = new Date(1985, 10, 23)
    expect(parseDataBrasileira(formatarDataBrasileira(original))).toEqual(original)
  })
})
