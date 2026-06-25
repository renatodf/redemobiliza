# REDE MOBILIZA — Design da Fase 1

**Data:** 2026-06-24
**Status:** Aprovado para implementação

---

## Visão Geral

Plataforma SaaS multi-tenant de mobilização territorial e segmentação inteligente para gabinetes políticos e campanhas eleitorais. Cada gabinete tem seus dados completamente isolados dos demais.

---

## Stack Tecnológica

- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Prisma** (ORM)
- **PostgreSQL** via Supabase
- **Supabase Auth** (email/senha para admins e super-admin; Google OAuth para admins; magic link para mobilizadores)
- **Tailwind CSS**
- **EasyPanel** (hospedagem da aplicação via Docker)
- **Supabase** (banco de dados + autenticação, serviço externo)

---

## Arquitetura

Uma aplicação Next.js única com rotas de API integradas. Supabase provê banco de dados e autenticação. A aplicação roda em container Docker gerenciado pelo EasyPanel em um servidor VPS.

### Infraestrutura

| Serviço | Plataforma |
|---|---|
| Aplicação Next.js | EasyPanel (Docker) |
| Banco de dados PostgreSQL | Supabase |
| Autenticação | Supabase Auth |
| Storage (logos, banners) | Supabase Storage |

A aplicação requer um `Dockerfile` para build e deploy no EasyPanel.

> **Configuração obrigatória do Supabase Auth:** o Supabase valida o parâmetro `redirectTo` dos magic links contra uma allowlist de URLs configurada em Authentication → URL Configuration → Redirect URLs. **A URL `/auth/callback` da aplicação (ex: `https://redemobiliza.com.br/auth/callback`) deve ser adicionada à allowlist antes do primeiro deploy.** Se não configurada, o Supabase ignora o `redirectTo` silenciosamente e o callback não recebe os parâmetros `gabineteId` e `token`, quebrando o fluxo de onboarding de mobilizadores.

### Row-Level Security (RLS)

O isolamento multi-tenant é garantido em duas camadas:

1. **Aplicação (Prisma):** toda query inclui `WHERE gabineteId = <id do gabinete autenticado>`. APIs de gabinete extraem `gabineteId` a partir do `userId` da sessão Supabase Auth via lookup em `UsuarioGabinete WHERE userId = auth.uid` — o JWT Supabase padrão não inclui `gabineteId` como claim; o campo deve ser obtido do banco, nunca de parâmetros de URL.
2. **Banco de dados (Supabase RLS):** RLS habilitado em todas as tabelas com coluna `gabineteId`. Políticas garantem que um usuário autenticado só leia/escreva linhas do próprio gabinete. Super-admin usa service role key (bypass de RLS) apenas para operações de suporte.

A tabela `PessoaSegmento` não possui `gabineteId` direto e é protegida via política RLS baseada em join: `pessoaId IN (SELECT id FROM "Pessoa" WHERE "gabineteId" = auth.uid_gabinete())` ou `segmentoId IN (SELECT id FROM "Segmento" WHERE "gabineteId" = auth.uid_gabinete())`. A tabela `VinculoRede` possui `gabineteId` próprio e segue a regra geral de RLS direta.

A função `auth.uid_gabinete()` deve ser criada no banco Supabase como custom function na migration inicial:

```sql
CREATE OR REPLACE FUNCTION auth.uid_gabinete()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "gabineteId"
  FROM public."UsuarioGabinete"
  WHERE "userId" = auth.uid()::text
  ORDER BY "gabineteId"
  LIMIT 1;
$$;
```
> **Segurança:** `SET search_path = ''` é obrigatório em funções `SECURITY DEFINER` para evitar search_path injection — sem ele, um schema interposto antes de `public` poderia substituir `public."UsuarioGabinete"` silenciosamente. `ORDER BY "gabineteId"` garante resultado determinístico para usuários em múltiplos gabinetes (permitido pelo `@@unique([userId, gabineteId])` em `UsuarioGabinete`).

Esta função retorna o `gabineteId` do usuário autenticado via lookup em `UsuarioGabinete`. Super-admin (que não tem linha em `UsuarioGabinete`) acessa dados de gabinetes via **service role key** (bypass de RLS), não via esta função — o middleware do super-admin usa o service role client do Prisma em vez do client autenticado.

**Modo suporte do super-admin:** quando o super-admin clica em "Entrar em modo suporte" para um gabinete específico, o servidor define o cookie `suporteGabineteId` com atributos `httpOnly=true, secure=true, sameSite='strict', path='/'` contendo o `gabineteId` do gabinete-alvo. **`path='/'` é obrigatório** — com `path='/super-admin'` o browser não enviaria o cookie para rotas `/api/...` usadas pelas queries Prisma de dados do gabinete. `secure=true` garante transmissão apenas via HTTPS. As queries Prisma dentro do modo suporte leem `gabineteId` desse cookie — não de `UsuarioGabinete`. A regra "nunca de parâmetros de URL" (linha acima) aplica-se a admins e mobilizadores; o super-admin em modo suporte usa o mecanismo de cookie descrito aqui. **Entrada no modo suporte:** o servidor gera um `sessaoId` (cuid), cria `LogSuporte` com `acao="acesso_inicio"` e define o cookie. **Saída do modo suporte:** quando o super-admin clica em "Sair do modo suporte", o servidor remove o cookie, cria `LogSuporte` com `acao="acesso_fim"` preenchendo `saidoEm`, e invalida o `sessaoId`. Se o browser fechar sem logout explícito, o cookie expira com a sessão do browser (cookie de sessão, sem `max-age`); a ausência do cookie no próximo acesso a `/super-admin/` indica que não há sessão de suporte ativa — o `LogSuporte` ficará com `saidoEm=null` (sessão "aberta"), detectável via a query descrita abaixo no modelo `LogSuporte`.

> **Integridade de `PessoaSegmento`:** a política OR pressupõe que `pessoaId` e `segmentoId` de uma mesma linha pertencem ao mesmo gabinete. Para garantir isso, a camada de aplicação deve sempre validar que `Pessoa.gabineteId == Segmento.gabineteId` antes de criar um `PessoaSegmento`. Um bug que crie uma linha com `pessoaId` de gabinete A e `segmentoId` de gabinete B não é bloqueado pelo RLS — a validação é responsabilidade da aplicação, não do banco.
>
> **Segmentos e papel do mobilizador:** a política RLS de `PessoaSegmento` garante **isolamento de tenant** (mobilizador não acessa dados de outro gabinete), mas **não** restringe acesso dentro do gabinete por papel. Um mobilizador com JWT válido pode ler `PessoaSegmento` de qualquer pessoa do gabinete via acesso direto ao banco (PostgREST com JWT autenticado, role=`authenticated` — distinto da anon key, que usa role `anon`). A restrição "mobilizador vê apenas segmentos dos seus convidados diretos" é imposta exclusivamente pela **camada de aplicação** — toda query da API do mobilizador que envolva `PessoaSegmento` deve filtrar por `VinculoRede.indicadoPorId = mobilizadorPessoaId`.

### Estrutura de URLs

```
redemobiliza.com.br/                          → redireciona para /login
redemobiliza.com.br/login                     → login geral
redemobiliza.com.br/super-admin/              → painel do super-admin
redemobiliza.com.br/g/[slug]/admin/           → painel do admin do gabinete
redemobiliza.com.br/g/[slug]/mobilizador/     → painel do mobilizador (acesso via magic link)
redemobiliza.com.br/g/[slug]/cadastro         → formulário público (sem login)
```

### Regras de slug

Slugs identificam o gabinete e os segmentos nas URLs. Regras:
- Apenas letras minúsculas, números e hífens
- Sem espaços, acentos ou caracteres especiais
- Exemplos válidos: `gabinete-joao`, `universitarios`, `palestra-2026`
- O sistema converte automaticamente o nome para slug no momento da criação

### Perfis de Acesso

| Perfil | Acesso |
|---|---|
| Super-admin | Gerencia todos os gabinetes + modo suporte com log |
| Admin do gabinete | Gerencia seu gabinete: pessoas, segmentos, mobilizadores, membros da equipe, regiões, profissões |
| Mobilizador | Vê seus convidados diretos e seu link/QR Code pessoal |

### Fluxo de criação de gabinete

1. Super-admin cria o gabinete (nome, slug, cores, logo)
2. Super-admin define o e-mail do admin do gabinete
3. Admin recebe convite por e-mail (Supabase Auth), clica no link, cria sua senha — o callback `/auth/confirm` lê `app_metadata.gabineteId` e cria automaticamente o `UsuarioGabinete` com `papel = "admin"`
4. Admin entra no sistema já configurado

---

## Modelo de Dados

```prisma
model Gabinete {
  id              String   @id @default(cuid())
  nome            String
  slug            String   @unique
  nomeSistema     String   @default("Rede Mobiliza")
  corPrimaria     String   @default("#1D4ED8")
  corSecundaria   String   @default("#3B82F6")
  logoUrl         String?
  imagemBannerUrl String?
  ativo           Boolean  @default(true)
  criadoEm       DateTime @default(now())
  atualizadoEm   DateTime @updatedAt

  pessoas      Pessoa[]
  segmentos    Segmento[]
  regioes      Regiao[]
  profissoes   Profissao[]
  usuarios     UsuarioGabinete[]
  vinculos     VinculoRede[]
  linksCompostos LinkComposto[]
  logsSuporteAcessados LogSuporte[]
}

model UsuarioGabinete {
  id         String   @id @default(cuid())
  userId     String   // Supabase auth user id
  gabineteId String
  papel      String   // admin | mobilizador
  criadoEm  DateTime @default(now())

  gabinete   Gabinete @relation(fields: [gabineteId], references: [id])

  @@unique([userId, gabineteId])
}
// Nota: admins autenticam via email/senha (Supabase inviteUserByEmail).
// Mobilizadores autenticam via magic link (Supabase signInWithOtp) — o Supabase
// cria um usuário em auth.users em ambos os casos. A diferença está no papel e
// nas rotas permitidas, não no tipo de conta Supabase.

model LinkComposto {
  id            String   @id @default(cuid())
  gabineteId    String
  mobilizadorId String   // referência à Pessoa com isMobilizador=true
  segmentoId    String
  criadoEm     DateTime @default(now())

  gabinete      Gabinete @relation(fields: [gabineteId], references: [id])
  mobilizador   Pessoa   @relation("LinksMobilizador", fields: [mobilizadorId], references: [id])
  segmento      Segmento @relation(fields: [segmentoId], references: [id])

  @@unique([gabineteId, mobilizadorId, segmentoId])
}

model Regiao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())

  gabinete   Gabinete  @relation(fields: [gabineteId], references: [id])
  pessoas    Pessoa[]

  // Nota: @@unique([gabineteId, nome]) foi removido propositalmente.
  // Regiões usam soft delete (ativa=false) — a constraint de banco bloquearia recriação de
  // região com mesmo nome após desativação. Unicidade de nome (entre ativa=true) é garantida
  // na camada de aplicação: verificar WHERE gabineteId=X AND nome=Y AND ativa=true
  // antes de criar ou editar. Ao editar, excluir o próprio id: AND id != <id_atual>.
}

model Profissao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())

  gabinete   Gabinete  @relation(fields: [gabineteId], references: [id])
  pessoas    Pessoa[]

  // Nota: @@unique([gabineteId, nome]) foi removido propositalmente.
  // Profissões usam soft delete (ativa=false) — a constraint de banco bloquearia recriação de
  // profissão com mesmo nome após desativação. Unicidade de nome (entre ativa=true) é garantida
  // na camada de aplicação: verificar WHERE gabineteId=X AND nome=Y AND ativa=true
  // antes de criar ou editar. Ao editar, excluir o próprio id: AND id != <id_atual>.
}

model Pessoa {
  id               String    @id @default(cuid())
  gabineteId       String
  nome             String
  whatsapp         String
  email            String?
  regiaoId         String?
  profissaoId      String?
  nascimento       DateTime?
  origem           String?   // qrcode | link | manual | indicacao | importacao | instagram | facebook | whatsapp
  isEquipe         Boolean   @default(false)
  isMobilizador    Boolean   @default(false)
  tokenMobilizador String?
  criadoEm         DateTime  @default(now())
  atualizadoEm     DateTime  @updatedAt

  gabinete           Gabinete         @relation(fields: [gabineteId], references: [id])
  regiao             Regiao?          @relation(fields: [regiaoId], references: [id])
  profissao          Profissao?       @relation(fields: [profissaoId], references: [id])
  segmentos          PessoaSegmento[]
  redesComoIndicado  VinculoRede[]    @relation("Indicado")
  redesComoIndicador VinculoRede[]    @relation("Indicador")
  linksCompostos     LinkComposto[]   @relation("LinksMobilizador")

  @@unique([gabineteId, whatsapp])
  @@unique([gabineteId, tokenMobilizador])
}

model Segmento {
  id           String   @id @default(cuid())
  gabineteId   String
  nome         String
  descricao    String?
  cor          String?
  icone        String?
  tipo         String   // interesse | grupo | evento | campanha
  slug         String
  status       String   @default("ativo")
  criadoEm    DateTime  @default(now())
  atualizadoEm DateTime @updatedAt

  gabinete       Gabinete         @relation(fields: [gabineteId], references: [id])
  pessoas        PessoaSegmento[]
  linksCompostos LinkComposto[]

  // Nota: @@unique([gabineteId, slug]) e @@unique([gabineteId, nome]) foram removidos
  // propositalmente. Segmentos usam soft delete (status='inativo') — constraints sem WHERE
  // bloqueariam recriação de segmentos com mesmo nome/slug após desativação (Prisma não
  // suporta unique parcial). Em substituição, criar dois índices parciais via migration SQL:
  //   CREATE UNIQUE INDEX ON "Segmento"("gabineteId", "nome") WHERE status = 'ativo';
  //   CREATE UNIQUE INDEX ON "Segmento"("gabineteId", "slug") WHERE status = 'ativo';
  // Esses índices garantem unicidade atômica no banco — dois INSERTs simultâneos com mesmo
  // nome/slug e status='ativo' resultam em erro de constraint no segundo, eliminando race
  // conditions. A verificação na app ainda é feita para retornar erro amigável antes do INSERT:
  //   - Criação: WHERE gabineteId=X AND (nome=Y OR slug=Z) AND status='ativo'
  //   - Edição:  WHERE gabineteId=X AND (nome=Y OR slug=Z) AND status='ativo' AND id != <id_atual>
  // (a cláusula `AND id != <id_atual>` é obrigatória na edição — sem ela, o próprio segmento
  // seria detectado como conflito e qualquer edição sem mudar nome/slug seria bloqueada).
}

model PessoaSegmento {
  pessoaId    String
  segmentoId  String
  criadoEm   DateTime @default(now())

  pessoa      Pessoa   @relation(fields: [pessoaId], references: [id])
  segmento    Segmento @relation(fields: [segmentoId], references: [id])

  @@id([pessoaId, segmentoId])
}

model VinculoRede {
  id            String   @id @default(cuid())
  gabineteId    String
  pessoaId      String
  indicadoPorId String?
  nivel         Int
  criadoEm     DateTime  @default(now())

  gabinete      Gabinete @relation(fields: [gabineteId], references: [id])
  pessoa        Pessoa   @relation("Indicado", fields: [pessoaId], references: [id])
  indicadoPor   Pessoa?  @relation("Indicador", fields: [indicadoPorId], references: [id])

  @@unique([gabineteId, pessoaId, indicadoPorId])
}
// Nota sobre a constraint @@unique com indicadoPorId nullable:
// PostgreSQL não considera NULL igual a NULL em constraints UNIQUE. Portanto, dois rows com
// (gabineteId='X', pessoaId='A', indicadoPorId=NULL) não conflitam — a constraint não impede
// duplicatas quando indicadoPorId é null. Para evitar vínculos nivel=0 duplicados (ex: por
// duplo submit ou retry de rede), a camada de aplicação DEVE verificar a existência antes do INSERT:
//   SELECT id FROM VinculoRede
//   WHERE gabineteId = X AND pessoaId = A AND indicadoPorId IS NULL
// Se já existir, o insert é pulado silenciosamente (não é erro — idempotência garantida pela app).
// Regra de cálculo de nivel (aplicada na camada de aplicação ao criar o vínculo):
// - indicadoPorId == null  → nivel = 0  (pessoa entrou diretamente, sem mobilizador)
// - indicadoPorId != null  → nivel = MIN(VinculoRede.nivel WHERE pessoaId=indicadoPorId AND gabineteId=gabineteId) + 1
//   "Quando o indicador pertence a múltiplas redes" significa: pessoaId=indicadoPorId pode ter
//   múltiplos registros VinculoRede no mesmo gabinete (um por cada mobilizador que a convidou).
//   Usa-se o MENOR desses niveis como base — ex: se o indicador tem niveis [2, 4], o indicado
//   recebe nivel = 2 + 1 = 3. Essa fórmula é aplicada independente de quantos vínculos o
//   indicado já possui no gabinete.
// O campo é gravado no INSERT para evitar recálculo em queries de leitura.

model LogSuporte {
  id                String   @id @default(cuid())
  gabineteId        String
  superAdminUserId  String   // userId do super-admin (Supabase auth.users)
  acao              String   // "acesso_inicio" | "acesso_fim" | descricao livre de ação
  detalhes          String?
  sessaoId          String   // agrupa eventos de uma mesma sessão de suporte
  criadoEm         DateTime @default(now())
  saidoEm          DateTime? // preenchido ao sair do modo suporte

  gabinete   Gabinete @relation(fields: [gabineteId], references: [id])
}
// sessaoId é gerado pelo servidor no início de cada sessão de suporte (cuid() ou UUID v4)
// e incluído em todos os registros da mesma sessão. É responsabilidade da camada de aplicação
// gerar e propagar o sessaoId — não é gerado pelo banco.
// Uma sessão de suporte gera ao menos dois registros com o mesmo sessaoId:
// acao="acesso_inicio" (saidoEm=null) e acao="acesso_fim" (saidoEm=timestamp de saída).
// Ações intermediárias (ex: "editou_pessoa") usam o mesmo sessaoId e têm saidoEm=null.
// IMPORTANTE: saidoEm só é preenchido no registro acao="acesso_fim" — nos demais é sempre null.
// Para identificar sessões abertas (sem saída registrada):
//   SELECT DISTINCT sessaoId FROM LogSuporte
//   WHERE sessaoId NOT IN (SELECT sessaoId FROM LogSuporte WHERE acao = 'acesso_fim')
```

---

## Módulo 1 — Cadastro Público de Pessoas

### Fluxo completo

**Passo 1 — WhatsApp (obrigatório — identificação única):**
- Pessoa digita o número
- Sistema normaliza antes de salvar e comparar em três passos: (1) remove **todos** os caracteres não numéricos, inclusive o sinal `+`; (2) prefixa `55` se o resultado tiver 10 dígitos (fixo local: DDD + 8) → 12 dígitos, ou se tiver 11 dígitos (celular local: DDD + 9) → 13 dígitos; (3) mantém sem alteração se já tiver 12 ou 13 dígitos (DDI + número completo). Qualquer outro comprimento é rejeitado como inválido antes de salvar. Resultado final: 12 ou 13 dígitos. Exemplos: `(61) 3333-3333` (fixo) → strip → `6133333333` (10 dígitos) → prefixar `55` → `556133333333`; `+55 (61) 3333-3333` → strip → `556133333333` (12 dígitos) → sem alteração; `(61) 99999-9999` (celular) → strip → `61999999999` (11 dígitos) → prefixar `55` → `5561999999999`; `+55 (61) 99999-9999` → strip → `5561999999999` (13 dígitos) → sem alteração. Ambas as formas de entrada para o mesmo número físico produzem o mesmo valor normalizado — garantindo que a constraint `@@unique([gabineteId, whatsapp])` detecte duplicatas. O sistema aplica a mesma função de normalização tanto no cadastro quanto na verificação de duplicidade.
- Sistema verifica se já existe no gabinete (usando o número normalizado com `WHERE gabineteId=X AND whatsapp=NORMALIZADO`)
- **Novo:** avança para preenchimento de dados
- **Já cadastrado:** exibe nome para confirmação → entra no segmento/rede sem repetir dados

**Passo 2 — Dados obrigatórios:**
- Nome completo
- Região administrativa (select da lista do gabinete)

**Passo 3 — Dados complementares:**
- Data de nascimento
- Profissão (select da lista editável do gabinete)
- Interesses (multi-select de segmentos do tipo "interesse")
- E-mail

### Automações ao concluir
- Vincula ao segmento do link (se `?segmento=slug` presente)
- Vincula à rede do mobilizador (se `?mobilizador=TOKEN` presente)
- Registra origem (qrcode, link, indicacao conforme parâmetros UTM)
- Página exibe identidade visual do gabinete (nome, cores, logo)

### Verificações na rota pública
- Se `Gabinete.ativo == false`: rota `/g/[slug]/cadastro` exibe página de erro "Este gabinete não está disponível no momento" (HTTP 403) — não processa cadastros
- Se segmento informado no link (`?segmento=slug`): o lookup deve usar `WHERE gabineteId=X AND slug='slug' AND status='ativo'` — o filtro `status='ativo'` é obrigatório na query porque pode existir múltiplos segmentos com o mesmo slug (um ativo, outros inativos após soft delete). Se a query não retornar resultado (segmento não existe ou está inativo), cadastro prossegue normalmente mas o vínculo ao segmento **não** é criado; sistema exibe aviso discreto "Este grupo não está mais disponível, mas seu cadastro foi realizado com sucesso"
- O parâmetro `?mobilizador=TOKEN` é válido se e somente se existir `Pessoa WHERE tokenMobilizador = TOKEN AND isMobilizador = true` no gabinete. Se qualquer condição falhar (token não existe, `tokenMobilizador=null`, `isMobilizador=false`), o parâmetro é ignorado silenciosamente e o vínculo de rede não é criado

### Verificações nas rotas autenticadas (admin e mobilizador)
- `/g/[slug]/admin/` e `/g/[slug]/mobilizador/` verificam `Gabinete.ativo = true` em cada request — se false, retornam HTTP 403 com mensagem "Este gabinete foi desativado. Entre em contato com o suporte."
- `/g/[slug]/mobilizador/` verifica se existe uma entrada em `UsuarioGabinete` com `papel = "mobilizador"` para o `userId` da sessão a cada request — não apenas o JWT Supabase. ("Existência" é o único critério — o registro ou existe ou foi deletado na remoção; não há campo `ativo`.) Se a entrada foi removida (mobilizador revogado), o middleware rejeita o acesso e redireciona para a página de login. O `signOut` tenta invalidar o JWT imediatamente; se falhar, o JWT pode permanecer válido até expiração natural, mas o middleware barra a cada request — sem acesso funcional ao painel.

### Rastreamento de origem

| Origem | Como é capturada |
|---|---|
| qrcode | `utm_source=qrcode` na URL |
| link | `utm_source=link` na URL |
| indicacao | Link com `?mobilizador=TOKEN` |
| manual | Cadastro feito pelo admin no painel |
| instagram / facebook / whatsapp | Parâmetros UTM no link |
| importacao | Definido automaticamente no módulo de importação de planilhas (funcionalidade futura) |

---

## Módulo 2 — Segmentos

### Gerenciamento pelo admin
- Criar, editar e desativar segmentos
- Campos: nome, descrição, cor, ícone, tipo, status
- Tipos: `interesse` | `grupo` | `evento` | `campanha`
- **Exclusão de segmento é sempre soft delete:** o admin define `status = "inativo"` (não apaga o registro). Segmentos com `status != "ativo"` não aparecem nos selects nem na rota pública. Os registros em `PessoaSegmento` e `LinkComposto` vinculados ao segmento são mantidos para fins de histórico; novos vínculos ao segmento inativo não podem ser criados. Hard delete não é suportado — a existência de FKs em `PessoaSegmento` e `LinkComposto` impediria a exclusão enquanto houver vínculos ativos.

### Links e QR Codes

| Tipo | URL gerada |
|---|---|
| Segmento simples | `/g/[slug]/cadastro?segmento=universitarios` |
| Mobilizador simples | `/g/[slug]/cadastro?mobilizador=TOKEN` |
| Composto (admin cria) | `/g/[slug]/cadastro?mobilizador=TOKEN&segmento=universitarios` |

- Cada link tem QR Code gerado automaticamente
- Admin pode baixar o QR Code para imprimir ou compartilhar
- Segmentos do tipo `interesse` aparecem no Passo 3 do formulário como multi-select
- Os demais tipos entram via link/QR Code apenas
- Links compostos são persistidos na tabela `LinkComposto` para consulta posterior pelo admin

### Funcionalidades futuras (próximo ciclo)
- Importação de planilhas/bases externas com campo segmento

---

## Módulo 3 — Rede de Mobilização

### Como uma pessoa vira mobilizador
1. Admin localiza a pessoa no sistema
2. Clica em "Tornar Mobilizador"
3. **Validação pré-promoção:** sistema verifica (a) `Pessoa.email != null` — se ausente, exibe erro "Informe o e-mail da pessoa antes de tornar mobilizador" e bloqueia; (b) Pessoa não possui `UsuarioGabinete` com `papel = "admin"` no mesmo gabinete — verificação via service role key: query SQL direta em `auth.users` (`SELECT id FROM auth.users WHERE email = $1 LIMIT 1` via `prisma.$queryRaw` **usando o Prisma client configurado com service role key** — o Prisma client padrão não tem acesso ao schema `auth`) → se retornar um usuário, checar `UsuarioGabinete WHERE userId = userId_encontrado AND gabineteId = X AND papel = "admin"`; se não existir linha em `auth.users` para este e-mail, verificação passa trivialmente; se existir usuário e ele for admin do mesmo gabinete, exibe erro "Um administrador do gabinete não pode ser promovido a mobilizador por este fluxo" e bloqueia. **Nota:** `supabase.auth.admin.getUserByEmail()` não existe na Admin JS SDK; a única forma de buscar por email é via SQL direto na tabela `auth.users` usando service role key.
4. Sistema gera `tokenMobilizador` único (cuid) e define `isMobilizador = true`
5. Sistema envia magic link por e-mail via `supabase.auth.signInWithOtp({ email, options: { redirectTo: 'https://<APP_URL>/auth/callback?gabineteId=GABINETE_ID&token=TOKEN_MOBILIZADOR' } })` — `<APP_URL>` deve ser lido de variável de ambiente (ex: `process.env.NEXT_PUBLIC_APP_URL`). O `redirectTo` **deve ser URL absoluta** — o Supabase valida o valor contra a allowlist de Redirect URLs (Authentication → URL Configuration) e silenciosamente descarta o `redirectTo` se for um path relativo, perdendo os parâmetros `gabineteId` e `token`. **`UsuarioGabinete` ainda não é criado neste momento**. **Nota de segurança:** o `token` presente na URL do redirectTo é o `tokenMobilizador` — ele aparece no link enviado por e-mail (exposição necessária, diferente de "retornar em resposta de API"). Essa exposição é aceita porque (a) o e-mail é enviado apenas para o próprio mobilizador e (b) o callback valida que o e-mail autenticado corresponde ao da Pessoa (passo 7), impedindo uso do token por terceiros.
6. Mobilizador clica no link → Supabase cria `auth.users` e dispara o callback de autenticação com os parâmetros do `redirectTo`
7. Callback lê `gabineteId` e `token` dos parâmetros do `redirectTo`. Busca `Pessoa WHERE gabineteId = gabineteId AND tokenMobilizador = token` — lookup determinístico, sem ambiguidade multi-gabinete. **Validação de e-mail:** compara `session.user.email.toLowerCase() == Pessoa.email?.toLowerCase()` (case-insensitive — Supabase normaliza emails para lowercase em `auth.users`); se divergir, rejeita com "Link inválido ou expirado — peça ao administrador para reenviar o convite" (impede que um usuário com JWT próprio use token de outra pessoa). Se não encontrar resultado (token não existe), mesma mensagem de erro. Cria `UsuarioGabinete` via **upsert** com `userId = auth.users.id` e `papel = "mobilizador"`, chave de conflito `[userId, gabineteId]` (upsert garante idempotência em double-click ou retry do browser)
8. Callback busca `Gabinete.slug` pelo `gabineteId` recebido. Se `gabineteId` não existir no banco (URL manipulada ou gabinete excluído), exibe "Link inválido ou expirado". Caso contrário, redireciona para `/g/[slug]/mobilizador/`

> Mobilizadores autenticam exclusivamente via magic link por e-mail (Supabase `signInWithOtp`).
> `UsuarioGabinete` é criado no callback de autenticação (após primeiro uso do magic link), não no momento da promoção — isso garante que `userId` sempre tenha um UUID válido de `auth.users`.

### Painel do mobilizador
- Seu link e QR Code pessoal (`/g/[slug]/cadastro?mobilizador=TOKEN`)
- Lista dos seus convidados diretos (nome, WhatsApp, região, segmentos)
- Contador total de pessoas que trouxe

> A API que popula essa lista usa `select` explícito — retorna apenas os campos acima. Campos como `isEquipe`, `isMobilizador`, `tokenMobilizador`, `email` e `origem` **não são retornados como campos JSON de primeiro nível**. O painel do mobilizador recebe seu link pessoal já montado server-side (ex: `{ linkPessoal: "/g/slug/cadastro?mobilizador=TOKEN" }`).
>
> **Sobre `tokenMobilizador`:** campo interno ao servidor. Regra: o `tokenMobilizador` **nunca é retornado como campo JSON isolado** em nenhuma resposta de API. O valor é exposto de duas formas **intencionais e controladas**: (1) embutido na URL de cadastro (`/g/slug/cadastro?mobilizador=TOKEN`) retornada como string pronta (`linkPessoal`) para o mobilizador usar seu link; (2) embutido na URL retornada pelo endpoint "Copiar link" do admin. Qualquer cliente que analise essas strings pode extrair o token — isso é aceito pelo design, pois o link de cadastro é publicamente compartilhável pelo mobilizador. O que **nunca deve acontecer** é retornar o token como campo direto em um objeto JSON de Pessoa ou listagem.

### Regras de privacidade

| Quem | Vê |
|---|---|
| Mobilizador | Apenas seus convidados diretos (nome, WhatsApp, região, segmentos) |
| Mobilizador | NÃO vê a rede dos seus convidados |
| Mobilizador | NÃO vê `isEquipe`, `isMobilizador`, `tokenMobilizador`, `email`, `origem`, `profissaoId`, `nascimento` dos convidados — nem o objeto relacionado `profissao { id, nome }` via include |
| Admin | Toda a árvore completa + todos os campos de cada pessoa, **exceto** `tokenMobilizador` como campo direto na ficha da pessoa (o valor pode ser obtido via endpoint dedicado "Copiar link de mobilizador", que retorna apenas o URL completo — nunca o token isolado) |

### Duplicidade controlada
- Pessoa existe uma única vez no banco (tabela `Pessoa`)
- Pode estar na rede de mais de um mobilizador (tabela `VinculoRede`)
- Contagem total: conta como 1 pessoa independente de quantas redes pertence
- Admin vê todos os vínculos da pessoa
- Cada mobilizador vê apenas o vínculo com ele

### Remoção de mobilizador
- Admin revoga a permissão
- **Antes de iniciar a transação:** verifique se existe entrada em `UsuarioGabinete` para o mobilizador e guarde o `userId` em memória (pode não existir se o mobilizador nunca clicou no magic link)
- As operações de banco são executadas em **uma única transação Prisma** com as seguintes operações: (1) `Pessoa.isMobilizador = false`, (2) `Pessoa.tokenMobilizador = null`, (3) remoção condicional da entrada em `UsuarioGabinete` — **inclua esta operação no array `prisma.$transaction([...])` somente se `userId` for não-nulo**; use `deleteMany({ where: { userId: userId, gabineteId } })` (nunca `delete`, que lança erro se o registro não existe); **nunca passe `userId: undefined` ao `deleteMany` — no Prisma, `where: { userId: undefined }` equivale a WHERE omitido e apagaria todos os `UsuarioGabinete` do gabinete**, e (4) `deleteMany({ where: { mobilizadorId: pessoaId, gabineteId } })` em `LinkComposto`. Os `LinkComposto` são apagados pois a FK `mobilizadorId` apontaria para uma `Pessoa` com `isMobilizador = false`, tornando os links permanentemente inúteis e confusos para o admin.
- Após commit da transação, se `userId` foi encontrado, chama `supabase.auth.admin.signOut(userId)` — essa chamada é **melhor esforço**: se **tiver sucesso**, ambos access token e refresh token são invalidados imediatamente (sem acesso residual). Se **falhar**, o refresh token permanece válido e o middleware Next.js barra o mobilizador em cada request ao painel; requests diretas ao PostgREST com JWT ainda válido contornam o middleware — acesso residual limitado ao TTL do refresh token (máximo 1 dia, ver configuração abaixo).
- O JWT do projeto Supabase deve ser configurado com **expiração máxima de 1 hora** (Auth → Settings → JWT expiry). Quando `signOut` **falha** (melhor esforço), o refresh token permanece válido e o JS Client o usa para renovar silenciosamente o access token por até o TTL do refresh token. Para limitar esse risco, configure também o **Refresh Token expiry** (Auth → Settings → Refresh Token expiry) para no máximo **1 dia** — isso restringe o pior caso de acesso pós-revogação por falha de `signOut`. Para sessões ativas legítimas, o Supabase renova o access token silenciosamente; admins e mobilizadores ativos **não precisam re-autenticar manualmente**.
- Links e QR Codes antigos do mobilizador param de funcionar imediatamente (token não existe mais — a rota pública valida `tokenMobilizador = TOKEN AND isMobilizador = true` e ambos estão nulos/falsos após a transação)
- Histórico de indicações é mantido (vínculos em `VinculoRede` não são apagados)
- Se a pessoa for re-promovida no futuro, um novo `tokenMobilizador` é gerado e um novo magic link é enviado. **Atenção:** os `LinkComposto` anteriores foram apagados na remoção — o admin precisará recriá-los manualmente se necessário.

---

## Módulo 4 — Super-Admin

### Acesso
- URL exclusiva: `/super-admin/`
- Login separado (e-mail e senha) — **não usa a rota `/login` dos admins de gabinete**
- Existe apenas um super-admin (o dono do sistema) — unicidade não é imposta pelo mecanismo de `app_metadata`; deve ser verificada no provisionamento e auditada periodicamente via Supabase Auth dashboard (listar usuários com `app_metadata.role = "super-admin"`)
- **Identificação:** o super-admin é identificado pelo campo `app_metadata.role = "super-admin"` no Supabase Auth, configurado via service role key no provisionamento inicial (nunca via dashboard de usuário). O middleware de `/super-admin/` verifica `session.user.app_metadata.role === "super-admin"` em cada request — qualquer outro valor resulta em HTTP 403. **Importante:** usar `app_metadata` (não `user_metadata`) — `app_metadata` só pode ser escrito via service role key, enquanto `user_metadata` pode ser sobrescrito pelo próprio usuário autenticado, o que abriria vetor de escalada de privilégio.

### Google OAuth para admins de gabinete
- Google OAuth disponível como alternativa de login para admins de gabinete (não para mobilizadores nem super-admin)
- **Fluxo obrigatório:** o admin deve primeiramente aceitar o convite por e-mail (`inviteUserByEmail`) — essa etapa cria o `auth.users` e o `UsuarioGabinete` via callback `/auth/confirm`. Somente após isso o Google pode ser adicionado como segundo método de autenticação (o Supabase vincula o provider Google ao mesmo `auth.users` já existente). Admins que ignoram o invite e tentam acessar diretamente via Google terão acesso negado.
- Após autenticação (por qualquer provider), o sistema verifica se o `userId` da sessão tem entrada em `UsuarioGabinete` com `papel = "admin"` — caso contrário, acesso é negado com mensagem "Seu e-mail não está autorizado. Entre em contato com o administrador."
- **Fluxo de envio do convite (super-admin):**
  1. `supabase.auth.admin.inviteUserByEmail(email)` — cria o usuário em `auth.users` e **envia imediatamente** o e-mail de convite
  2. `supabase.auth.admin.updateUserById(userId, { app_metadata: { gabineteId, papel: 'admin' } })` — armazena `gabineteId` em `app_metadata` via service role key (não em `user_metadata`, que pode ser sobrescrito pelo próprio usuário — mesma razão pela qual `app_metadata` é usado para o super-admin)
  - **Race condition:** o e-mail é enviado no passo 1, antes de `app_metadata` ser gravado no passo 2. Se o admin clicar no link antes de o passo 2 completar, `session.user.app_metadata.gabineteId` estará `null` no callback `/auth/confirm`. **Mitigação:** o callback deve verificar explicitamente se `app_metadata.gabineteId` está presente; caso esteja `null` ou ausente, exibir erro "Convite inválido — solicite ao administrador do sistema o reenvio do convite" e abortar sem criar `UsuarioGabinete`. **Importante:** o link de convite do Supabase é de uso único — após o primeiro clique (mesmo que resulte em erro no callback), o token é consumido e o link não pode ser reutilizado. Não oriente o admin a "tentar abrir o link novamente". **Para reenviar o convite:** se o usuário ainda não existe em `auth.users` (ex: primeiro envio falhou antes de criar o registro), use novamente `inviteUserByEmail`. Se o usuário já existe em `auth.users` (convite anterior foi enviado mas o link foi consumido com erro), `inviteUserByEmail` retornará erro "User already registered" — nesse caso use `supabase.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: 'https://<APP_URL>/auth/confirm' } })` para gerar um novo link de autenticação sem criar novo usuário — o `redirectTo` **deve apontar para `/auth/confirm`** (não para `/auth/callback`) para que o callback correto crie o `UsuarioGabinete`. Antes de chamar `generateLink`, verifique que `app_metadata.gabineteId` já foi gravado para este usuário (chame `updateUserById` se necessário). O link gerado deve ser enviado manualmente por e-mail (ou via outra API transacional) — `generateLink` não envia o e-mail automaticamente, diferente de `inviteUserByEmail`. **Nota:** `type: 'invite'` não é um tipo válido no `generateLink` da Supabase Admin SDK — use `type: 'magiclink'`. Na prática, o passo 2 completa em milissegundos após o passo 1 — a janela de race é mínima, mas deve ser tratada defensivamente com a mensagem acima.
- **Fluxo do callback `/auth/confirm`:**
  1. Lê `gabineteId` de `session.user.app_metadata.gabineteId` (somente leitura pelo usuário — seguro)
  2. Verifica que o `gabineteId` existe no banco; se não existir, exibe erro e aborta
  3. Cria `UsuarioGabinete` via **upsert** com `userId = auth.users.id`, `gabineteId` e `papel = "admin"` (upsert garante idempotência em double-click ou retry)
  4. Redireciona para `/g/[slug]/admin/` usando o `Gabinete.slug` correspondente ao `gabineteId`

### Capacidades

**Gestão de gabinetes:**
- Criar novo gabinete (nome, slug, cores, logo)
- Ativar/desativar gabinete
- Definir e-mail do admin (sistema envia convite automático via Supabase Auth)
- Ver resumo: total de pessoas, segmentos e mobilizadores por gabinete

**Modo suporte:**
- Super-admin pode acessar qualquer gabinete para suporte
- Todo acesso em modo suporte é registrado no `LogSuporte`:
  - Gabinete acessado
  - Data e hora de entrada e saída
  - Ações realizadas

---

## Módulo 5 — Personalização do Gabinete

Cada gabinete pode configurar sua identidade visual:
- Nome do sistema (ex: "Sistema do Deputado X")
- Cor primária e secundária
- Logo (upload de imagem)
- Imagem de banner

Essas configurações são exibidas na página pública de cadastro.

---

## Módulo 6 — Membros da Equipe

O admin pode marcar qualquer pessoa cadastrada como membro da equipe interna do gabinete.

### Gerenciamento
- Toggle "Membro da equipe" disponível na ficha de qualquer pessoa no painel admin
- `Pessoa.isEquipe` é alternado na ficha da pessoa: **marcar é imediato** (sem confirmação); **desmarcar exige confirmação** "Remover [nome] da equipe?" antes de executar — tanto na ficha quanto na listagem
- Não tem relação com mobilizador — uma pessoa pode ser membro da equipe, mobilizador, ambos ou nenhum

### Listagem de membros
- A lista geral de pessoas no painel admin possui um filtro **"Somente equipe"** que exibe apenas pessoas com `isEquipe = true` (não é uma rota separada — é um estado de filtro na mesma tela de pessoas)
- Campos exibidos com o filtro ativo: nome, WhatsApp, região (ou "—" se vazia), profissão (ou "—" se vazia), se é mobilizador
- Admin pode desmarcar `isEquipe` diretamente na listagem (sem precisar abrir a ficha individual); a confirmação **"Remover [nome] da equipe?"** é exibida antes de executar — consistente com o comportamento da ficha

---

## Módulo 7 — Listas Gerenciáveis pelo Admin

### Regiões Administrativas
- Pré-cadastradas com as 35 regiões administrativas do DF
- Admin pode adicionar, editar ou **desativar** (soft delete: `ativa = false`) — hard delete não é suportado para evitar FK constraint com Pessoas vinculadas
- Regiões com `ativa = false` não aparecem no formulário de cadastro nem nos selects do painel; Pessoas que já possuem `regiaoId` apontando para uma região desativada mantêm o vínculo e a região é exibida como "(desativada)" nas listagens admin

### Profissões
- Pré-cadastradas com lista padrão de profissões comuns
- Admin pode adicionar, editar ou **desativar** (soft delete: `ativa = false`) — hard delete não é suportado pelo mesmo motivo
- Profissões com `ativa = false` não aparecem no formulário de cadastro nem nos selects do painel; Pessoas que já possuem `profissaoId` apontando para profissão desativada mantêm o vínculo e a profissão é exibida como "(desativada)"
- Campo aparece como select no formulário de cadastro

---

## Dashboard do Administrador (Fase 1)

Cards e tabelas filtráveis por período (hoje / 7 dias / 30 dias / personalizado):

- Total de pessoas cadastradas — **estado atual, não filtrado por período**
- Novas pessoas no período selecionado
- Total de mobilizadores ativos — **estado atual, não filtrado por período** (critério: `isMobilizador = true`, independente de ter `UsuarioGabinete` criado)
- Total de membros da equipe (`isEquipe = true`) — **estado atual, não filtrado por período**
- Pessoas por segmento (tabela ordenável)
- Ranking de mobilizadores por convidados — conta `VinculoRede WHERE indicadoPorId = Pessoa.id` para o período selecionado, filtrando apenas pessoas com `isMobilizador = true` no momento da consulta. Mobilizadores com zero convidados no período aparecem no final da lista com contagem 0. Ex-mobilizadores (`isMobilizador = false`) não aparecem no ranking, mesmo que possuam `VinculoRede` histórico.
- Pessoas por origem (tabela e eventual gráfico)
- Pessoas por região administrativa

### Mapeamento de origens (valor gravado → label exibido)

| Valor em `Pessoa.origem` | Label no dashboard |
|---|---|
| `qrcode` | QR Code |
| `link` | Link |
| `manual` | Manual |
| `indicacao` | Indicação |
| `instagram` | Instagram |
| `facebook` | Facebook |
| `whatsapp` | WhatsApp |
| `importacao` | Importação |
| `null` | Não informado |

> Dashboard será expandido conforme novos módulos forem adicionados ao sistema.

---

## Funcionalidades Futuras (fora do escopo da Fase 1)

- Importação de planilhas/bases externas vinculadas a segmentos
- Disparo automático de mensagens (WhatsApp/e-mail) ao cadastrar
- Gráficos visuais no dashboard (barras, linhas, pizza)
- Planos e limites por gabinete (billing)
- Módulos: Tarefas, Demandas, Agenda, Comunicação

> **Nota para os módulos de Tarefas e Demandas (Fase 2):** o campo `Pessoa.isEquipe` foi criado na Fase 1 especificamente para suportar esses módulos. O seletor de "Responsável" deve filtrar `WHERE isEquipe = true AND gabineteId = <gabinete autenticado>`. Mobilizadores com `isMobilizador = true` mas `isEquipe = false` **não aparecem** no seletor — se o admin quiser atribuir responsabilidade a um mobilizador, deve primeiro marcá-lo como membro da equipe via toggle. Qualquer alteração no modelo de membros da equipe na Fase 2 deve considerar a compatibilidade com esse campo.
