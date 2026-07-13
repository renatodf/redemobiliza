# HANDOFF — Rede Mobiliza

> Documento de transição gerado em 2026-07-10, a partir do histórico completo do projeto (245 commits) e dos specs/plans em `docs/superpowers/`. Atualizado em 2026-07-11 com o trabalho da sessão seguinte (Central de Filtros — aba Pessoas e exportação assíncrona, seção 11 abaixo). Atualizado novamente em 2026-07-12 com as abas Demandas e Banco de Talentos da Central de Filtros e o Dashboard "Dados Gerais" (seções 12-14 abaixo). HEAD no momento da última atualização: `83d0341` (branch `main`, deployado em produção).

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

### 12. Central de Filtros — aba Demandas (12/07)

Segunda aba da Central de Filtros (seção 11), seguindo o mesmo spec. Rotas `/[slug]/admin/filtros/demandas` e `/[slug]/mobilizador/filtros/demandas`, compartilhando `DemandasFiltro.tsx`. Filtros combináveis por status/área/prazo/datas; exportação **síncrona** (sem fila/e-mail, diferente da aba Pessoas) via PDF (`gerarPdfDemandas`) ou Excel (`gerarExcelDemandas`) em `src/lib/filtros-demandas.ts` (`buildWhereDemandas`). Escopo de segurança: admin vê o gabinete inteiro, mobilizador vê só as demandas em que é `responsavelId` — confirmado ponta a ponta (tela + exportação) contra dados reais de produção. Bug fix aplicado durante a revisão: `Number(searchParams.page)` virando `NaN` com input inválido (mesmo padrão pré-existente em `admin/filtros/page.tsx`, corrigido nos dois lugares).

### 13. Central de Filtros — aba Banco de Talentos (12/07)

Terceira e última aba planejada da Central de Filtros — **fecha a Fase 2 do Banco de Talentos** que a seção 6 deixava pendente (dashboard/listagem/filtros/exportação/encaminhamento). Só existe no admin (`/[slug]/admin/filtros/banco-talentos`), não no mobilizador.
- `BancoTalentosFiltro.tsx`: filtro por área de colocação + PCD/prioridade, seleção múltipla via checkbox.
- `POST /api/[slug]/filtros/banco-talentos/exportar`: opcionalmente cria uma `Demanda` por pessoa selecionada (encaminhamento em massa, sequencial, com histórico + e-mail), depois monta um **ZIP de currículos** (`jszip`) e devolve como download. Não existe modelo `Encaminhamento` — o "encaminhamento" é simplesmente a criação direta de `Demanda`s vinculadas ao `AreaColocacao`.
- **Achado Important na revisão final, corrigido no mesmo dia (`f125439`)**: TOCTOU — a rota revalidava o tenant mas não reaplicava `colocado:false`/`curriculoUrl not null` da listagem original, então uma pessoa marcada como colocada (ou já sem registro no Banco de Talentos) depois de selecionada na tela ainda entrava no ZIP e gerava Demanda indevida. Corrigido incluindo esse `where` na revalidação.
- Mesmo commit também sanitiza nome de arquivo no ZIP (path traversal) e sufixa com parte do id (evita colisão de nomes).
- Fix de segurança pós-implementação (`8ae97ec`): SSRF potencial em `fetch(curriculoUrl)` — não explorável hoje (único caminho de escrita é `getPublicUrl` do próprio Storage), mas mitigado com allowlist de origem + `redirect:'error'` como defesa em profundidade.
- Follow-up não bloqueante registrado: sem `$transaction` no loop de criação de Demandas — falha parcial deixa Demandas já criadas sem rollback.

**Com isso, a Central de Filtros (spec de 11/07, seção 11) está completa: as três abas — Pessoas, Demandas, Banco de Talentos — existem e funcionam.**

### 14. Dashboard "Dados Gerais" (12/07)

Atende a pendência 6 da versão anterior deste documento (ideia de conversa, sem spec). Vira a **nova tela inicial** de admin e mobilizador.
- `calcularFaixaEtaria` + `agruparTopEOutros` (`src/lib/dashboard.ts` ou equivalente) — funções puras de agregação, TDD.
- `GraficoPizza.tsx` (`src/components/GraficoPizza.tsx`) reutilizável, com `PALETA_CATEGORICA`/`COR_NEUTRA`/`CORES_STATUS_DEMANDA` — cores de status de demanda cross-verificadas byte-a-byte contra `status-demanda.ts` para nunca divergir visualmente da Central de Filtros.
- **Escolaridade e Religião** viraram filtros novos na aba Pessoas da Central de Filtros como pré-requisito (2 selects em `PessoasFiltro.tsx` + `buildWherePessoas`), gabinete-wide (não escopado por `idsRede` no mobilizador, mesmo padrão de região/profissão/segmento).
- `DashboardConteudo.tsx` (`src/app/[slug]/admin/dashboard/DashboardConteudo.tsx`) é compartilhado entre admin e mobilizador (sem hardcoding de papel) — região + 5 pizzas (sexo, faixa etária, escolaridade, religião, status de demandas do mês).
- **Bug de `deletedAt` corrigido** (herdado — pessoas soft-deletadas entravam nas contagens/agregados do dashboard): confirmado contra dado real (gabinete de teste com 1 pessoa soft-deletada: 40 total vs 39 ativa).
- Mobilizador: `/[slug]/mobilizador/page.tsx` virou redirect; a antiga home (listagem da rede) migrou para `/[slug]/mobilizador/rede/page.tsx`; nova `/[slug]/mobilizador/dashboard/page.tsx` reusa `DashboardConteudo` escopado por `idsRede` (Pessoas) e `responsavelId`+`solicitante` combinados (Demandas). Menu: "Início" agora aponta pra `/rede`, "Dados Gerais" é item novo.
- **Fix pós-revisão (commit `83d0341`, HEAD atual)**: `/mobilizador/demandas` não lia `dataInicio`/`dataFim` — clicar na fatia "Demandas do mês" do dashboard mostrava a contagem certa mas abria a listagem sem limite de data (admin já funcionava). Corrigido com o mesmo padrão de `criadoEm` já usado em `/admin/demandas`. Também trocado `revalidatePath` de `marcar-desfecho-demanda.ts` de `/mobilizador/rede` (sem dado de demanda) pra `/mobilizador/demandas` (recomendação da mesma revisão).
- Follow-up não bloqueante: `assertMobilizadorAccess` não checa `tokenMobilizador` (diferente da página antiga) — pré-existente, fora de escopo.

### 15. Cadastro Completo da Pessoa + Criação de Demanda + aba Cadastros (12/07)

Spec: `docs/superpowers/specs/2026-07-12-cadastro-completo-e-demanda-design.md`. Plano: `docs/superpowers/plans/2026-07-12-cadastro-completo-e-demanda.md` (9 tasks + 1 fix pós-revisão, executado via subagent-driven-development num worktree isolado, merge fast-forward pra `main`).

- **`CamposPessoa.tsx`** (`src/app/[slug]/admin/pessoas/[pessoaId]/CamposPessoa.tsx`): componente extraído do antigo `EditarPessoaForm.tsx` — só os campos, sem `<form>`/botão próprio — cobrindo agora o modelo `Pessoa` inteiro (nascimento, origem, bairro, logradouro, número, complemento, CEP entraram; antes só ficavam de leitura na ficha ou nem existiam em formulário nenhum). Reaproveitado por `EditarPessoaForm` (edição avulsa), pela tela de Nova Demanda e pela nova aba Cadastros.
- **Data de nascimento sempre como texto `DD/MM/AAAA`**, nunca `<input type="date">`, sem máscara de digitação — `src/lib/data-brasileira.ts` (`parseDataBrasileira`/`formatarDataBrasileira`, TDD).
- **`editarPessoa` persiste os campos novos** — mesma regra de permissão de antes (admin edita qualquer pessoa; mobilizador editava só rede direta), **ampliada durante a revisão final pra sub-rede inteira** (`coletarSubRedeIds`), pra bater com o escopo de busca da nova aba Cadastros (ver decisão abaixo).
- **Cadastro público ganhou nascimento** (opcional, mesmo formato DD/MM/AAAA) na etapa "dados" do `CadastroForm.tsx`/`submeterCadastro`.
- **Nova Demanda virou um único formulário**: a ficha completa do solicitante (`CamposPessoa`) e os dados da demanda são salvos juntos, atomicamente, por uma nova action `criarDemandaComCadastro` (`prisma.$transaction([pessoa.updateMany, demanda.create])`) — a action `criarDemanda` original não foi removida mas não é mais usada nesta tela.
- **Nova aba "Cadastros" na Central de Filtros** (admin e mobilizador): busca por nome/WhatsApp + edição inline via `EditarPessoaForm`/`editarPessoa` já existentes — sem action nova, sem exportação, sem cadastro de pessoa nova nessa aba. Mobilizador escopado à sub-rede inteira, com guard IDOR (`idsRede.includes(pessoaIdBusca)`) antes de qualquer query tocar o id não confiável.
- **Decisão pós-revisão final**: a busca da aba Cadastros do mobilizador usa a sub-rede inteira (todos os níveis), mas `editarPessoa` só autorizava edição de rede direta (nível 1) — abria a ficha mas falhava ao salvar. Corrigido ampliando `editarPessoa` pra sub-rede inteira, o que também muda a permissão do mobilizador na ficha normal da pessoa (não só nesta aba nova).
- **Bug pré-existente encontrado no smoke test manual pós-deploy (não introduzido por esta feature)**: o cadastro público nunca completava quando o `<input type="file">` de foto ficava vazio (comum — sem foto é o caso mais frequente) — um `File` vazio embutido no objeto que `submeterCadastro` recebia quebrava a serialização da Server Action do Next ("Only plain objects... Classes or null prototypes are not supported"). **Fix parcial aplicado** (`3310c45`): só incluía `foto` no payload quando um arquivo de verdade foi escolhido — resolvia o caso sem foto. **Upload de foto real no cadastro público foi corrigido em `1493cfc`**, migrando `submeterCadastro` pra receber um `FormData` nativo — ver pendência 10.

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
2. ~~Banco de Talentos incompleto~~ — **concluído em 12/07**: as abas Demandas (seção 12) e Banco de Talentos (seção 13) da Central de Filtros foram construídas. As três abas do spec (`docs/superpowers/specs/2026-07-11-central-de-filtros-design.md`) existem e funcionam.
3. ~~Exportação assíncrona por e-mail (Pessoas, 500+ registros)~~ — **implementada nesta sessão** (plano `docs/superpowers/plans/2026-07-11-central-de-filtros-exportacao-assincrona.md`, 4 tasks + 1 fix pós-revisão, ver `.superpowers/sdd/progress.md`). Decisão tomada durante a implementação: quem recebe o e-mail de exportação é sempre a **conta logada que pediu o download** (`session.user.email`), não uma ficha de `Pessoa` — diferente do padrão de alertas (Demanda hoje, Agenda no futuro), que notificam **todos os vinculados à entidade**. Ver pendência 9 abaixo.
4. ~~Spec de Link de Cadastro desatualizado~~ — **corrigido nesta sessão**: `docs/superpowers/specs/2026-07-09-link-de-cadastro-design.md` agora descreve o link fixo pessoal do mobilizador (não mais cards por segmento), com nota explícita marcando a mudança e o motivo (gabinete sem `Segmento` quebrando o design original).
5. **Domínio de e-mail do Resend nunca configurado**: o spec do módulo de Demandas já listava isso como pendência em 27/06 ("configurar domínio de envio no Resend (DNS)", "definir endereço de remetente"). Variável de produção atual (`REMETENTE_EMAIL=onboarding@resend.dev`, conforme memória do projeto) sugere que ainda está no domínio sandbox do Resend, que restringe destinatários — **agora também bloqueia o e-mail de exportação pronta** da pendência 3 acima, não só os alertas de Demandas. Ver pendência 9: a ideia de e-mail de sistema por gabinete pode ser a solução definitiva pra isso. **Fora do alcance de uma sessão de código** — precisa de ação do usuário no painel do Resend/DNS.
6. ~~"Dados Gerais"~~ — **construído em 12/07** (seção 14): dashboard virou a nova tela inicial de admin e mobilizador, com região + 5 pizzas; "Usuários"/rede ficou só com a listagem, em item de menu próprio.
7. ~~README.md é o stub padrão do `create-next-app`~~ — **corrigido nesta sessão**: README real com visão geral, stack, setup local e tabela de scripts, apontando pro `HANDOFF.md` para o histórico completo.
8. ~~Tema dinâmico do gabinete não chega na tela pública `/cadastro/*`~~ — **corrigido nesta sessão**: `CadastroForm.tsx` (compartilhado por `/cadastro/[segmentoSlug]` e `/cadastro/link`) ganhou prop `corPrimaria`, e os 6 botões que usavam `bg-blue-600` fixo agora usam `style={{ backgroundColor: corPrimaria, color: corTextoContraste(corPrimaria) }}`, mesmo padrão já usado no resto do sistema. Verificado manualmente com um gabinete real (`amigos-do-izalci`, `corPrimaria: #263e0f`) — botão renderiza com a cor certa e contraste de texto correto.
9. **Ideia (conversa, não spec): e-mail de sistema por gabinete**. Cada gabinete teria seu próprio remetente de e-mail ("nome do gabinete"), reaproveitado por todo tipo de aviso do sistema — alertas de Demanda (já existe), alertas de Agenda (**módulo de Agenda ainda nem existe** — mencionado como algo futuro, onde um evento poderá ter várias pessoas vinculadas), e o e-mail de exportação pronta (pendência 3). Não especificado nem planejado ainda; pode ser a solução para a pendência 5 (domínio Resend em sandbox) se o remetente por gabinete vier com domínio verificado próprio. **Requer spec + plano antes de código** (decisão do usuário, 11/07/2026 — feature grande demais pra encaixar numa sessão de "pendências rápidas").
10. ~~Upload de foto no cadastro público continua quebrado~~ (achado em 12/07, durante smoke test manual pós-deploy da seção 15 — bug pré-existente, não introduzido nesta sessão). Qualquer `File` (vazio ou com conteúdo real) embutido no objeto comum que `submeterCadastro` recebia quebrava a serialização da Server Action do Next ("Only plain objects... Classes or null prototypes are not supported"), porque a chamada era manual (`await submeterCadastro({...})`), fora do padrão nativo `<form action={fn}>`. O caso sem foto (mais comum) já tinha sido corrigido (`3310c45` — só incluía `foto` no payload quando um arquivo de verdade foi escolhido). **Corrigido definitivamente em `1493cfc`**: `submeterCadastro` agora recebe um `FormData` nativo como argumento único (igual `uploadFotoPessoa` já fazia), e `CadastroForm.tsx` monta e envia o `FormData` direto do form nativo. Verificado manualmente com upload de foto real (redirecionou pra `/sucesso`, `fotoUrl` populado no banco) e com o fluxo sem foto e o de confirmação de presença — todos sem erro.

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
- **Estado em 12/07/2026**: push + deploy manual executados após o Dashboard "Dados Gerais" (seção 14, `commit.sha` `83d0341`) e novamente após o Cadastro Completo + Nova Demanda + aba Cadastros (seção 15, `commit.sha` `f9f42d8`), ambos confirmados via `projects.listProjectsAndServices`. O fix do bug de foto vazia no cadastro público (`3310c45`, pendência 10) ainda **não foi deployado** — feito localmente, aguardando push/deploy.
