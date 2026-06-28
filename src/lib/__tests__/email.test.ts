import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null })
  return { mockSend }
})
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } }
  }),
}))

import { enviarEmail, templateDemandaAtribuida, templateAlertaExpiracao, templateDemandaExpirada } from '@/lib/email'

describe('enviarEmail', () => {
  beforeEach(() => mockSend.mockClear())

  it('chama resend.emails.send com os parâmetros corretos', async () => {
    await enviarEmail({ para: 'test@test.com', assunto: 'Teste', html: '<p>ok</p>' })
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test@test.com',
      subject: 'Teste',
      html: '<p>ok</p>',
    }))
  })

  it('lança erro quando Resend retorna error', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'API key inválida' } })
    await expect(enviarEmail({ para: 'x@x.com', assunto: 'x', html: 'x' }))
      .rejects.toThrow('Falha ao enviar e-mail')
  })
})

describe('templates', () => {
  it('templateDemandaAtribuida contém nome e título', () => {
    const html = templateDemandaAtribuida({
      nomeResponsavel: 'João',
      tituloDemanda: 'Cirurgia urgente',
      nomeSolicitante: 'Maria',
      prazo: new Date('2026-07-01T10:00:00'),
      urlDemanda: 'https://example.com/demanda/1',
    })
    expect(html).toContain('João')
    expect(html).toContain('Cirurgia urgente')
    expect(html).toContain('Maria')
  })

  it('templateAlertaExpiracao contém nome e link', () => {
    const html = templateAlertaExpiracao({
      nomeResponsavel: 'Ana',
      tituloDemanda: 'Escola',
      prazo: new Date(),
      urlDemanda: 'https://example.com/d/1',
    })
    expect(html).toContain('Ana')
    expect(html).toContain('https://example.com/d/1')
  })

  it('templateDemandaExpirada contém solicitante', () => {
    const html = templateDemandaExpirada({
      nomeDestinatario: 'Admin',
      tituloDemanda: 'Habitação',
      nomeSolicitante: 'Carlos',
      urlDemanda: 'https://example.com/d/2',
    })
    expect(html).toContain('Carlos')
    expect(html).toContain('Habitação')
  })
})
