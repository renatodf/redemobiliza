import 'server-only'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const TIMEOUT_MS = 5000

type ResultadoNominatim = { lat: string; lon: string }

export async function geocodificarRegiao(
  nome: string,
  uf: string
): Promise<{ latitude: number; longitude: number } | null> {
  const query = `${nome}, ${uf}, Brasil`
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const resposta = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RedeMobiliza/1.0 (geocodificacao de regiao via painel admin)' },
    })
    if (!resposta.ok) return null

    const dados = (await resposta.json()) as ResultadoNominatim[]
    if (dados.length === 0) return null

    const latitude = Number(dados[0].lat)
    const longitude = Number(dados[0].lon)
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null

    return { latitude, longitude }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
