-- SCRIPT PARA REINICIAR O BANCO DE DADOS (EXECUTAR NO SQL EDITOR DO SUPABASE)
-- CUIDADO: Isso apaga todos os dados existentes!

-- 1. Limpar dependências
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_delete_user CASCADE;

-- 2. Remover tabelas existentes
DROP TABLE IF EXISTS public.registrations CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 3. Recriar Tipos
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

-- 4. Recriar Tabela de Perfis
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role user_role NOT NULL DEFAULT 'lider',
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Recriar Tabela de Registros (Base de Dados de Contatos/Assuntos)
CREATE TABLE public.registrations (
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
  demands JSONB DEFAULT '[]',
  assunto TEXT,
  responsavel TEXT NOT NULL,
  email TEXT,
  instagram TEXT,
  whatsapp TEXT,
  lembrete_contato_ativo BOOLEAN DEFAULT true,
  intervalo_contato_dias INTEGER DEFAULT 30,
  data_proximo_contato DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança
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

CREATE POLICY "Acesso total usuários autenticados" ON registrations
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 6. Trigger para criação automática de perfil
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
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para remoção automática do auth.user correspondente quando o perfil é deletado
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

-- 7. BOOTSTRAP: Admin e Demo
DO $$
DECLARE
  admin_id UUID;
  demo_id UUID;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'paerik@gmail.com';
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (admin_id, 'Administrador Master', 'paerik@gmail.com', 'vereador')
    ON CONFLICT (id) DO UPDATE SET role = 'vereador', email = 'paerik@gmail.com';
  END IF;

  SELECT id INTO demo_id FROM auth.users WHERE email = 'andersonmaroque@gmail.com';
  IF demo_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (demo_id, 'Anderson Maroque', 'andersonmaroque@gmail.com', 'chefe_de_gabinete')
    ON CONFLICT (id) DO UPDATE SET role = 'chefe_de_gabinete', email = 'andersonmaroque@gmail.com';
  END IF;
END $$;
