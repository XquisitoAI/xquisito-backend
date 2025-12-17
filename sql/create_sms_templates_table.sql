-- Create sms_templates table
CREATE TABLE IF NOT EXISTS sms_templates (
  -- Identificación
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  -- Información básica
  name VARCHAR(255) NOT NULL,

  -- Contenido (estructura de bloques)
  blocks JSONB NOT NULL,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT sms_templates_name_check CHECK (char_length(name) >= 1)
);

-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_sms_templates_restaurant ON sms_templates(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_created_at ON sms_templates(created_at DESC);

-- Habilitar RLS (Row Level Security)
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Los usuarios solo pueden ver templates de su restaurante
CREATE POLICY "Users can view their restaurant's templates"
  ON sms_templates FOR SELECT
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id IN (
        SELECT id FROM user_admin_portal WHERE clerk_user_id = auth.jwt() ->> 'sub'
      )
    )
  );

-- Policy: Los usuarios pueden crear templates para su restaurante
CREATE POLICY "Users can create templates for their restaurant"
  ON sms_templates FOR INSERT
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id IN (
        SELECT id FROM user_admin_portal WHERE clerk_user_id = auth.jwt() ->> 'sub'
      )
    )
  );

-- Policy: Los usuarios pueden actualizar templates de su restaurante
CREATE POLICY "Users can update their restaurant's templates"
  ON sms_templates FOR UPDATE
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id IN (
        SELECT id FROM user_admin_portal WHERE clerk_user_id = auth.jwt() ->> 'sub'
      )
    )
  );

-- Policy: Los usuarios pueden eliminar templates de su restaurante
CREATE POLICY "Users can delete their restaurant's templates"
  ON sms_templates FOR DELETE
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE user_id IN (
        SELECT id FROM user_admin_portal WHERE clerk_user_id = auth.jwt() ->> 'sub'
      )
    )
  );

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_sms_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sms_templates_updated_at
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_sms_templates_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE sms_templates IS 'Almacena templates de SMS personalizados por restaurante';
COMMENT ON COLUMN sms_templates.id IS 'Identificador único del template';
COMMENT ON COLUMN sms_templates.restaurant_id IS 'ID del restaurante propietario del template';
COMMENT ON COLUMN sms_templates.name IS 'Nombre descriptivo del template';
COMMENT ON COLUMN sms_templates.blocks IS 'Array JSON con la estructura de bloques del template (type, content, id)';
COMMENT ON COLUMN sms_templates.created_at IS 'Fecha de creación del template';
COMMENT ON COLUMN sms_templates.updated_at IS 'Fecha de última actualización del template';
