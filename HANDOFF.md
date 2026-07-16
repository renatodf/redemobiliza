# HANDOFF — Rede Mobiliza

> Documento de transição gerado em 2026-07-10, a partir do histórico completo do projeto (245 commits) e dos specs/plans em `docs/superpowers/`. Atualizado em 2026-07-11 com o trabalho da sessão seguinte (Central de Filtros — aba Pessoas e exportação assíncrona, seção 11 abaixo). Atualizado novamente em 2026-07-12 com as abas Demandas e Banco de Talentos da Central de Filtros e o Dashboard "Dados Gerais" (seções 12-14 abaixo). Atualizado novamente em 2026-07-15 com staging/produção separados, a substituição do mapa do Dashboard por um mapa real com geocodificação, e o botão "Visualizar Dados Gerais" nas abas Pessoas e Demandas da Central de Filtros (seções 16-20 abaixo). Atualizado novamente em 2026-07-16 com a ordenação alfabética + ocultação do formulário de filtros na listagem de Demandas (seção 21 abaixo). HEAD no momento desta atualização: `ee61995` (branch `main`).

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
- ~~Follow-up não bloqueante registrado: sem `$transaction` no loop de criação de Demandas~~ — **corrigido em `eee7ebd` (13/07)**: loop agora roda em `prisma.$transaction` em lote; e-mails continuam sendo enviados depois do commit, fora da transação.

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
- ~~Follow-up não bloqueante: `assertMobilizadorAccess` não checa `tokenMobilizador`~~ — **corrigido em `eee7ebd` (13/07)**: agora exige `tokenMobilizador` não-nulo, igual à página antiga. Efeito colateral pego na mesma correção: `scripts/vincular-mobilizador.ts` promovia mobilizador sem gerar token — corrigido para gerar `tokenMobilizador`, igual a `promover-mobilizador.ts`.

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

### 16. Staging e Produção Separados no EasyPanel (13/07)

Spec: `docs/superpowers/specs/2026-07-13-staging-producao-easypanel-design.md`. Plano: `docs/superpowers/plans/2026-07-13-staging-producao-easypanel.md` (8 tasks).

- Branch `develop` criada a partir de `main`; projeto Supabase separado `rede-mobiliza-staging` (sa-east-1); DNS `staging.redemobiliza.com.br` apontando pra mesma VPS; serviço `app-staging` no EasyPanel (porta 8081, `autoDeploy:false`, fonte no repo canônico, branch `develop`).
- `.env.staging`/`.env.production` locais (gitignored, nunca versionados); GitHub Actions (`.github/workflows/deploy-staging.yml`) roda testes + typecheck + dispara deploy automático de staging a cada push em `develop` — staging é o único ambiente com deploy automático, produção continua manual.
- `deploy-prod.sh`: script que promove `develop` → `main` e dispara o deploy de produção, lendo o token de deploy de `~/.config/rede-mobiliza-deploy/` (fora do repo, nunca hardcoded — revisão de segurança automática flagou uma primeira versão que hardcodava o token, corrigido antes de qualquer push).
- **Incidente de segurança na mesma sessão**: o plano de implementação (`docs/superpowers/plans/2026-07-13-staging-producao-easypanel.md`, commit `22491a9`, fase de brainstorming/planning) continha `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` reais de produção em texto puro, como "exemplo" de valor no passo do `.env.production`. O GitHub Push Protection bloqueou o push pro mirror `easypanel`, mas o remote `origin` já tinha aceitado o commit sem bloqueio antes — as duas chaves ficaram expostas de verdade no histórico do repo canônico por um período desta sessão. **Remediação aplicada**: (1) ambas as chaves rotacionadas antes de qualquer outra coisa (Resend via API, Supabase via painel); (2) histórico reescrito com `git filter-repo --replace-text` numa cópia `--mirror` temporária, redigindo as duas strings em todos os ~329 commits; (3) force-push de `main` e `develop` reescritos pros dois remotes; (4) working dir local resetado (`git reset --hard`) pra bater com o histórico novo. **Lição registrada em memória do projeto**: nunca colar valor real de segredo em documento de spec/plano, mesmo como "exemplo" — sempre usar placeholder, mesmo quando o valor real já é conhecido no momento da escrita.

### 17. Mapa de Regiões do DF no Dashboard (13/07) — substituído em 14/07, ver seção 18

Spec: `docs/superpowers/specs/2026-07-13-mapa-regioes-dashboard-design.md`. Plano: `docs/superpowers/plans/2026-07-13-mapa-regioes-dashboard.md` (5 tasks).

- Primeira versão do mapa de "Pessoas por região" no Dashboard: `MapaRegioesDF.tsx`, um SVG com pan/zoom (arraste, roda do mouse, pinça) e balões proporcionais por região, com posições/tamanhos calculados em `regioes-df-mapa.ts` sobre um contorno geográfico real do DF (dados do IBGE).
- `GraficoPizza.tsx` ganhou fatias clicáveis via `<path>`/`<circle>` SVG (antes só a legenda era clicável) — essa parte **permanece** no código atual, não foi substituída.
- Aliases de nome combinado (ex. "Sudoeste/Octogonal", "SCIA/Estrutural") precisaram ser adicionados depois de testar contra as 35 regiões reais de um gabinete de produção — 2 não bateram de primeira com o nome esperado pelo mapa.
- **Essa abordagem inteira (mapa com posições fixas específicas do DF) foi substituída no dia seguinte** pela seção 18 abaixo, que usa coordenadas geográficas reais de cada `Regiao` em vez de posições fixas — `MapaRegioesDF.tsx`/`regioes-df-mapa.ts` não existem mais no código atual, removidos na mesma leva de commits que introduziu o mapa real.

### 18. Mapa real de pessoas cadastradas — geocodificação por Região (14/07)

Spec: `docs/superpowers/specs/2026-07-14-mapa-cadastros-real-design.md` (+ nota de Fase 2 sobre drill-down por CEP, registrada no spec mas **ainda não implementada**). Plano: `docs/superpowers/plans/2026-07-14-mapa-cadastros-real.md`.

- `Regiao` ganha `uf`, `latitude`, `longitude` (migration) + lista estática dos 27 estados brasileiros pra popular o select de UF.
- **Geocodificação via Nominatim (OpenStreetMap)**, disparada automaticamente ao criar/editar uma `Regiao` (`criarRegiao` agora exige UF; `editarRegiao` só re-geocodifica quando nome ou UF mudam — evita chamada desnecessária à API externa). Rota órfã `/admin/regioes` removida no mesmo commit.
- `mapa-pessoas.ts` substitui `regioes-df-mapa.ts` — sem mais contornos fixos do DF, o mapa passa a funcionar pra **qualquer** UF/região do Brasil, não só o Distrito Federal.
- `MapaCadastros.tsx` (Leaflet + tiles do OpenStreetMap) substitui `MapaRegioesDF.tsx` no Dashboard — pinos reais sobre um mapa mundial de verdade, não mais posições calculadas manualmente. Pinos/pontos memoizados pra não resetar o viewport (zoom/posição de pan) a cada re-render do Dashboard.
- Tela de Cidades (Configurações) ganha campo UF, indicador visual de "já geocodificada" e edição de região existente.

### 19. Visualizar Dados Gerais a partir de um filtro — aba Pessoas (14/07)

Spec: `docs/superpowers/specs/2026-07-14-visualizar-dados-gerais-design.md`. Plano: `docs/superpowers/plans/2026-07-14-visualizar-dados-gerais.md` (9 tasks, subagent-driven-development em worktree isolado, merge fast-forward pra `main`). **Deployado em produção** — `commit.sha` `ae6fc25` confirmado via API do EasyPanel (`projects.listProjectsAndServices`).

- Sempre que um filtro de Pessoas está ativo (Central de Filtros ou visão de rede de um mobilizador específico na tela de Usuários), um botão **"Visualizar Dados Gerais"** leva ao Dashboard já filtrado pelo mesmo recorte.
- `src/lib/filtros-ativos.ts` (`CAMPOS_FILTRO_PESSOAS`, `temFiltroAtivo`) é a fonte única de verdade de "o que conta como filtro ativo" (região, sexo, profissão, segmento, escolaridade, religião, `redeDeId` — `periodo` e idade/aniversário não contam, decisão do usuário, já que idade/aniversário não são aplicados de verdade nos números agregados hoje).
- Novo parâmetro **`redeDeId`**: escopa o Dashboard pela sub-rede completa e recursiva de um mobilizador específico (reaproveita `coletarSubRedeIds`, já existente desde a Central de Filtros), ou pela "Rede Raiz" (`redeDeId=raiz`) — só faz sentido no lado admin, mobilizador já vê só a própria rede.
- Dashboard ganha badges removíveis por filtro ativo + "Limpar tudo"; corrige de quebra um bug pré-existente onde `profissaoId` era ignorado pelos números agregados do Dashboard (só existia na Central de Filtros).
- Verificado manualmente contra gabinete real (`amigos-do-izalci`): botão aparece/some corretamente, badges com nomes resolvidos (não id cru), combinação de filtros, remoção individual de badge, "Limpar tudo" preservando `periodo`, clique em fatia de pizza a partir de dashboard filtrado por rede combinando os dois filtros na Central de Filtros.

### 20. Central de Filtros — aba Demandas: filtro de período + Visualizar Dados Gerais (14–15/07)

Spec: `docs/superpowers/specs/2026-07-14-demandas-periodo-e-dashboard-design.md`. Plano: `docs/superpowers/plans/2026-07-14-demandas-periodo-e-dashboard.md` (9 tasks + verificação final, subagent-driven-development em worktree isolado).

- Extensão direta da seção 19 (que só cobriu a aba Pessoas): a aba Demandas da Central de Filtros ganha **filtro de período** (`dataInicio`/`dataFim`, filtra pela data de **criação** da demanda — decisão do usuário, já que não existe campo consultável de "data de atendimento" no schema hoje, só no histórico `MovimentacaoDemanda`) e um botão **"Visualizar Dados Gerais"** que, diferente do da aba Pessoas, **aparece sempre**, mesmo sem nenhum filtro ativo (com nenhum filtro, a população vira "todo mundo que já fez alguma demanda").
- Mecanismo diferente do `redeDeId`: em vez de resolver uma lista de ids numa consulta separada, usa um **filtro relacional do Prisma** — `pessoa.demandasSolicitadas.some({ areaId, status, criadoEm, ... })` — reaproveitando `buildWhereDemandas` (já existente) aninhado dentro de `buildWherePessoas` (novo 4º parâmetro opcional `filtroDemandas`). Uma única consulta, sem round-trip extra.
- Novo flag de URL `filtroDemandas=1` + badges dedicadas (Área, Status, Período — com label dinâmico "Todos os solicitantes"/"Solicitantes filtrados" dependendo se há sub-filtro); tipo `FiltroExibivel` do Dashboard generalizado com `camposLimpar?: string[]` pra suportar badges que limpam mais de um parâmetro de URL de uma vez (ex: badge de Período limpa `dataInicio` e `dataFim` juntos).
- Escopo de segurança do mobilizador: `pessoa.id` entra como `responsavelId` tanto na rota de exportação (já existia) quanto no novo caminho do Dashboard — confirmado presente nos dois pontos em revisão de código dedicada, ponto mais crítico desta feature (sem isso, mobilizador veria demandas de outros responsáveis).
- Verificado manualmente contra gabinete real: botão sempre visível mesmo sem filtro, badges corretas com nomes resolvidos, `Total pessoas=6` pra 7 demandas confirma que o filtro relacional `some` não duplica pessoas com múltiplas demandas batendo o filtro.

### 21. Listagem de Demandas — ordenação alfabética + ocultar formulário de filtros (15–16/07)

Spec: `docs/superpowers/specs/2026-07-15-demandas-listagem-sort-e-filtros-design.md`. Plano: `docs/superpowers/plans/2026-07-15-demandas-listagem-sort-e-filtros.md` (3 tasks, executado sem worktree — direto em `main`).

- `/admin/demandas` ganha ordenação clicável em Solicitante/Área/Status (mesmo `SortableHeader` já usado em Responsável/Prazo, sem alterá-lo), estendendo `buildOrderBy`. "Status" ordena pelo valor bruto do campo (`aberta`/`atendida`/`expirada`/`nao_atendida`), não por gravidade.
- O formulário de filtros visível (status/área/responsável/região/prazo alterado/datas) foi **ocultado, não apagado**: o bloco inteiro virou um único comentário JSX, trivialmente reversível. A lógica de dados (`where`/`temFiltro`, período padrão de 30 dias) continua ativa e respondendo aos mesmos parâmetros de URL — os links de "Demandas do mês" do Dashboard continuam funcionando.
- Dois fixes pós-implementação: acentuação do texto comentado tinha sido corrompida na primeira tentativa (`b3a962e`); build Docker quebrava por `no-unused-vars` nas variáveis que só alimentam o formulário agora comentado, suprimido com eslint-disable justificado (`ee61995`).
- Verificado manualmente contra gabinete real (`amigos-do-izalci`, login via magic link admin gerado com a service-role key): formulário ausente da tela, as 3 colunas ordenam corretamente, link de status+período do Dashboard ainda filtra certo (1 resultado, batendo com o widget). Sem erros no console.
- **Achado incidental (dado de teste legado, não é bug desta feature)**: duas demandas do gabinete de teste têm status bruto `resolvida`/`em_andamento` — fora do enum atual (`aberta`/`expirada`/`atendida`/`nao_atendida`) — aparecem na listagem sem o badge colorido/label amigável, só o texto cru. Ver pendência 11 abaixo.

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
- **Geocodificação de `Regiao` via Nominatim (OpenStreetMap)**, disparada automaticamente ao criar/editar (não um botão manual) — só re-geocodifica quando nome ou UF mudam, pra não bater a API externa à toa. Ver seção 18.
- **Escopar o Dashboard por uma população "derivada" (rede de um mobilizador ou solicitantes de demandas filtradas) sempre reaproveita a query já existente que produz esse recorte** (`coletarSubRedeIds` pra rede, `buildWhereDemandas` pra demandas) em vez de duplicar lógica — no caso de demandas, isso vira um filtro relacional do Prisma (`pessoa.demandasSolicitadas.some({...})`) aninhado dentro de `buildWherePessoas`, não uma segunda consulta com lista de ids. Ver seções 19-20.

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
11. **Dado de teste legado com status fora do enum**: no gabinete `amigos-do-izalci` (achado em 16/07, durante verificação manual da seção 21), duas demandas têm `status` gravado como `resolvida`/`em_andamento` — valores que não existem no enum atual (`aberta`/`expirada`/`atendida`/`nao_atendida`). A listagem exibe o texto cru em vez do badge colorido/label amigável, porque o mapeamento de label não cobre esses valores. Provavelmente dado de teste de uma fase anterior do enum (antes de convergir pros 4 status atuais) — não é regressão de nenhuma feature recente. Não bloqueante, mas vale limpar o dado ou decidir um fallback de exibição se aparecer de novo em produção real.

10. ~~Upload de foto no cadastro público continua quebrado~~ (achado em 12/07, durante smoke test manual pós-deploy da seção 15 — bug pré-existente, não introduzido nesta sessão). Qualquer `File` (vazio ou com conteúdo real) embutido no objeto comum que `submeterCadastro` recebia quebrava a serialização da Server Action do Next ("Only plain objects... Classes or null prototypes are not supported"), porque a chamada era manual (`await submeterCadastro({...})`), fora do padrão nativo `<form action={fn}>`. O caso sem foto (mais comum) já tinha sido corrigido (`3310c45` — só incluía `foto` no payload quando um arquivo de verdade foi escolhido). **Corrigido definitivamente em `1493cfc`**: `submeterCadastro` agora recebe um `FormData` nativo como argumento único (igual `uploadFotoPessoa` já fazia), e `CadastroForm.tsx` monta e envia o `FormData` direto do form nativo. Verificado manualmente com upload de foto real (redirecionou pra `/sucesso`, `fotoUrl` populado no banco) e com o fluxo sem foto e o de confirmação de presença — todos sem erro.

---

## Problemas conhecidos em aberto (ambiente, não código)

- **Worktrees compartilham o mesmo banco Supabase** e cada `.env.local` copiado trava `NEXT_PUBLIC_APP_URL` na porta de quando foi copiado — testar cruzado entre worktrees serve código antigo na porta errada (gera 404 enganoso). Não é bug de produção, só armadilha de dev local.
- **`next lint`/`eslint` não roda dentro de worktrees aninhados** (conflito de plugin `@next/next` entre o `node_modules` do worktree e o do checkout principal) — usar `tsc --noEmit` como rede de segurança nesse cenário.
- **Testes de e-mail falham localmente** (`src/lib/__tests__/email.test.ts`, 2 de 54) por falta de `RESEND_API_KEY` no `.env.local` local — pré-existente, não é regressão de nenhuma feature.
- **`vitest run` a partir do repo principal conta os testes em dobro se um worktree isolado ainda estiver vivo dentro de `.claude/worktrees/`** — o glob de teste pega tanto `src/__tests__` quanto a cópia aninhada dentro do worktree (fisicamente uma subpasta do repo). Não é regressão real (os 2 arquivos de teste são idênticos, resultado dobra igualmente passes e falhas); some sozinho depois que o worktree é removido (`git worktree remove`). Só gerou confusão momentânea numa sessão (14-15/07) até perceber a causa.

---

## Deploy

- Produção: `https://rede-mobiliza-app.azl4mh.easypanel.host/`
- Fluxo: `git push origin main` (canônico) + `git push easypanel main` (o que o EasyPanel observa) → `curl http://187.77.34.212:3000/api/deploy/<token>` para disparar o build manualmente (autoDeploy está desligado) → confirmar `commit.sha` via API tRPC do EasyPanel.
- Credenciais e detalhes completos: memória do projeto (`project_deploy.md`), não reproduzidos aqui por serem segredos.
- **Estado em 12/07/2026**: push + deploy manual executados após o Dashboard "Dados Gerais" (seção 14, `commit.sha` `83d0341`) e novamente após o Cadastro Completo + Nova Demanda + aba Cadastros (seção 15, `commit.sha` `f9f42d8`), ambos confirmados via `projects.listProjectsAndServices`. O fix do bug de foto vazia no cadastro público (`3310c45`, pendência 10) ainda **não foi deployado** — feito localmente, aguardando push/deploy.
- **Ambiente staging separado desde 13/07** (seção 16): `develop` tem deploy automático a cada push via GitHub Actions; produção (`main`) continua exigindo o passo manual acima (ou `deploy-prod.sh`, que automatiza promover `develop` → `main` + disparar o webhook).
- **Estado em 14-15/07/2026**: `commit.sha` `ae6fc25` (Visualizar Dados Gerais — aba Pessoas, seção 19) **deployado e confirmado em produção** via API do EasyPanel. A feature da seção 20 (Demandas — filtro de período + Visualizar Dados Gerais) está mergeada em `main` localmente neste HEAD (`7d24301`) mas **push/deploy ainda não executados** — verificar se já foram feitos antes de assumir que produção reflete esta seção.
