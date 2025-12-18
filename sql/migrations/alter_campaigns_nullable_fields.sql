-- =====================================================
-- MIGRATION: Hacer reward_value y reward_code opcionales en campaigns
-- Author: Claude Code Assistant
-- Date: 2025-12-17
-- Description: Permite valores NULL en reward_value y reward_code
--              para soportar campañas informativas sin descuentos
-- =====================================================

-- Modificar reward_value para permitir NULL
ALTER TABLE public.campaigns
  ALTER COLUMN reward_value DROP NOT NULL;

-- Modificar reward_code para permitir NULL (probablemente ya lo permite, pero lo aseguramos)
ALTER TABLE public.campaigns
  ALTER COLUMN reward_code DROP NOT NULL;

-- Actualizar comentarios para clarificar que son opcionales
COMMENT ON COLUMN public.campaigns.reward_value IS
'Valor de la recompensa (opcional) - Porcentaje, monto fijo, o puntos según reward_type';

COMMENT ON COLUMN public.campaigns.reward_code IS
'Código promocional (opcional) - Código que los clientes deben usar para reclamar la recompensa';

-- =====================================================
-- MIGRATION COMPLETED SUCCESSFULLY
-- =====================================================

-- Cambios aplicados:
-- ✅ reward_value ahora permite NULL
-- ✅ reward_code ahora permite NULL
-- ✅ Soporta campañas informativas sin descuentos
-- ✅ Soporta campañas promocionales con descuentos

-- Ejemplos de uso:
--
-- Campaña informativa (sin descuento):
-- INSERT INTO campaigns (restaurant_id, name, segment_id, reward_type, start_date, end_date)
-- VALUES (1, 'Nueva sucursal', 'uuid-segment', 'discount_percentage', '2025-01-01', '2025-01-31');
--
-- Campaña promocional (con descuento):
-- INSERT INTO campaigns (restaurant_id, name, segment_id, reward_type, reward_value, reward_code, start_date, end_date)
-- VALUES (1, 'Promo 20% OFF', 'uuid-segment', 'discount_percentage', 20, 'PROMO20', '2025-01-01', '2025-01-31');
