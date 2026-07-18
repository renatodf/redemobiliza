import { describe, it, expect } from 'vitest'
import {
  escolherTelefones,
  ehPessoaDummyDoLuar,
  decodificarGenero,
  decodificarReligiao,
  normalizarNome,
  registrarWhatsappUnico,
  resolverNomeCatalogo,
  validarNascimento,
  type TelefoneMongo,
} from './lib-pessoas-fase3'

describe('escolherTelefones', () => {
  it('sem telefones retorna tudo null/vazio', () => {
    expect(escolherTelefones([])).toEqual({ whatsapp: null, telefoneFixo: null, extras: [] })
  })

  it('um celular único vira whatsapp', () => {
    const telefones: TelefoneMongo[] = [{ id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '61987654321' }]
    expect(escolherTelefones(telefones)).toEqual({ whatsapp: '5561987654321', telefoneFixo: null, extras: [] })
  })

  it('prefere celular sobre fixo mesmo se o fixo for mais recente', () => {
    const telefones: TelefoneMongo[] = [
      { id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '61987654321' },
      { id: '000000000000000000000002', tipo: 'landline', numeroCru: '6133224455' },
    ]
    const r = escolherTelefones(telefones)
    expect(r.whatsapp).toBe('5561987654321')
    expect(r.telefoneFixo).toBe('556133224455')
  })

  it('entre múltiplos celulares usa o mais recente (maior _id)', () => {
    const telefones: TelefoneMongo[] = [
      { id: '000000000000000000000002', tipo: 'cellphone', numeroCru: '61911112222' },
      { id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '61987654321' },
    ]
    // fora de ordem de inserção no array — a função deve ordenar por id, não confiar na ordem recebida
    expect(escolherTelefones(telefones).whatsapp).toBe('5561911112222')
  })

  it('só fixo (sem celular) vira whatsapp também', () => {
    const telefones: TelefoneMongo[] = [{ id: '000000000000000000000001', tipo: 'landline', numeroCru: '6133224455' }]
    expect(escolherTelefones(telefones)).toEqual({ whatsapp: '556133224455', telefoneFixo: '556133224455', extras: [] })
  })

  it('números inválidos são descartados', () => {
    const telefones: TelefoneMongo[] = [
      { id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '123' },
      { id: '000000000000000000000002', tipo: 'cellphone', numeroCru: '61987654321' },
    ]
    expect(escolherTelefones(telefones).whatsapp).toBe('5561987654321')
  })

  it('todos inválidos retorna whatsapp null', () => {
    const telefones: TelefoneMongo[] = [{ id: '000000000000000000000001', tipo: 'cellphone', numeroCru: 'abc' }]
    expect(escolherTelefones(telefones).whatsapp).toBeNull()
  })

  it('números extras vão pra extras, sem duplicar o whatsapp/telefoneFixo escolhidos', () => {
    const telefones: TelefoneMongo[] = [
      { id: '000000000000000000000001', tipo: 'cellphone', numeroCru: '61911112222' },
      { id: '000000000000000000000002', tipo: 'cellphone', numeroCru: '61987654321' },
      { id: '000000000000000000000003', tipo: 'landline', numeroCru: '6133224455' },
    ]
    const r = escolherTelefones(telefones)
    expect(r.whatsapp).toBe('5561987654321')
    expect(r.telefoneFixo).toBe('556133224455')
    expect(r.extras).toEqual(['5561911112222'])
  })
})

describe('ehPessoaDummyDoLuar', () => {
  const LUAR = '6063a6ccc3e599000464eaa7'

  it('não é do Luar: false mesmo com nome suspeito', () => {
    expect(ehPessoaDummyDoLuar({ createdById: 'outro-id', email: null, nome: 'Luar teste' })).toBe(false)
  })

  it('é do Luar mas nome/email normais: false', () => {
    expect(ehPessoaDummyDoLuar({ createdById: LUAR, email: 'maria@gmail.com', nome: 'Maria Silva' })).toBe(false)
  })

  it('é do Luar com "teste" no nome: true', () => {
    expect(ehPessoaDummyDoLuar({ createdById: LUAR, email: null, nome: 'Luar 2 Faria teste' })).toBe(true)
  })

  it('é do Luar com "legislapp" no email: true', () => {
    expect(ehPessoaDummyDoLuar({ createdById: LUAR, email: 'x@legislapp.com.br', nome: 'Alguém' })).toBe(true)
  })

  it('é do Luar com "luar" no nome: true', () => {
    expect(ehPessoaDummyDoLuar({ createdById: LUAR, email: null, nome: 'Luar 3 Faria doido' })).toBe(true)
  })
})

describe('decodificarGenero', () => {
  it('id feminino conhecido', () => {
    expect(decodificarGenero('5c82c37a24a225000460301f')).toBe('feminino')
  })
  it('id masculino conhecido', () => {
    expect(decodificarGenero('5c82c37a24a2250004603016')).toBe('masculino')
  })
  it('id desconhecido retorna null', () => {
    expect(decodificarGenero('000000000000000000000000')).toBeNull()
  })
  it('null retorna null', () => {
    expect(decodificarGenero(null)).toBeNull()
  })
})

describe('decodificarReligiao', () => {
  it('id conhecido', () => {
    expect(decodificarReligiao('5c82c2c724a2250004602f24')).toBe('CATÓLICA APOSTÓLICA ROMANA')
  })
  it('id desconhecido retorna null', () => {
    expect(decodificarReligiao('000000000000000000000000')).toBeNull()
  })
})

describe('normalizarNome', () => {
  it('remove acento e caixa', () => {
    expect(normalizarNome('Luziânia')).toBe('luziania')
    expect(normalizarNome('LUZIANIA')).toBe('luziania')
  })
  it('mantém espaços internos, remove das pontas', () => {
    expect(normalizarNome('  Água Fria de Goiás  ')).toBe('agua fria de goias')
  })
})

describe('registrarWhatsappUnico', () => {
  it('primeiro registro retorna true', () => {
    const usados = new Set<string>()
    expect(registrarWhatsappUnico(usados, '5561987654321')).toBe(true)
    expect(usados.has('5561987654321')).toBe(true)
  })
  it('segundo registro do mesmo número retorna false', () => {
    const usados = new Set<string>(['5561987654321'])
    expect(registrarWhatsappUnico(usados, '5561987654321')).toBe(false)
  })
})

describe('resolverNomeCatalogo', () => {
  it('sem fusão, retorna o próprio label', () => {
    expect(resolverNomeCatalogo('Taguatinga', {})).toBe('Taguatinga')
  })
  it('com fusão, retorna o nome canônico', () => {
    expect(resolverNomeCatalogo('Acao social', { 'Acao social': 'Ação social' })).toBe('Ação social')
  })
})

describe('validarNascimento', () => {
  it('data plausível passa direto', () => {
    const data = new Date('1990-05-15')
    expect(validarNascimento(data)).toBe(data)
  })

  it('ano 0000 (sentinela do sistema antigo) retorna null', () => {
    // Date.UTC(0, ...) sofre o mapeamento legado de anos 0-99 pra 1900-1999,
    // então pra representar ano 0000 de fato é preciso setUTCFullYear(0).
    const data = new Date(Date.UTC(2000, 7, 29))
    data.setUTCFullYear(0)
    expect(validarNascimento(data)).toBeNull()
  })

  it('ano muito no futuro retorna null', () => {
    const data = new Date(Date.UTC(2982, 0, 1))
    expect(validarNascimento(data)).toBeNull()
  })

  it('ano exatamente 1900 é aceito (limite inclusivo)', () => {
    const data = new Date(Date.UTC(1900, 0, 1))
    expect(validarNascimento(data)).toBe(data)
  })

  it('não é Date retorna null', () => {
    expect(validarNascimento('1990-05-15')).toBeNull()
    expect(validarNascimento(null)).toBeNull()
    expect(validarNascimento(undefined)).toBeNull()
  })
})
