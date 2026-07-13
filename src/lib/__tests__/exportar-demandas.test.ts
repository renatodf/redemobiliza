import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarExcelDemandas, gerarPdfDemandas, type DemandaExportavel } from '../exportar-demandas'

const demandaExemplo: DemandaExportavel = {
  titulo: 'Buraco na rua principal',
  area: { nome: 'Infraestrutura' },
  status: 'atendida',
  solicitante: { nome: 'João Souza' },
  responsavel: { nome: 'Maria Silva' },
  prazoDesfecho: new Date(2026, 6, 20),
}

describe('gerarExcelDemandas', () => {
  it('gera um .xlsx válido com uma linha por demanda', async () => {
    const buffer = await gerarExcelDemandas([demandaExemplo])
    const workbook = new ExcelJS.Workbook()
    // exceljs declara sua própria interface global `Buffer extends ArrayBuffer`
    // (index.d.ts do pacote), que colide com a do @types/node e quebra a
    // compatibilidade estrutural — bug de tipos de terceiros, não do nosso código.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any)
    const sheet = workbook.getWorksheet('Demandas')
    expect(sheet?.rowCount).toBe(2)
    expect(sheet?.getRow(2).getCell(1).value).toBe('Buraco na rua principal')
  })

  it('usa o label amigável do status, não o valor cru', async () => {
    const buffer = await gerarExcelDemandas([demandaExemplo])
    const workbook = new ExcelJS.Workbook()
    // exceljs declara sua própria interface global `Buffer extends ArrayBuffer`
    // (index.d.ts do pacote), que colide com a do @types/node e quebra a
    // compatibilidade estrutural — bug de tipos de terceiros, não do nosso código.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any)
    const sheet = workbook.getWorksheet('Demandas')
    expect(sheet?.getRow(2).getCell(3).value).toBe('CONCLUÍDO')
  })

  it('gera planilha vazia (só cabeçalho) quando não há demandas', async () => {
    const buffer = await gerarExcelDemandas([])
    const workbook = new ExcelJS.Workbook()
    // exceljs declara sua própria interface global `Buffer extends ArrayBuffer`
    // (index.d.ts do pacote), que colide com a do @types/node e quebra a
    // compatibilidade estrutural — bug de tipos de terceiros, não do nosso código.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any)
    const sheet = workbook.getWorksheet('Demandas')
    expect(sheet?.rowCount).toBe(1)
  })
})

describe('gerarPdfDemandas', () => {
  it('gera um PDF válido (bytes começam com %PDF-)', async () => {
    const buffer = await gerarPdfDemandas([demandaExemplo])
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })

  it('não quebra com lista vazia', async () => {
    const buffer = await gerarPdfDemandas([])
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })
})
