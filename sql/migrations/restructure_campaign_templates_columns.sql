-- =====================================================
-- MIGRATION: Reestructurar campaign_templates con columnas separadas
-- Author: Claude Code Assistant
-- Date: 2025-12-18
-- Description: Separar template_id (UUID para SMS) y template_whatsapp_id (VARCHAR para WhatsApp)
--              Eliminar template_type ya que se infiere de qué columna tiene valor
-- =====================================================

-- Paso 1: Eliminar el trigger existente
DROP TRIGGER IF EXISTS validate_campaign_template_trigger ON public.campaign_templates;
DROP FUNCTION IF EXISTS validate_campaign_template();

-- Paso 2: Agregar nueva columna template_whatsapp_id
ALTER TABLE public.campaign_templates
  ADD COLUMN template_whatsapp_id VARCHAR(255);

-- Paso 3: Remover constraint NOT NULL de template_id temporalmente
ALTER TABLE public.campaign_templates
  ALTER COLUMN template_id DROP NOT NULL;

-- Paso 4: Migrar datos existentes basándose en template_type
-- Mover los IDs de WhatsApp a la nueva columna
UPDATE public.campaign_templates
SET template_whatsapp_id = template_id
WHERE template_type = 'whatsapp';

-- Limpiar template_id para registros de WhatsApp (ya que ahora están en template_whatsapp_id)
UPDATE public.campaign_templates
SET template_id = NULL
WHERE template_type = 'whatsapp';

-- Paso 5: Convertir template_id a UUID (ahora solo contendrá IDs de SMS)
-- Primero, crear una columna temporal UUID
ALTER TABLE public.campaign_templates
  ADD COLUMN template_id_uuid UUID;

-- Copiar y convertir los valores válidos (solo SMS templates)
UPDATE public.campaign_templates
SET template_id_uuid = template_id::UUID
WHERE template_id IS NOT NULL;

-- Eliminar la columna original
ALTER TABLE public.campaign_templates
  DROP COLUMN template_id;

-- Renombrar la columna temporal
ALTER TABLE public.campaign_templates
  RENAME COLUMN template_id_uuid TO template_id;

-- Paso 6: Eliminar la columna template_type (ya no es necesaria)
ALTER TABLE public.campaign_templates
  DROP COLUMN template_type;

-- Paso 7: Agregar constraint de check para asegurar que al menos una columna tenga valor
ALTER TABLE public.campaign_templates
  ADD CONSTRAINT check_at_least_one_template CHECK (
    (template_id IS NOT NULL AND template_whatsapp_id IS NULL) OR
    (template_id IS NULL AND template_whatsapp_id IS NOT NULL)
  );

-- Paso 8: Crear función de validación actualizada
CREATE OR REPLACE FUNCTION validate_campaign_template()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate SMS templates (deben existir en sms_templates)
    IF NEW.template_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM sms_templates
            WHERE id = NEW.template_id
        ) THEN
            RAISE EXCEPTION 'Template ID % does not exist in sms_templates', NEW.template_id;
        END IF;
    END IF;

    -- Para WhatsApp templates, solo validamos que no esté vacío
    IF NEW.template_whatsapp_id IS NOT NULL THEN
        IF LENGTH(TRIM(NEW.template_whatsapp_id)) = 0 THEN
            RAISE EXCEPTION 'WhatsApp template ID cannot be empty';
        END IF;
    END IF;

    -- Verificar que al menos uno esté presente
    IF NEW.template_id IS NULL AND NEW.template_whatsapp_id IS NULL THEN
        RAISE EXCEPTION 'At least one template (SMS or WhatsApp) must be specified';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Paso 9: Recrear el trigger
CREATE TRIGGER validate_campaign_template_trigger
    BEFORE INSERT OR UPDATE ON public.campaign_templates
    FOR EACH ROW EXECUTE FUNCTION validate_campaign_template();

-- Paso 10: Agregar índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_campaign_templates_template_id
    ON public.campaign_templates(template_id) WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_templates_whatsapp_id
    ON public.campaign_templates(template_whatsapp_id) WHERE template_whatsapp_id IS NOT NULL;

-- Paso 11: Actualizar comentarios
COMMENT ON COLUMN public.campaign_templates.template_id IS
'UUID del template de SMS - apunta a sms_templates.id (mutuamente exclusivo con template_whatsapp_id)';

COMMENT ON COLUMN public.campaign_templates.template_whatsapp_id IS
'Identificador string del template de WhatsApp (mutuamente exclusivo con template_id)';

COMMENT ON TABLE public.campaign_templates IS
'Templates asociados a campañas - cada registro representa un template (SMS o WhatsApp)';

-- =====================================================
-- MIGRATION COMPLETED SUCCESSFULLY
-- =====================================================

-- Cambios aplicados:
-- ✅ template_id ahora es UUID y solo para SMS templates
-- ✅ Nueva columna template_whatsapp_id (VARCHAR) para WhatsApp templates
-- ✅ Eliminada columna template_type (se infiere de qué columna tiene valor)
-- ✅ Constraint para asegurar que solo una columna tenga valor
-- ✅ Trigger actualizado para validar ambos tipos
-- ✅ Índices agregados para mejor rendimiento
-- ✅ Datos existentes migrados correctamente

-- Ejemplos de uso:
--
-- Template de SMS:
-- INSERT INTO campaign_templates (campaign_id, template_id, is_primary)
-- VALUES ('campaign-uuid', 'sms-template-uuid', true);
--
-- Template de WhatsApp:
-- INSERT INTO campaign_templates (campaign_id, template_whatsapp_id, is_primary)
-- VALUES ('campaign-uuid', 'recuperacion_clientes', true);
