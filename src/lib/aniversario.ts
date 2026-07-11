function aoMeioDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate())
}

function proximaOcorrenciaAniversario(nascimento: Date, hojeNormalizado: Date): Date {
  let candidato = new Date(hojeNormalizado.getFullYear(), nascimento.getMonth(), nascimento.getDate())
  if (candidato < hojeNormalizado) {
    candidato = new Date(hojeNormalizado.getFullYear() + 1, nascimento.getMonth(), nascimento.getDate())
  }
  return candidato
}

export function estaNoIntervaloAniversario(
  nascimento: Date,
  modo: 'dia' | 'semana' | 'mes',
  hoje: Date
): boolean {
  const hojeNormalizado = aoMeioDia(hoje)

  if (modo === 'mes') {
    return nascimento.getMonth() === hojeNormalizado.getMonth()
  }

  const proxima = proximaOcorrenciaAniversario(nascimento, hojeNormalizado)
  const diffDias = Math.round((proxima.getTime() - hojeNormalizado.getTime()) / (1000 * 60 * 60 * 24))

  if (modo === 'dia') return diffDias === 0
  return diffDias >= 0 && diffDias <= 6
}

export function calcularIdade(nascimento: Date, hoje: Date): number {
  let idade = hoje.getFullYear() - nascimento.getFullYear()
  const aindaNaoFezAniversarioEsteAno =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate())
  if (aindaNaoFezAniversarioEsteAno) idade--
  return idade
}
