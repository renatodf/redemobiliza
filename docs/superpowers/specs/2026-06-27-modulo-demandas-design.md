# Módulo de Demandas — Design

**Data:** 2026-06-27
**Status:** Aprovado para implementação

---

## Visão Geral

Módulo de CRM político para registro e acompanhamento de pedidos recebidos pelo gabinete. Cada demanda está vinculada a um solicitante cadastrado, tem um responsável (mobilizador com `isColaborador = true`), prazo configurável e ciclo de vida com status visuais.

---

## Pré-requisitos e Mudanças no Schema Existente

### Rename: `isEquipe` → `isColaborador`

O campo `isEquipe` no model `Pessoa` é renomeado para `isColaborador`. Pessoas com `isColaborador = true` aparecem como opção de responsável em todos os módulos (Demandas, Agenda, etc.).

Arquivos afetados:
- `prisma/schema.prisma`
- `src/actions/admin/toggle-equipe.ts` → renomear para `toggle-colaborador.ts`
- `src/app/[slug]/admin/pessoas/[pessoaId]/MobilizadorSection.tsx`
- `src/app/[slug]/admin/pessoas/[pessoaId]/page.tsx`

Migration: `rename_isequipe_to_iscolaborador`

### Campos de Endereço no model `Pessoa`

```prisma
bairro      String?
logradouro  String?
numero      String?
complemento String?
cep         String?
// cidade já existe
```

---

## Schema — Novos Models

```prisma
model AreaDemanda {
  id         String    @id @default(cuid())
  nome       String
  gabineteId String
  gabinete   Gabinete  @relation(fields: [gabineteId], references: [id])
  demandas   Demanda[]

  @@index([gabineteId])
}

model Demanda {
  id              String    @id @default(cuid())
  gabineteId      String
  titulo          String
  descricao       String
  solicitanteId   String
  responsavelId   String
  areaId          String
  status          String    @default("aberta") // aberta | expirada | atendida | nao_atendida
  prazoDesfecho   DateTime
  prazoAlterado   Boolean   @default(false)
  alertaEnviadoEm DateTime? // preenchido pelo cron ao enviar o alerta de expiração — evita duplicatas
  observacao      String?
  criadoEm       DateTime  @default(now())
  criadoPorId     String

  gabinete    Gabinete            @relation(fields: [gabineteId], references: [id])
  solicitante Pessoa              @relation("DemandaSolicitante", fields: [solicitanteId], references: [id])
  responsavel Pessoa              @relation("DemandaResponsavel", fields: [responsavelId], references: [id])
  area        AreaDemanda         @relation(fields: [areaId], references: [id])
  criadoPor   Pessoa              @relation("DemandaCriadoPor", fields: [criadoPorId], references: [id])
  historico   MovimentacaoDemanda[]

  @@index([gabineteId])
  @@index([status])
  @@index([responsavelId])
  @@index([prazoDesfecho])
}

model MovimentacaoDemanda {
  id        String   @id @default(cuid())
  demandaId String
  tipo      String   // criacao | status_alterado | prazo_alterado | observacao | responsavel_alterado
  descricao String
  autorId   String
  criadoEm DateTime @default(now())

  demanda Demanda @relation(fields: [demandaId], references: [id])
  autor   Pessoa  @relation(fields: [autorId], references: [id])

  @@index([demandaId])
}

model ConfiguracaoSistema {
  id                   String   @id @default(cuid())
  gabineteId           String   @unique
  prazoDemandasHoras   Int      @default(72)
  alertaExpiracaoHoras Int      @default(12)

  gabinete Gabinete @relation(fields: [gabineteId], references: [id])
}
```

**Observações:**
- `AreaDemanda` tem `gabineteId` — áreas são por gabinete, não globais
- `observacao` é campo direto em `Demanda` para exibição sem join
- `ConfiguracaoSistema` tem `gabineteId` — cada gabinete configura seu próprio prazo padrão
- `MovimentacaoDemanda` inclui o tipo `responsavel_alterado` (reatribuição pelo admin)

### Áreas pré-cadastradas (seed por gabinete)

Saúde, Educação, Habitação, Social, Segurança, Infraestrutura, Empreendedorismo.

Como `AreaDemanda` tem `gabineteId`, o seed não pode ser feito na migration (gabinetes são criados após o deploy). A solução é uma função `seedAreasGabinete(gabineteId)` chamada quando o super-admin cria um novo gabinete. O admin pode criar, editar e excluir áreas livremente após isso.

---

## Ciclo de Status

| Status | Cor | Origem |
|---|---|---|
| `aberta` | Amarelo | Automático — demanda criada e dentro do prazo |
| `expirada` | Laranja | Automático — cron detecta prazo ultrapassado sem desfecho |
| `atendida` | Verde | Manual — responsável ou admin marca como atendida |
| `nao_atendida` | Vermelho | Manual — responsável ou admin marca como não atendida |

Transições permitidas:
- `aberta` → `expirada` (cron)
- `aberta` → `atendida` (manual)
- `aberta` → `nao_atendida` (manual)
- `expirada` → `atendida` (manual — responsável ainda pode concluir)
- `expirada` → `nao_atendida` (manual)

Uma demanda expirada não fecha sozinha. A expiração é alerta visual; o desfecho continua sendo responsabilidade do responsável.

---

## Permissões por Perfil

| Ação | Admin | Mobilizador |
|---|---|---|
| Criar demanda | ✅ | ❌ |
| Ver todas as demandas | ✅ | ❌ |
| Ver demandas próprias | ✅ | ✅ |
| Editar observação | ✅ | ✅ (próprias) |
| Alterar prazo | ✅ | ✅ (próprias) |
| Marcar desfecho | ✅ | ✅ (próprias) |
| Reatribuir responsável | ✅ | ❌ |
| Gerenciar áreas | ✅ | ❌ |
| Gerenciar configurações | ✅ | ❌ |

---

## Estrutura de Rotas

### Admin

```
/[slug]/admin/demandas/                   → listagem + dashboard de cards
/[slug]/admin/demandas/nova               → formulário de abertura
/[slug]/admin/demandas/[demandaId]/       → detalhe + linha do tempo
/[slug]/admin/demandas/areas/             → CRUD de áreas
/[slug]/admin/configuracoes/              → prazo padrão + alerta de expiração
```

### Mobilizador

```
/[slug]/mobilizador/                      → página existente, ganha seção "Minhas Demandas"
/[slug]/mobilizador/demandas/[demandaId]/ → detalhe da demanda (observação, prazo, desfecho)
```

---

## UI Admin — Telas

### Listagem de Demandas (`/demandas/`)

**Cards de resumo (topo):**
- Em aberto 🟡 | Expiradas 🟠 | Atendidas 🟢 | Não atendidas 🔴 | Prazo alterado ⚪

**Tabela:**
- Padrão: últimos 30 dias, ordenação cronológica inversa, 20 por página
- Colunas: título, solicitante, responsável, área, prazo, status (badge colorido)

**Filtros:**
- Status | Área | Responsável | Cidade do solicitante | Período (data inicial/final, mês, ano) | Prazo alterado (sim/não)

### Formulário de Abertura (`/demandas/nova`)

1. **Busca de solicitante** — autocomplete por nome ou WhatsApp
   - Se não encontrar: botão "Cadastrar pessoa agora" abre modal inline (campos mínimos: nome + WhatsApp + e-mail)
2. **Endereço do solicitante** — exibido abaixo do solicitante selecionado
   - Se incompleto: campos editáveis para preenchimento opcional (salvo no perfil da pessoa)
   - Se completo: exibido para confirmação com opção de edição
3. **Dados da demanda:** título, descrição, área, responsável (apenas `isMobilizador = true` e `isColaborador = true`), prazo (pré-calculado com base na configuração, editável)
4. **Submit:** cria demanda, registra evento `criacao` no histórico, envia e-mail ao responsável

### Tela de Detalhe (`/demandas/[demandaId]/`)

- Cabeçalho: título, badge de status, área, prazo (indicador visual diferenciado se `prazoAlterado = true`)
- Solicitante: nome, WhatsApp, endereço
- Responsável: nome, com botão "Reatribuir" visível apenas para admin
- Campo observação: exibido e editável pelo responsável e pelo admin
- Botões de desfecho: "Marcar como Atendida" / "Marcar como Não Atendida"
- Linha do tempo: histórico cronológico completo de todas as movimentações

---

## UI Mobilizador — Adições

### Seção "Minhas Demandas" (na página principal)

Lista de demandas atribuídas ao mobilizador logado, ordenadas por prazo (mais urgente primeiro). Badge de status colorido em cada item. Link para o detalhe.

### Detalhe da Demanda (`/mobilizador/demandas/[demandaId]/`)

- Visualiza todas as informações da demanda
- Adiciona/edita observação
- Altera prazo de desfecho (justificativa obrigatória no campo observação)
- Marca como Atendida ou Não Atendida
- Visualiza linha do tempo completa
- **Não pode** reatribuir responsável nem ver demandas de outros mobilizadores

---

## Cron de Expiração

**Rota:** `POST /api/cron/verificar-demandas`
**Proteção:** header `Authorization: Bearer CRON_SECRET` (variável de ambiente)
**Configuração EasyPanel:** cron `0 * * * *` (todo início de hora)

**Lógica de execução:**

1. **Expiração:** busca demandas com `status = "aberta"` e `prazoDesfecho < now()`
   - Atualiza status para `"expirada"` em lote
   - Registra evento `status_alterado` no histórico de cada uma
   - Envia e-mail ao responsável e ao admin

2. **Alerta antecipado:** busca demandas com `status = "aberta"`, `alertaEnviadoEm = null` e `prazoDesfecho` entre `now()` e `now() + alertaExpiracaoHoras`
   - Envia e-mail de alerta ao responsável (sem alterar status)
   - Preenche `alertaEnviadoEm = now()` para não reenviar nas próximas execuções do cron

---

## Camada de E-mail

**Arquivo:** `src/lib/email.ts`

Interface única `enviarEmail({ para, assunto, html })` encapsulando o Resend SDK. Trocar de provedor = alterar apenas este arquivo.

**Templates:**

| Template | Destinatário | Gatilho |
|---|---|---|
| Demanda atribuída | Responsável | Criação da demanda |
| Alerta de expiração | Responsável | X horas antes do prazo (configurável) |
| Demanda expirada | Responsável + Admin | Cron detecta expiração |

---

## Sequência de Implementação

**Etapa 1 — Fundação do schema**
- Rename `isEquipe` → `isColaborador` (migration + código)
- Adicionar campos de endereço à `Pessoa`
- Criar models `AreaDemanda`, `Demanda`, `MovimentacaoDemanda`, `ConfiguracaoSistema`
- Seed de áreas na migration

**Etapa 2 — CRUD de Áreas e Configurações**
- Tela de gerenciamento de áreas no admin
- Tela de configurações do sistema (prazo padrão + alerta)

**Etapa 3 — Abertura de demanda**
- Formulário `/demandas/nova` com busca de solicitante + cadastro inline
- Preenchimento de endereço do solicitante
- Server action `criarDemanda`

**Etapa 4 — Listagem e detalhe (admin)**
- Listagem com filtros e dashboard de cards
- Tela de detalhe com linha do tempo
- Reatribuição de responsável

**Etapa 5 — Painel do mobilizador para demandas**
- Seção "Minhas Demandas" no painel existente
- Tela de detalhe do mobilizador

**Etapa 6 — Cron e notificações**
- `src/lib/email.ts` com Resend
- Templates de e-mail
- `src/app/api/cron/verificar-demandas/route.ts`
- Instruções de configuração no EasyPanel

---

## Pendências Resolvidas

- **Áreas pré-cadastradas:** Saúde, Educação, Habitação, Social, Segurança, Infraestrutura, Empreendedorismo
- **Reatribuição de responsável:** permitida pelo admin, registrada na linha do tempo
- **Notificação ao solicitante:** não implementada nesta fase
- **Serviço de e-mail:** Resend com camada de abstração para troca futura
- **Intervalo do cron:** 1 hora (`0 * * * *`)

## Pendências em Aberto

- Configurar domínio de envio de e-mail no Resend (DNS)
- Definir endereço de remetente (ex: `noreply@redemobiliza.com.br`)
