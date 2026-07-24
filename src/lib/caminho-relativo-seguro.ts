// Sanitiza um destino de redirect potencialmente não confiável (ex: vindo de
// uma Server Action invocável direto por um Client Component, bypassando a
// UI, com qualquer valor). Checar a string crua (ex: startsWith('/')) não é
// suficiente: navegadores normalizam barra invertida e caracteres de controle
// antes de resolver a URL (ex: "/\evil.com" e "/\t/evil.com" viram
// "//evil.com" — origem diferente), então usamos o próprio parser de URL
// (mesma implementação WHATWG que o navegador usa) contra uma origem fixa. Só
// a checagem de origem não basta: um valor como
// "http://localhost.invalid//evil.com" bate com a origem fixa mas resolve num
// pathname que começa com "//" (quirk do parser: segmento vazio após a
// autoridade vira parte do path) — "//evil.com" sozinho já é uma URL relativa
// a protocolo (protocol-relative), então também rejeitamos qualquer pathname
// resolvido que comece com "//".
export function caminhoRelativoSeguro(valor: string, fallback: string): string {
  const origemFixa = 'http://localhost.invalid'
  try {
    const resolvida = new URL(valor, origemFixa)
    if (resolvida.origin !== origemFixa) return fallback
    if (resolvida.pathname.startsWith('//')) return fallback
    return resolvida.pathname + resolvida.search + resolvida.hash
  } catch {
    return fallback
  }
}
