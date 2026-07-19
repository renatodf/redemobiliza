import { describe, it, expect } from 'vitest'
import { toggleLista } from '../toggle-lista'

describe('toggleLista', () => {
  it('valor ausente na lista é adicionado', () => {
    expect(toggleLista(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
  })

  it('valor já presente na lista é removido', () => {
    expect(toggleLista(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('lista vazia, adiciona o valor', () => {
    expect(toggleLista([], 'a')).toEqual(['a'])
  })

  it('lista com um único valor igual ao buscado, remove e fica vazia', () => {
    expect(toggleLista(['a'], 'a')).toEqual([])
  })

  it('não modifica a lista original (imutável)', () => {
    const original = ['a', 'b']
    toggleLista(original, 'c')
    expect(original).toEqual(['a', 'b'])
  })
})
