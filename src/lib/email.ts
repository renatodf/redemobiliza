import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.REMETENTE_EMAIL ?? 'noreply@redemobiliza.com.br'

export interface EmailPayload {
  para: string
  assunto: string
  html: string
}

export async function enviarEmail({ para, assunto, html }: EmailPayload): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to: para,
    subject: assunto,
    html,
  })
  if (error) throw new Error(`Falha ao enviar e-mail: ${error.message}`)
}

export function templateDemandaAtribuida({
  nomeResponsavel,
  tituloDemanda,
  nomeSolicitante,
  prazo,
  urlDemanda,
}: {
  nomeResponsavel: string
  tituloDemanda: string
  nomeSolicitante: string
  prazo: Date
  urlDemanda: string
}): string {
  return `
    <p>Olá, ${nomeResponsavel}!</p>
    <p>Uma nova demanda foi atribuída a você:</p>
    <p><strong>${tituloDemanda}</strong></p>
    <p>Solicitante: ${nomeSolicitante}</p>
    <p>Prazo de desfecho: ${prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    <p><a href="${urlDemanda}">Acessar demanda →</a></p>
  `
}

export function templateAlertaExpiracao({
  nomeResponsavel,
  tituloDemanda,
  prazo,
  urlDemanda,
}: {
  nomeResponsavel: string
  tituloDemanda: string
  prazo: Date
  urlDemanda: string
}): string {
  return `
    <p>Olá, ${nomeResponsavel}!</p>
    <p>A demanda <strong>${tituloDemanda}</strong> está prestes a expirar.</p>
    <p>Prazo: ${prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    <p><a href="${urlDemanda}">Acessar demanda →</a></p>
  `
}

export function templateDemandaExpirada({
  nomeDestinatario,
  tituloDemanda,
  nomeSolicitante,
  urlDemanda,
}: {
  nomeDestinatario: string
  tituloDemanda: string
  nomeSolicitante: string
  urlDemanda: string
}): string {
  return `
    <p>Olá, ${nomeDestinatario}!</p>
    <p>A demanda <strong>${tituloDemanda}</strong> (solicitante: ${nomeSolicitante}) expirou sem desfecho.</p>
    <p><a href="${urlDemanda}">Acessar demanda →</a></p>
  `
}
