-- Migración: create_pos_integrations
-- Descripción: Crea tabla pos_integrations para configuración de POS por sucursal

CREATE TABLE pos_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES pos_providers(id),

  -- Credenciales específicas de esta sucursal
  credentials JSONB NOT NULL,

  -- Configuraciones específicas
  settings JSONB NOT NULL,

  -- Endpoints específicos
  endpoints JSONB NOT NULL,

  -- Estado
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_status VARCHAR(20),
  sync_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Una integración por proveedor por sucursal
  UNIQUE(branch_id, provider_id)
);
