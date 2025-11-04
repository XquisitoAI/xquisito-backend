-- ===============================================
-- SCRIPT: Crear tabla pending_invitations
-- DESCRIPCIÓN: Sistema de whitelist para invitaciones por email
-- FECHA: 3 Noviembre 2025
-- ===============================================

-- Crear tabla para gestión de invitaciones
CREATE TABLE public.pending_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  email character varying NOT NULL CHECK (email::text ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'::text),
  client_name character varying NOT NULL CHECK (char_length(client_name::text) >= 2),
  invited_by character varying NOT NULL, -- user_id de Clerk del super admin
  invited_at timestamp with time zone DEFAULT now(),
  used_at timestamp with time zone NULL,
  status character varying(20) DEFAULT 'pending' CHECK (status IN ('pending', 'registered', 'expired')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT pending_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT fk_invitations_client FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE,
  CONSTRAINT unique_pending_email UNIQUE (email, status) -- Solo una invitación pending por email
);

-- Índices para optimizar consultas
CREATE INDEX idx_pending_invitations_email ON public.pending_invitations(email);
CREATE INDEX idx_pending_invitations_status ON public.pending_invitations(status);
CREATE INDEX idx_pending_invitations_client_id ON public.pending_invitations(client_id);

-- RLS (Row Level Security) - Habilitar para mayor seguridad
ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

-- Política: Solo usuarios autenticados pueden ver invitaciones
CREATE POLICY "Authenticated users can view invitations" ON public.pending_invitations
  FOR SELECT USING (true);

-- Política: Solo usuarios autenticados pueden insertar invitaciones
CREATE POLICY "Authenticated users can insert invitations" ON public.pending_invitations
  FOR INSERT WITH CHECK (true);

-- Política: Solo usuarios autenticados pueden actualizar invitaciones
CREATE POLICY "Authenticated users can update invitations" ON public.pending_invitations
  FOR UPDATE USING (true);

-- ===============================================
-- COMENTARIOS EN LA TABLA
-- ===============================================

COMMENT ON TABLE public.pending_invitations IS 'Tabla para gestionar invitaciones por email al admin-portal';
COMMENT ON COLUMN public.pending_invitations.id IS 'Identificador único de la invitación';
COMMENT ON COLUMN public.pending_invitations.client_id IS 'ID del cliente asociado (FK a clients)';
COMMENT ON COLUMN public.pending_invitations.email IS 'Email autorizado para registro';
COMMENT ON COLUMN public.pending_invitations.client_name IS 'Nombre del cliente para mostrar en invitación';
COMMENT ON COLUMN public.pending_invitations.invited_by IS 'User ID de Clerk del super admin que envió la invitación';
COMMENT ON COLUMN public.pending_invitations.invited_at IS 'Fecha y hora cuando se envió la invitación';
COMMENT ON COLUMN public.pending_invitations.used_at IS 'Fecha y hora cuando se completó el registro (NULL si no se ha usado)';
COMMENT ON COLUMN public.pending_invitations.status IS 'Estado de la invitación: pending, registered, expired';

-- ===============================================
-- DATOS DE EJEMPLO (OPCIONAL - COMENTAR EN PRODUCCIÓN)
-- ===============================================

-- Descomentar para insertar datos de prueba
/*
INSERT INTO public.pending_invitations (client_id, email, client_name, invited_by) VALUES
(
  (SELECT id FROM public.clients LIMIT 1),
  'test@example.com',
  'Restaurante Test',
  'clerk_user_test_123'
);
*/

-- ===============================================
-- VERIFICACIÓN
-- ===============================================

-- Verificar que la tabla se creó correctamente
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'pending_invitations'
ORDER BY ordinal_position;

-- Verificar constraints
SELECT
  conname as constraint_name,
  contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'public.pending_invitations'::regclass;