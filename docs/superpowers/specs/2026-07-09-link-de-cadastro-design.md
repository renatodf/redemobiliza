# Link de Cadastro

## Contexto

O menu do admin já tem um item "Link de Cadastro" (`src/components/admin/Sidebar.tsx`),
hoje marcado `emBreve: true` (sem link). O objetivo é implementar essa tela de verdade,
em duas versões — mobilizador e admin —, reaproveitando o layout/tema já usado nas
telas programadas (Sidebar, Topbar, `corPrimaria`/`corTextoContraste`, mesma fonte),
não o briefing visual antigo (azul, menu com itens que não existem no sistema) que
serviu só de referência de conteúdo/interação.

O mecanismo de convite por link já existe parcialmente: cada `Pessoa` mobilizadora tem
um `tokenMobilizador`, e a página pública `/{slug}/cadastro/{segmentoSlug}?m={token}`
já registra o cadastro vinculado a esse mobilizador (`VinculoRede.indicadoPorId`) e ao
segmento (`PessoaSegmento`). O que falta:

1. Uma tela dedicada pro mobilizador ver/copiar/baixar esse link (hoje esse conteúdo
   vive espalhado como cards na home).
2. Uma tela pro admin **compor** um link com mais de um segmento e/ou escolher a rede
   de qualquer mobilizador do gabinete (ou nenhuma — cadastro vai pra "Rede Raiz").
3. Download do QR code em JPG (fundo branco) e PNG (com opção de fundo transparente).
4. Um jeito de filtrar, na listagem de Usuários, quem está na "Rede Raiz" (sem
   mobilizador).

"Rede Raiz" não é um conceito novo no banco — é simplesmente `VinculoRede.indicadoPorId
= null`, que a action de cadastro já produz quando não há `?m=` na URL. Não precisa de
campo novo no schema.

## Menu (Sidebar)

- **Mobilizador** (`buildItensMobilizador`): terceiro item "Link de Cadastro" →
  `/{slug}/mobilizador/link-cadastro`, usando o ícone `link-cadastro` que já existe no
  componente (hoje só usado pelo admin).
- **Admin** (`buildItensAdmin`): o item existente "Link de Cadastro" ganha
  `href: /{slug}/admin/link-cadastro` e deixa de ser `emBreve`.

## Tela do mobilizador — `/{slug}/mobilizador/link-cadastro`

> ⚠️ **Revisado em 11/07/2026, após implementação real**: o design original abaixo
> (um card por segmento, cada um com seu próprio link `?m=token`) foi **abandonado**
> assim que um gabinete real sem nenhum `Segmento` cadastrado quebrou a tela (nenhum
> card pra mostrar). A versão implementada substitui os cards por segmento por **um
> único link fixo pessoal**, independente de segmento — ver descrição abaixo.

Um único bloco (não mais um card por segmento) com:

- **Link fixo pessoal**: `https://{appUrl}/{slug}/cadastro/link?m={tokenMobilizador}`
  — reaproveita a mesma rota estática `/cadastro/link` usada pelo link composto do
  admin (ver seção seguinte), só que sem `?segmentos=`. Quem se cadastra por ele entra
  direto na rede do mobilizador e não fica marcado em nenhum segmento (o cadastro por
  segmento continua existindo, só não é mais o caminho do link pessoal do mobilizador).
- Botão "Copiar link" com feedback visual ("Copiado!" por alguns segundos)
  (`CopiarLinkButton.tsx`).
- QR code do link (lib `qrcode`, mesmo padrão de antes).
- Dois botões de download: "Baixar PNG" (fundo branco) e "Baixar PNG transparente".
  (Correção em relação à ideia original de JPG: a lib `qrcode` já usada no projeto só
  suporta PNG/SVG/texto no servidor — `type: 'image/jpeg'` cai silenciosamente em PNG.
  Gerar JPG de verdade exigiria duas dependências novas; decidido manter só PNG, que é
  o formato padrão pra QR code de qualquer forma, sem lossy compression nas bordas.)

Implementado em `src/app/[slug]/mobilizador/link-cadastro/page.tsx`. Sem mudança de
acesso/dados — é puramente uma tela nova reaproveitando dados que a home já buscava
(`Pessoa.tokenMobilizador`).

## Tela do admin — `/{slug}/admin/link-cadastro`

Formulário com:

1. **Segmentos** — lista de botões-pílula (multi-seleção via estado local
   `Set<string>` de `segmento.id`, enviados como inputs hidden `segmentoIds`) com
   todos os segmentos ativos do gabinete (pode marcar mais de um). Implementado em
   `GerarLinkForm.tsx`.
2. **Rede** — um `<select name="mobilizadorPessoaId">` com "Rede Raiz (sem
   mobilizador)" como primeira opção (valor vazio) seguido de todos os mobilizadores
   do gabinete pelo nome. Escolher um mobilizador aqui significa: quem se cadastrar
   por esse link entra **diretamente** na rede dele (mesmo significado de
   `indicadoPorId` hoje — vínculo direto, não desce mais um nível).
3. Botão **"Gerar Link"** — server action (`gerarLinkCadastro`,
   `src/actions/admin/gerar-link-cadastro.ts`) que recebe os `segmentoIds` e
   (opcionalmente) o `mobilizadorPessoaId` escolhido, monta a URL e gera os dois QR
   codes **PNG** (opaco + transparente — não JPG, ver correção abaixo), devolvendo
   tudo via `useFormState` (mesmo padrão já usado em outros diálogos do projeto). Não
   há atualização "ao vivo" enquanto marca os segmentos — só ao clicar Gerar Link,
   evitando introduzir geração de QR code no client.
4. Depois de gerado: mesmo bloco de link + copiar + QR + downloads da tela do
   mobilizador.

Requer pelo menos 1 segmento selecionado; a rede é opcional.

## Formato do link do admin (novo, só pra esse caso)

`https://{appUrl}/{slug}/cadastro/link?segmentos=slug1,slug2&m=token` — rota estática
nova (`src/app/[slug]/cadastro/link/page.tsx`), **fora** da rota dinâmica
`[segmentoSlug]` (por isso "link" nunca colide com um slug de segmento real — rotas
estáticas do Next.js sempre têm prioridade sobre a dinâmica irmã no mesmo nível). Se
não houver `m`, o cadastro vai pra Rede Raiz.

Efeito colateral aceito: um segmento futuro com slug exatamente `link` teria seu link
pessoal (`/cadastro/link`) inacessível, sempre resolvendo pra essa página nova. Slug
reservado, documentado aqui — não é um bug, é uma escolha de nomenclatura.

Página pública, sem autenticação — mesmo nível de acesso que `/cadastro/[segmentoSlug]`.
Reaproveita o mesmo `CadastroForm`, mas mostra um título genérico ("Cadastro") em vez
do nome de um segmento específico, já que pode haver mais de um.

Depois de enviado, redireciona pra `/{slug}/cadastro/link/sucesso` (página de sucesso
nova, mesmo template da existente, só sem o "voltar" apontando pra um segmento
específico — aponta pra raiz do gabinete).

## Action de cadastro (generalização)

`submeterCadastro` passa a receber `segmentoSlugs: string[]` (lista, mínimo 1) em vez
de `segmentoSlug` único. A lógica interna (validar whatsapp, criar/reaproveitar
`Pessoa`, criar `VinculoRede` uma vez) não muda — só o loop de
`pessoaSegmento.upsert` passa a rodar por cada slug da lista. O formulário existente
(`/cadastro/[segmentoSlug]`) passa a chamar a action com um array de 1 item — mudança
interna, sem mudança de comportamento visível pra quem já usa o link pessoal.

## Filtro "Rede Raiz" na listagem de Usuários

Em `src/app/[slug]/admin/pessoas/page.tsx`, o parâmetro `?rede=` ganha um valor
especial `raiz`: quando presente, filtra `VinculoRede.indicadoPorId: null` em vez de
buscar vínculos de um `pessoaId` específico. Um link "Ver Rede Raiz" fica visível perto
dos filtros existentes da página.

## Download de QR code (PNG opaco + PNG transparente)

A lib `qrcode` (já é dependência do projeto, já usada em `/mobilizador/page.tsx`)
suporta nativamente, sem dependência nova:
- PNG opaco (fundo branco): `QRCode.toDataURL(link, { width: 300, margin: 2 })` — o
  mesmo que já é gerado hoje.
- PNG transparente: `QRCode.toDataURL(link, { width: 300, margin: 2, color: { light:
  '#ffffff00' } })` — hex de 8 dígitos com canal alpha zerado.

Cada card gera as duas data URLs no servidor (mesmo padrão do `qrDataUrl` de hoje) e os
botões de download são simplesmente `<a href={dataUrl} download="...">` — sem
JavaScript de cliente.

## Fora de escopo

- Busca/paginação no `<select>` de mobilizadores do admin (lista simples por enquanto;
  se crescer muito, é um follow-up).
- Qualquer redesenho da tela "Dados Gerais" (dashboard futuro) mencionada pelo usuário
  — não faz parte deste spec.
