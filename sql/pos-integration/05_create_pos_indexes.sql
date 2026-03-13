-- Migración: create_pos_indexes
-- Descripción: Crea índices para optimizar búsquedas en tablas POS

-- Índices para pos_integrations
CREATE INDEX idx_pos_integrations_branch ON pos_integrations(branch_id);
CREATE INDEX idx_pos_integrations_active ON pos_integrations(is_active);

-- Índices para pos_order_sync
CREATE INDEX idx_pos_order_sync_integration ON pos_order_sync(integration_id);
CREATE INDEX idx_pos_order_sync_local_order ON pos_order_sync(local_order_id, local_order_type);
CREATE INDEX idx_pos_order_sync_status ON pos_order_sync(sync_status);
CREATE INDEX idx_pos_order_sync_pos_order ON pos_order_sync(pos_order_id);

-- Índices para pos_menu_mapping
CREATE INDEX idx_pos_menu_mapping_integration ON pos_menu_mapping(integration_id);
CREATE INDEX idx_pos_menu_mapping_item ON pos_menu_mapping(menu_item_id);
