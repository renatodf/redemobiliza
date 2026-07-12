import { describe, it, expect } from 'vitest'
import { agruparTopEOutros } from '../agrupar-top-outros'

describe('agruparTopEOutros', () => {
  it('mantém todos os valores quando estão dentro do limite', () => {
    const resultado = agruparTopEOutros(
      [
        { chave: 'Católica', contagem: 10 },
        { chave: 'Evangélica', contagem: 8 },
      ],
      5
    )
    expect(resultado).toEqual([
      { chave: 'Católica', contagem: 10 },
      { chave: 'Evangélica', contagem: 8 },
    ])
  })

  it('ordena do maior pro menor', () => {
    const resultado = agruparTopEOutros(
      [
        { chave: 'B', contagem: 3 },
        { chave: 'A', contagem: 10 },
      ],
      5
    )
    expect(resultado.map((r) => r.chave)).toEqual(['A', 'B'])
  })

  it('agrupa o excedente em "Outros"', () => {
    const resultado = agruparTopEOutros(
      [
        { chave: 'A', contagem: 10 },
        { chave: 'B', contagem: 8 },
        { chave: 'C', contagem: 5 },
        { chave: 'D', contagem: 2 },
      ],
      2
    )
    expect(resultado).toEqual([
      { chave: 'A', contagem: 10 },
      { chave: 'B', contagem: 8 },
      { chave: 'Outros', contagem: 7 },
    ])
  })

  it('agrupa null e string vazia em "Não informado"', () => {
    const resultado = agruparTopEOutros(
      [
        { chave: 'A', contagem: 10 },
        { chave: null, contagem: 3 },
        { chave: '', contagem: 2 },
      ],
      5
    )
    expect(resultado).toEqual([
      { chave: 'A', contagem: 10 },
      { chave: 'Não informado', contagem: 5 },
    ])
  })

  it('sem excedente, não gera fatia "Outros"', () => {
    const resultado = agruparTopEOutros([{ chave: 'A', contagem: 10 }], 5)
    expect(resultado.find((r) => r.chave === 'Outros')).toBeUndefined()
  })

  it('sem valores não informados, não gera fatia "Não informado"', () => {
    const resultado = agruparTopEOutros([{ chave: 'A', contagem: 10 }], 5)
    expect(resultado.find((r) => r.chave === 'Não informado')).toBeUndefined()
  })

  it('lista vazia retorna lista vazia', () => {
    expect(agruparTopEOutros([], 5)).toEqual([])
  })
})
