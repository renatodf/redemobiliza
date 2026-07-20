# Combobox de Segmentos no Link de Cadastro

Data: 2026-07-19

## Contexto

A tela `/[slug]/admin/link-cadastro` (`GerarLinkForm.tsx`) permite ao admin gerar um link de cadastro público combinando múltiplos Segmentos + a rede de um Mobilizador específico (ou "Rede Raiz"). Hoje os Segmentos aparecem como um grid de pills sempre-visível — um botão por `Segmento` do gabinete, clicável para selecionar/desselecionar.

Com gabinetes reais (ex. IZALCI, pós-importação) tendo dezenas de Segmentos, o grid fica grande demais para escanear visualmente. A seção 31 do HANDOFF já resolveu o mesmo problema para o filtro de Área de Interesse no Banco de Talentos (`/[slug]/admin/filtros/banco-talentos`), criando o componente `ComboBoxMultiplo` (`src/components/admin/ComboBoxMultiplo.tsx`) — um campo de texto digitável que filtra as opções ainda não selecionadas, com as opções selecionadas aparecendo como pills clicáveis abaixo.

## Objetivo

Trocar o grid de pills de Segmentos em `GerarLinkForm.tsx` pelo mesmo `ComboBoxMultiplo` já usado em `BancoTalentosFiltro.tsx`, sem alterar nenhum outro comportamento da tela.

## Fora de escopo

- O seletor de Mobilizador/Rede continua um `<select>` HTML simples (é seleção única; converter para combobox exigiria um componente novo, que o usuário decidiu não fazer nesta sessão).
- Nenhuma mudança em `gerarLinkCadastro` (Server Action), no formato dos dados enviados (`segmentoIds` continua uma lista de ids via `<input type="hidden">`), ou em qualquer rota.
- Nenhuma mudança no componente `ComboBoxMultiplo` em si — ele já existe e já está validado em produção (Banco de Talentos).

## Design

Único arquivo alterado: `src/app/[slug]/admin/link-cadastro/GerarLinkForm.tsx`.

Reaproveita ponto a ponto o padrão já em produção em `src/app/[slug]/admin/filtros/BancoTalentosFiltro.tsx`:

1. O bloco atual (linhas ~67-90: `<p>Segmentos para esse cadastro</p>` + grid `flex flex-wrap` de pills sempre-visíveis) é substituído por:
   - `<ComboBoxMultiplo opcoes={segmentos.map(s => ({id: s.id, label: s.nome}))} selecionados={segmentosSelecionados} onToggle={toggleSegmento} placeholder="Buscar segmento..." />`
   - Abaixo, só quando `segmentosSelecionados.size > 0`: os segmentos selecionados como pills clicáveis (clique remove — reaproveita `toggleSegmento`), com o mesmo estilo `style={{ backgroundColor: corPrimaria, color: corTexto }}` já usado hoje pelas pills selecionadas.
   - Quando `segmentos.length === 0`: mantém a mensagem atual "Nenhum segmento ativo cadastrado." (sem renderizar o combobox nesse caso, mesmo padrão do Banco de Talentos com `areas.length === 0`).
2. Estado (`segmentosSelecionados: Set<string>`, função `toggleSegmento`) e os `<input type="hidden" name="segmentoIds" value={id}>` gerados a partir dele **não mudam** — só a UI de seleção muda, o dado que chega na Server Action é idêntico.
3. Sem lib nova, sem componente novo — `ComboBoxMultiplo` e `filtrarOpcoesComboBox` (`src/lib/filtrar-opcoes-combobox.ts`) já existem e são reaproveitados como estão.

## Testes

Não há lógica pura nova para testar via TDD (`ComboBoxMultiplo`/`filtrarOpcoesComboBox` já têm cobertura própria, inalterada). Verificação é manual: abrir a tela com um gabinete que tenha vários Segmentos, digitar para filtrar, selecionar/desselecionar via combobox e via pill, confirmar que o link gerado reflete os segmentos certos (mesmo teste que a tela já tinha antes, só que exercitando a nova UI).

## Riscos

Nenhum risco novo — é substituição de um componente de apresentação já validado em produção por outro, sem tocar em dado, permissão ou rota.
