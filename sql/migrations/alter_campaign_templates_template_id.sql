-- =====================================================
-- MIGRATION: Modificar campaign_templates.template_id a VARCHAR
-- Author: Claude Code Assistant
-- Date: 2025-12-17
-- Description: Cambia template_id de UUID a VARCHAR para soportar
--              templates de WhatsApp con identificadores de texto
-- =====================================================

-- Paso 1: Eliminar el trigger de validación temporalmente
DROP TRIGGER IF EXISTS validate_campaign_template_trigger ON public.campaign_templates;

-- Paso 2: Modificar la columna template_id de UUID a VARCHAR(255)
ALTER TABLE public.campaign_templates
  ALTER COLUMN template_id TYPE VARCHAR(255);

-- Paso 3: Recrear el trigger de validación (ahora acepta strings para WhatsApp)
CREATE OR REPLACE FUNCTION validate_campaign_template()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate SMS templates (deben existir en sms_templates)
    IF NEW.template_type = 'sms' THEN
        IF NOT EXISTS (
            SELECT 1 FROM sms_templates
            WHERE id::text = NEW.template_id
        ) THEN
            RAISE EXCEPTION 'Template ID % does not exist in sms_templates', NEW.template_id;
        END IF;
    -- Validate Email templates (deben existir en email_templates)
    ELSIF NEW.template_type = 'email' THEN
        IF NOT EXISTS (
            SELECT 1 FROM email_templates
            WHERE id::text = NEW.template_id
        ) THEN
            RAISE EXCEPTION 'Template ID % does not exist in email_templates', NEW.template_id;
        END IF;
    -- WhatsApp and push templates: permitir cualquier string
    -- No se valida contra una tabla porque usan identificadores personalizados
    ELSIF NEW.template_type NOT IN ('whatsapp', 'push') THEN
        RAISE EXCEPTION 'Invalid template_type: %', NEW.template_type;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Paso 4: Recrear el trigger
CREATE TRIGGER validate_campaign_template_trigger
    BEFORE INSERT OR UPDATE ON public.campaign_templates
    FOR EACH ROW EXECUTE FUNCTION validate_campaign_template();

-- =====================================================
-- MIGRATION COMPLETED SUCCESSFULLY
-- =====================================================

-- Cambios aplicados:
-- ✅ template_id ahora es VARCHAR(255) en lugar de UUID
-- ✅ Soporta UUIDs para SMS y Email templates
-- ✅ Soporta strings arbitrarios para WhatsApp y Push templates
-- ✅ Trigger actualizado para validar correctamente

COMMENT ON COLUMN public.campaign_templates.template_id IS
'Template identifier - UUID for SMS/Email templates, string identifier for WhatsApp/Push templates';
