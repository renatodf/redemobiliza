# HANDOFF — Rede Mobiliza

> Documento de transição gerado em 2026-07-10, a partir do histórico completo do projeto (245 commits) e dos specs/plans em `docs/superpowers/`. HEAD no momento: `4746de7` (branch `main`).

## O que é o projeto

Plataforma SaaS multi-tenant de mobilização/engajamento civil. Cada **gabinete** (tenant) tem seu próprio domínio de dados, marca visual (`corPrimaria`/`corTextoContraste`) e três perfis de acesso: **super-admin** (gerencia gabinetes), **admin** (gerencia um gabinete) e **mobilizador** (cadastra pessoas na própria rede e acompanha demandas atribuídas a ele). Pessoas se cadastram publicamente por um link e entram na rede do mobilizador que as indicou (ou na "Rede Raiz", sem mobilizador).

**Stack:** Next.js 14.2.35 (App Router) + React 18 + TypeScript 5 (strict) + Prisma 7.8 (`adapter-pg`) + Supabase (`@supabase/ssr`, Auth + Storage + Postgres/RLS) + Tailwind 3.4 + Vitest. Deploy: Docker no EasyPanel (VPS Hostinger).

---

## O que foi implementado (ordem cronológica)

### 1. Fase 1 — Fundação (24–25/06)
Multi-tenancy (`gabineteId` em toda tabela), autenticação (admin por e-mail/senha ou Google OAuth; mobilizador por magic link; super-admin em login separado), RLS no Postgres, cadastro público, rede de mobilização via link de indicação, painel admin (pessoas, segmentos, regiões, profissões, personalização visual), dashboard v1.

Essa fase passou por **~15 rodadas de revisão adversarial do spec** antes de qualquer linha de código — origem da maioria das decisões de segurança descritas abaixo.

### 2. Foto de perfil (26–27/06)
Upload, lightbox e remoção de foto da pessoa via Supabase Storage.

### 3. Módulo de Demandas (27/06)
Sistema de tickets: solicitante/responsável/área/prazo/status (`aberta → expirada → atendida/nao_atendida`), expiração automática via cron + e-mail de alerta (Resend), CRUD completo no admin e visão restrita no mobilizador.

### 4. Edição/soft-delete de mobilizador (28/06)
Promoção/despromoção de mobilizador, soft-delete e restauração de pessoa, troca de senha.

### 5. Ordenação e navegação em cascata na rede (28/06)
Colunas ordenáveis, drill-down `?rede=id&path=ids` com breadcrumb pela árvore de indicações.

### 6. Banco de Talentos — **apenas Fase 1** (28/06 spec, 07/07 plano)
O spec descreve um módulo completo (dashboard, filtros, listagem, seleção múltipla, exportação em ZIP de currículos, encaminhamento para Demanda, notificação por e-mail). **Só a Fase 1 foi construída**: modelo de dados (`AreaColocacao`, `BancoTalentos`, `BancoTalentosArea`), gestão de áreas em Configurações, e um modal de cadastro/atualização (`BancoTalentosDialog`) na ficha da pessoa. Não existe dashboard, listagem, filtros, exportação nem encaminhamento — confirmado ausência do modelo `Encaminhamento` no schema atual.

### 7. Redesign da tela Usuários/Perfil (07/07)
Novo design system do admin: `Sidebar`, `Topbar`, `Avatar`, `Modal`, `Pagination`, `CollapsibleSection`, `SegmentPills`, `VerMaisList`, `UsuariosTable`. Shell preto, tema dinâmico por gabinete, fonte Ubuntu Condensed. **Esse design system foi reaproveitado por todas as features seguintes.**

### 8. Edição/exclusão de demanda — admin (08/07)
Alternância visualização/edição na ficha de demanda, transição de status livre (antes só a partir de aberta/expirada), soft-delete de demanda.

### 9. Redesign da área do mobilizador (09/07)
Home vira a listagem da rede (reaproveitando `UsuariosTable` em modo somente-leitura). "Demandas" e "Perfil" viram itens de menu próprios (antes eram cards na home). Rota `/mobilizador/rede` removida — lógica migrada para `/mobilizador/page.tsx`.

### 10. Link de Cadastro (09/07, iterado nesta sessão)
- Mobilizador ganha **um link fixo pessoal** (`?m=token`), independente de segmento.
- Admin ganha tela de composição: múltiplos segmentos + rede de um mobilizador específico (ou nenhum = "Rede Raiz").
- Nova rota pública `/[slug]/cadastro/link` (aceita `?segmentos=a,b` e/ou `?m=token`).
- Filtro "Ver Rede Raiz" na listagem de Usuários.
- QR code para download (PNG opaco + PNG transparente — JPG real não é suportado pela lib `qrcode` no servidor).
- Botão "Copiar link" (estilo "+ Mobilizador").
- Upload de foto na ficha pública de cadastro: arquivo (botão customizado, sem chrome nativo do navegador) ou captura ao vivo pela webcam (`getUserMedia`, para desktop sem picker nativo de câmera).

> ⚠️ **O spec deste módulo está desatualizado**: `docs/superpowers/specs/2026-07-09-link-de-cadastro-design.md` ainda descreve o design original (card por segmento para o mobilizador), que foi abandonado em favor do link fixo após teste real revelar que um gabinete sem nenhum `Segmento` quebrava o design original. O spec não foi corrigido para refletir o que foi de fato construído.

---

## Decisões técnicas importantes e por quê

- **Multi-tenancy por `gabineteId`** em toda tabela de dado de tenant, sempre filtrado a partir da sessão (nunca de parâmetro de URL) — defesa em profundidade junto com RLS no banco.
- **RLS + função `auth.uid_gabinete()`** (`SECURITY DEFINER`, `SET search_path=''` para evitar injeção via search_path) resolve o gabinete do usuário autenticado a partir de `UsuarioGabinete`. Super-admin contorna RLS via service-role key, nunca por essa função.
- **Modelo de auth diferenciado por papel**: admin por e-mail/senha ou Google (`app_metadata.gabineteId` — não `user_metadata`, que o próprio usuário pode editar); mobilizador só por magic link; super-admin em `/super-admin/login` separado, identificado por `app_metadata.role==='super-admin'`.
- **Soft delete** em toda entidade de tenant com unicidade recriável (Regiao, Profissao, Segmento, Pessoa, VinculoRede, Demanda, ObservacaoPessoa). Como Prisma não suporta índice único parcial, a unicidade-enquanto-ativo é garantida por **índice único parcial via SQL bruto** (`WHERE ativa=true` / `status='ativo'` / `deletedAt IS NULL`), não por `@@unique` no schema.
- **Mitigação de open-redirect** (endurecida em 3 rodadas na feature Link de Cadastro): resolver a URL não confiável via `new URL(valor, origemFixa)`, comparar `.origin`, E rejeitar qualquer `.pathname` resolvido que comece com `//` (bypass via URL protocol-relative). Função `caminhoRelativoSeguro` em `src/actions/public/submeter-cadastro.ts`.
- **Upload de imagem**: compressão client-side (`src/lib/comprimir-imagem.ts`, canvas, máx. 1280px + JPEG 0.8, pula se <300KB) antes do envio; validação server-side por allowlist de MIME (jpeg/png/webp/gif — SVG explicitamente rejeitado, vetor de XSS armazenado) e limite de 5MB; caminho de storage `{gabineteId}/pessoas/{pessoaId}/{asset}.{ext}` no bucket `gabinete-assets`, `upsert:true`, cache-busting via `?v=timestamp`.
- **QR code**: lib `qrcode`, `toDataURL()` server-side — só PNG/SVG/texto funcionam de verdade no servidor (`type:'image/jpeg'` cai silenciosamente para PNG); PNG transparente via hex de 8 dígitos com alpha (`#ffffff00`).
- **Deploy manual obrigatório**: EasyPanel com `autoDeploy:false` — todo `git push` precisa ser seguido de um curl no webhook de deploy. Dois remotes: `origin` (`rede-mobiliza`, canônico) e `easypanel` (`redemobiliza`, espelho que o EasyPanel observa).
- **Tema dinâmico por gabinete** (`corPrimaria`/`corTextoContraste()`) aplicado em quase toda a UI — **exceção conhecida**: a tela pública `/cadastro/*` ainda usa `bg-blue-600` fixo, nunca recebeu a cor do gabinete.

---

## Modelo de dados (18 modelos Prisma)

`Gabinete` (tenant) · `UsuarioGabinete` (usuário auth ↔ gabinete ↔ papel) · `LinkComposto` (links compostos gerados pelo admin) · `Regiao` · `Profissao` · `Pessoa` (entidade central — dados de contato/endereço, `isColaborador`, `isMobilizador`, `tokenMobilizador`, `fotoUrl`, soft-delete) · `Segmento` · `PessoaSegmento` (join) · `VinculoRede` (aresta do grafo de indicação; `indicadoPorId` nulo = rede raiz) · `LogSuporte` (auditoria do modo suporte do super-admin) · `ObservacaoPessoa` · `AreaDemanda` · `Demanda` · `MovimentacaoDemanda` (trilha de auditoria) · `ConfiguracaoSistema` (SLA de demandas por gabinete) · `AreaColocacao` · `BancoTalentos` · `BancoTalentosArea` (join).

---

## Bugs reais encontrados e corrigidos (código já implementado, não rodadas de spec)

| Commit | O quê |
|---|---|
| `77060d1` | `getSession()` → `getUser()` no middleware (best practice de segurança do Supabase SSR) |
| `a6ad63c` | Removido bypass de auth via header `x-pathname` (spoofável) |
| `7c07590` | Open-redirect no redirect de atualização de senha |
| `15924cf` | Rejeitar upload de SVG + allowlist de MIME (XSS armazenado) |
| IDOR (rede/whatsapp) | Parâmetro `?rede` e fallback de whatsapp nulo permitiam acesso cross-tenant |
| `1e54ea5`/`c3c4393` | Demandas com soft-delete (`deletedAt`) vazando em listagens/agregados/cron |
| `16e862c` | Tailwind não escaneava `src/lib` — selos de status de demanda invisíveis em produção |
| `8e08818` | `promoverMobilizador` não gerava `tokenMobilizador` → 404 no login do mobilizador |
| `d705184`/`131d5ee` | Promoção de mobilizador reaproveitava conta órfã do Supabase Auth (e inicialmente reaproveitava a senha — corrigido no mesmo dia) |
| `c7c813b` | Paginação quebrava depois da página 7 (joins mortos de demanda) |
| `5e304f3` (esta sessão) | Link do mobilizador redesenhado pra link fixo após gabinete real sem nenhum Segmento quebrar o design original |
| `4746de7` (esta sessão) | Botão nativo de input de arquivo com aparência inconsistente — substituído por `<label>` totalmente estilizado |

---

## Pendências / próximos passos conhecidos

1. **Bug pré-existente, sinalizado e não corrigido** (flagrado por um revisor durante o plano de Link de Cadastro, fora do escopo daquela feature): em `src/actions/public/submeter-cadastro.ts`, `handleConfirmar` (`CadastroForm.tsx`) envia `nome: ''`, mas `submeterCadastro` valida `!nome.trim()` **antes** de checar se a pessoa já existe — então o fluxo "já cadastrado, só confirmar presença" sempre retorna erro "Nome é obrigatório". Confirmado ainda presente no código atual.
2. **Banco de Talentos incompleto**: falta dashboard, tela de listagem/filtros, seleção múltipla + exportação em ZIP de currículos, e o fluxo de encaminhamento para Demanda — tudo especificado em `docs/superpowers/specs/2026-06-28-banco-de-talentos-design.md` mas nunca implementado.
3. **Spec de Link de Cadastro desatualizado** — precisa ser corrigido para refletir o design de link fixo (ver seção 10 acima).
4. **Domínio de e-mail do Resend nunca configurado**: o spec do módulo de Demandas já listava isso como pendência em 27/06 ("configurar domínio de envio no Resend (DNS)", "definir endereço de remetente"). Variável de produção atual (`REMETENTE_EMAIL=onboarding@resend.dev`, conforme memória do projeto) sugere que ainda está no domínio sandbox do Resend, que restringe destinatários.
5. **"Dados Gerais"**: usuário mencionou (conversa, não spec) querer um dashboard como nova tela inicial do sistema, com o botão "Usuários" ficando só com a listagem atual — não especificado nem planejado ainda.
6. **README.md é o stub padrão do `create-next-app`** (36 linhas, texto genérico), não versionado no git, sem nenhuma documentação real do projeto.
7. **Tema dinâmico do gabinete não chega na tela pública `/cadastro/*`** — ainda usa azul fixo (`bg-blue-600`), diferente do resto do sistema.

---

## Problemas conhecidos em aberto (ambiente, não código)

- **Worktrees compartilham o mesmo banco Supabase** e cada `.env.local` copiado trava `NEXT_PUBLIC_APP_URL` na porta de quando foi copiado — testar cruzado entre worktrees serve código antigo na porta errada (gera 404 enganoso). Não é bug de produção, só armadilha de dev local.
- **`next lint`/`eslint` não roda dentro de worktrees aninhados** (conflito de plugin `@next/next` entre o `node_modules` do worktree e o do checkout principal) — usar `tsc --noEmit` como rede de segurança nesse cenário.
- **Testes de e-mail falham localmente** (`src/lib/__tests__/email.test.ts`, 2 de 54) por falta de `RESEND_API_KEY` no `.env.local` local — pré-existente, não é regressão de nenhuma feature.

---

## Deploy

- Produção: `https://rede-mobiliza-app.azl4mh.easypanel.host/`
- Fluxo: `git push origin main` (canônico) + `git push easypanel main` (o que o EasyPanel observa) → `curl http://187.77.34.212:3000/api/deploy/<token>` para disparar o build manualmente (autoDeploy está desligado) → confirmar `commit.sha` via API tRPC do EasyPanel.
- Credenciais e detalhes completos: memória do projeto (`project_deploy.md`), não reproduzidos aqui por serem segredos.
