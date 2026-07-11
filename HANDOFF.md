# HANDOFF — Rede Mobiliza

> Documento de transição gerado em 2026-07-10, a partir do histórico completo do projeto (245 commits) e dos specs/plans em `docs/superpowers/`. Atualizado em 2026-07-11 com o trabalho da sessão seguinte (Central de Filtros — aba Pessoas e exportação assíncrona, seção 11 abaixo). HEAD no momento da última atualização: `ced0330` (branch `main`).

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

### 11. Central de Filtros e Exportação — apenas Fase 1: aba Pessoas (11/07)

Spec completo em `docs/superpowers/specs/2026-07-11-central-de-filtros-design.md`: uma tela de filtros/exportação acessível pelo ícone de lupa do Topbar (antes decorativo), com três abas planejadas — **Pessoas**, **Demandas** e **Banco de Talentos** — cada uma com filtros combináveis e exportação própria. **Só a aba Pessoas foi construída até agora**; as abas Demandas e Banco de Talentos aparecem desabilitadas na UI (`FiltrosTabs.tsx`, rótulo "Em breve") e não têm rota nem componente implementados.

O que existe hoje:
- Rotas `/[slug]/admin/filtros` (casca de abas) e `/[slug]/mobilizador/filtros` (só Pessoas, sem casca de abas — mobilizador não tem acesso a Demandas/Banco de Talentos nesta tela).
- `PessoasFiltro.tsx`: filtros combináveis por aniversário (dia/semana/mês, ignora ano), sexo, região, faixa de idade, profissão e segmento (multi-select); botão "Limpar filtro" ao lado de "Filtrar".
- Escopo: admin vê o gabinete inteiro; mobilizador vê apenas a própria sub-rede — **toda a sub-árvore de indicações**, não só indicados diretos. Isso exigiu `coletarSubRedeIds(pessoaId, gabineteId)` em `src/lib/rede.ts`, uma **CTE recursiva em SQL bruto** (`prisma.$queryRaw`, já que Prisma não suporta consulta recursiva nativa) com proteção contra ciclo (`d5501c3`).
- Exportação síncrona em `GET /api/[slug]/filtros/pessoas/exportar`: gera PDF (`pdf-lib`, não `pdfkit` como o spec original menciona — decisão tomada na implementação) ou Excel (`exceljs`) com nome/WhatsApp/e-mail/região/profissão/segmentos/nascimento, e devolve como download direto.
- Funções puras de aniversário/idade em `src/lib/aniversario.ts`; where-builder + filtro pós-consulta (para os campos que não dá pra expressar em `where` do Prisma, ex. faixa etária calculada) em `src/lib/filtros-pessoas.ts`.

**Exportação assíncrona por e-mail para 500+ pessoas — implementada nesta sessão**, seguindo o plano em `docs/superpowers/plans/2026-07-11-central-de-filtros-exportacao-assincrona.md`: `LIMITE_EXPORT_SINCRONO = 500` (`src/lib/filtros-pessoas.ts`), aviso na UI quando `totalFiltrado >= 500`, botão "Limpar filtro"; acima do limite a rota responde na hora com página de confirmação e gera o arquivo em segundo plano (fire-and-forget — seguro porque o processo Node do Docker é persistente), sobe pro bucket `gabinete-assets` com link assinado de 48h (`uploadExportacaoESaerAssinada`, `src/lib/upload-exportacao.ts`) e envia por e-mail (`templateExportacaoPronta`, `src/lib/email.ts`). Destinatário é sempre `session.user.email` de quem pediu (fix pós-revisão — ver pendência 3).

**Ainda não implementado (spec já escrito, aguardando):**
- Abas Demandas e Banco de Talentos (filtros, exportação PDF/Excel de Demandas; exportação em ZIP de currículos + fluxo de encaminhamento em massa para Demanda no Banco de Talentos).

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
- **Sub-rede completa via CTE recursiva**: como Prisma não suporta consulta recursiva nativa, `coletarSubRedeIds` (`src/lib/rede.ts`) usa `prisma.$queryRaw` para percorrer `VinculoRede.indicadoPorId` recursivamente, com proteção explícita contra ciclo — reaproveitável por qualquer tela futura que precise da árvore de indicação completa de um mobilizador, não só um nível.
- **Exportação em lote usa link assinado, não público**: diferente do padrão de upload de foto/currículo individual (URL pública fixa), arquivos de exportação em massa (potencialmente centenas de registros com dado pessoal de uma vez) usam `createSignedUrl` com expiração — ver seção 11 e pendência 3.

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
| `5e304f3` | Link do mobilizador redesenhado pra link fixo após gabinete real sem nenhum Segmento quebrar o design original |
| `4746de7` | Botão nativo de input de arquivo com aparência inconsistente — substituído por `<label>` totalmente estilizado |
| `31df5a4` | Confirmação de presença de pessoa já cadastrada exigia `nome` incorretamente antes de checar se a pessoa já existia (ver pendência 1 da versão anterior deste documento — corrigido) |
| `f278147`/`ff2347a` | Incompatibilidade de tipo Buffer/exceljs no teste de exportação, e `as any` (bloqueado pelo ESLint `no-explicit-any`) trocado por `Uint8Array` — build Docker estava quebrando por isso |

---

## Pendências / próximos passos conhecidos

1. ~~Bug de confirmação de presença exigindo nome~~ — **corrigido em `31df5a4`** (11/07).
2. **Banco de Talentos incompleto — agora reenquadrado como parte da Central de Filtros**: a aba "Banco de Talentos" da Central de Filtros (seção 11 acima) assume o papel do dashboard/listagem que o spec original de 28/06 previa. Nem essa aba nem a aba Demandas foram construídas ainda — só filtro/exportação de Pessoas existe. Ver `docs/superpowers/specs/2026-07-11-central-de-filtros-design.md` para o desenho completo pendente (filtros de Demandas; filtros + ZIP de currículos + encaminhamento em massa de Banco de Talentos).
3. ~~Exportação assíncrona por e-mail (Pessoas, 500+ registros)~~ — **implementada nesta sessão** (plano `docs/superpowers/plans/2026-07-11-central-de-filtros-exportacao-assincrona.md`, 4 tasks + 1 fix pós-revisão, ver `.superpowers/sdd/progress.md`). Decisão tomada durante a implementação: quem recebe o e-mail de exportação é sempre a **conta logada que pediu o download** (`session.user.email`), não uma ficha de `Pessoa` — diferente do padrão de alertas (Demanda hoje, Agenda no futuro), que notificam **todos os vinculados à entidade**. Ver pendência 9 abaixo.
4. **Spec de Link de Cadastro desatualizado** — precisa ser corrigido para refletir o design de link fixo (ver seção 10 acima).
5. **Domínio de e-mail do Resend nunca configurado**: o spec do módulo de Demandas já listava isso como pendência em 27/06 ("configurar domínio de envio no Resend (DNS)", "definir endereço de remetente"). Variável de produção atual (`REMETENTE_EMAIL=onboarding@resend.dev`, conforme memória do projeto) sugere que ainda está no domínio sandbox do Resend, que restringe destinatários — **agora também bloqueia o e-mail de exportação pronta** da pendência 3 acima, não só os alertas de Demandas. Ver pendência 9: a ideia de e-mail de sistema por gabinete pode ser a solução definitiva pra isso.
6. **"Dados Gerais"**: usuário mencionou (conversa, não spec) querer um dashboard como nova tela inicial do sistema, com o botão "Usuários" ficando só com a listagem atual — não especificado nem planejado ainda.
7. **README.md é o stub padrão do `create-next-app`** (36 linhas, texto genérico), não versionado no git, sem nenhuma documentação real do projeto.
8. **Tema dinâmico do gabinete não chega na tela pública `/cadastro/*`** — ainda usa azul fixo (`bg-blue-600`), diferente do resto do sistema.
9. **Ideia (conversa, não spec): e-mail de sistema por gabinete**. Cada gabinete teria seu próprio remetente de e-mail ("nome do gabinete"), reaproveitado por todo tipo de aviso do sistema — alertas de Demanda (já existe), alertas de Agenda (**módulo de Agenda ainda nem existe** — mencionado como algo futuro, onde um evento poderá ter várias pessoas vinculadas), e o e-mail de exportação pronta (pendência 3). Não especificado nem planejado ainda; pode ser a solução para a pendência 5 (domínio Resend em sandbox) se o remetente por gabinete vier com domínio verificado próprio.

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
