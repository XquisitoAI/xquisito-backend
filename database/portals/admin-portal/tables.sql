-- ============================================================
-- Admin Portal — Tablas principales
-- Portal: Acceso por restaurante (autenticación via Clerk)
-- Última verificación: 2026-05-14
-- ============================================================

-- CLIENTS — Empresa/cliente que contrata los servicios de Even
CREATE TABLE IF NOT EXISTS public.clients (
  id          uuid         NOT NULL DEFAULT gen_random_uuid(),
  name        varchar(255) NOT NULL,
  owner_name  varchar(255) NOT NULL,
  phone       varchar(50)  NOT NULL,
  email       varchar(255) NOT NULL,
  services    jsonb        DEFAULT '[]'::jsonb,
  active      boolean      DEFAULT true,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),
  table_count integer      DEFAULT 0,
  room_count  integer      DEFAULT 0,
  deleted     boolean      DEFAULT false,

  CONSTRAINT clients_pkey              PRIMARY KEY (id),
  CONSTRAINT clients_email_key         UNIQUE      (email),
  CONSTRAINT clients_email_format      CHECK       ((email)::text ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'::text),
  CONSTRAINT clients_name_length       CHECK       (char_length((name)::text) >= 2),
  CONSTRAINT clients_owner_name_length CHECK       (char_length((owner_name)::text) >= 2),
  CONSTRAINT chk_clients_table_count_range CHECK   ((table_count >= 0) AND (table_count <= 100)),
  CONSTRAINT chk_clients_room_count_range  CHECK   ((room_count  >= 0) AND (room_count  <= 500))
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_clients_email       ON public.clients (email);
CREATE INDEX IF NOT EXISTS idx_clients_active      ON public.clients (active);
CREATE INDEX IF NOT EXISTS idx_clients_created_at  ON public.clients (created_at);
CREATE INDEX IF NOT EXISTS idx_clients_table_count ON public.clients (table_count);
CREATE INDEX IF NOT EXISTS idx_clients_room_count  ON public.clients (room_count);

-- RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on clients"
  ON public.clients FOR ALL TO public USING (true) WITH CHECK (true);

-- USER ADMIN PORTAL — Usuarios del panel de administración (autenticación Clerk)
CREATE TABLE IF NOT EXISTS public.user_admin_portal (
  id            serial       NOT NULL,
  clerk_user_id varchar(50)  NOT NULL,
  email         varchar(255) NOT NULL,
  first_name    varchar(100),
  last_name     varchar(100),
  phone         varchar(20),
  is_active     boolean      DEFAULT true,
  created_at    timestamptz  DEFAULT now(),
  updated_at    timestamptz  DEFAULT now(),
  deleted       boolean      DEFAULT false,

  CONSTRAINT user_admin_portal_pkey              PRIMARY KEY (id),
  CONSTRAINT user_admin_portal_clerk_user_id_key UNIQUE      (clerk_user_id),
  CONSTRAINT user_admin_portal_email_key         UNIQUE      (email)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_user_admin_portal_clerk_id  ON public.user_admin_portal (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_admin_portal_email     ON public.user_admin_portal (email);
CREATE INDEX IF NOT EXISTS idx_user_admin_portal_is_active ON public.user_admin_portal (is_active);

-- RLS
ALTER TABLE public.user_admin_portal ENABLE ROW LEVEL SECURITY;

-- Acceso amplio para el propio usuario (clerk_user_id via JWT sub)
CREATE POLICY "Users can only access their own profile"
  ON public.user_admin_portal FOR ALL TO public
  USING ((clerk_user_id)::text = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));

CREATE POLICY "user_admin_portal_insert_policy"
  ON public.user_admin_portal FOR INSERT TO public
  WITH CHECK (
    (clerk_user_id IS NOT NULL) AND (email IS NOT NULL)
    AND (length((clerk_user_id)::text) > 10)
    AND ((email)::text ~~ '%@%'::text)
  );

CREATE POLICY "user_admin_portal_select_policy"
  ON public.user_admin_portal FOR SELECT TO public
  USING (
    ((clerk_user_id)::text = (current_setting('rls.clerk_user_id'::text, true))::text)
    OR current_setting('rls.clerk_user_id'::text, true) IS NULL
  );

CREATE POLICY "user_admin_portal_update_policy"
  ON public.user_admin_portal FOR UPDATE TO public
  USING (
    ((clerk_user_id)::text = (current_setting('rls.clerk_user_id'::text, true))::text)
    OR current_setting('rls.clerk_user_id'::text, true) IS NULL
  );

-- Soft delete — nunca borrar registros
CREATE POLICY "user_admin_portal_delete_policy"
  ON public.user_admin_portal FOR DELETE TO public USING (false);

-- PENDING INVITATIONS — Invitaciones pendientes para nuevos usuarios del portal
CREATE TABLE IF NOT EXISTS public.pending_invitations (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  client_id   uuid        NOT NULL,
  email       varchar     NOT NULL,
  client_name varchar     NOT NULL,
  invited_by  varchar     NOT NULL,
  invited_at  timestamptz DEFAULT now(),
  used_at     timestamptz,
  status      varchar(20) DEFAULT 'pending',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  CONSTRAINT pending_invitations_pkey          PRIMARY KEY (id),
  CONSTRAINT fk_invitations_client             FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT unique_pending_email              UNIQUE      (email, status),
  CONSTRAINT pending_invitations_email_check   CHECK       ((email)::text ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+[.][A-Za-z]+$'::text),
  CONSTRAINT pending_invitations_client_name_check CHECK   (char_length((client_name)::text) >= 2),
  CONSTRAINT pending_invitations_status_check  CHECK       ((status)::text = ANY ((ARRAY['pending','registered','expired'])::text[]))
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_pending_invitations_client_id ON public.pending_invitations (client_id);
CREATE INDEX IF NOT EXISTS idx_pending_invitations_email     ON public.pending_invitations (email);
CREATE INDEX IF NOT EXISTS idx_pending_invitations_status    ON public.pending_invitations (status);

-- RLS
ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view invitations"
  ON public.pending_invitations FOR SELECT TO public USING (true);

CREATE POLICY "Authenticated users can insert invitations"
  ON public.pending_invitations FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Authenticated users can update invitations"
  ON public.pending_invitations FOR UPDATE TO public USING (true);
