-- ============================================================
-- POS Integration — Tablas de integración con sistemas POS externos
-- (actualmente: Soft Restaurant, Symphony y otros)
-- Compartido a nivel plataforma (no específico de un servicio)
-- Última verificación: 2026-05-14
-- ============================================================

-- POS PROVIDERS — Catálogo de sistemas POS soportados
CREATE TABLE IF NOT EXISTS public.pos_providers (
  id                 uuid    NOT NULL DEFAULT gen_random_uuid(),
  code               varchar NOT NULL,
  name               varchar NOT NULL,
  credentials_schema jsonb   NOT NULL,
  settings_schema    jsonb   NOT NULL,
  endpoint_schema    jsonb   NOT NULL,
  sync_mode          varchar NOT NULL,
  api_type           varchar DEFAULT 'rest',
  requires_agent     boolean DEFAULT false,
  is_active          boolean DEFAULT true,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),

  CONSTRAINT pos_providers_pkey PRIMARY KEY (id),
  CONSTRAINT pos_providers_code_key UNIQUE (code)
);

ALTER TABLE public.pos_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_providers_select_all"
  ON public.pos_providers FOR SELECT TO public USING (true);

-- POS INTEGRATIONS — Configuración de POS activa por sucursal
CREATE TABLE IF NOT EXISTS public.pos_integrations (
  id          uuid    NOT NULL DEFAULT gen_random_uuid(),
  branch_id   uuid    NOT NULL,
  provider_id uuid    NOT NULL,
  credentials jsonb   NOT NULL,
  settings    jsonb   NOT NULL,
  endpoints   jsonb   NOT NULL,
  is_active   boolean DEFAULT true,
  sync_status varchar,
  sync_error  text,
  last_sync_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  CONSTRAINT pos_integrations_pkey PRIMARY KEY (id),
  CONSTRAINT pos_integrations_branch_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT pos_integrations_provider_fkey FOREIGN KEY (provider_id) REFERENCES public.pos_providers(id)
);

ALTER TABLE public.pos_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_integrations_all_service"
  ON public.pos_integrations FOR ALL TO public USING (true) WITH CHECK (true);

-- POS ORDER SYNC — Log de sincronización de órdenes con el POS
CREATE TABLE IF NOT EXISTS public.pos_order_sync (
  id               uuid    NOT NULL DEFAULT gen_random_uuid(),
  integration_id   uuid    NOT NULL,
  local_order_id   uuid    NOT NULL,
  local_order_type varchar NOT NULL,
  pos_order_id     varchar,
  pos_table_id     varchar,
  pos_check_number bigint,
  sync_status      varchar NOT NULL,
  sync_direction   varchar NOT NULL,
  sync_error       text,
  last_synced_at   timestamptz,
  request_payload  jsonb,
  response_payload jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),

  CONSTRAINT pos_order_sync_pkey PRIMARY KEY (id),
  CONSTRAINT pos_order_sync_integration_fkey FOREIGN KEY (integration_id) REFERENCES public.pos_integrations(id)
);

ALTER TABLE public.pos_order_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_order_sync_all_service"
  ON public.pos_order_sync FOR ALL TO public USING (true) WITH CHECK (true);

-- POS MENU MAPPING — Mapeo de items Xquisito ↔ POS
CREATE TABLE IF NOT EXISTS public.pos_menu_mapping (
  id             uuid    NOT NULL DEFAULT gen_random_uuid(),
  integration_id uuid    NOT NULL,
  menu_item_id   integer NOT NULL,
  pos_item_id    varchar NOT NULL,
  pos_item_name  varchar,
  sync_direction varchar DEFAULT 'both',
  price_sync     boolean DEFAULT false,
  is_synced      boolean DEFAULT false,
  last_synced_at timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),

  CONSTRAINT pos_menu_mapping_pkey PRIMARY KEY (id),
  CONSTRAINT pos_menu_mapping_integration_fkey FOREIGN KEY (integration_id) REFERENCES public.pos_integrations(id),
  CONSTRAINT pos_menu_mapping_item_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id),
  CONSTRAINT pos_menu_mapping_unique UNIQUE (integration_id, menu_item_id)
);

ALTER TABLE public.pos_menu_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_menu_mapping_all_service"
  ON public.pos_menu_mapping FOR ALL TO public USING (true) WITH CHECK (true);

-- POS SECTION MAPPING — Mapeo de secciones Xquisito ↔ grupos POS
CREATE TABLE IF NOT EXISTS public.pos_section_mapping (
  id               uuid    NOT NULL DEFAULT gen_random_uuid(),
  integration_id   uuid    NOT NULL,
  menu_section_id  integer NOT NULL,
  pos_group_id     varchar NOT NULL,
  pos_group_name   varchar,
  sync_direction   varchar DEFAULT 'both',
  last_synced_at   timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),

  CONSTRAINT pos_section_mapping_pkey PRIMARY KEY (id),
  CONSTRAINT pos_section_mapping_integration_fkey FOREIGN KEY (integration_id) REFERENCES public.pos_integrations(id),
  CONSTRAINT pos_section_mapping_section_fkey FOREIGN KEY (menu_section_id) REFERENCES public.menu_sections(id),
  CONSTRAINT pos_section_mapping_unique UNIQUE (integration_id, menu_section_id)
);

ALTER TABLE public.pos_section_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on pos_section_mapping"
  ON public.pos_section_mapping FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read pos_section_mapping"
  ON public.pos_section_mapping FOR SELECT TO authenticated USING (true);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_pos_integrations_branch ON public.pos_integrations (branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_sync_local ON public.pos_order_sync (local_order_id);
CREATE INDEX IF NOT EXISTS idx_pos_menu_mapping_item ON public.pos_menu_mapping (menu_item_id);
