import { describe, it, expect } from 'vitest'
import { resolverMongoIdIndicador, calcularNiveis } from './lib-rede-fase5'

describe('resolverMongoIdIndicador', () => {
  const canonicos = new Set(['pessoa-a', 'pessoa-b', 'dev-gustavo-nao-deveria-estar-aqui'])

  it('sem created_by_id retorna null (raiz)', () => {
    expect(resolverMongoIdIndicador(null, canonicos)).toBeNull()
  })

  it('created_by_id é o dev Gustavo retorna null (raiz), mesmo se ele for canônico', () => {
    expect(resolverMongoIdIndicador('67605433e30de14b89780451', canonicos)).toBeNull()
  })

  it('created_by_id é o dev Luar retorna null (raiz)', () => {
    expect(resolverMongoIdIndicador('6063a6ccc3e599000464eaa7', canonicos)).toBeNull()
  })

  it('created_by_id não é canônico (indicador não foi importado) retorna null (raiz)', () => {
    expect(resolverMongoIdIndicador('pessoa-nao-importada', canonicos)).toBeNull()
  })

  it('created_by_id válido e canônico retorna o próprio id', () => {
    expect(resolverMongoIdIndicador('pessoa-a', canonicos)).toBe('pessoa-a')
  })
})

describe('calcularNiveis', () => {
  it('mapa vazio retorna mapa vazio', () => {
    expect(calcularNiveis(new Map())).toEqual(new Map())
  })

  it('um nó raiz único tem nível 0', () => {
    const grafo = new Map([['a', null]])
    expect(calcularNiveis(grafo)).toEqual(new Map([['a', 0]]))
  })

  it('cadeia de profundidade 3', () => {
    const grafo = new Map<string, string | null>([
      ['raiz', null],
      ['filho1', 'raiz'],
      ['filho2', 'filho1'],
      ['filho3', 'filho2'],
    ])
    expect(calcularNiveis(grafo)).toEqual(
      new Map([
        ['raiz', 0],
        ['filho1', 1],
        ['filho2', 2],
        ['filho3', 3],
      ])
    )
  })

  it('duas raízes independentes com filhos próprios', () => {
    const grafo = new Map<string, string | null>([
      ['raiz1', null],
      ['raiz2', null],
      ['filho-de-1', 'raiz1'],
      ['filho-de-2', 'raiz2'],
    ])
    expect(calcularNiveis(grafo)).toEqual(
      new Map([
        ['raiz1', 0],
        ['raiz2', 0],
        ['filho-de-1', 1],
        ['filho-de-2', 1],
      ])
    )
  })

  it('nó cujo indicador não está no mapa (nunca deveria acontecer na prática) recebe nível 0 por segurança', () => {
    const grafo = new Map<string, string | null>([['orfao', 'indicador-inexistente']])
    expect(calcularNiveis(grafo)).toEqual(new Map([['orfao', 0]]))
  })
})
