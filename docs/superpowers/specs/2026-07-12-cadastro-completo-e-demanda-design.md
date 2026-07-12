# Cadastro Completo da Pessoa + Criação de Demanda

**Data:** 2026-07-12
**Status:** aprovado

---

## Contexto

O cadastro de uma pessoa é construído em camadas ao longo do tempo — cadastro público
(nome/WhatsApp/e-mail/gênero/região/profissão/foto), edição manual pelo admin ou pelo
próprio mobilizador (`EditarPessoaForm.tsx`, que hoje cobre nome/WhatsApp/e-mail/gênero/
região/profissão/CPF/telefone fixo/orientação sexual/religião/escolaridade), e campos que
só existem para receber dados de sistemas antigos (endereço completo, data de nascimento,
origem do cadastro) — hoje só leitura na ficha, sem nenhum formulário que os edite.

Esse spec fecha essa lacuna em três frentes: (1) o formulário de editar pessoa passa a
cobrir o modelo `Pessoa` inteiro, (2) o cadastro público ganha o campo de nascimento que
nunca foi implementado, e (3) a tela de criar demanda passa a permitir completar o
cadastro do solicitante no mesmo formulário, com um único salvamento atômico.

## 1. Componente compartilhado de campos da Pessoa

Novo componente `src/app/[slug]/admin/pessoas/[pessoaId]/CamposPessoa.tsx` — renderiza
todos os `<div>`/inputs de dados da pessoa, **sem** `<form>` nem botão de submit próprio
(é sempre usado dentro do `<form>` de quem o chama). Extraído do conteúdo hoje duplicado
inline em `EditarPessoaForm.tsx`.

**Campos (nome do input = nome do campo no Prisma, exceto onde indicado):**

| Campo | Tipo de input | Obrigatório | Observação |
|---|---|---|---|
| `nome` | texto | sim | sem mudança |
| `whatsapp` | texto | sim | sem mudança, normalizado via `normalizeWhatsApp` |
| `email` | e-mail | não | sem mudança |
| `nascimento` | texto, placeholder `DD/MM/AAAA` | não | **novo** — ver seção 4 (parsing) |
| `genero` | select (masculino/feminino/outro) | não | sem mudança |
| `origem` | texto livre | não | **novo** — hoje só gravado programaticamente (`'manual'`, `'convite'`), passa a ser editável como os demais campos livres (religião/escolaridade) |
| `regiaoId` | select | não | sem mudança |
| `profissaoId` | select | não | sem mudança |
| `cpf` | texto | não | sem mudança |
| `telefoneFixo` | texto | não | sem mudança |
| `orientacaoSexual` | texto | não | sem mudança |
| `religiao` | texto | não | sem mudança |
| `escolaridade` | texto | não | sem mudança |
| `bairro` | texto | não | **novo** |
| `logradouro` | texto | não | **novo** |
| `numero` | texto | não | **novo** |
| `complemento` | texto | não | **novo** |
| `cep` | texto | não | **novo** |

**Fora deste componente** (fluxos dedicados, sem mudança): `fotoUrl` (upload próprio via
`FotoPerfilAvatar`), `isColaborador`/`isMobilizador`/`tokenMobilizador` (promoção/
despromoção), `userId`/`criadoEm`/`atualizadoEm`/`deletedAt`/`id`/`gabineteId` (sistema).

## 2. Parsing de data brasileira (DD/MM/AAAA)

Novo módulo `src/lib/data-brasileira.ts`, funções puras (TDD):

```ts
export function parseDataBrasileira(input: string): Date | null
export function formatarDataBrasileira(data: Date | null): string
```

- `parseDataBrasileira`: aceita só o formato `DD/MM/AAAA` (com zero à esquerda opcional
  nos dois primeiros grupos). Valida dia/mês/ano plausíveis (ex. rejeita `32/01/2000`,
  `31/02/2000`) verificando que o `Date` resultante não sofreu overflow (`getDate()`/
  `getMonth()` batendo com o que foi informado). String vazia ou inválida → `null`.
- `formatarDataBrasileira`: inverso, usado para preencher `defaultValue` dos inputs a
  partir do `Date` vindo do banco. `null`/`undefined` → string vazia.
- Reaproveitado em: `editarPessoa`, a nova action combinada de demanda, `submeterCadastro`,
  e nos `defaultValue` de `CamposPessoa`.
- Campo inválido (texto que não bate o formato) → erro de validação amigável, mesmo
  padrão de retorno de erro já usado em cada action (não lança exceção não tratada).

## 3. `EditarPessoaForm` (edição avulsa — ficha do admin e perfil do mobilizador)

- `EditarPessoaForm.tsx` passa a renderizar `<CamposPessoa>` com os campos novos, mantendo
  seu próprio `<form>` + botão "Salvar alterações" (sem mudança de UX aqui, só mais campos).
- `editarPessoa` (action) passa a ler e persistir os campos novos (`nascimento` via
  `parseDataBrasileira`, `origem`, `bairro`, `logradouro`, `numero`, `complemento`, `cep`),
  sem mudar as regras de permissão existentes (admin edita qualquer pessoa do gabinete;
  mobilizador só a própria rede direta ou o próprio cadastro).
- **Sem mudança de escopo de acesso**: o mobilizador editando o próprio perfil
  (`/mobilizador/perfil`) ganha os mesmos campos novos, pela mesma action — decisão
  explícita do usuário nesta sessão ("sempre que for editar o cadastro de alguém, pode
  abrir todos os campos, independente de ser demanda").
- Ajuste necessário: `mobilizador/perfil/page.tsx` usa `select` explícito no
  `prisma.pessoa.findFirst` — precisa incluir os campos novos (hoje só busca os campos
  que já existiam no form). `admin/pessoas/[pessoaId]/page.tsx` usa `include` (sem
  `select` nos campos escalares), então já traz tudo — só o objeto `pessoa={{...}}`
  passado pro form precisa listar os campos novos.

## 4. Cadastro público — campo de nascimento

- `CadastroForm.tsx`, etapa `dados`: novo campo "Data de nascimento" (texto,
  `DD/MM/AAAA`, opcional), posicionado logo após "Nome completo" — junto de
  e-mail/gênero/região/profissão/foto, como pedido.
- `submeterCadastro` (action, `src/actions/public/submeter-cadastro.ts`): novo campo
  opcional `nascimento?: string` no `SubmeterCadastroInput`. Parseado via
  `parseDataBrasileira` — se vier preenchido e for inválido, retorna
  `{ erro: 'Data de nascimento inválida — use o formato DD/MM/AAAA' }` (mesmo padrão de
  retorno das outras validações da action). Gravado em `Pessoa.create` junto dos demais
  campos da etapa `dados`.
- Sem mudança na etapa de confirmação de presença (pessoa já cadastrada) — nascimento só
  é perguntado no cadastro novo, mesma regra já aplicada a `nome`.

## 5. Nova Demanda — ficha completa + criação num só passo

Tela `/[slug]/admin/demandas/nova` (`src/app/[slug]/admin/demandas/nova/page.tsx`).

- **Passo 1 (buscar/cadastrar solicitante) não muda**: busca por nome/WhatsApp, seleção
  na lista, ou cadastro mínimo inline (nome + WhatsApp obrigatórios, e-mail opcional) via
  `cadastrarSolicitante` — que redireciona pra mesma tela com `?solicitanteId=`.
- **Passo 2 muda**: o cartão hoje só-leitura ("Solicitante: nome/WhatsApp/região" + link
  "Trocar") é substituído por `<CamposPessoa>` completo, pré-preenchido com os dados
  atuais da pessoa. O `select` do `prisma.pessoa.findFirst` que busca o solicitante
  (hoje: `id`, `nome`, `whatsapp`, `bairro`, `logradouro`, `numero`, `complemento`, `cep`,
  `regiao.nome`) precisa crescer para trazer também `email`, `regiaoId`, `profissaoId`,
  `genero`, `nascimento`, `origem`, `cpf`, `telefoneFixo`, `orientacaoSexual`, `religiao`,
  `escolaridade` — os campos que faltam pro `<CamposPessoa>` pré-preencher tudo. O link
  "Trocar" continua fora do `<form>`, como navegação simples de volta pra busca.
- `<CamposPessoa>` e os campos de "Dados da Demanda" (título, descrição, área,
  responsável, prazo) ficam dentro de **um único `<form>`**, com **um único botão**
  ("Salvar", renomeado de "Abrir Demanda").
- **Nova server action** `src/actions/admin/criar-demanda-com-cadastro.ts`
  (`criarDemandaComCadastro`), que substitui `criarDemanda` **só nesta tela**
  (`criarDemanda` original fica intocada — não é usada em mais nenhum lugar hoje, mas não
  há necessidade de removê-la neste spec). A nova action:
  1. `assertAdminAccess` (mesma checagem de hoje).
  2. Valida os campos da demanda (mesmas obrigatoriedades de `criarDemanda`) e os campos
     da pessoa (mesma validação de `editarPessoa`: nome/WhatsApp obrigatórios, WhatsApp
     normalizado, nascimento parseado).
  3. `prisma.$transaction([...])`: `pessoa.updateMany` (dados da pessoa) +
     `demanda.create` (com `historico.create` de criação, igual hoje) — **atômico**: se
     qualquer validação falhar antes da transação, ou a transação falhar (ex. FK
     inválida), nada é salvo — nem a demanda nem a edição do cadastro.
  4. Fora da transação (efeito colateral, mesmo padrão de `criarDemanda` hoje): envio do
     e-mail de notificação ao responsável, com `try/catch` silencioso — não desfaz a
     transação se falhar.
  5. Redireciona pra ficha da demanda criada (mesmo destino de hoje).
- **Sem mudança de escopo de acesso**: continua só admin (mobilizador não cria demanda).
- **Fora deste spec** (confirmado com o usuário): a tela de demanda **já existente**
  (`/admin/demandas/[id]`) não ganha esse comportamento — continua com seu modo de edição
  atual, só dos dados da própria demanda.

## Testes

TDD nos módulos novos/alterados:

- `src/lib/__tests__/data-brasileira.test.ts`: casos válidos, inválidos (dia/mês/ano fora
  do intervalo, formato errado, string vazia), e o roundtrip `formatarDataBrasileira(parseDataBrasileira(x))`.
- `editarPessoa`: campos novos persistidos corretamente; nascimento inválido retorna erro
  sem persistir nada; permissão de admin/mobilizador continua igual (teste de regressão).
- `criarDemandaComCadastro`: transação atômica (demanda inválida não persiste edição da
  pessoa, e vice-versa); campos novos da pessoa persistidos; WhatsApp duplicado/ inválido
  tratado (mesmo comportamento de erro que `editarPessoa` já tem hoje — sem novo
  tratamento adicional, fora de escopo).
- `submeterCadastro`: nascimento opcional aceito quando ausente; erro amigável quando
  formato inválido; persistido corretamente quando válido.

## Fora de escopo (explicitamente, por decisão do usuário nesta sessão)

- Editar a ficha completa a partir da tela de uma demanda **já existente** — só na
  criação.
- Qualquer tratamento novo de erro de WhatsApp duplicado além do que `editarPessoa` já
  faz hoje.
- Máscara de digitação ao vivo (auto-inserir `/`) no campo de nascimento — só placeholder
  + validação no envio, mesmo padrão do campo de WhatsApp hoje.
