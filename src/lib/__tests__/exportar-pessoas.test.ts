import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarExcelPessoas, gerarPdfPessoas, type PessoaExportavel } from '../exportar-pessoas'

const pessoaExemplo: PessoaExportavel = {
  nome: 'Maria Silva',
  whatsapp: '61999998888',
  email: 'maria@example.com',
  nascimento: new Date(1990, 4, 20),
  regiao: { nome: 'Taguatinga' },
  profissao: { nome: 'Professora' },
  segmentos: [{ segmento: { nome: 'Saúde' } }],
}

describe('gerarExcelPessoas', () => {
  it('gera um .xlsx válido com uma linha por pessoa', async () => {
    const buffer = await gerarExcelPessoas([pessoaExemplo])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Pessoas')
    expect(sheet?.rowCount).toBe(2)
    expect(sheet?.getRow(2).getCell(1).value).toBe('Maria Silva')
  })

  it('gera planilha vazia (só cabeçalho) quando não há pessoas', async () => {
    const buffer = await gerarExcelPessoas([])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Pessoas')
    expect(sheet?.rowCount).toBe(1)
  })
})

describe('gerarPdfPessoas', () => {
  it('gera um PDF válido (bytes começam com %PDF-)', async () => {
    const buffer = await gerarPdfPessoas([pessoaExemplo])
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })

  it('não quebra com lista vazia', async () => {
    const buffer = await gerarPdfPessoas([])
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })
})
