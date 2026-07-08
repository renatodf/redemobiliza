# Edição da ficha de demanda (admin)

## Contexto

Hoje `/admin/demandas/[demandaId]` mostra todos os formulários (observação, alterar
prazo, marcar desfecho) sempre visíveis, sem distinção entre visualizar e editar.
Título, descrição e área nunca podem ser corrigidos depois da criação, e a troca de
status só é permitida a partir de `aberta`/`expirada` (não dá pra reverter um
encerramento feito por engano). Não existe exclusão de demanda.

Escopo: só a tela de admin. A tela do mobilizador
(`/mobilizador/demandas/[demandaId]`) e suas actions próprias não são alteradas.

## Modo visualização vs. edição

A página passa a ter dois modos, controlados por um checkbox oculto + CSS
`peer-checked` (mesmo padrão já usado na edição de observações da ficha de pessoa).

- **Visualização (padrão):** título, descrição, área, prazo, status e observação
  aparecem como texto — nenhum campo editável na tela.
- **Edição:** os mesmos blocos viram formulários.

No cabeçalho, ao lado do badge de status, ficam dois ícones sempre visíveis:
- **✏️ Editar** — liga o modo edição (label associada ao checkbox).
- **🗑️ Excluir** — soft delete da demanda, com confirmação.

Um ✕ no lugar do ✏️ (mesma label, mesmo checkbox) fecha o modo edição.

## Conteúdo do modo edição (ordem na página)

1. **Dados** — título, descrição e área viram inputs. Solicitante e responsável
   ficam fora (responsável já tem "Reatribuir responsável" à parte, inalterado).
2. **Observação** — o textarea de adicionar/atualizar observação (já existe) passa a
   só aparecer em modo edição; hoje fica sempre visível.
3. **Status** — logo abaixo da observação, um `<select>` com as 4 opções (Em aberto,
   Expirada, Atendida, Não atendida) + botão "Salvar status". Substitui os dois
   botões grandes de "Desfecho" (✓ Atendida / ✗ Não atendida), que são removidos. A
   troca passa a valer de **qualquer status para qualquer status** — hoje só era
   possível encerrar quando a demanda estava aberta/expirada.
4. **Prazo** — o formulário de alterar prazo que já existe, mas deixa de ficar
   restrito a status aberta/expirada (fica sempre disponível em modo edição).
   Continua exigindo justificativa, como hoje.

Cada bloco mantém seu próprio botão "Salvar" (mini-forms independentes), não um form
único.

## Exclusão

`ExcluirDemandaButton` (client component, mesmo padrão de `ExcluirPessoaButton`):
`confirm()` do navegador → action `excluirDemanda` faz soft delete
(`deletedAt = new Date()`) e redireciona para `/admin/demandas`. Sem restrição por
histórico — qualquer demanda pode ser excluída (soft delete é reversível no banco).

## Actions

- **`src/actions/admin/editar-demanda.ts`** (nova): valida título/descrição/área
  obrigatórios, atualiza a demanda, grava uma `MovimentacaoDemanda` resumindo o que
  mudou (ex: "Dados editados por Fulano: título e área alterados").
- **`src/actions/admin/marcar-desfecho-demanda.ts` → renomeada para
  `alterar-status-demanda.ts`**: passa a aceitar os 4 status (não só
  atendida/não_atendida), remove a checagem de status atual, ajusta a mensagem do
  histórico para refletir a transição livre. Único ponto de uso é essa página, então
  o rename é seguro.
- **`src/actions/admin/alterar-prazo-demanda.ts`**: remove a checagem
  `status !== 'aberta' && status !== 'expirada'`. Resto inalterado (justificativa
  continua obrigatória).
- **`src/actions/admin/atualizar-observacao-demanda.ts`**: sem mudança de lógica, só
  passa a renderizar atrás do toggle de edição.
- **`src/actions/admin/excluir-demanda.ts`** (nova): soft delete, mesmo padrão de
  `soft-delete-pessoa.ts`.

## Fora de escopo

- Tela do mobilizador e suas actions (`src/actions/mobilizador/*`).
- Edição de solicitante/responsável dentro desse form (responsável já tem fluxo
  próprio).
- Exclusão física (hard delete) — sempre soft delete.
