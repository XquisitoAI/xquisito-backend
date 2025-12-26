-- =====================================================
-- MIGRATION: Add template_whatsapp_id to campaign_sends
-- Author: Claude Code Assistant
-- Date: 2025-12-18
-- Description: Adds template_whatsapp_id column to campaign_sends
--              table to support both SMS and WhatsApp templates
-- =====================================================

-- Add template_whatsapp_id column
ALTER TABLE public.campaign_sends
ADD COLUMN template_whatsapp_id character varying(255) DEFAULT NULL;

-- Add message_content_whatsapp column
ALTER TABLE public.campaign_sends
ADD COLUMN message_content_whatsapp text DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN public.campaign_sends.template_whatsapp_id IS 'WhatsApp template ID (VARCHAR). Use template_id for SMS (UUID) or template_whatsapp_id for WhatsApp (VARCHAR).';
COMMENT ON COLUMN public.campaign_sends.message_content IS 'SMS message content. Use this for SMS messages.';
COMMENT ON COLUMN public.campaign_sends.message_content_whatsapp IS 'WhatsApp message content. Use this for WhatsApp messages.';

-- Add check constraint to ensure only one template type is used
ALTER TABLE public.campaign_sends
ADD CONSTRAINT campaign_sends_template_check CHECK (
  (template_id IS NOT NULL AND template_whatsapp_id IS NULL) OR
  (template_id IS NULL AND template_whatsapp_id IS NOT NULL)
);

-- Add index for performance
CREATE INDEX idx_campaign_sends_template_whatsapp_id ON public.campaign_sends(template_whatsapp_id);

-- =====================================================
-- MIGRATION COMPLETED SUCCESSFULLY
-- =====================================================
