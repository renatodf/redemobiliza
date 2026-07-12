export function calcularFaixaEtaria(idade: number): string {
  if (idade < 25) return '16-24'
  if (idade < 35) return '25-34'
  if (idade < 45) return '35-44'
  if (idade < 60) return '45-59'
  return '60+'
}
