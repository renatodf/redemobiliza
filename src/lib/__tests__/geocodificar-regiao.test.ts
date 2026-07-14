import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geocodificarRegiao } from '../geocodificar-regiao'

describe('geocodificarRegiao', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna latitude/longitude quando o Nominatim encontra resultado', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '-15.7942', lon: '-47.8822' }],
    } as Response)

    const resultado = await geocodificarRegiao('Ceilândia', 'DF')

    expect(resultado).toEqual({ latitude: -15.7942, longitude: -47.8822 })
  })

  it('retorna null quando o Nominatim não encontra nenhum resultado', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response)

    const resultado = await geocodificarRegiao('Cidade Inventada Xyz', 'DF')

    expect(resultado).toBeNull()
  })

  it('retorna null quando a resposta HTTP não é ok', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => [] } as Response)

    const resultado = await geocodificarRegiao('Ceilândia', 'DF')

    expect(resultado).toBeNull()
  })

  it('retorna null quando o fetch lança erro de rede, sem lançar exceção', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    await expect(geocodificarRegiao('Ceilândia', 'DF')).resolves.toBeNull()
  })

  it('monta a query com nome, UF e "Brasil"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] } as Response)
    vi.stubGlobal('fetch', fetchMock)

    await geocodificarRegiao('Águas Lindas de Goiás', 'GO')

    const urlChamada = fetchMock.mock.calls[0][0] as string
    expect(urlChamada).toContain(encodeURIComponent('Águas Lindas de Goiás, GO, Brasil'))
  })

  it('envia um header User-Agent identificando a aplicação', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] } as Response)
    vi.stubGlobal('fetch', fetchMock)

    await geocodificarRegiao('Ceilândia', 'DF')

    const opcoes = fetchMock.mock.calls[0][1] as RequestInit
    expect((opcoes.headers as Record<string, string>)['User-Agent']).toBeTruthy()
  })
})
