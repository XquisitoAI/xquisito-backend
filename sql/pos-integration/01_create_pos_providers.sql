-- Migración: create_pos_providers
-- Descripción: Crea tabla pos_providers y agrega datos iniciales de proveedores

-- Crear tabla pos_providers
CREATE TABLE pos_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  credentials_schema JSONB NOT NULL,
  settings_schema JSONB NOT NULL,
  endpoint_schema JSONB NOT NULL,
  sync_mode VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar Symphony provider (OAuth 2.0 con PKCE)
INSERT INTO pos_providers (code, name, credentials_schema, settings_schema, endpoint_schema, sync_mode)
VALUES (
  'symphony',
  'Oracle MICROS Simphony',
  '{
    "type": "object",
    "required": ["client_id", "username", "password", "orgname"],
    "properties": {
      "client_id": {"type": "string", "description": "OAuth 2.0 Client ID generado al crear la cuenta API"},
      "username": {"type": "string", "description": "Usuario de la cuenta API de Symphony"},
      "password": {"type": "string", "description": "Contraseña de la cuenta API de Symphony"},
      "orgname": {"type": "string", "description": "Nombre corto de la organización en Symphony"}
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["loc_ref", "rvc_ref", "employee_ref", "order_type_ref"],
    "properties": {
      "loc_ref": {"type": "string", "description": "Location Reference (locRef) - identificador de ubicación"},
      "rvc_ref": {"type": "integer", "description": "Revenue Center Reference (rvcRef) - ID del centro de ingresos"},
      "employee_ref": {"type": "integer", "description": "Employee Reference (checkEmployeeRef) - ID del empleado para registrar órdenes"},
      "order_type_ref": {"type": "integer", "description": "Order Type Reference (orderTypeRef) - tipo de orden (dine-in, takeout, etc.)"},
      "order_channel_ref": {"type": "integer", "description": "Order Channel Reference (opcional) - canal de la orden"}
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["base_url"],
    "properties": {
      "base_url": {"type": "string", "description": "Symphony API Base URL"}
    }
  }'::jsonb,
  'push'
);

-- Insertar Wansoft provider (inactivo)
INSERT INTO pos_providers (code, name, credentials_schema, settings_schema, endpoint_schema, sync_mode, is_active)
VALUES (
  'wansoft',
  'Wansoft POS',
  '{
    "type": "object",
    "required": ["username", "api_key"],
    "properties": {
      "username": {"type": "string", "description": "Wansoft Username"},
      "api_key": {"type": "string", "description": "Wansoft API Key"}
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["company_docs", "terminal_id"],
    "properties": {
      "company_docs": {"type": "string", "description": "Company Documents ID"},
      "terminal_id": {"type": "string", "description": "Terminal ID"}
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["base_url"],
    "properties": {
      "base_url": {"type": "string", "description": "Wansoft API Base URL"}
    }
  }'::jsonb,
  'push',
  false
);

-- Insertar SoftRest provider (inactivo)
INSERT INTO pos_providers (code, name, credentials_schema, settings_schema, endpoint_schema, sync_mode, is_active)
VALUES (
  'softrest',
  'SoftRest POS',
  '{
    "type": "object",
    "required": ["api_key"],
    "properties": {
      "api_key": {"type": "string", "description": "SoftRest API Key"}
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["store_id", "terminal_id"],
    "properties": {
      "store_id": {"type": "string", "description": "Store ID"},
      "terminal_id": {"type": "string", "description": "Terminal ID"}
    }
  }'::jsonb,
  '{
    "type": "object",
    "required": ["base_url"],
    "properties": {
      "base_url": {"type": "string", "description": "SoftRest API Base URL"}
    }
  }'::jsonb,
  'push',
  false
);
