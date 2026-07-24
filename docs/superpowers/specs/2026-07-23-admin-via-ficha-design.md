# Botão "+Admin" na ficha + lista de admins no super-admin — Design

## Contexto

Terceiro item da lista de 5 ajustes de UI/produto desta sessão (ver seções 33-34 do HANDOFF para os dois primeiros). Hoje, promover alguém a administrador de um gabinete só é possível pelo painel do super-admin (`/super-admin/gabinetes/[id]`), via convite por e-mail (`convidarAdmin` → `supabase.auth.admin.inviteUserByEmail`) — um fluxo separado de como já se promove alguém a **mobilizador** direto na ficha da pessoa (botão `+Mobilizador`, com senha definida na hora). A lista de admins nesse painel hoje só mostra o `userId` cru, sem nome, sem ação de editar ou remover.

Este spec junta duas mudanças que pertencem uma à outra: (1) trazer a promoção a admin pra dentro da ficha da pessoa, no mesmo padrão já usado pra mobilizador; (2) dar à lista de admins do super-admin uma cara utilizável (nome, editar, remover), já que agora ela passa a ter dados reais de onde puxar (a `Pessoa` vinculada).

## Objetivo

- Ficha da pessoa (`/[slug]/admin/pessoas/[id]`) ganha um botão **+Admin**, ao lado dos três já existentes (Colaborador, Mobilizador, Banco de Talentos), num grid 2×2.
- Painel do super-admin (`/super-admin/gabinetes/[id]`) passa a listar os admins de um gabinete pelo nome (quando há `Pessoa` vinculada), com ícone de editar (abre a ficha via modo suporte) e de excluir (remove o admin na hora).

## Schema

Novo campo em `Pessoa`, mesmo padrão de `isColaborador`/`isMobilizador`:

```prisma
isAdmin Boolean @default(false)
```

Inserido logo após `isMobilizador`/`tokenMobilizador` no modelo `Pessoa` (`prisma/schema.prisma`). Migration nova. `userId` (campo já existente em `Pessoa`) passa a ser reaproveitado também pro vínculo de admin — não é um campo por papel, é "o usuário Supabase Auth desta pessoa, seja qual for o papel atual dela".

Nenhuma mudança em `UsuarioGabinete` — continua com um único `papel: String` por (`userId`, `gabineteId`); `papel` passa a valer `'admin'` quando a promoção vem da ficha, exatamente como já vale `'mobilizador'` hoje.

## Regra: um papel por vez

Uma pessoa só pode ter um papel (`admin` ou `mobilizador`) por gabinete de cada vez — restrição que já existe hoje na prática (`UsuarioGabinete` guarda um único `papel` por usuário+gabinete). **Decisão do usuário**: promover alguém que já é mobilizador a admin **substitui** o papel — não bloqueia, não acumula. A promoção a admin:
1. Remove o vínculo de mobilizador (`Pessoa.isMobilizador = false`, `tokenMobilizador = null`, `UsuarioGabinete` de papel `mobilizador` apagado) — mesmo efeito de `revogarMobilizador`, só que como parte da mesma transação.
2. Cria o vínculo de admin (`Pessoa.isAdmin = true`, `UsuarioGabinete` novo com `papel: 'admin'`).

O caminho inverso (promover a mobilizador alguém que já é admin) não está no escopo deste spec — o botão `+Mobilizador` continua existindo e funcionando como hoje; se o usuário quiser a mesma troca-de-papel no sentido contrário, é decisão de uma sessão futura (fora de escopo aqui, mas o padrão de "substituir" fica registrado pra reaproveitar).

## Ficha da pessoa — grid 2×2

Bloco atual (`src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`) é uma coluna vertical de 3 botões (`flex flex-col items-end gap-2`). Vira um grid de 2 colunas:

```
[ +Colaborador ]  [ +Mobilizador ]
[ +Admin       ]  [ Banco de Talentos ]
```

(ordem = ordem atual dos 3 botões existentes, com Admin encaixado no fim — decisão do usuário).

- **+Colaborador**: mesmo botão de hoje (`toggleColaborador`), só o rótulo encurta pra combinar com o padrão dos outros três — `+Colaborador` / `Remover colaborador` (hoje: "Marcar como colaborador" / "Remover como colaborador"). Nenhuma mudança de comportamento.
- **+Mobilizador**: inalterado.
- **+Admin** (novo): mesmo padrão visual/comportamental do `+Mobilizador` — dialog com senha + confirmar senha; ao confirmar, roda a lógica descrita acima (substitui mobilizador se houver, cria/reaproveita o usuário Supabase, grava `isAdmin=true` + `UsuarioGabinete`). Quando a pessoa já é admin, vira **Remover admin** (mesmo estilo do `Revogar Mobilizador`: botão outline, com `confirm()`, sem dialog). Só aparece pra quem já é `isAdmin` (`isAdmin && (pessoa.isAdmin ? <RemoverAdminButton/> : <PromoverAdminDialog/>)`, mesmo `isAdmin` de página que já inclui `role === 'super-admin'` — então o próprio super-admin, na ficha, já vê e usa este botão normalmente).
- **Remover admin**: sem trava especial — qualquer admin do gabinete (inclusive o próprio super-admin via modo suporte) pode remover qualquer outro admin, inclusive a si mesmo, inclusive zerando todos os admins do gabinete (decisão do usuário — o super-admin sempre consegue reverter via `+Admin` de novo).
- **Banco de Talentos**: inalterado.

## Reaproveitamento da criação de conta

`src/lib/supabase/criar-usuario-mobilizador.ts` (função `criarOuReaproveitarUsuarioMobilizador`) já é genérica o bastante — cria um usuário Supabase Auth por e-mail/senha, ou diagnostica conta órfã sem nunca reaproveitar senha de conta existente. Passa a servir os dois fluxos (mobilizador e admin); renomeada para algo neutro (ex. `criarOuReaproveitarUsuarioAcesso`, arquivo `criar-usuario-acesso.ts`), com o único call site existente (`promover-mobilizador.ts`) atualizado junto.

## Painel do super-admin — lista de admins

`src/app/super-admin/gabinetes/[id]/page.tsx`, seção "Administradores". Query atual:

```ts
const admins = await prisma.usuarioGabinete.findMany({
  where: { gabineteId: gabinete.id, papel: 'admin' },
  select: { id: true, userId: true, criadoEm: true },
  orderBy: { criadoEm: 'asc' },
})
```

Passa a também buscar, pra cada `userId`, a `Pessoa` correspondente (`where: { userId, gabineteId, isAdmin: true, deletedAt: null }` — join manual, já que não há FK direta entre `UsuarioGabinete` e `Pessoa`; `deletedAt: null` pelo mesmo motivo de sempre — pessoa soft-deletada não deve aparecer com nome como se estivesse ativa, cai no caso "sem `Pessoa` vinculada" abaixo). Dois casos por linha:

- **Tem `Pessoa` vinculada** (admin criado pela ficha, ou um admin legado que depois ganhou uma `Pessoa` — caso raro, tratado igual): mostra o nome da pessoa. Ícone de **editar** (`IconeEditar`) vira link que primeiro chama `entrarModoSuporte` (ver abaixo) e já entra direto na ficha dessa pessoa. Ícone de **excluir** (`IconeExcluir`) remove o admin na hora — `confirm()` + nova Server Action que apaga o `UsuarioGabinete` e zera `Pessoa.isAdmin`.
- **Sem `Pessoa` vinculada** (admin legado, convidado por e-mail antes desta feature existir): busca o e-mail no Supabase Auth por `userId` (`supabaseAdmin.auth.admin.getUserById`) e mostra o e-mail no lugar do nome. **Sem ícone de editar** (não existe ficha pra abrir). Ícone de excluir continua disponível, mesma ação.

### `entrarModoSuporte` ganha destino opcional

`src/actions/super-admin/modo-suporte.ts` hoje sempre redireciona pra `/${slug}/admin/` depois de registrar o `LogSuporte`. Ganha um segundo parâmetro opcional (`redirectPath?: string`) — quando informado, redireciona pra esse caminho em vez do padrão. O ícone de editar da lista de admins chama `entrarModoSuporte(gabineteId, `/[slug]/admin/pessoas/${pessoaId}`)`.

## Fora de escopo

- Fluxo de convite por e-mail (`convidarAdmin`) continua existindo no painel do super-admin, inalterado — é um caminho secundário/legado, não removido.
- Nenhuma trava de "não remover o último admin" (decisão do usuário).
- Promover um admin existente de volta a mobilizador pela ficha — o botão `+Mobilizador` continua existindo e funcional, mas este spec não adiciona lógica de "substituir admin por mobilizador" simetricamente (só o sentido mobilizador→admin foi pedido).
- Qualquer mudança em como o super-admin acessa gabinetes fora deste fluxo específico (o botão "Entrar em modo suporte" já existente na página do gabinete continua igual).

## Verificação

- `npx tsc --noEmit` limpo.
- Manual (Playwright, gabinete real):
  - Ficha: grid 2×2 renderiza na ordem certa; `+Admin` promove com senha, pessoa vira admin, consegue logar em `/login`; se a pessoa já era mobilizadora, ao promover a admin o `+Mobilizador` volta a aparecer como "+Mobilizador" (não mobilizadora mais); `Remover admin` reverte.
  - Super-admin: lista mostra nome de admins com `Pessoa` vinculada e e-mail dos legados; lápis leva direto pra ficha (via modo suporte, confirmando `LogSuporte` novo); lixeira remove com confirmação.
  - Sem erros no console.
