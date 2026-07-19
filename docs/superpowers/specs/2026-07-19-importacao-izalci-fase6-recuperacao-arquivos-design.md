# Importação Izalci — Fase 6: Recuperação de Arquivos (currículos + fotos) — Spec

## Contexto

Fase adicional, não prevista na spec-mãe original (`docs/superpowers/specs/2026-07-18-importacao-izalci-mongodb-design.md`), motivada por dois problemas reportados pelo usuário após as Fases 1-5 completas: (1) o filtro de Banco de Talentos não mostra nenhum dos 526 registros importados, porque exige `curriculoUrl` preenchido e nenhum tinha; (2) investigação revelou que os arquivos reais de currículo e foto — que se pensava perdidos — na verdade existem no MongoDB Atlas ao vivo, fora do backup estático usado nas Fases 1-5.

## O problema central: os arquivos estão no GridFS "cache" do banco ao vivo, não no backup

O sistema antigo ("Legislapp", repositório `renatodf/gestao-gabinete`) usa Shrine + `shrine-gridfs` pra armazenar arquivos dentro do próprio MongoDB. Toda referência de arquivo no Mongo (`curriculum_file_data`, `photo_data`, e até `document_file_data` de uma feature não relacionada) aponta pro storage `"cache"` (prefixo GridFS `temp`, coleções `temp.files`/`temp.chunks`) — o storage `"store"` (permanente, prefixo `fs`) nunca foi usado pelo sistema, está vazio até hoje. O app sempre funcionou lendo direto do `"cache"`, por isso currículos e fotos funcionavam normalmente pro usuário até este ano.

**O backup usado nas Fases 1-5 (`/Users/renato/Backups/mongodb-meubancodedadosprod-2026-07-18/`) não incluiu `temp.files`/`temp.chunks`** — só veio `fs.files`/`fs.chunks` (vazios). Confirmado por conexão direta ao cluster Atlas (`<cluster>.mongodb.net`, banco `meubancodedadosprod`): `temp.files` tem 85.379 documentos, `temp.chunks` tem 94.878 — e os ids batem exatamente (nome de arquivo, tamanho, tipo) com o que já tínhamos mapeado em `curriculum_file_data`/`photo_data` do tenant Izalci.

## Dados confirmados na investigação (via conexão ao vivo)

- **Currículos**: 545 ids extraídos de `curriculum_file_data`, **545 encontrados** em `temp.files` (100%). Tipos: 488 PDF, 1 DOCX, 1 DOC, 55 sem `contentType` registrado no GridFS (precisa detectar pelo conteúdo). Tamanho total 202,8 MB. Nenhum passa de 10MB.
- **Fotos** (tenant Izalci): 802 ids extraídos de `photo_data`, **801 encontrados** em `temp.files` (1 arquivo é compartilhado por 2 pessoas — mesmo upload usado duas vezes, sem problema, baixa uma vez só). Tipos: 251 JPEG, 5 PNG, 545 sem `contentType` registrado. Tamanho total 853 MB. **17 passam de 5MB, 5 passam de 10MB.**
- Decisão do usuário (confirmada): importar todas as fotos, mesmo as grandes — mas comprimir as que passarem de 5MB antes de subir, pra não pesar o banco de armazenamento (mesmo cuidado que o sistema atual já tem com tamanho de arquivo).

## Religação: mesmo padrão de WhatsApp recalculado das Fases 4-5

Nem `Pessoa` nem `BancoTalentos` guardam id do Mongo. Pra saber qual `Pessoa`/`BancoTalentos` já existente no Postgres corresponde a qual `photo_data`/`curriculum_file_data` do Mongo, o script reconstrói o mesmo mapa `whatsapp → mongoId canônico` já usado na Fase 5 (reprocessar `people.bson.gz` na mesma ordem e com os mesmos filtros da Fase 3 — reaproveitando `escolherTelefones`, `ehPessoaDummyDoLuar`, `registrarWhatsappUnico` de `lib-pessoas-fase3.ts`, sem reescrever), depois cruza com `whatsapp → pessoaId` do Postgres (mesma query das Fases 4-5).

- **Fotos**: pra cada `mongoId` canônico com `photo_data`, resolve `pessoaId` via whatsapp e atualiza `Pessoa.fotoUrl`.
- **Currículos**: pra cada `curriculums` do Mongo, resolve o `person_id` (não o `_id` do próprio currículo) até um `pessoaId` via whatsapp, confirma que esse `pessoaId` já tem um `BancoTalentos` (criado na Fase 4) e atualiza `BancoTalentos.curriculoUrl` desse registro.

## Detecção de tipo de arquivo

O campo `metadata.mime_type` do Mongo é inconsistente (encontrado caso onde o `mime_type` declarado não bate com a extensão do nome do arquivo) e frequentemente ausente no próprio documento GridFS (`contentType: null` em boa parte dos casos). O script detecta o tipo real pelos primeiros bytes do arquivo baixado (pacote `file-type`), não confia no metadado do Mongo. Se a detecção falhar (raro), cai pro `contentType` do GridFS e, por último, pra extensão do `filename`.

## Compressão de fotos grandes

Fotos com tamanho original **maior que 5MB** (limite que o app usa hoje pra upload normal via `validarImagemUpload`, `src/lib/validar-imagem-upload.ts`) são redimensionadas com `sharp` antes do upload: maior lado redimensionado pra no máximo 1600px, reencodadas como JPEG qualidade 82. Fotos de 5MB ou menos sobem sem alteração (evita perda de qualidade desnecessária pra quem já está dentro do limite normal). Currículos não são comprimidos (documentos, não imagem; todos já cabem no limite de 10MB do app).

## Upload pro Supabase Storage — mesmo padrão já usado pelo app

Reaproveita exatamente a convenção já usada em produção (`src/actions/admin/upload-foto-pessoa.ts`, `src/actions/admin/salvar-banco-talentos.ts`):
- Bucket: `gabinete-assets`.
- Caminho de foto: `{gabineteId}/pessoas/{pessoaId}/foto.{ext}`.
- Caminho de currículo: `{gabineteId}/pessoas/{pessoaId}/curriculo.{ext}`.
- `Pessoa.fotoUrl` recebe `{publicUrl}?v={timestamp}` (cache-busting, mesmo padrão do upload manual).
- `BancoTalentos.curriculoUrl` recebe o `publicUrl` puro, sem sufixo (mesmo padrão do upload manual).

## Idempotência

Antes de processar cada `Pessoa`/`BancoTalentos`, o script checa se `fotoUrl`/`curriculoUrl` já está preenchido — se estiver, pula (não sobrescreve upload manual que alguém possa ter feito depois das Fases 3-4). Permite reexecutar o script com segurança.

## Arquitetura

Um único script (`scripts/importacao-izalci/recuperar-arquivos-fase6.ts`) cobrindo fotos e currículos juntos — não dois scripts separados, porque ambos dependem do mesmo passo caro de reconstrução do mapa `whatsapp → mongoId` (reprocessar `people.bson.gz` inteiro); separar em dois scripts duplicaria esse passo sem necessidade. Um `scripts/importacao-izalci/lib-arquivos-fase6.ts` com funções puras testáveis (montar caminho de storage, decidir se uma foto precisa de compressão pelo tamanho).

### Novas dependências (devDependencies, mesmo padrão do `bson` da Fase 3)
- `mongodb` — driver oficial, pra conexão ao vivo (diferente do pacote `bson` já usado, que só decodifica arquivo estático).
- `sharp` — redimensionar/comprimir fotos grandes.
- `file-type` — detectar tipo real de arquivo pelos bytes.

## Segurança — acesso temporário ao MongoDB Atlas

- Connection string do Atlas fica só em `.env.local` (já gitignored, nunca commitado), numa variável nova (`MONGO_ATLAS_URI_LEGADO` ou similar) — nunca em nenhum arquivo de spec/plano/script como valor literal.
- **Passo final obrigatório do plano** (depois do rollout, antes de considerar a fase concluída): revogar o acesso — remover a liberação de rede `0.0.0.0/0` no Atlas e apagar (ou, no mínimo, trocar a senha do) usuário de banco de dados temporário criado especificamente pra essa tarefa.

## Testes

Sem teste automatizado pra código que toca Mongo/Postgres/Supabase Storage real (padrão já estabelecido). As funções puras de `lib-arquivos-fase6.ts` (montar caminho de foto/currículo, decidir necessidade de compressão pelo tamanho) ganham teste Vitest de verdade (TDD).

## Fora de escopo

- Os ~85 mil arquivos de outros tenants no mesmo banco compartilhado — só currículos/fotos do tenant Izalci.
- Qualquer UI nova — os campos `fotoUrl`/`curriculoUrl` já são lidos normalmente pela ficha de pessoa e pelo filtro de Banco de Talentos assim que preenchidos.
- Resolver a segunda pendência reportada pelo usuário (filtro de Banco de Talentos exigindo `curriculoUrl`) — depois desta fase, a maioria dos 526 `BancoTalentos` vai ter `curriculoUrl` preenchido de verdade, o que já resolve o sintoma pra a maior parte dos casos; qualquer ajuste remanescente no filtro (pra quem não tiver currículo mesmo depois da recuperação) é uma decisão separada, a discutir depois que os números reais desta fase estiverem em mãos.

## Nota pós-execução

Executado com sucesso contra staging e produção: `Pessoa.fotoUrl` preenchido = 696-697 (paridade, diferença de 1 é registro de teste pré-existente em staging); `BancoTalentos.curriculoUrl` preenchido = 497 em ambos; 73 não resolvidos em ambos (detalhamento no plano). Dois bugs reais encontrados e corrigidos durante a execução ao vivo: falha de compressão sem tratamento de erro (foto corrompida na fonte) e download do GridFS sem timeout (chunks incompletos travando o processamento sequencial) — ambos corrigidos isolando a falha por registro, sem corromper estado, dado que cada arquivo é salvo individualmente e de forma idempotente. Amostra de URLs reais verificada via `curl`, servindo o conteúdo correto. Detalhes completos: `docs/superpowers/plans/2026-07-19-importacao-izalci-fase6-recuperacao-arquivos.md`.
