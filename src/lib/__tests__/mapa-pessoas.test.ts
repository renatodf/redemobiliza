import { describe, it, expect } from 'vitest'
import { calcularTamanhoBalao } from '../mapa-pessoas'

describe('calcularTamanhoBalao', () => {
  it('retorna o tamanho mínimo quando contagem é igual ao mínimo do conjunto', () => {
    expect(calcularTamanhoBalao(10, 10, 100)).toBe(17)
  })

  it('retorna o tamanho máximo quando contagem é igual ao máximo do conjunto', () => {
    expect(calcularTamanhoBalao(100, 10, 100)).toBe(34)
  })

  it('retorna um valor intermediário proporcional', () => {
    expect(calcularTamanhoBalao(55, 10, 100)).toBeCloseTo(25.5, 5)
  })

  it('retorna o ponto médio quando min e max são iguais (evita divisão por zero)', () => {
    expect(calcularTamanhoBalao(42, 42, 42)).toBe(25.5)
  })

  it('retorna tamanho mínimo quando contagem está abaixo do intervalo min/max', () => {
    expect(calcularTamanhoBalao(1, 10, 100)).toBe(17)
  })

  it('retorna tamanho máximo quando contagem está acima do intervalo min/max', () => {
    expect(calcularTamanhoBalao(150, 10, 100)).toBe(34)
  })
})
