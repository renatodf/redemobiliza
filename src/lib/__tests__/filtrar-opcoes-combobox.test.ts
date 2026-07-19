import { describe, it, expect } from 'vitest'
import { filtrarOpcoesComboBox, type OpcaoComboBox } from '../filtrar-opcoes-combobox'

const OPCOES: OpcaoComboBox[] = [
  { id: '1', label: 'Educação' },
  { id: '2', label: 'Saúde' },
  { id: '3', label: 'Saneamento' },
]

describe('filtrarOpcoesComboBox', () => {
  it('sem busca, retorna todas as opções não selecionadas', () => {
    expect(filtrarOpcoesComboBox(OPCOES, '', new Set())).toEqual(OPCOES)
  })

  it('filtra por texto contido no label, case-insensitive', () => {
    expect(filtrarOpcoesComboBox(OPCOES, 'sa', new Set())).toEqual([
      { id: '2', label: 'Saúde' },
      { id: '3', label: 'Saneamento' },
    ])
  })

  it('exclui opções já selecionadas mesmo que o texto bata', () => {
    expect(filtrarOpcoesComboBox(OPCOES, 'sa', new Set(['2']))).toEqual([{ id: '3', label: 'Saneamento' }])
  })

  it('busca sem nenhuma opção compatível retorna lista vazia', () => {
    expect(filtrarOpcoesComboBox(OPCOES, 'zzz', new Set())).toEqual([])
  })

  it('busca com espaços nas pontas é ignorada na comparação', () => {
    expect(filtrarOpcoesComboBox(OPCOES, '  educação  ', new Set())).toEqual([{ id: '1', label: 'Educação' }])
  })
})
