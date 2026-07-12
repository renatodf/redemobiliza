// Paleta categórica validada (skill de dataviz do projeto,
// references/palette.md) — ordem fixa, nunca ciclada.
export const PALETA_CATEGORICA = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
]

// "Outros"/"Não informado" usam esse tom neutro — nunca competem por
// uma cor da paleta categórica.
export const COR_NEUTRA = '#898781'

// Cores de status já reservadas no sistema (mesmas de statusDemandaPill
// em src/lib/status-demanda.ts e GraficoDemandas) — nunca reciclar pra
// outra dimensão.
export const CORES_STATUS_DEMANDA: Record<string, string> = {
  atendida: '#6E9924',
  nao_atendida: '#B80000',
  aberta: '#CBB100',
  expirada: '#FB923C',
}
