-- Migración: create_pos_order_sync
-- Descripción: Crea tabla pos_order_sync para sincronización de órdenes con POS

CREATE TABLE pos_order_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES pos_integrations(id) ON DELETE CASCADE,

  -- Referencias a órdenes locales
  local_order_id UUID NOT NULL,
  local_order_type VARCHAR(50) NOT NULL,  -- 'table_order', 'tap_orders_and_pay', etc.

  -- IDs del POS
  pos_order_id VARCHAR(255),              -- ID de la orden en el POS
  pos_table_id VARCHAR(255),              -- ID de mesa en el POS

  -- Estado de sincronización
  sync_status VARCHAR(20) NOT NULL,       -- 'pending', 'synced', 'failed', 'closed'
  sync_direction VARCHAR(10) NOT NULL,    -- 'push', 'pull'
  sync_error TEXT,
  last_synced_at TIMESTAMPTZ,

  -- Metadata para debugging
  request_payload JSONB,
  response_payload JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(integration_id, local_order_id)
);
