type PosicaoRegiao = { nome: string; x: number; y: number }

// Coordenadas aproximadas (percentual, viewBox 0 0 100 85) — ilustrativas, não uma
// projeção cartográfica real. Inclui as Regiões Administrativas oficiais do DF e
// alguns apelidos informais comuns (Asa Norte/Sul, Sudoeste/Octogonal, etc) já que
// gabinetes cadastram o nome da Região livremente.
const REGIOES_DF: PosicaoRegiao[] = [
  { nome: 'Plano Piloto', x: 50, y: 30 },
  { nome: 'Asa Norte', x: 52, y: 25 },
  { nome: 'Asa Sul', x: 50, y: 35 },
  { nome: 'Sudoeste', x: 44, y: 38 },
  { nome: 'Octogonal', x: 43, y: 39 },
  { nome: 'Noroeste', x: 46, y: 22 },
  { nome: 'Cruzeiro', x: 42, y: 33 },
  { nome: 'Lago Norte', x: 58, y: 22 },
  { nome: 'Lago Sul', x: 58, y: 38 },
  { nome: 'Núcleo Bandeirante', x: 42, y: 45 },
  { nome: 'Candangolândia', x: 44, y: 47 },
  { nome: 'Park Way', x: 45, y: 55 },
  { nome: 'Guará', x: 35, y: 45 },
  { nome: 'Águas Claras', x: 33, y: 52 },
  { nome: 'Vicente Pires', x: 30, y: 45 },
  { nome: 'Taguatinga', x: 28, y: 50 },
  { nome: 'Ceilândia', x: 22, y: 42 },
  { nome: 'Samambaia', x: 25, y: 62 },
  { nome: 'Recanto das Emas', x: 30, y: 65 },
  { nome: 'Riacho Fundo', x: 38, y: 55 },
  { nome: 'Riacho Fundo II', x: 35, y: 60 },
  { nome: 'Santa Maria', x: 40, y: 68 },
  { nome: 'Gama', x: 38, y: 78 },
  { nome: 'Brazlândia', x: 16, y: 26 },
  { nome: 'Sobradinho', x: 62, y: 18 },
  { nome: 'Sobradinho II', x: 64, y: 16 },
  { nome: 'Planaltina', x: 72, y: 14 },
  { nome: 'Fercal', x: 60, y: 12 },
  { nome: 'Paranoá', x: 65, y: 32 },
  { nome: 'Itapoã', x: 62, y: 28 },
  { nome: 'São Sebastião', x: 68, y: 45 },
  { nome: 'Jardim Botânico', x: 62, y: 40 },
  { nome: 'Varjão', x: 54, y: 20 },
  { nome: 'SCIA', x: 40, y: 38 },
  { nome: 'Estrutural', x: 40, y: 38 },
  { nome: 'SIA', x: 41, y: 40 },
  { nome: 'Arniqueira', x: 32, y: 50 },
  { nome: 'Sol Nascente', x: 20, y: 45 },
  { nome: 'Pôr do Sol', x: 20, y: 45 },
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
