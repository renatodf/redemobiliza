-- ============================================================
-- REDE MOBILIZA — SQL de setup do banco Supabase
-- Executar no Supabase SQL Editor após prisma migrate dev
-- ============================================================

-- ------------------------------------------------------------
-- 1. Função auth.uid_gabinete()
-- Retorna o gabineteId do usuário autenticado via PostgREST.
-- SET search_path = '' previne injection via SECURITY DEFINER.
-- ORDER BY garante resultado determinístico (usuários têm 1 gabinete).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth.uid_gabinete()
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
  USING (id = auth.uid_gabinete());

-- UsuarioGabinete: usuário vê apenas seus próprios vínculos
CREATE POLICY "usuario_gabinete_select" ON "UsuarioGabinete"
  FOR SELECT TO authenticated
  USING ("userId" = auth.uid()::text);

-- Pessoa: leitura e escrita restritas ao próprio gabinete
CREATE POLICY "pessoa_select" ON "Pessoa"
  FOR SELECT TO authenticated
  USING ("gabineteId" = auth.uid_gabinete());

CREATE POLICY "pessoa_write" ON "Pessoa"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- Segmento
CREATE POLICY "segmento_select" ON "Segmento"
  FOR SELECT TO authenticated
  USING ("gabineteId" = auth.uid_gabinete());

CREATE POLICY "segmento_write" ON "Segmento"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- Regiao
CREATE POLICY "regiao_all" ON "Regiao"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- Profissao
CREATE POLICY "profissao_all" ON "Profissao"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- VinculoRede
CREATE POLICY "vinculo_rede_all" ON "VinculoRede"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- PessoaSegmento: sem gabineteId — join via Pessoa do mesmo gabinete
CREATE POLICY "pessoa_segmento_all" ON "PessoaSegmento"
  FOR ALL TO authenticated
  USING (
    "pessoaId" IN (
      SELECT id FROM "Pessoa" WHERE "gabineteId" = auth.uid_gabinete()
    )
  );

-- LinkComposto
CREATE POLICY "link_composto_all" ON "LinkComposto"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

-- LogSuporte: sem política para authenticated.
-- Super-admin usa SUPABASE_SERVICE_ROLE_KEY (bypassa RLS).
-- Nenhum usuário autenticado normal acessa esta tabela via PostgREST.

-- ObservacaoPessoa: acesso restrito ao próprio gabinete
CREATE POLICY "observacao_pessoa_select" ON "ObservacaoPessoa"
  FOR SELECT TO authenticated
  USING ("gabineteId" = auth.uid_gabinete());

CREATE POLICY "observacao_pessoa_write" ON "ObservacaoPessoa"
  FOR ALL TO authenticated
  USING ("gabineteId" = auth.uid_gabinete())
  WITH CHECK ("gabineteId" = auth.uid_gabinete());

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

-- Regiao: nome único entre regiões ativas
CREATE UNIQUE INDEX IF NOT EXISTS "Regiao_gabineteId_nome_ativo_idx"
  ON "Regiao"("gabineteId", "nome") WHERE ativa = true;

-- Profissao: nome único entre profissões ativas
CREATE UNIQUE INDEX IF NOT EXISTS "Profissao_gabineteId_nome_ativo_idx"
  ON "Profissao"("gabineteId", "nome") WHERE ativa = true;

-- VinculoRede: pessoaId único por gabinete QUANDO não tem indicador.
-- NULL != NULL em UNIQUE convencional — este índice resolve a race condition.
CREATE UNIQUE INDEX IF NOT EXISTS "VinculoRede_gabineteId_pessoaId_sem_indicador_idx"
  ON "VinculoRede"("gabineteId", "pessoaId") WHERE "indicadoPorId" IS NULL;
