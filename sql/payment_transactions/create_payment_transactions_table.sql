-- ====================================================
-- Tabla de Transacciones de Pago
-- Máxima trazabilidad de todas las transacciones
-- ====================================================

CREATE TABLE IF NOT EXISTS public.payment_transactions (
    -- Identificador único
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- =============================================
    -- RELACIONES CON OTRAS TABLAS
    -- =============================================

    -- Método de pago utilizado (puede ser de user o guest)
    payment_method_id UUID NOT NULL,
    -- Nota: No usamos FK porque puede referir a user_payment_methods O guest_payment_methods

    -- Restaurante donde se realizó la transacción
    restaurant_id INTEGER NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,

    -- Orden asociada (UNA de estas dos será NULL)
    id_table_order UUID REFERENCES public.table_order(id) ON DELETE SET NULL,
    id_tap_orders_and_pay UUID REFERENCES public.tap_orders_and_pay(id) ON DELETE SET NULL,

    -- Constraint: Al menos una orden debe estar presente
    CONSTRAINT chk_one_order_type CHECK (
        (id_table_order IS NOT NULL AND id_tap_orders_and_pay IS NULL) OR
        (id_table_order IS NULL AND id_tap_orders_and_pay IS NOT NULL)
    ),

    -- =============================================
    -- MONTOS BASE
    -- =============================================

    -- Consumo (sin propina ni comisiones)
    base_amount DECIMAL(10,2) NOT NULL CHECK (base_amount >= 0),

    -- Propina
    tip_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0),

    -- IVA de propina (16%, NO pagado por cliente - lo paga el restaurante)
    iva_tip DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (iva_tip >= 0),

    -- =============================================
    -- COMISIONES XQUISITO
    -- =============================================

    -- Comisión total Xquisito (sin IVA)
    xquisito_commission_total DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (xquisito_commission_total >= 0),

    -- Comisión parte cliente (sin IVA)
    xquisito_commission_client DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (xquisito_commission_client >= 0),

    -- Comisión parte restaurante (sin IVA)
    xquisito_commission_restaurant DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (xquisito_commission_restaurant >= 0),

    -- IVA sobre comisión cliente (16%)
    iva_xquisito_client DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (iva_xquisito_client >= 0),

    -- IVA sobre comisión restaurante (16%)
    iva_xquisito_restaurant DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (iva_xquisito_restaurant >= 0),

    -- Total cobrado al cliente (comisión + IVA)
    xquisito_client_charge DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (xquisito_client_charge >= 0),

    -- Total cobrado al restaurante (comisión + IVA)
    xquisito_restaurant_charge DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (xquisito_restaurant_charge >= 0),

    -- Tasa % aplicada según el rango (5.8, 4.2, o 4.0)
    xquisito_rate_applied DECIMAL(4,2) NOT NULL CHECK (xquisito_rate_applied > 0),

    -- =============================================
    -- COMISIÓN E-CART (PROCESADOR DE PAGOS)
    -- =============================================

    -- Tasa % aplicada (2.3 para débito, 2.6 para crédito)
    ecart_commission_rate DECIMAL(4,2) NOT NULL CHECK (ecart_commission_rate > 0),

    -- Monto de comisión (% del total)
    ecart_commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (ecart_commission_amount >= 0),

    -- Cargo fijo ($1.50)
    ecart_fixed_fee DECIMAL(10,2) NOT NULL DEFAULT 1.50 CHECK (ecart_fixed_fee >= 0),

    -- IVA sobre comisión E-cart (16%)
    iva_ecart DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (iva_ecart >= 0),

    -- Total comisión E-cart (amount + fixed_fee + iva)
    ecart_commission_total DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (ecart_commission_total >= 0),

    -- Tipo de tarjeta utilizada
    card_type VARCHAR(10) NOT NULL CHECK (card_type IN ('credit', 'debit')),

    -- =============================================
    -- TOTALES
    -- =============================================

    -- Total cobrado al cliente
    total_amount_charged DECIMAL(10,2) NOT NULL CHECK (total_amount_charged > 0),

    -- Base para cálculo de comisiones (consumo + propina)
    subtotal_for_commission DECIMAL(10,2) NOT NULL CHECK (subtotal_for_commission >= 0),

    -- =============================================
    -- INGRESOS NETOS (CALCULADOS)
    -- =============================================

    -- Ingreso neto del restaurante (después de comisiones)
    -- = base_amount + tip_amount - xquisito_restaurant_charge
    restaurant_net_income DECIMAL(10,2) NOT NULL CHECK (restaurant_net_income >= 0),

    -- Ingreso neto de Xquisito (después de pagar E-cart)
    -- = (xquisito_client_charge + xquisito_restaurant_charge) - ecart_commission_total
    xquisito_net_income DECIMAL(10,2) NOT NULL CHECK (xquisito_net_income >= 0),

    -- =============================================
    -- METADATA
    -- =============================================

    -- Moneda (siempre MXN por ahora)
    currency VARCHAR(3) NOT NULL DEFAULT 'MXN',

    -- Timestamp de creación
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- =============================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- =============================================

-- Índice para búsqueda por método de pago
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_method
ON public.payment_transactions(payment_method_id);

-- Índice para búsqueda por restaurante
CREATE INDEX IF NOT EXISTS idx_payment_transactions_restaurant
ON public.payment_transactions(restaurant_id);

-- Índice para búsqueda por orden de mesa (xquisito-fronted)
CREATE INDEX IF NOT EXISTS idx_payment_transactions_table_order
ON public.payment_transactions(id_table_order)
WHERE id_table_order IS NOT NULL;

-- Índice para búsqueda por orden tap (tap-order-and-pay)
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tap_order
ON public.payment_transactions(id_tap_orders_and_pay)
WHERE id_tap_orders_and_pay IS NOT NULL;

-- Índice por fecha de creación (para reportes)
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at
ON public.payment_transactions(created_at DESC);

-- Índice compuesto para reportes por restaurante y fecha
CREATE INDEX IF NOT EXISTS idx_payment_transactions_restaurant_date
ON public.payment_transactions(restaurant_id, created_at DESC);

-- Índice por tipo de tarjeta (para análisis)
CREATE INDEX IF NOT EXISTS idx_payment_transactions_card_type
ON public.payment_transactions(card_type);

-- =============================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =============================================

COMMENT ON TABLE public.payment_transactions IS
'Registro completo de todas las transacciones de pago con máxima trazabilidad';

COMMENT ON COLUMN public.payment_transactions.payment_method_id IS
'ID del método de pago (puede ser de user_payment_methods o guest_payment_methods)';

COMMENT ON COLUMN public.payment_transactions.id_table_order IS
'ID de orden de xquisito-fronted (NULL si es tap-order-and-pay)';

COMMENT ON COLUMN public.payment_transactions.id_tap_orders_and_pay IS
'ID de orden de tap-order-and-pay (NULL si es xquisito-fronted)';

COMMENT ON COLUMN public.payment_transactions.iva_tip IS
'IVA de propina 16% - NO pagado por cliente, lo descuenta el sistema';

COMMENT ON COLUMN public.payment_transactions.xquisito_rate_applied IS
'Tasa aplicada según rango: <$100=5.8%, $100-$150=4.2%, >$150=4.0%';

COMMENT ON COLUMN public.payment_transactions.ecart_commission_rate IS
'Tasa E-cart según tipo de tarjeta: débito=2.3%, crédito=2.6%';

COMMENT ON COLUMN public.payment_transactions.card_type IS
'Tipo de tarjeta utilizada: credit o debit';

-- =============================================
-- FUNCIÓN PARA VALIDAR INTEGRIDAD DE MONTOS
-- =============================================

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

-- Trigger para validar montos antes de insertar
CREATE TRIGGER validate_payment_amounts_trigger
    BEFORE INSERT OR UPDATE ON public.payment_transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_payment_transaction_amounts();

-- =============================================
-- ROW LEVEL SECURITY (OPCIONAL)
-- =============================================

-- Habilitar RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Política: Solo administradores pueden ver todas las transacciones
-- (Ajustar según tus necesidades de seguridad)
CREATE POLICY "Allow service role full access" ON public.payment_transactions
    FOR ALL USING (true);

-- =============================================
-- VISTA PARA DISTRIBUCIÓN DE DINERO
-- =============================================

CREATE OR REPLACE VIEW payment_transactions_distribution AS
SELECT
    pt.id,
    pt.created_at,
    pt.restaurant_id,
    pt.total_amount_charged,

    -- Distribución E-cart
    pt.ecart_commission_total as ecart_receives,

    -- Distribución Xquisito
    (pt.xquisito_commission_total +
     pt.iva_xquisito_client +
     pt.iva_xquisito_restaurant -
     pt.ecart_commission_total) as xquisito_receives,

    -- Distribución Restaurante
    (pt.base_amount +
     pt.tip_amount -
     pt.iva_tip -
     pt.xquisito_restaurant_charge) as restaurant_receives,

    -- Propina neta (sin IVA)
    (pt.tip_amount - pt.iva_tip) as tip_net,

    -- Verificación (debe sumar total_amount_charged)
    (pt.ecart_commission_total +
     (pt.xquisito_commission_total + pt.iva_xquisito_client + pt.iva_xquisito_restaurant - pt.ecart_commission_total) +
     (pt.base_amount + pt.tip_amount - pt.iva_tip - pt.xquisito_restaurant_charge)) as total_distributed

FROM public.payment_transactions pt;

COMMENT ON VIEW payment_transactions_distribution IS
'Vista que muestra la distribución exacta del dinero: E-cart, Xquisito, Restaurante';
