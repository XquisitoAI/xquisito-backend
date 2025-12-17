-- =====================================================
-- MIGRATION: Complete Campaigns System (FIXED)
-- Author: Claude Code Assistant
-- Date: 2025-12-17
-- Description: Creates complete campaigns system with corrected constraints
-- =====================================================

-- Step 1: Create ENUM types for campaigns system
-- =====================================================

-- Campaign reward types
CREATE TYPE campaign_reward_type AS ENUM (
  'discount_percentage',  -- 15% descuento
  'discount_fixed',       -- $50 descuento fijo
  'free_item',           -- Item gratis específico
  'points',              -- Puntos extra de lealtad
  'buy_one_get_one'      -- Promoción 2x1
);

-- Campaign status lifecycle
CREATE TYPE campaign_status AS ENUM (
  'draft',        -- Borrador (en edición)
  'scheduled',    -- Programada (lista para enviar)
  'running',      -- En ejecución (enviándose)
  'paused',       -- Pausada (temporalmente detenida)
  'completed',    -- Completada (finalizada exitosamente)
  'cancelled'     -- Cancelada (terminada antes de tiempo)
);

-- Template types for multi-channel support
CREATE TYPE template_type AS ENUM (
  'sms',          -- SMS messages
  'email',        -- Email messages
  'whatsapp',     -- WhatsApp messages
  'push'          -- Push notifications
);

-- Send status for tracking delivery funnel
CREATE TYPE send_status AS ENUM (
  'pending',      -- Pendiente de envío
  'sent',         -- Enviado
  'delivered',    -- Entregado
  'opened',       -- Abierto/leído
  'clicked',      -- Click en link/CTA
  'redeemed',     -- Recompensa canjeada
  'failed',       -- Error en envío
  'bounced'       -- Rebotó (email inválido, etc.)
);

-- Step 2: Create email_templates table to complement sms_templates
-- =====================================================

CREATE TABLE public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id integer NOT NULL,
  name character varying(255) NOT NULL CHECK (char_length(name::text) >= 1),
  subject character varying(255) NOT NULL CHECK (char_length(subject::text) >= 1),
  blocks jsonb NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT email_templates_pkey PRIMARY KEY (id),
  CONSTRAINT email_templates_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE
);

-- Step 3: Create main campaigns table
-- =====================================================

CREATE TABLE public.campaigns (
  -- Identificación principal
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id integer NOT NULL,

  -- Información básica de la campaña
  name character varying(255) NOT NULL CHECK (char_length(name::text) >= 1),
  description text,

  -- Segmentación de clientes
  segment_id uuid NOT NULL, -- FK a customer_segments

  -- Sistema de recompensas configurable
  reward_type campaign_reward_type NOT NULL DEFAULT 'discount_percentage',
  reward_value numeric(10,2) NOT NULL CHECK (reward_value > 0),
  reward_code character varying(50), -- Código promocional opcional
  reward_description text, -- Descripción detallada del reward

  -- Sistema de puntos (opcional)
  points_required integer DEFAULT 0 CHECK (points_required >= 0),
  points_awarded integer DEFAULT 0 CHECK (points_awarded >= 0),

  -- Programación temporal
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,

  -- Control de estado y canales de entrega
  status campaign_status NOT NULL DEFAULT 'draft',
  delivery_methods text[] NOT NULL DEFAULT '{email}', -- Array de métodos: email, sms, whatsapp, push

  -- Configuración de entrega automática
  auto_send boolean DEFAULT false,
  send_immediately boolean DEFAULT false,

  -- Métricas de performance (actualizadas automáticamente)
  total_targeted integer DEFAULT 0, -- Clientes en el segmento
  total_sent integer DEFAULT 0,     -- Mensajes enviados
  total_delivered integer DEFAULT 0, -- Mensajes entregados
  total_opened integer DEFAULT 0,    -- Mensajes abiertos
  total_clicked integer DEFAULT 0,   -- Links clickeados
  total_redeemed integer DEFAULT 0,  -- Recompensas canjeadas

  -- Control de presupuesto (opcional)
  budget_limit numeric(10,2), -- Límite de gasto en recompensas
  current_spend numeric(10,2) DEFAULT 0, -- Gasto actual

  -- Auditoría
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by text, -- Clerk user ID del creador

  -- Constraints principales
  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT campaigns_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE,
  CONSTRAINT campaigns_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.customer_segments(id) ON DELETE RESTRICT,
  CONSTRAINT campaigns_dates_check CHECK (end_date > start_date),
  CONSTRAINT campaigns_budget_check CHECK (current_spend <= budget_limit OR budget_limit IS NULL),
  CONSTRAINT campaigns_name_restaurant_unique UNIQUE (restaurant_id, name)
);

-- Step 4: Create campaign_templates junction table (FIXED)
-- =====================================================

CREATE TABLE public.campaign_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  template_id uuid NOT NULL,
  template_type template_type NOT NULL,

  -- Configuration per template
  is_primary boolean DEFAULT false, -- Template principal para ese tipo
  custom_variables jsonb DEFAULT '{}', -- Variables personalizadas para este template

  -- Auditoría
  created_at timestamp with time zone DEFAULT now(),

  -- Constraints (without problematic subquery constraint)
  CONSTRAINT campaign_templates_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_templates_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE,
  CONSTRAINT campaign_templates_unique_type UNIQUE (campaign_id, template_type)
);

-- Step 5: Create campaign_sends tracking table
-- =====================================================

CREATE TABLE public.campaign_sends (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  user_id text NOT NULL, -- Clerk user ID del cliente
  delivery_method character varying(20) NOT NULL, -- email, sms, whatsapp, push
  template_id uuid, -- ID del template específico usado

  -- Información del mensaje
  recipient_email character varying(255),
  recipient_phone character varying(50),
  message_content text, -- Contenido final del mensaje enviado

  -- Tracking de estados con timestamps
  status send_status NOT NULL DEFAULT 'pending',
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  opened_at timestamp with time zone,
  clicked_at timestamp with time zone,
  redeemed_at timestamp with time zone,
  failed_at timestamp with time zone,

  -- Error handling
  error_message text,
  retry_count integer DEFAULT 0,

  -- Metadata adicional
  device_info jsonb DEFAULT '{}', -- Info del dispositivo donde se abrió
  click_data jsonb DEFAULT '{}',  -- Data de clicks y interacciones

  -- Auditoría
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  -- Constraints
  CONSTRAINT campaign_sends_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_sends_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE,
  CONSTRAINT campaign_sends_unique UNIQUE (campaign_id, user_id, delivery_method),
  CONSTRAINT campaign_sends_delivery_method_check CHECK (delivery_method IN ('email', 'sms', 'whatsapp', 'push'))
);

-- Step 6: Create performance indexes
-- =====================================================

-- Campaigns table indexes
CREATE INDEX idx_campaigns_restaurant_id ON public.campaigns(restaurant_id);
CREATE INDEX idx_campaigns_segment_id ON public.campaigns(segment_id);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_dates ON public.campaigns(start_date, end_date);
CREATE INDEX idx_campaigns_created_by ON public.campaigns(created_by);

-- Campaign templates indexes
CREATE INDEX idx_campaign_templates_campaign_id ON public.campaign_templates(campaign_id);
CREATE INDEX idx_campaign_templates_template_type ON public.campaign_templates(template_type);
CREATE INDEX idx_campaign_templates_template_id ON public.campaign_templates(template_id);

-- Campaign sends indexes for analytics
CREATE INDEX idx_campaign_sends_campaign_id ON public.campaign_sends(campaign_id);
CREATE INDEX idx_campaign_sends_user_id ON public.campaign_sends(user_id);
CREATE INDEX idx_campaign_sends_status ON public.campaign_sends(status);
CREATE INDEX idx_campaign_sends_delivery_method ON public.campaign_sends(delivery_method);
CREATE INDEX idx_campaign_sends_sent_at ON public.campaign_sends(sent_at);
CREATE INDEX idx_campaign_sends_redeemed_at ON public.campaign_sends(redeemed_at);

-- Email templates indexes
CREATE INDEX idx_email_templates_restaurant_id ON public.email_templates(restaurant_id);
CREATE INDEX idx_email_templates_is_default ON public.email_templates(is_default);

-- Step 7: Create update triggers for timestamps
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic updated_at
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_sends_updated_at BEFORE UPDATE ON public.campaign_sends
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 8: Create validation functions (instead of CHECK constraints with subqueries)
-- =====================================================

-- Function to validate template relationships
CREATE OR REPLACE FUNCTION validate_campaign_template()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate SMS templates
    IF NEW.template_type = 'sms' THEN
        IF NOT EXISTS (SELECT 1 FROM sms_templates WHERE id = NEW.template_id) THEN
            RAISE EXCEPTION 'Template ID % does not exist in sms_templates', NEW.template_id;
        END IF;
    -- Validate Email templates
    ELSIF NEW.template_type = 'email' THEN
        IF NOT EXISTS (SELECT 1 FROM email_templates WHERE id = NEW.template_id) THEN
            RAISE EXCEPTION 'Template ID % does not exist in email_templates', NEW.template_id;
        END IF;
    -- WhatsApp and push templates will be validated by application logic
    ELSIF NEW.template_type NOT IN ('whatsapp', 'push') THEN
        RAISE EXCEPTION 'Invalid template_type: %', NEW.template_type;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for template validation
CREATE TRIGGER validate_campaign_template_trigger
    BEFORE INSERT OR UPDATE ON public.campaign_templates
    FOR EACH ROW EXECUTE FUNCTION validate_campaign_template();

-- Step 9: Create helpful views for analytics
-- =====================================================

-- Campaign performance view
CREATE VIEW campaign_performance AS
SELECT
    c.id,
    c.name,
    c.restaurant_id,
    c.status,
    c.start_date,
    c.end_date,
    c.total_targeted,
    c.total_sent,
    c.total_delivered,
    c.total_opened,
    c.total_clicked,
    c.total_redeemed,
    -- Conversion rates
    CASE WHEN c.total_sent > 0 THEN (c.total_delivered::float / c.total_sent * 100) ELSE 0 END as delivery_rate,
    CASE WHEN c.total_delivered > 0 THEN (c.total_opened::float / c.total_delivered * 100) ELSE 0 END as open_rate,
    CASE WHEN c.total_opened > 0 THEN (c.total_clicked::float / c.total_opened * 100) ELSE 0 END as click_rate,
    CASE WHEN c.total_sent > 0 THEN (c.total_redeemed::float / c.total_sent * 100) ELSE 0 END as redemption_rate,
    -- ROI calculation
    c.current_spend,
    c.budget_limit,
    cs.segment_name,
    cs.estimated_customers
FROM campaigns c
LEFT JOIN customer_segments cs ON c.segment_id = cs.id;

-- =====================================================
-- MIGRATION COMPLETED SUCCESSFULLY (FIXED VERSION)
-- =====================================================

-- Summary of created objects:
-- ✅ 4 ENUM types (campaign_reward_type, campaign_status, template_type, send_status)
-- ✅ 4 tables (campaigns, campaign_templates, campaign_sends, email_templates)
-- ✅ 15+ indexes for performance
-- ✅ 3 triggers for automatic timestamps
-- ✅ 1 validation trigger for template relationships
-- ✅ 1 view for campaign analytics
--
-- Fixed issues:
-- 🔧 Removed problematic subquery CHECK constraint
-- ✅ Added validation trigger function instead
-- ✅ All foreign key constraints preserved
--
-- Ready for:
-- 🎯 Campaign creation and management
-- 📊 Multi-channel template support
-- 📈 Detailed tracking and analytics
-- 📱 SMS, Email, WhatsApp, Push notifications