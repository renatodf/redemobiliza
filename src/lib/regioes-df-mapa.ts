type PosicaoRegiao = { nome: string; x: number; y: number }

// Dimensões do viewBox que as coordenadas x/y abaixo assumem — x já é percentual
// (0-100), mas y não é (a proporção real do DF não é quadrada), então quem for
// posicionar um pino por percentual de altura precisa dividir y por VIEWBOX_ALTURA.
export const VIEWBOX_LARGURA = 100
export const VIEWBOX_ALTURA = 58.2

// Coordenadas reais (percentual, viewBox 0 0 100 58.2 — mesma proporção real do DF,
// ~1.72:1 largura/altura). Projetadas a partir do contorno oficial do IBGE (mesmo
// dado usado em CONTORNO_DF, ver MapaRegioesDF.tsx) e de coordenadas aproximadas do
// centro de cada Região Administrativa — não é uma projeção cartográfica de precisão
// profissional, mas reflete a geografia real do DF (antes disso, as posições eram um
// desenho estilizado sem relação com o mapa de verdade). Inclui as RAs oficiais e
// alguns apelidos informais comuns (Asa Norte/Sul, Sudoeste/Octogonal, etc) já que
// gabinetes cadastram o nome da Região livremente. Confirmado contra gabinete real
// (amigos-do-izalci, 35 regiões cadastradas): duas usam o nome combinado com barra
// ("Sudoeste/Octogonal", "SCIA/Estrutural") em vez dos nomes separados — adicionados
// como entradas próprias já que a normalização não junta strings com "/".
const REGIOES_DF: PosicaoRegiao[] = [
  { nome: 'Plano Piloto', x: 41.32, y: 31.07 },
  { nome: 'Asa Norte', x: 41.54, y: 27.46 },
  { nome: 'Asa Sul', x: 38.48, y: 34.85 },
  { nome: 'Sudoeste', x: 36.43, y: 31.68 },
  { nome: 'Octogonal', x: 35.92, y: 32.21 },
  { nome: 'Sudoeste/Octogonal', x: 36.43, y: 31.68 },
  { nome: 'Noroeste', x: 39.5, y: 25.35 },
  { nome: 'Cruzeiro', x: 34.39, y: 30.63 },
  { nome: 'Lago Norte', x: 43.59, y: 24.3 },
  { nome: 'Lago Sul', x: 43.59, y: 34.85 },
  { nome: 'Núcleo Bandeirante', x: 32.35, y: 39.07 },
  { nome: 'Candangolândia', x: 31.33, y: 36.96 },
  { nome: 'Park Way', x: 31.33, y: 42.23 },
  { nome: 'Guará', x: 27.24, y: 34.85 },
  { nome: 'Águas Claras', x: 26.22, y: 35.9 },
  { nome: 'Vicente Pires', x: 25.2, y: 32.74 },
  { nome: 'Taguatinga', x: 23.15, y: 34.85 },
  { nome: 'Ceilândia', x: 18.05, y: 33.79 },
  { nome: 'Samambaia', x: 21.11, y: 39.07 },
  { nome: 'Recanto das Emas', x: 23.15, y: 42.23 },
  { nome: 'Riacho Fundo', x: 28.26, y: 40.12 },
  { nome: 'Riacho Fundo II', x: 27.24, y: 42.23 },
  { nome: 'Santa Maria', x: 28.26, y: 52.79 },
  { nome: 'Gama', x: 23.15, y: 54.9 },
  { nome: 'Brazlândia', x: 8.85, y: 16.91 },
  { nome: 'Sobradinho', x: 50.74, y: 15.86 },
  { nome: 'Sobradinho II', x: 49.71, y: 15.86 },
  { nome: 'Planaltina', x: 64.56, y: 13.16 },
  { nome: 'Fercal', x: 51.76, y: 8.47 },
  { nome: 'Paranoá', x: 52.78, y: 28.52 },
  { nome: 'Itapoã', x: 54.82, y: 26.41 },
  { nome: 'São Sebastião', x: 52.78, y: 42.23 },
  { nome: 'Jardim Botânico', x: 50.74, y: 36.96 },
  { nome: 'Varjão', x: 42.56, y: 22.19 },
  { nome: 'SCIA', x: 29.28, y: 29.57 },
  { nome: 'Estrutural', x: 29.28, y: 29.57 },
  { nome: 'SCIA/Estrutural', x: 29.28, y: 29.57 },
  { nome: 'SIA', x: 33.37, y: 31.68 },
  { nome: 'Arniqueira', x: 25.2, y: 36.96 },
  { nome: 'Sol Nascente', x: 14.98, y: 32.74 },
  { nome: 'Pôr do Sol', x: 14.98, y: 32.74 },
]

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function encontrarPosicaoRegiao(nome: string): { x: number; y: number } | null {
  const alvo = normalizar(nome)
  if (!alvo) return null
  const encontrada = REGIOES_DF.find((r) => normalizar(r.nome) === alvo)
  return encontrada ? { x: encontrada.x, y: encontrada.y } : null
}

export function calcularTamanhoBalao(
  contagem: number,
  min: number,
  max: number,
  tamanhoMin = 17,
  tamanhoMax = 34
): number {
  if (max <= min) return (tamanhoMin + tamanhoMax) / 2
  const proporcao = (contagem - min) / (max - min)
  const tamanho = tamanhoMin + proporcao * (tamanhoMax - tamanhoMin)
  return Math.max(tamanhoMin, Math.min(tamanhoMax, tamanho))
}
