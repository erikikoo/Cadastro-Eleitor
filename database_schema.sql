-- Schema para DataLink - Gestão e Análise

-- Tabela de perfis com papéis (RBAC)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('vereador', 'chefe_de_gabinete', 'acessor', 'lider');
  ELSE
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'vereador';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'chefe_de_gabinete';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'acessor';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'lider';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role user_role NOT NULL DEFAULT 'lider',
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS para perfis
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Limpar políticas existentes para evitar erros de duplicidade
DROP POLICY IF EXISTS "Perfis visíveis para todos os usuários autenticados" ON profiles;
DROP POLICY IF EXISTS "Usuários podem criar seu próprio perfil" ON profiles;
DROP POLICY IF EXISTS "Apenas administradores podem atualizar perfis" ON profiles;
DROP POLICY IF EXISTS "Admins podem inserir perfis" ON profiles;
DROP POLICY IF EXISTS "Admins podem deletar perfis" ON profiles;

CREATE POLICY "Perfis visíveis para todos os usuários autenticados" ON profiles
  FOR SELECT USING (
    auth.role() = 'authenticated' AND 
    (email != 'paerik@gmail.com' OR id = auth.uid())
  );

CREATE POLICY "Usuários podem criar seu próprio perfil" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins podem inserir perfis" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('vereador', 'chefe_de_gabinete')
    )
  );

CREATE POLICY "Apenas administradores podem atualizar perfis" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('vereador', 'chefe_de_gabinete')
    )
  );

CREATE POLICY "Admins podem deletar perfis" ON profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('vereador', 'chefe_de_gabinete')
    )
  );

-- Tabela de cadastros (atualizada com relação ao criador se necessário)
CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo TEXT NOT NULL,
  cep TEXT NOT NULL,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  "dataNascimento" DATE,
  sexo TEXT CHECK (sexo IN ('M', 'F', 'Prefiro não dizer')),
  estado_civil TEXT,
  nome_conjuge TEXT,
  "possuiFilhos" BOOLEAN DEFAULT false,
  quantidade_filhos INTEGER DEFAULT 0,
  filhos JSONB DEFAULT '[]',
  assunto TEXT NOT NULL,
  responsavel TEXT NOT NULL,
  email TEXT,
  instagram TEXT,
  whatsapp TEXT,
  lembrete_contato_ativo BOOLEAN DEFAULT true,
  intervalo_contato_dias INTEGER DEFAULT 30,
  data_proximo_contato DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_por TEXT,
  updated_at TIMESTAMPTZ
);

-- Migração segura: Renomear createdAt para created_at e adicionar novas colunas se necessário
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='createdAt') THEN
    ALTER TABLE registrations RENAME COLUMN "createdAt" TO created_at;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='nome_completo') THEN
    ALTER TABLE registrations ADD COLUMN nome_completo TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='estado_civil') THEN
    ALTER TABLE registrations ADD COLUMN estado_civil TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='nome_conjuge') THEN
    ALTER TABLE registrations ADD COLUMN nome_conjuge TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='possuiFilhos') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='possuifilhos') THEN
      ALTER TABLE registrations RENAME COLUMN possuifilhos TO "possuiFilhos";
    ELSE
      ALTER TABLE registrations ADD COLUMN "possuiFilhos" BOOLEAN DEFAULT false;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='quantidade_filhos') THEN
    ALTER TABLE registrations ADD COLUMN quantidade_filhos INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='filhos') THEN
    ALTER TABLE registrations ADD COLUMN filhos JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='demands') THEN
    ALTER TABLE registrations ADD COLUMN demands JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='whatsapp') THEN
    ALTER TABLE registrations ADD COLUMN whatsapp TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='lembrete_contato_ativo') THEN
    ALTER TABLE registrations ADD COLUMN lembrete_contato_ativo BOOLEAN DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='intervalo_contato_dias') THEN
    ALTER TABLE registrations ADD COLUMN intervalo_contato_dias INTEGER DEFAULT 30;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='data_proximo_contato') THEN
    ALTER TABLE registrations ADD COLUMN data_proximo_contato DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='atualizado_por') THEN
    ALTER TABLE registrations ADD COLUMN atualizado_por TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='updated_at') THEN
    ALTER TABLE registrations ADD COLUMN updated_at TIMESTAMPTZ;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='createdAt') THEN
    ALTER TABLE profiles RENAME COLUMN "createdAt" TO created_at;
  END IF;

  -- Tornar campos de endereço e nascimento opcionais para suporte ao cadastro rápido
  ALTER TABLE registrations ALTER COLUMN logradouro DROP NOT NULL;
  ALTER TABLE registrations ALTER COLUMN numero DROP NOT NULL;
  ALTER TABLE registrations ALTER COLUMN bairro DROP NOT NULL;
  ALTER TABLE registrations ALTER COLUMN cidade DROP NOT NULL;
  ALTER TABLE registrations ALTER COLUMN estado DROP NOT NULL;
  ALTER TABLE registrations ALTER COLUMN "dataNascimento" DROP NOT NULL;
  ALTER TABLE registrations ALTER COLUMN estado_civil DROP NOT NULL;
  ALTER TABLE registrations ALTER COLUMN assunto DROP NOT NULL;
  
  -- Atualizar check de sexo (remover Outro se necessário, já que foi solicitado anteriormente)
  ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_sexo_check;
  
  -- Limpar dados que não batem com o novo check para evitar erro de violação
  UPDATE registrations SET sexo = 'Prefiro não dizer' WHERE sexo NOT IN ('M', 'F', 'Prefiro não dizer') OR sexo IS NULL;
  
  ALTER TABLE registrations ADD CONSTRAINT registrations_sexo_check CHECK (sexo IN ('M', 'F', 'Prefiro não dizer'));

  -- Tornar email e instagram opcionais se já existirem
  ALTER TABLE registrations ALTER COLUMN email DROP NOT NULL;
  ALTER TABLE registrations ALTER COLUMN instagram DROP NOT NULL;

  -- Forçar atualização do cache do esquema
  EXECUTE 'NOTIFY pgrst, ''reload schema''';
END $$;

-- Habilitar Row Level Security (RLS)
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- Limpar políticas existentes para registros
DROP POLICY IF EXISTS "Acesso total usuários autenticados" ON registrations;

-- Política de acesso: Todos os autenticados podem ver e inserir
CREATE POLICY "Acesso total usuários autenticados" ON registrations
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Índices
CREATE INDEX IF NOT EXISTS idx_registrations_bairro ON registrations(bairro);
CREATE INDEX IF NOT EXISTS idx_registrations_cidade ON registrations(cidade);
CREATE INDEX IF NOT EXISTS idx_registrations_assunto ON registrations(assunto);
CREATE INDEX IF NOT EXISTS idx_registrations_responsavel ON registrations(responsavel);

-- Gatilho para criação automática de perfil ao cadastrar usuário
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

-- Ativar o gatilho
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Gatilho para remoção automática do auth.user correspondente quando o perfil é deletado
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

-- BOOTSTRAP: Garante que o administrador e o usuário demo tenham o perfil correto
DO $$
DECLARE
  admin_id UUID;
  demo_id UUID;
BEGIN
  -- Admin Master
  SELECT id INTO admin_id FROM auth.users WHERE email = 'paerik@gmail.com';
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (admin_id, 'Administrador Master', 'paerik@gmail.com', 'vereador')
    ON CONFLICT (id) DO UPDATE SET role = 'vereador', email = 'paerik@gmail.com';
  END IF;

  -- Demo/Staff User
  SELECT id INTO demo_id FROM auth.users WHERE email = 'andersonmaroque@gmail.com';
  IF demo_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (demo_id, 'Anderson Maroque', 'andersonmaroque@gmail.com', 'chefe_de_gabinete')
    ON CONFLICT (id) DO UPDATE SET role = 'chefe_de_gabinete', email = 'andersonmaroque@gmail.com';
  END IF;

  -- Global refresh for safety
  UPDATE public.profiles SET role = 'vereador' WHERE id IN (SELECT id FROM auth.users WHERE email = 'paerik@gmail.com');
  UPDATE public.profiles SET role = 'chefe_de_gabinete' WHERE id IN (SELECT id FROM auth.users WHERE email = 'andersonmaroque@gmail.com');
END $$;

-- Inserção de dados de teste (opcional)
INSERT INTO registrations (cep, logradouro, numero, bairro, cidade, estado, "dataNascimento", sexo, assunto, responsavel, email, instagram, created_at)
VALUES 
('60123-456', 'Rua Exemplo', '100', 'Centro', 'Fortaleza', 'CE', '1985-10-15', 'M', 'Infraestrutura', 'João Silva', 'joao@email.com', '@joao_exemplo', now())
ON CONFLICT DO NOTHING;
