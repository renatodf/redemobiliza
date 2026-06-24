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

### Row-Level Security (RLS)

O isolamento multi-tenant é garantido em duas camadas:

1. **Aplicação (Prisma):** toda query inclui `WHERE gabineteId = <id do gabinete autenticado>`. APIs de gabinete extraem `gabineteId` da sessão Supabase Auth — nunca de parâmetros de URL.
2. **Banco de dados (Supabase RLS):** RLS habilitado em todas as tabelas com coluna `gabineteId`. Políticas garantem que um usuário autenticado só leia/escreva linhas do próprio gabinete. Super-admin usa service role key (bypass de RLS) apenas para operações de suporte.

A tabela `PessoaSegmento` não possui `gabineteId` direto e é protegida via política RLS baseada em join: `pessoaId IN (SELECT id FROM Pessoa WHERE gabineteId = auth.uid_gabinete())` ou `segmentoId IN (SELECT id FROM Segmento WHERE gabineteId = auth.uid_gabinete())`. A tabela `VinculoRede` possui `gabineteId` próprio e segue a regra geral de RLS direta.

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
| Admin do gabinete | Gerencia seu gabinete: pessoas, segmentos, mobilizadores, regiões, profissões |
| Mobilizador | Vê seus convidados diretos e seu link/QR Code pessoal |

### Fluxo de criação de gabinete

1. Super-admin cria o gabinete (nome, slug, cores, logo)
2. Super-admin define o e-mail do admin do gabinete
3. Admin recebe convite por e-mail (Supabase Auth) e cria sua senha
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
}

model Regiao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())

  gabinete   Gabinete  @relation(fields: [gabineteId], references: [id])
  pessoas    Pessoa[]

  @@unique([gabineteId, nome])
}

model Profissao {
  id         String   @id @default(cuid())
  gabineteId String
  nome       String
  ativa      Boolean  @default(true)
  criadoEm  DateTime @default(now())

  gabinete   Gabinete  @relation(fields: [gabineteId], references: [id])
  pessoas    Pessoa[]

  @@unique([gabineteId, nome])
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

  @@unique([gabineteId, slug])
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
// Regra de cálculo de nivel (aplicada na camada de aplicação ao criar o vínculo):
// - indicadoPorId == null  → nivel = 0  (pessoa entrou diretamente, sem mobilizador)
// - indicadoPorId != null  → nivel = MIN(VinculoRede.nivel WHERE pessoaId=indicadoPorId AND gabineteId=gabineteId) + 1
//   Quando o indicador pertence a múltiplas redes, usa-se o menor nivel encontrado.
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
- Sistema verifica se já existe no gabinete
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
- Se segmento informado no link tiver `status != "ativo"`: cadastro prossegue normalmente, mas o vínculo ao segmento **não** é criado; sistema exibe aviso discreto "Este grupo não está mais disponível, mas seu cadastro foi realizado com sucesso"
- Se token de mobilizador não existir (tokenMobilizador null ou pessoa não é mobilizador): parâmetro `?mobilizador=` é ignorado silenciosamente; vínculo de rede não é criado

### Verificações nas rotas autenticadas (admin e mobilizador)
- `/g/[slug]/admin/` e `/g/[slug]/mobilizador/` verificam `Gabinete.ativo = true` em cada request — se false, retornam HTTP 403 com mensagem "Este gabinete foi desativado. Entre em contato com o suporte."
- `/g/[slug]/mobilizador/` verifica a existência de entrada ativa em `UsuarioGabinete` com `papel = "mobilizador"` a cada request — não apenas o JWT Supabase. Se a entrada foi removida (mobilizador revogado), a sessão é invalidada imediatamente e o usuário é redirecionado para a página de login.

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
- Criar, editar e excluir segmentos
- Campos: nome, descrição, cor, ícone, tipo, status
- Tipos: `interesse` | `grupo` | `evento` | `campanha`

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
3. **Validação pré-promoção:** sistema verifica `Pessoa.email != null` — se ausente, exibe erro "Informe o e-mail da pessoa antes de tornar mobilizador" e bloqueia a ação
4. Sistema gera `tokenMobilizador` único (cuid) e define `isMobilizador = true`
5. Sistema envia magic link por e-mail via `supabase.auth.signInWithOtp({ email })` — **`UsuarioGabinete` ainda não é criado neste momento**
6. Mobilizador clica no link → Supabase cria `auth.users` e dispara callback de autenticação na aplicação
7. Callback verifica `Pessoa.tokenMobilizador != null` para o email autenticado → cria `UsuarioGabinete` com `userId = auth.users.id` e `papel = "mobilizador"`
8. Mobilizador é redirecionado para `/g/[slug]/mobilizador/`

> Mobilizadores autenticam exclusivamente via magic link por e-mail (Supabase `signInWithOtp`).
> `UsuarioGabinete` é criado no callback de autenticação (após primeiro uso do magic link), não no momento da promoção — isso garante que `userId` sempre tenha um UUID válido de `auth.users`.

### Painel do mobilizador
- Seu link e QR Code pessoal (`/g/[slug]/cadastro?mobilizador=TOKEN`)
- Lista dos seus convidados diretos (nome, WhatsApp, região, segmentos)
- Contador total de pessoas que trouxe

### Regras de privacidade

| Quem | Vê |
|---|---|
| Mobilizador | Apenas seus convidados diretos |
| Mobilizador | NÃO vê a rede dos seus convidados |
| Admin | Toda a árvore completa |

### Duplicidade controlada
- Pessoa existe uma única vez no banco (tabela `Pessoa`)
- Pode estar na rede de mais de um mobilizador (tabela `VinculoRede`)
- Contagem total: conta como 1 pessoa independente de quantas redes pertence
- Admin vê todos os vínculos da pessoa
- Cada mobilizador vê apenas o vínculo com ele

### Remoção de mobilizador
- Admin revoga a permissão
- Sistema define `Pessoa.isMobilizador = false` e `Pessoa.tokenMobilizador = null`
- A entrada correspondente em `UsuarioGabinete` (papel = "mobilizador") é removida
- Sistema chama `supabase.auth.admin.signOut(userId)` para invalidar imediatamente todas as sessões JWT ativas do mobilizador — sem esperar expiração natural do token
- Links e QR Codes antigos do mobilizador param de funcionar imediatamente (token não existe mais)
- Histórico de indicações é mantido (vínculos em `VinculoRede` não são apagados)
- Se a pessoa for re-promovida no futuro, um novo `tokenMobilizador` é gerado e um novo magic link é enviado

---

## Módulo 4 — Super-Admin

### Acesso
- URL exclusiva: `/super-admin/`
- Login separado (e-mail e senha) — **não usa a rota `/login` dos admins de gabinete**
- Existe apenas um super-admin (o dono do sistema)
- **Identificação:** o super-admin é identificado pelo campo `user_metadata.role = "super-admin"` no Supabase Auth, configurado manualmente via Supabase Dashboard no provisionamento inicial. O middleware de `/super-admin/` verifica `session.user.user_metadata.role === "super-admin"` em cada request — qualquer outro valor resulta em HTTP 403.

### Google OAuth para admins de gabinete
- Google OAuth disponível como alternativa de login para admins de gabinete (não para mobilizadores nem super-admin)
- Após autenticação via Google, o sistema verifica se o email tem entrada ativa em `UsuarioGabinete` com `papel = "admin"` — caso contrário, acesso é negado com mensagem "Seu e-mail não está autorizado. Entre em contato com o administrador."
- Admins que usam Google OAuth não precisam definir senha — o convite por e-mail (Supabase `inviteUserByEmail`) redireciona para configuração de senha, mas se o admin optar por Google, o fluxo de senha é ignorado

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

- Checkbox "Membro da equipe" disponível na ficha de qualquer pessoa no painel admin
- `Pessoa.isEquipe` é alternado diretamente pelo admin (toggle simples)
- Não tem relação com mobilizador — uma pessoa pode ser membro da equipe, mobilizador, ambos ou nenhum

**Uso em módulos futuros:** nos módulos de Tarefas, Demandas e similares, o campo "Responsável" exibirá apenas pessoas com `isEquipe = true`. Isso evita selecionar cadastros externos por engano.

---

## Módulo 7 — Listas Gerenciáveis pelo Admin

### Regiões Administrativas
- Pré-cadastradas com as 35 regiões administrativas do DF
- Admin pode adicionar, editar ou excluir

### Profissões
- Pré-cadastradas com lista padrão de profissões comuns
- Admin pode adicionar, editar ou excluir
- Campo aparece como select no formulário de cadastro

---

## Dashboard do Administrador (Fase 1)

Cards e tabelas filtráveis por período (hoje / 7 dias / 30 dias / personalizado):

- Total de pessoas cadastradas
- Novas pessoas no período selecionado
- Total de mobilizadores ativos
- Pessoas por segmento (tabela ordenável)
- Ranking de mobilizadores por convidados
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
