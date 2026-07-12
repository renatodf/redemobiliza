import EditarPessoaForm from '../pessoas/[pessoaId]/EditarPessoaForm'
import type { PessoaCampos } from '../pessoas/[pessoaId]/CamposPessoa'
import { corTextoContraste } from '@/lib/cor-contraste'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }
type ResultadoBusca = { id: string; nome: string; whatsapp: string; regiao: { nome: string } | null }

export default function CadastrosBusca({
  slug,
  baseHref,
  q,
  resultados,
  pessoaSelecionada,
  regioes,
  profissoes,
  corPrimaria,
}: {
  slug: string
  baseHref: string
  q: string
  resultados: ResultadoBusca[]
  pessoaSelecionada: (PessoaCampos & { id: string }) | null
  regioes: Regiao[]
  profissoes: Profissao[]
  corPrimaria: string
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      {pessoaSelecionada ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{pessoaSelecionada.nome}</h2>
            <a href={baseHref} className="text-xs text-blue-600 hover:underline">
              Nova busca
            </a>
          </div>
          <EditarPessoaForm
            slug={slug}
            pessoaId={pessoaSelecionada.id}
            pessoa={pessoaSelecionada}
            regioes={regioes}
            profissoes={profissoes}
            corPrimaria={corPrimaria}
          />
        </>
      ) : (
        <div className="space-y-3">
          <form method="GET" className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nome ou WhatsApp..."
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              style={{ backgroundColor: corPrimaria, color: corTextoContraste(corPrimaria) }}
              className="px-4 py-2 rounded-md text-sm"
            >
              Buscar
            </button>
          </form>

          {resultados.length > 0 && (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
              {resultados.map((p) => (
                <li key={p.id}>
                  <a
                    href={`${baseHref}?pessoaId=${p.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                      <p className="text-xs text-gray-500">{p.whatsapp} · {p.regiao?.nome ?? 'Sem região'}</p>
                    </div>
                    <span className="text-xs text-blue-600">Editar →</span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {q && resultados.length === 0 && (
            <p className="text-sm text-gray-500">
              Nenhuma pessoa encontrada para &ldquo;{q}&rdquo;.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
