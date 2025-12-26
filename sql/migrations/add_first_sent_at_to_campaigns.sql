-- =====================================================
-- MIGRATION: Add first_sent_at to campaigns
-- Author: Claude Code Assistant
-- Date: 2025-12-18
-- Description: Adds first_sent_at column to track when
--              a campaign was sent for the first time
-- =====================================================

-- Add first_sent_at column to campaigns table
ALTER TABLE public.campaigns
ADD COLUMN first_sent_at timestamp with time zone DEFAULT NULL;

-- Add comment to explain the purpose
COMMENT ON COLUMN public.campaigns.first_sent_at IS 'Timestamp when campaign was first sent to customers. NULL means never sent. Used to prevent duplicate sends on re-activation.';

-- Create index for performance when checking if campaign has been sent
CREATE INDEX idx_campaigns_first_sent_at ON public.campaigns(first_sent_at);

-- =====================================================
-- MIGRATION COMPLETED SUCCESSFULLY
-- =====================================================
