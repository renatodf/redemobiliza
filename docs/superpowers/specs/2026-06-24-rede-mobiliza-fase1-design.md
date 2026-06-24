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
- **Supabase Auth** (email/senha + Google)
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
  userId     String   // Supabase auth user id (apenas admins têm conta Supabase)
  gabineteId String
  papel      String   // admin (mobilizadores NÃO entram aqui — identificados por Pessoa.isMobilizador)
  criadoEm  DateTime @default(now())

  gabinete   Gabinete @relation(fields: [gabineteId], references: [id])

  @@unique([userId, gabineteId])
}

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
  nivel         Int      @default(0)
  criadoEm     DateTime  @default(now())

  gabinete      Gabinete @relation(fields: [gabineteId], references: [id])
  pessoa        Pessoa   @relation("Indicado", fields: [pessoaId], references: [id])
  indicadoPor   Pessoa?  @relation("Indicador", fields: [indicadoPorId], references: [id])
}

model LogSuporte {
  id         String   @id @default(cuid())
  gabineteId String
  acao       String
  detalhes   String?
  criadoEm  DateTime @default(now())

  gabinete   Gabinete @relation(fields: [gabineteId], references: [id])
}
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

### Rastreamento de origem

| Origem | Como é capturada |
|---|---|
| qrcode | `utm_source=qrcode` na URL |
| link | `utm_source=link` na URL |
| indicacao | Link com `?mobilizador=TOKEN` |
| manual | Cadastro feito pelo admin no painel |
| instagram / facebook / whatsapp | Parâmetros UTM no link |

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
2. Clica em "Tornar Mobilizador" (pessoa deve ter e-mail cadastrado)
3. Sistema gera token único automaticamente
4. Sistema envia magic link por e-mail via Supabase Auth
5. Mobilizador clica no link e acessa seu painel diretamente (sem senha)

> Mobilizadores autenticam exclusivamente via magic link por e-mail.
> Eles NÃO têm conta Supabase convencional — são identificados pelo token na tabela `Pessoa`.

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
- Histórico de indicações é mantido (vínculos não são apagados)

---

## Módulo 4 — Super-Admin

### Acesso
- URL exclusiva: `/super-admin/`
- Login separado (e-mail e senha)
- Existe apenas um super-admin (o dono do sistema)

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

## Módulo 6 — Listas Gerenciáveis pelo Admin

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
- Pessoas por origem (QR Code, Link, Manual, Indicação)
- Pessoas por região administrativa

> Dashboard será expandido conforme novos módulos forem adicionados ao sistema.

---

## Funcionalidades Futuras (fora do escopo da Fase 1)

- Importação de planilhas/bases externas vinculadas a segmentos
- Disparo automático de mensagens (WhatsApp/e-mail) ao cadastrar
- Gráficos visuais no dashboard (barras, linhas, pizza)
- Planos e limites por gabinete (billing)
- Módulos: Tarefas, Demandas, Agenda, Comunicação
