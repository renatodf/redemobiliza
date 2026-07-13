# Fix — Upload de Foto no Cadastro Público

**Data:** 2026-07-12
**Status:** aprovado

---

## Contexto

Durante o smoke test manual da feature de Cadastro Completo (seção 15 do `HANDOFF.md`), foi
encontrado — via navegador real, não é regressão desta sessão — que o cadastro público
(`/[slug]/cadastro/[segmentoSlug]` e `/[slug]/cadastro/link`, ambos compartilham
`CadastroForm.tsx`) **nunca completa quando o `<input type="file">` de foto é enviado**,
com ou sem arquivo escolhido.

**Causa raiz** (investigada por eliminação sistemática — Fase 1-3 de debug):
`handleSubmeterDados` chama `submeterCadastro({ ...vários campos, foto: fd.get('foto') })`
— um objeto comum (não um `FormData`) contendo um `File` como propriedade. Essa chamada é
manual (`await submeterCadastro(...)`), fora do padrão nativo `<form action={fn}>`. Nesse
caminho de invocação, o Next (14.2.35) rejeita qualquer `File` embutido dentro de um objeto
comum ao serializar os argumentos da Server Action: `Error: Only plain objects, and a few
built-ins, can be passed to Server Actions. Classes or null prototypes are not supported.`
Confirmado tanto com um `File` vazio (input não tocado) quanto com um arquivo real (upload
de verdade) — o erro ocorre nos dois casos.

**Diferença com o padrão que já funciona**: `uploadFotoPessoa`
(`src/actions/admin/upload-foto-pessoa.ts`, usado por `FotoPerfilAvatar.tsx` na ficha do
admin) recebe um **`FormData` nativo** como argumento único — esse padrão não tem o
problema, porque `FormData` é um dos built-ins que o Next reconhece nativamente na
serialização de Server Actions.

**Mitigação já aplicada** (commit `3310c45`, antes deste spec): o cliente só inclui `foto`
no objeto quando um arquivo de tamanho > 0 foi escolhido — resolve o caso mais comum
(cadastro sem foto), mas **upload de foto real continua quebrado**. Este spec substitui
essa mitigação por uma correção definitiva.

## Decisão

Migrar `submeterCadastro` para receber um **`FormData` nativo**, igual `uploadFotoPessoa`
já faz — elimina a causa raiz para qualquer arquivo, vazio ou não, e segue um padrão já
comprovado nesta base de código (em vez de introduzir um padrão novo, como base64, ou uma
segunda action pública para o upload).

Alternativas descartadas: separar em duas chamadas (criaria uma nova action pública sem
autenticação, com superfície de segurança própria a proteger) e converter a foto pra
base64 no cliente (evita o `File`, mas introduz um padrão de transporte que não existe em
nenhum outro lugar do código).

## Escopo da mudança

Só dois arquivos são afetados — `submeterCadastro` e `SubmeterCadastroInput` não são
usados em nenhum outro lugar do projeto (confirmado por busca).

### `src/actions/public/submeter-cadastro.ts`

- Assinatura muda de `submeterCadastro(input: SubmeterCadastroInput)` para
  `submeterCadastro(formData: FormData): Promise<{ erro: string } | never>` — o tipo
  `SubmeterCadastroInput` é removido.
- Toda extração de campo passa de desestruturação do objeto para `formData.get('campo')`
  (ou `formData.getAll('segmentoSlugs')` para o array de segmentos, que agora vira múltiplas
  entradas do FormData com a mesma chave em vez de um array serializado).
- **Nenhuma regra de validação, nenhum nome de campo, nenhum comportamento muda** — é troca
  de transporte, não de lógica. Toda a lógica existente (normalização de WhatsApp, parsing
  de nascimento via `parseDataBrasileira`, verificação de segmento, criação/reuso de
  `Pessoa`, vínculo de rede, upload de foto pro Storage, `caminhoRelativoSeguro`) permanece
  idêntica, só lendo os valores de outra fonte.
- O guard existente `if (foto && foto.size > 0)` (já presente antes deste fix, cuida de
  ignorar upload quando o arquivo é vazio) continua fazendo esse papel — não precisa mais
  do guard client-side de `3310c45`, que é removido.

### `src/app/[slug]/cadastro/[segmentoSlug]/CadastroForm.tsx`

- `handleSubmeterDados`: já constrói `const fd = new FormData(e.currentTarget)` a partir do
  form nativo, que já contém `nome`/`email`/`regiaoId`/`profissaoId`/`genero`/`nascimento`/
  `foto` com os mesmos `name` de hoje. Passa a **enriquecer esse mesmo `fd`** com os campos
  que não vêm de nenhum input (`slug`, `whatsapp` — vem do state da etapa anterior —,
  `segmentoSlugs` via `fd.append` em loop, `mobilizadorToken`, `sucessoUrl`) e chamar
  `submeterCadastro(fd)` diretamente — sem reconstruir o objeto do zero, sem o guard de
  `3310c45` (removido).
- `handleConfirmar` (etapa de confirmação de presença, pessoa já cadastrada, sem foto):
  monta um `FormData` equivalente com os mesmos campos que hoje manda no objeto
  (`slug`, `whatsapp`, `nome: ''`, `mobilizadorToken`, `sucessoUrl`), sem `foto`.

## Testes

Sem teste automatizado novo (decisão do usuário — mantém o padrão já estabelecido no
projeto: server actions são verificadas manualmente, sem harness de teste). Verificação
manual via navegador real, cobrindo:

1. Cadastro novo sem foto — deve completar (era o caso já mitigado por `3310c45`, confirma
   que continua funcionando).
2. Cadastro novo com foto de arquivo real (upload) — **caso que hoje está quebrado**, deve
   passar a completar e a foto deve aparecer salva na ficha da pessoa.
3. Cadastro novo com foto capturada pela webcam — mesmo caminho de código que o upload de
   arquivo (`comprimirImagem` + `DataTransfer`), deve funcionar pelo mesmo motivo do item 2.
4. Etapa de confirmação de presença (pessoa já cadastrada) — sem foto, deve continuar
   funcionando como hoje.
5. `npx tsc --noEmit` e `npm test` (com exclude de `.worktrees`/`.claude/worktrees`, ver
   nota já registrada no HANDOFF sobre esse comportamento do `vitest`) sem regressão.

## Fora de escopo

- Qualquer mudança de comportamento além da troca de transporte (nenhuma validação nova,
  nenhum campo novo, nenhuma mudança de UX).
- Teste automatizado para esta ou qualquer outra server action — decisão explícita do
  usuário nesta sessão.
- O bug de `bg-blue-600` fixo ou qualquer outro item já listado como pendência separada no
  `HANDOFF.md` — este spec é só sobre o upload de foto.
