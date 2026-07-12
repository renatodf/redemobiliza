import { formatarDataBrasileira } from '@/lib/data-brasileira'

type Regiao = { id: string; nome: string }
type Profissao = { id: string; nome: string }

export type PessoaCampos = {
  nome: string
  whatsapp: string
  email: string | null
  nascimento: Date | null
  genero: string | null
  origem: string | null
  regiaoId: string | null
  profissaoId: string | null
  cpf: string | null
  telefoneFixo: string | null
  orientacaoSexual: string | null
  religiao: string | null
  escolaridade: string | null
  bairro: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  cep: string | null
}

export default function CamposPessoa({
  pessoa,
  regioes,
  profissoes,
}: {
  pessoa: PessoaCampos
  regioes: Regiao[]
  profissoes: Profissao[]
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome *</label>
        <input
          name="nome"
          required
          defaultValue={pessoa.nome}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">WhatsApp *</label>
          <input
            name="whatsapp"
            required
            defaultValue={pessoa.whatsapp}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">E-mail</label>
          <input
            name="email"
            type="email"
            defaultValue={pessoa.email ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Data de nascimento</label>
          <input
            name="nascimento"
            placeholder="DD/MM/AAAA"
            defaultValue={formatarDataBrasileira(pessoa.nascimento)}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Gênero</label>
          <select
            name="genero"
            defaultValue={pessoa.genero ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Não informado</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
            <option value="outro">Outro</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Região</label>
          <select
            name="regiaoId"
            defaultValue={pessoa.regiaoId ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar...</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Profissão</label>
          <select
            name="profissaoId"
            defaultValue={pessoa.profissaoId ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar...</option>
            {profissoes.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Orientação Sexual</label>
          <input
            name="orientacaoSexual"
            defaultValue={pessoa.orientacaoSexual ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Origem do cadastro</label>
          <input
            name="origem"
            defaultValue={pessoa.origem ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">CPF</label>
          <input
            name="cpf"
            defaultValue={pessoa.cpf ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Telefone Fixo</label>
          <input
            name="telefoneFixo"
            defaultValue={pessoa.telefoneFixo ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Religião</label>
          <input
            name="religiao"
            defaultValue={pessoa.religiao ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Escolaridade</label>
          <input
            name="escolaridade"
            defaultValue={pessoa.escolaridade ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Logradouro</label>
          <input
            name="logradouro"
            defaultValue={pessoa.logradouro ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Número</label>
          <input
            name="numero"
            defaultValue={pessoa.numero ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Complemento</label>
          <input
            name="complemento"
            defaultValue={pessoa.complemento ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Bairro</label>
          <input
            name="bairro"
            defaultValue={pessoa.bairro ?? ''}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">CEP</label>
        <input
          name="cep"
          defaultValue={pessoa.cep ?? ''}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
      </div>
    </div>
  )
}
