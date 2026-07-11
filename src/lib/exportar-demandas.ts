import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { statusDemandaPill } from './status-demanda'

export type DemandaExportavel = {
  titulo: string
  area: { nome: string }
  status: string
  solicitante: { nome: string }
  responsavel: { nome: string }
  prazoDesfecho: Date
}

function formatarLinha(d: DemandaExportavel) {
  return {
    titulo: d.titulo,
    area: d.area.nome,
    status: statusDemandaPill(d.status).label,
    solicitante: d.solicitante.nome,
    responsavel: d.responsavel.nome,
    prazo: d.prazoDesfecho.toLocaleDateString('pt-BR'),
  }
}

export async function gerarExcelDemandas(demandas: DemandaExportavel[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Demandas')
  sheet.columns = [
    { header: 'Título', key: 'titulo', width: 30 },
    { header: 'Área', key: 'area', width: 20 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Solicitante', key: 'solicitante', width: 24 },
    { header: 'Responsável', key: 'responsavel', width: 24 },
    { header: 'Prazo', key: 'prazo', width: 14 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const d of demandas) sheet.addRow(formatarLinha(d))
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

const COLUNAS = [
  { chave: 'titulo' as const, titulo: 'Título', largura: 120 },
  { chave: 'area' as const, titulo: 'Área', largura: 70 },
  { chave: 'status' as const, titulo: 'Status', largura: 70 },
  { chave: 'solicitante' as const, titulo: 'Solicitante', largura: 90 },
  { chave: 'responsavel' as const, titulo: 'Responsável', largura: 90 },
  { chave: 'prazo' as const, titulo: 'Prazo', largura: 70 },
]

export async function gerarPdfDemandas(demandas: DemandaExportavel[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const fonte = await doc.embedFont(StandardFonts.Helvetica)
  const fonteBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const largura = 595
  const altura = 842
  const margem = 40
  const alturaLinha = 18

  let pagina = doc.addPage([largura, altura])
  let y = altura - margem

  function novaPagina() {
    pagina = doc.addPage([largura, altura])
    y = altura - margem
  }

  function desenharCabecalho() {
    let x = margem
    for (const col of COLUNAS) {
      pagina.drawText(col.titulo, { x, y, size: 9, font: fonteBold, color: rgb(0, 0, 0) })
      x += col.largura
    }
    y -= alturaLinha
  }

  pagina.drawText('Demandas filtradas', { x: margem, y, size: 14, font: fonteBold })
  y -= alturaLinha * 1.5
  desenharCabecalho()

  for (const d of demandas) {
    if (y < margem + alturaLinha) {
      novaPagina()
      desenharCabecalho()
    }
    const linha = formatarLinha(d)
    let x = margem
    for (const col of COLUNAS) {
      pagina.drawText(linha[col.chave].slice(0, 40), { x, y, size: 8, font: fonte, color: rgb(0.2, 0.2, 0.2) })
      x += col.largura
    }
    y -= alturaLinha
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}
