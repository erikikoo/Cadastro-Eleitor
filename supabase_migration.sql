-- EXECUTE ESTE SQL NO EDITOR DE SQL DO SEU DASHBOARD SUPABASE
-- Para corrigir o erro "Could not find the 'data_proximo_contato' column" e o erro "invalid input value for enum user_role: 'acessor'"

-- 1. Garante que o tipo ENUM user_role no banco aceita o valor 'acessor'
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'acessor';

-- 2. Atualiza colunas necessárias na tabela registrations
ALTER TABLE registrations 
ADD COLUMN IF NOT EXISTS whatsapp TEXT,
ADD COLUMN IF NOT EXISTS estado_civil TEXT,
ADD COLUMN IF NOT EXISTS nome_conjuge TEXT,
ADD COLUMN IF NOT EXISTS lembrete_contato_ativo BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS intervalo_contato_dias INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS data_proximo_contato DATE,
ADD COLUMN IF NOT EXISTS google_contact_event_id TEXT,
ADD COLUMN IF NOT EXISTS possui_filhos BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS filhos JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS demands JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS atualizado_por TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 3. Reconstrói a função de gatilho para capturar e persistir o papel (role) corretamente na criação do usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    CASE 
      WHEN new.raw_user_meta_data->>'role' = 'vereador' THEN 'vereador'::user_role
      WHEN new.raw_user_meta_data->>'role' = 'chefe_de_gabinete' THEN 'chefe_de_gabinete'::user_role
      WHEN new.raw_user_meta_data->>'role' = 'acessor' THEN 'acessor'::user_role
      WHEN new.raw_user_meta_data->>'role' = 'lider' THEN 'lider'::user_role
      WHEN new.email = 'paerik@gmail.com' THEN 'vereador'::user_role 
      WHEN new.email = 'andersonmaroque@gmail.com' THEN 'chefe_de_gabinete'::user_role
      ELSE 'lider'::user_role 
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    updated_at = now();
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Altera com segurança a chave estrangeira em registrations para ON DELETE SET NULL
-- Primeiro, garante que a coluna created_by existe na tabela registrations
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Isso permite deletar usuários do auth.users sem causar violação de chave estrangeira nas tabelas de registro
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tc.constraint_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_name = 'registrations'
          AND kcu.column_name = 'created_by'
    LOOP
        EXECUTE 'ALTER TABLE registrations DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
END $$;

ALTER TABLE registrations 
  ADD CONSTRAINT registrations_created_by_fkey 
  FOREIGN KEY (created_by) 
  REFERENCES auth.users(id) 
  ON DELETE SET NULL;

-- 5. Criar gatilho para remoção automática do auth.user correspondente quando o perfil é deletado na tabela profiles
CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = old.id) THEN
    DELETE FROM auth.users WHERE id = old.id;
  END IF;
  RETURN old;
EXCEPTION WHEN OTHERS THEN
  RETURN old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;
CREATE TRIGGER on_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_delete_user();

-- 6. Adiciona suporte a soft-delete para perfis (operadores)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- 7. Criar a tabela de demandas (demands) relacional
CREATE TABLE IF NOT EXISTS public.demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  assunto TEXT NOT NULL,
  data_pedido DATE NOT NULL,
  atendido BOOLEAN DEFAULT false,
  data_atendimento DATE,
  prazo_retorno_dias INTEGER DEFAULT 0,
  data_prevista_retorno DATE,
  retorno_realizado BOOLEAN DEFAULT false,
  observacoes TEXT,
  google_event_id TEXT,
  files JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir todas as colunas necessárias na tabela demands se ela já existia antes
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS registration_id UUID REFERENCES public.registrations(id) ON DELETE CASCADE;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS assunto TEXT NOT NULL DEFAULT 'Geral';
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS data_pedido DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS atendido BOOLEAN DEFAULT false;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS data_atendimento DATE;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS prazo_retorno_dias INTEGER DEFAULT 0;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS data_prevista_retorno DATE;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS retorno_realizado BOOLEAN DEFAULT false;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]';
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.demands ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Habilitar RLS para tabela de demandas
ALTER TABLE public.demands ENABLE ROW LEVEL SECURITY;

-- Criar política de acesso total para usuários autenticados na tabela demands
DROP POLICY IF EXISTS "Acesso total usuários autenticados na tabela demands" ON public.demands;
CREATE POLICY "Acesso total usuários autenticados na tabela demands" ON public.demands
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Criar índices de busca para demandas
CREATE INDEX IF NOT EXISTS idx_demands_registration_id ON public.demands(registration_id);
CREATE INDEX IF NOT EXISTS idx_demands_atendido ON public.demands(atendido);
CREATE INDEX IF NOT EXISTS idx_demands_retorno_realizado ON public.demands(retorno_realizado);

