export function parseDataBrasileira(input: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim())
  if (!match) return null

  const dia = Number(match[1])
  const mes = Number(match[2])
  const ano = Number(match[3])

  const data = new Date(ano, mes - 1, dia)
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return null
  }
  return data
}

export function formatarDataBrasileira(data: Date | null | undefined): string {
  if (!data) return ''
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const ano = data.getFullYear()
  return `${dia}/${mes}/${ano}`
}
