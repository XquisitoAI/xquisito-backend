-- Migración: create_pos_menu_mapping
-- Descripción: Crea tabla pos_menu_mapping para mapear ítems del menú con códigos POS

CREATE TABLE pos_menu_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES pos_integrations(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,

  -- Código del ítem en el POS
  pos_item_id VARCHAR(255) NOT NULL,      -- ID/código del ítem en el POS
  pos_item_code VARCHAR(100),             -- Código alternativo del ítem

  -- Sincronización de precios
  price_sync BOOLEAN DEFAULT false,       -- ¿Sincronizar precio desde POS?

  is_synced BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(integration_id, menu_item_id)
);
