-- =============================================
-- AGREGAR COLUMNAS DE INGRESOS NETOS
-- =============================================
-- Este script agrega las columnas restaurant_net_income y xquisito_net_income
-- a la tabla payment_transactions existente

-- Agregar columna de ingreso neto del restaurante
ALTER TABLE public.payment_transactions
ADD COLUMN IF NOT EXISTS restaurant_net_income DECIMAL(10,2);

-- Agregar columna de ingreso neto de Xquisito
ALTER TABLE public.payment_transactions
ADD COLUMN IF NOT EXISTS xquisito_net_income DECIMAL(10,2);

-- Agregar comentarios para documentación
COMMENT ON COLUMN public.payment_transactions.restaurant_net_income IS
'Ingreso neto del restaurante (después de comisiones) = base_amount + tip_amount - xquisito_restaurant_charge';

COMMENT ON COLUMN public.payment_transactions.xquisito_net_income IS
'Ingreso neto de Xquisito (después de pagar E-cart) = (xquisito_client_charge + xquisito_restaurant_charge) - ecart_commission_total';

-- Actualizar registros existentes con valores calculados (si existen)
UPDATE public.payment_transactions
SET
    restaurant_net_income = base_amount + tip_amount - xquisito_restaurant_charge,
    xquisito_net_income = (xquisito_client_charge + xquisito_restaurant_charge) - ecart_commission_total
WHERE restaurant_net_income IS NULL OR xquisito_net_income IS NULL;

-- Ahora que los valores están calculados, hacer las columnas NOT NULL
ALTER TABLE public.payment_transactions
ALTER COLUMN restaurant_net_income SET NOT NULL;

ALTER TABLE public.payment_transactions
ALTER COLUMN xquisito_net_income SET NOT NULL;

-- Agregar constraints de validación
ALTER TABLE public.payment_transactions
ADD CONSTRAINT chk_restaurant_net_income_positive CHECK (restaurant_net_income >= 0);

ALTER TABLE public.payment_transactions
ADD CONSTRAINT chk_xquisito_net_income_positive CHECK (xquisito_net_income >= 0);

-- =============================================
-- ACTUALIZAR TRIGGER DE VALIDACIÓN
-- =============================================

-- Eliminar trigger existente para recrearlo
DROP TRIGGER IF EXISTS validate_payment_amounts_trigger ON public.payment_transactions;

-- Recrear función de validación con las nuevas validaciones
CREATE OR REPLACE FUNCTION validate_payment_transaction_amounts()
RETURNS TRIGGER AS $$
BEGIN
    -- Validar que subtotal_for_commission = base_amount + tip_amount
    IF ABS(NEW.subtotal_for_commission - (NEW.base_amount + NEW.tip_amount)) > 0.01 THEN
        RAISE EXCEPTION 'subtotal_for_commission debe ser igual a base_amount + tip_amount';
    END IF;

    -- Validar que iva_tip = tip_amount * 0.16
    IF ABS(NEW.iva_tip - (NEW.tip_amount * 0.16)) > 0.01 THEN
        RAISE EXCEPTION 'iva_tip debe ser 16%% de tip_amount';
    END IF;

    -- Validar que xquisito_client_charge = xquisito_commission_client + iva_xquisito_client
    IF ABS(NEW.xquisito_client_charge - (NEW.xquisito_commission_client + NEW.iva_xquisito_client)) > 0.01 THEN
        RAISE EXCEPTION 'xquisito_client_charge debe ser igual a comisión + IVA';
    END IF;

    -- Validar que total_amount_charged = base_amount + tip_amount + xquisito_client_charge
    IF ABS(NEW.total_amount_charged - (NEW.base_amount + NEW.tip_amount + NEW.xquisito_client_charge)) > 0.01 THEN
        RAISE EXCEPTION 'total_amount_charged debe ser base + propina + comisión cliente';
    END IF;

    -- Validar que restaurant_net_income = base_amount + tip_amount - xquisito_restaurant_charge
    IF ABS(NEW.restaurant_net_income - (NEW.base_amount + NEW.tip_amount - NEW.xquisito_restaurant_charge)) > 0.01 THEN
        RAISE EXCEPTION 'restaurant_net_income debe ser base + propina - comisión restaurante';
    END IF;

    -- Validar que xquisito_net_income = (xquisito_client_charge + xquisito_restaurant_charge) - ecart_commission_total
    IF ABS(NEW.xquisito_net_income - ((NEW.xquisito_client_charge + NEW.xquisito_restaurant_charge) - NEW.ecart_commission_total)) > 0.01 THEN
        RAISE EXCEPTION 'xquisito_net_income debe ser comisiones totales - comisión E-cart';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrear trigger para validar montos antes de insertar
CREATE TRIGGER validate_payment_amounts_trigger
    BEFORE INSERT OR UPDATE ON public.payment_transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_payment_transaction_amounts();

-- =============================================
-- VERIFICACIÓN
-- =============================================

-- Mostrar estructura actualizada de la tabla
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'payment_transactions'
    AND column_name IN ('restaurant_net_income', 'xquisito_net_income')
ORDER BY ordinal_position;
