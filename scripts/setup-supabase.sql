-- ============================================================
-- REDE MOBILIZA — SQL de setup do banco Supabase
-- Executar no Supabase SQL Editor após prisma migrate dev
-- ============================================================

-- ------------------------------------------------------------
-- 1. Função public.uid_gabinete()
-- Retorna o gabineteId do usuário autenticado via PostgREST.
-- Fica no schema public (não em auth): o Supabase revogou CREATE no
-- schema auth do role postgres (usado pela conexão direta/service-role),
-- então funções auxiliares de RLS devem viver em public — não altera o
-- nível de segurança da função, que continua SECURITY DEFINER.
-- SET search_path = '' previne injection via SECURITY DEFINER (garante
-- que a função só resolve nomes de objeto pelos schemas qualificados
-- explicitamente no corpo, nunca por um search_path manipulável).
-- ORDER BY garante resultado determinístico (usuários têm 1 gabinete).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.uid_gabinete()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT "gabineteId"
  FROM public."UsuarioGabinete"
  WHERE "userId" = auth.uid()::text
  ORDER BY "gabineteId"
  LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 2. Habilitar RLS em todas as tabelas
-- Sem política explícita = acesso negado por padrão (deny all).
-- Prisma usa conexão direta como postgres e bypassa RLS.
-- Estas políticas protegem apenas acesso direto via PostgREST/SDK.
-- ------------------------------------------------------------
ALTER TABLE "Gabinete"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsuarioGabinete" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pessoa"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Segmento"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Regiao"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Profissao"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VinculoRede"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PessoaSegmento"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LinkComposto"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LogSuporte"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ObservacaoPessoa"   ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Políticas RLS para role authenticated
-- ------------------------------------------------------------

-- Gabinete: membro autenticado lê apenas seu próprio gabinete
CREATE POLICY "gabinete_select" ON "Gabinete"
  FOR SELECT TO authenticated
  USING (id = public.uid_gabinete());

-- UsuarioGabinete: usuário vê apenas seus próprios vínculos
CREATE POLICY "usuario_gabinete_select" ON "UsuarioGabinete"
  FOR SELECT TO authenticated
  USING ("userId" = auth.uid()::text);

-- Pessoa: leitura e escrita restritas ao próprio gabinete
CREATE POLICY "pessoa_select" ON "Pessoa"
  FOR SELECT TO authenticated
  USING ("gabineteId" = public.uid_gabinete());

CREATE POLICY "pessoa_write" ON "Pessoa"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- Segmento
CREATE POLICY "segmento_select" ON "Segmento"
  FOR SELECT TO authenticated
  USING ("gabineteId" = public.uid_gabinete());

CREATE POLICY "segmento_write" ON "Segmento"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- Regiao
CREATE POLICY "regiao_all" ON "Regiao"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- Profissao
CREATE POLICY "profissao_all" ON "Profissao"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- VinculoRede
CREATE POLICY "vinculo_rede_all" ON "VinculoRede"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- PessoaSegmento: sem gabineteId — join via Pessoa do mesmo gabinete
CREATE POLICY "pessoa_segmento_all" ON "PessoaSegmento"
  FOR ALL TO authenticated
  USING (
    "pessoaId" IN (
      SELECT id FROM "Pessoa" WHERE "gabineteId" = public.uid_gabinete()
    )
  );

-- LinkComposto
CREATE POLICY "link_composto_all" ON "LinkComposto"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- LogSuporte: sem política para authenticated.
-- Super-admin usa SUPABASE_SERVICE_ROLE_KEY (bypassa RLS).
-- Nenhum usuário autenticado normal acessa esta tabela via PostgREST.

-- ObservacaoPessoa: acesso restrito ao próprio gabinete
CREATE POLICY "observacao_pessoa_select" ON "ObservacaoPessoa"
  FOR SELECT TO authenticated
  USING ("gabineteId" = public.uid_gabinete());

CREATE POLICY "observacao_pessoa_write" ON "ObservacaoPessoa"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- ------------------------------------------------------------
-- 4. Índices parciais para unicidade com soft delete
-- Substitui @@unique do Prisma onde há deleção lógica.
-- ------------------------------------------------------------

-- Segmento: nome único entre segmentos com status = 'ativo'
CREATE UNIQUE INDEX IF NOT EXISTS "Segmento_gabineteId_nome_ativo_idx"
  ON "Segmento"("gabineteId", "nome") WHERE status = 'ativo';

-- Segmento: slug único entre segmentos com status = 'ativo'
CREATE UNIQUE INDEX IF NOT EXISTS "Segmento_gabineteId_slug_ativo_idx"
  ON "Segmento"("gabineteId", "slug") WHERE status = 'ativo';

-- Regiao: nome único entre regiões ativas (case-insensitive, alinhado com
-- o findFirst de criarRegiao que usa mode: 'insensitive')
CREATE UNIQUE INDEX IF NOT EXISTS "Regiao_gabineteId_nome_ativo_idx"
  ON "Regiao"("gabineteId", lower(nome)) WHERE ativa = true;

-- Profissao: nome único entre profissões ativas (case-insensitive, alinhado
-- com o findFirst de criarProfissao que usa mode: 'insensitive')
CREATE UNIQUE INDEX IF NOT EXISTS "Profissao_gabineteId_nome_ativo_idx"
  ON "Profissao"("gabineteId", lower(nome)) WHERE ativa = true;

-- VinculoRede: pessoaId único por gabinete QUANDO não tem indicador.
-- NULL != NULL em UNIQUE convencional — este índice resolve a race condition.
CREATE UNIQUE INDEX IF NOT EXISTS "VinculoRede_gabineteId_pessoaId_sem_indicador_idx"
  ON "VinculoRede"("gabineteId", "pessoaId") WHERE "indicadoPorId" IS NULL;

-- ------------------------------------------------------------
-- 5. Políticas RLS para as 7 tabelas descobertas sem cobertura
-- (achado 1.1 da auditoria de terceira ordem, 2026-07-17): RLS estava
-- habilitado (ALTER TABLE ... ENABLE ROW LEVEL SECURITY já rodado, provável
-- ação em massa do Security Advisor do Supabase) em produção e staging,
-- mas nenhuma política — nem as das seções 2-3 acima, nem estas — existia
-- de fato em nenhum dos dois bancos até esta migração ser aplicada.
-- ------------------------------------------------------------

-- AreaDemanda: escopo direto por gabineteId
CREATE POLICY "area_demanda_all" ON "AreaDemanda"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- Demanda: escopo direto por gabineteId
CREATE POLICY "demanda_all" ON "Demanda"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- MovimentacaoDemanda: sem gabineteId — join via Demanda do mesmo gabinete
CREATE POLICY "movimentacao_demanda_all" ON "MovimentacaoDemanda"
  FOR ALL TO authenticated
  USING (
    "demandaId" IN (
      SELECT id FROM "Demanda" WHERE "gabineteId" = public.uid_gabinete()
    )
  );

-- ConfiguracaoSistema: escopo direto por gabineteId (coluna única)
CREATE POLICY "configuracao_sistema_all" ON "ConfiguracaoSistema"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- AreaColocacao: escopo direto por gabineteId
CREATE POLICY "area_colocacao_all" ON "AreaColocacao"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

-- BancoTalentos: sem gabineteId — join via Pessoa do mesmo gabinete
CREATE POLICY "banco_talentos_all" ON "BancoTalentos"
  FOR ALL TO authenticated
  USING (
    "pessoaId" IN (
      SELECT id FROM "Pessoa" WHERE "gabineteId" = public.uid_gabinete()
    )
  );

-- BancoTalentosArea: sem gabineteId — join via AreaColocacao do mesmo gabinete
CREATE POLICY "banco_talentos_area_all" ON "BancoTalentosArea"
  FOR ALL TO authenticated
  USING (
    "areaColocacaoId" IN (
      SELECT id FROM "AreaColocacao" WHERE "gabineteId" = public.uid_gabinete()
    )
  );

ALTER TABLE "AreaDemanda"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Demanda"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MovimentacaoDemanda"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConfiguracaoSistema"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AreaColocacao"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BancoTalentos"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BancoTalentosArea"    ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 6. Política RLS para TelefoneExtra (Fase 1 da importação Izalci,
-- docs/superpowers/specs/2026-07-18-importacao-izalci-fase1-fundacao-schema-design.md)
-- ------------------------------------------------------------

-- TelefoneExtra: escopo direto por gabineteId (mesmo padrão de escopo direto
-- por gabineteId das tabelas da seção 5, ex.: area_demanda_all/regiao_all —
-- não o de ObservacaoPessoa, que usa select/write como duas policies separadas)
CREATE POLICY "telefone_extra_all" ON "TelefoneExtra"
  FOR ALL TO authenticated
  USING ("gabineteId" = public.uid_gabinete())
  WITH CHECK ("gabineteId" = public.uid_gabinete());

ALTER TABLE "TelefoneExtra" ENABLE ROW LEVEL SECURITY;
