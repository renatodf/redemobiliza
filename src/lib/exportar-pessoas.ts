import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type PessoaExportavel = {
  nome: string
  whatsapp: string
  email: string | null
  nascimento: Date | null
  regiao: { nome: string } | null
  profissao: { nome: string } | null
  segmentos: { segmento: { nome: string } }[]
}

function formatarLinha(p: PessoaExportavel) {
  return {
    nome: p.nome,
    whatsapp: p.whatsapp,
    email: p.email ?? '',
    regiao: p.regiao?.nome ?? '',
    profissao: p.profissao?.nome ?? '',
    segmentos: p.segmentos.map((s) => s.segmento.nome).join(', '),
    nascimento: p.nascimento ? p.nascimento.toLocaleDateString('pt-BR') : '',
  }
}

export async function gerarExcelPessoas(pessoas: PessoaExportavel[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Pessoas')
  sheet.columns = [
    { header: 'Nome', key: 'nome', width: 30 },
    { header: 'WhatsApp', key: 'whatsapp', width: 18 },
    { header: 'E-mail', key: 'email', width: 28 },
    { header: 'Região', key: 'regiao', width: 20 },
    { header: 'Profissão', key: 'profissao', width: 20 },
    { header: 'Segmentos', key: 'segmentos', width: 30 },
    { header: 'Nascimento', key: 'nascimento', width: 14 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const p of pessoas) sheet.addRow(formatarLinha(p))
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

const COLUNAS = [
  { chave: 'nome' as const, titulo: 'Nome', largura: 140 },
  { chave: 'whatsapp' as const, titulo: 'WhatsApp', largura: 90 },
  { chave: 'regiao' as const, titulo: 'Região', largura: 80 },
  { chave: 'profissao' as const, titulo: 'Profissão', largura: 90 },
  { chave: 'nascimento' as const, titulo: 'Nascimento', largura: 70 },
]

export async function gerarPdfPessoas(pessoas: PessoaExportavel[]): Promise<Buffer> {
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

  pagina.drawText('Pessoas filtradas', { x: margem, y, size: 14, font: fonteBold })
  y -= alturaLinha * 1.5
  desenharCabecalho()

  for (const p of pessoas) {
    if (y < margem + alturaLinha) {
      novaPagina()
      desenharCabecalho()
    }
    const linha = formatarLinha(p)
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
