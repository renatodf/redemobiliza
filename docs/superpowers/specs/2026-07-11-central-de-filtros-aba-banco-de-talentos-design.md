# Central de Filtros — Aba Banco de Talentos

**Data:** 2026-07-11
**Status:** aprovado

---

## Contexto

Fecha o desenho da terceira e última aba da Central de Filtros (`docs/superpowers/specs/2026-07-11-central-de-filtros-design.md`) — Pessoas e Demandas já estão em produção.

Existe um spec anterior e mais ambicioso para este módulo: `docs/superpowers/specs/2026-06-28-banco-de-talentos-design.md` (dashboard dedicado, model `Encaminhamento` separado, "gestor padrão" fixo configurado uma vez, notificação automática por e-mail, 9 filtros, indicadores de aniversário). **Esse spec está substituído por este documento** — decisão explícita do usuário após revisão comparativa: mantém-se o nível de simplicidade já usado nas abas Pessoas e Demandas (sem dashboard, sem model de auditoria separado, sem configuração fixa de gestor — o responsável é escolhido a cada exportação, mesmo padrão de `criarDemanda`). O spec de 28/06 fica arquivado como histórico, não como fonte de verdade.

Dois recursos do spec antigo foram mantidos, mas um deles já existe:
- **"Marcar colocado"**: já está implementado desde a Fase 1 — o campo `colocado` é editável em `BancoTalentosDialog.tsx` (ficha da pessoa) e já é persistido por `salvarBancoTalentos`. Nada novo a construir aqui; só decidir como ele entra no filtro (ver abaixo).
- **Seleção individual de candidatos via checkbox**: isso é novo — diferente de Pessoas/Demandas (que exportam "tudo que bate no filtro"), aqui a exportação atua sobre uma seleção explícita, porque a ação pode ter efeito colateral (criar Demandas de acompanhamento), não é um download passivo.

## Escopo de acesso

Só admin. Mobilizador **não tem acesso** — a aba nem aparece (`FiltrosTabs` do mobilizador já lista só Pessoas e Demandas, sem alteração necessária ali).

## Sem schema novo

`BancoTalentos`, `AreaColocacao` e `BancoTalentosArea` já existem da Fase 1 (28/06–07/07). Nenhuma migration nesta feature. Como `BancoTalentos` não tem `gabineteId` direto (só via `pessoa.gabineteId`), os filtros de tenant e região passam pela relação:

```typescript
where: {
  pessoa: { gabineteId, regiaoId: params.regiaoId ? params.regiaoId : undefined },
  colocado: false,
  curriculoUrl: { not: null },
  ...
}
```

## Filtros

| Filtro | Campo | Comportamento |
|---|---|---|
| Área de interesse | `BancoTalentosArea` | Multi-select (mesmo padrão de pílulas de `GerarLinkForm.tsx` — estado local `Set<string>`, inputs hidden), via `areas: { some: { areaColocacaoId: { in: [...] } } }` |
| Prioridade | `BancoTalentos.prioridade` | 1 / 2 / 3, igualdade direta |
| PcD | `BancoTalentos.isPcd` | Sim / Não |
| Região | `Pessoa.regiaoId` (via relação `pessoa`) | igualdade direta |

**Sempre aplicados, sem filtro visível** (mesma decisão explícita do usuário, sem toggle de UI):
- `colocado: false` — quem já foi colocado no mercado nunca aparece na listagem.
- `curriculoUrl: { not: null }` — quem não tem currículo anexado nunca aparece na listagem (não é só ignorado no ZIP — nem entra no filtro).

## Seleção e exportação

**Seleção:** checkbox por linha + "selecionar todos" no cabeçalho da tabela, escopo **só da página atual** (20 itens) — trocar de página reseta a seleção. Botão "Exportar selecionados" fica desabilitado até pelo menos 1 marcado.

**Dialog de confirmação** (Client Component, mesmo padrão `<dialog>` de `BancoTalentosDialog.tsx`), aberto ao clicar "Exportar selecionados":
1. Mostra "X selecionado(s)" — contagem simples, sem distinção de currículo (todo selecionável sempre tem currículo, dado o filtro fixo acima, então essa distinção do spec antigo é desnecessária aqui).
2. Pergunta: "Abrir demanda de acompanhamento de encaminhamento pra cada um?" — Sim/Não.
3. Se **Sim**: aparece um `<select>` de responsável — mobilizador/colaborador do gabinete, mesma validação de `criarDemanda` (`isMobilizador: true, isColaborador: true, deletedAt: null`). Obrigatório escolher antes de confirmar.
4. Confirmar submete um único `<form method="post">` nativo (sem JS necessário pra funcionar) — `pessoaId`s selecionados (inputs hidden, um por ID), `abrirDemanda` (`'sim'`/ausente), `responsavelId` (se aplicável) — direto pra rota de exportação. O POST nativo dispara o download do ZIP como resposta, mesmo mecanismo que já funciona pros links `GET` de PDF/Excel em Pessoas/Demandas.

## Rota `POST /api/[slug]/filtros/banco-talentos/exportar`

Só `assertAdminAccess` — sem fallback pra `assertMobilizadorAccess` (mobilizador não tem acesso a esta aba, então não faz sentido tentar autorizá-lo aqui).

1. Lê `pessoaId`s do form (`formData.getAll('pessoaId')`), `abrirDemanda`, `responsavelId`.
2. **Revalida contra o gabinete**: busca as `Pessoa`s pelos IDs recebidos filtrando por `gabineteId` — IDs que não pertencem ao gabinete (form adulterado) somem silenciosamente da lista final, nunca causam erro nem vazam dado de outro tenant.
3. Se `abrirDemanda`:
   a. Valida `responsavelId` (`isMobilizador && isColaborador && gabineteId`) — se inválido, aborta **antes** de criar qualquer Demanda (nenhuma criação parcial).
   b. `garantirAreaEmprego(gabineteId)`: idempotente (`findFirst` + `create` da `AreaDemanda` "Emprego"), mesmo padrão de `criarAreaColocacao`. Sem índice único em `AreaDemanda(gabineteId, nome)` — uma corrida rara poderia criar duas áreas "Emprego"; risco aceito, mesmo padrão já usado em `criarAreaColocacao` (que também não tem lock), não é um caso novo introduzido por esta feature.
   c. Cria uma `Demanda` por pessoa selecionada e revalidada: título `"Acompanhamento de encaminhamento — [Nome]"`, `solicitanteId` = a própria pessoa do Banco de Talentos, `responsavelId` = escolhido, `areaId` = "Emprego", `prazoDesfecho` = `ConfiguracaoSistema.prazoDemandasHoras` a partir de agora (mesmo default de `criarDemanda`).
4. Monta o ZIP (`jszip`) buscando o currículo de cada pessoa via `fetch(curriculoUrl)` (já é uma URL pública do bucket `gabinete-assets`, sem necessidade de reconstruir o path de Storage). Nome interno de cada arquivo: `Nome_Sobrenome.ext` (extensão preservada do original). Nome do ZIP: `curriculos_DD_MM_YYYY.zip`.
5. Retorna `application/zip` com `Content-Disposition: attachment`.

## Dependências novas

- `jszip` — geração do ZIP (nunca instalada, prevista desde o spec de 28/06).

## Testes

- `filtros-banco-talentos.test.ts`: `buildWhereBancoTalentos` — `colocado: false` e `curriculoUrl: { not: null }` sempre presentes; `gabineteId` sempre via relação `pessoa`; cada filtro (área, prioridade, PcD, região) isolado e combinado.
- Sem teste automatizado pra rota de exportação (depende de Storage/ZIP reais, I/O externo — mesmo padrão de todas as rotas de exportação existentes) nem pro dialog de confirmação (Client Component apresentacional).

## Casos de borda

- `pessoaId` selecionado que não pertence ao gabinete (form adulterado): filtrado silenciosamente na revalidação, nunca processado.
- Nenhum candidato selecionado: botão de exportar desabilitado no client antes mesmo de submeter.
- `responsavelId` inválido: rota rejeita antes de criar qualquer Demanda.
- Corrida na criação da área "Emprego": risco aceito (ver seção da rota acima).

## Fora de escopo

- Dashboard de indicadores (total, PcD, prioridade, gênero, aniversariantes) — spec de 28/06, não retomado.
- Model `Encaminhamento` (auditoria separada de cada encaminhamento) — as próprias `Demanda`s criadas já servem de registro/acompanhamento.
- "Gestor padrão de encaminhamento" configurável — responsável é escolhido a cada exportação.
- Notificação automática por e-mail ao responsável.
- Filtros extras do spec de 28/06 (gênero, cidade, período de cadastro, "encaminhado pra entrevista", "tem currículo" como toggle — currículo agora é sempre exigido, não é mais opcional).
- Seleção entre páginas (a seleção reseta ao trocar de página).
