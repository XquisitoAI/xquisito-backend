-- ===============================================
-- AGREGAR RESTAURANT_ID A LA TABLA TABLES
-- ===============================================
-- Este script relaciona las mesas con los restaurantes,
-- permitiendo que múltiples restaurantes tengan sus propias mesas.

-- 1. Agregar columna restaurant_id a la tabla tables
ALTER TABLE tables
ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;

-- 2. Agregar foreign key a restaurants
ALTER TABLE tables
ADD CONSTRAINT fk_tables_restaurant
FOREIGN KEY (restaurant_id)
REFERENCES restaurants(id)
ON DELETE CASCADE;

-- 3. Crear índice para optimizar búsquedas por restaurante
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON tables(restaurant_id);

-- 4. Verificar y eliminar constraints dependientes antes de modificar tables_table_number_key
-- Primero verificar si existe la tabla user_orders y su constraint
DO $$
BEGIN
    -- Eliminar constraint fk_table_number de user_orders si existe
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_table_number'
        AND table_name = 'user_orders'
    ) THEN
        ALTER TABLE user_orders DROP CONSTRAINT fk_table_number;
        RAISE NOTICE 'Dropped constraint fk_table_number from user_orders';
    END IF;
END $$;

-- 5. Ahora podemos eliminar el constraint UNIQUE de table_number usando CASCADE
-- Esto permite que cada restaurante tenga su propia mesa #1, #2, etc.
ALTER TABLE tables
DROP CONSTRAINT IF EXISTS tables_table_number_key CASCADE;

-- 6. Agregar constraint único compuesto: (restaurant_id, table_number)
ALTER TABLE tables
ADD CONSTRAINT tables_restaurant_table_unique
UNIQUE (restaurant_id, table_number);

-- 7. Actualizar la función open_table_order para incluir restaurant_id
-- Primero eliminar versiones anteriores
DROP FUNCTION IF EXISTS open_table_order(INTEGER);
DROP FUNCTION IF EXISTS open_table_order(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION open_table_order(
    p_table_number INTEGER,
    p_restaurant_id INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_table_id UUID;
    v_order_id UUID;
BEGIN
    -- Verificar que la mesa existe y está disponible para el restaurante
    IF p_restaurant_id IS NOT NULL THEN
        SELECT id INTO v_table_id
        FROM tables
        WHERE table_number = p_table_number
        AND restaurant_id = p_restaurant_id
        AND status = 'available';
    ELSE
        -- Retrocompatibilidad: si no se proporciona restaurant_id
        SELECT id INTO v_table_id
        FROM tables
        WHERE table_number = p_table_number
        AND status = 'available';
    END IF;

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Mesa % no está disponible para este restaurante', p_table_number;
    END IF;

    -- Crear la orden de mesa
    INSERT INTO table_order (table_id, status)
    VALUES (v_table_id, 'not_paid')
    RETURNING id INTO v_order_id;

    -- Cambiar estado de mesa a ocupada
    UPDATE tables SET status = 'occupied' WHERE id = v_table_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- 8a. Actualizar función add_user_to_order para incluir guest_id
-- Esta función es requerida por create_dish_order
DROP FUNCTION IF EXISTS add_user_to_order(UUID, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS add_user_to_order(UUID, VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS add_user_to_order(UUID, VARCHAR, VARCHAR, VARCHAR) CASCADE;

CREATE OR REPLACE FUNCTION add_user_to_order(
    p_table_order_id UUID,
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_guest_name VARCHAR(255) DEFAULT NULL,
    p_guest_id VARCHAR(255) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_user_order_id UUID;
BEGIN
    -- Verificar si el usuario ya existe en la orden
    -- Priorizar guest_id si está disponible, si no usar guest_name
    SELECT id INTO v_user_order_id
    FROM user_order
    WHERE table_order_id = p_table_order_id
    AND (
        (p_user_id IS NOT NULL AND user_id = p_user_id) OR
        (p_guest_id IS NOT NULL AND guest_id = p_guest_id) OR
        (p_guest_id IS NULL AND p_user_id IS NULL AND guest_name = p_guest_name)
    );

    -- Si no existe, crear nuevo user_order
    IF v_user_order_id IS NULL THEN
        INSERT INTO user_order (table_order_id, user_id, guest_name, guest_id)
        VALUES (p_table_order_id, p_user_id, p_guest_name, p_guest_id)
        RETURNING id INTO v_user_order_id;
    END IF;

    RETURN v_user_order_id;
END;
$$ LANGUAGE plpgsql;

-- 8b. Actualizar la función create_dish_order para incluir restaurant_id
-- Primero eliminar versiones anteriores para evitar conflictos
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER, VARCHAR, TEXT[], JSONB, DECIMAL);
DROP FUNCTION IF EXISTS create_dish_order(INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, INTEGER, VARCHAR, TEXT[], JSONB, DECIMAL, INTEGER);

CREATE OR REPLACE FUNCTION create_dish_order(
    p_table_number INTEGER,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_guest_name VARCHAR(255) DEFAULT NULL,
    p_quantity INTEGER DEFAULT 1,
    p_guest_id VARCHAR(255) DEFAULT NULL,
    p_images TEXT[] DEFAULT NULL,
    p_custom_fields JSONB DEFAULT NULL,
    p_extra_price DECIMAL(10,2) DEFAULT 0,
    p_restaurant_id INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_table_order_id UUID;
    v_user_order_id UUID;
    v_dish_order_id UUID;
BEGIN
    -- Buscar orden activa para la mesa (filtrando por restaurant_id si se proporciona)
    IF p_restaurant_id IS NOT NULL THEN
        SELECT "to".id INTO v_table_order_id
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        WHERE t.table_number = p_table_number
        AND t.restaurant_id = p_restaurant_id
        AND "to".status IN ('not_paid', 'partial');
    ELSE
        -- Retrocompatibilidad: si no se proporciona restaurant_id
        SELECT "to".id INTO v_table_order_id
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        WHERE t.table_number = p_table_number
        AND "to".status IN ('not_paid', 'partial');
    END IF;

    -- Si no hay orden activa, crear una nueva
    IF v_table_order_id IS NULL THEN
        v_table_order_id := open_table_order(p_table_number, p_restaurant_id);
    END IF;

    -- Agregar usuario a la orden (con guest_id)
    v_user_order_id := add_user_to_order(v_table_order_id, p_user_id, p_guest_name, p_guest_id);

    -- Crear el platillo con custom_fields y extra_price
    INSERT INTO dish_order (
        user_order_id,
        item,
        quantity,
        price,
        status,
        payment_status,
        images,
        custom_fields,
        extra_price
    )
    VALUES (
        v_user_order_id,
        p_item,
        p_quantity,
        p_price,
        'pending',
        'not_paid',
        p_images,
        p_custom_fields,
        p_extra_price
    )
    RETURNING id INTO v_dish_order_id;

    RETURN v_dish_order_id;
END;
$$ LANGUAGE plpgsql;

-- 9. Actualizar get_table_order_summary para incluir restaurant_id
-- Primero eliminar versiones anteriores
DROP FUNCTION IF EXISTS get_table_order_summary(INTEGER);
DROP FUNCTION IF EXISTS get_table_order_summary(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_table_order_summary(
    p_table_number INTEGER,
    p_restaurant_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    table_order_id UUID,
    table_number INTEGER,
    restaurant_id INTEGER,
    status VARCHAR(20),
    total_amount DECIMAL(10,2),
    paid_amount DECIMAL(10,2),
    remaining_amount DECIMAL(10,2),
    no_items INTEGER,
    created_at TIMESTAMP
) AS $$
BEGIN
    IF p_restaurant_id IS NOT NULL THEN
        RETURN QUERY
        SELECT
            "to".id,
            t.table_number,
            t.restaurant_id,
            "to".status,
            "to".total_amount,
            "to".paid_amount,
            "to".remaining_amount,
            "to".no_items,
            "to".created_at
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        WHERE t.table_number = p_table_number
        AND t.restaurant_id = p_restaurant_id
        AND "to".status IN ('not_paid', 'partial')
        ORDER BY "to".created_at DESC
        LIMIT 1;
    ELSE
        -- Retrocompatibilidad
        RETURN QUERY
        SELECT
            "to".id,
            t.table_number,
            t.restaurant_id,
            "to".status,
            "to".total_amount,
            "to".paid_amount,
            "to".remaining_amount,
            "to".no_items,
            "to".created_at
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        WHERE t.table_number = p_table_number
        AND "to".status IN ('not_paid', 'partial')
        ORDER BY "to".created_at DESC
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 10. Actualizar el trigger update_table_order_totals para incluir extra_price
-- IMPORTANTE: Este trigger calcula automáticamente los totales cuando se pagan items
CREATE OR REPLACE FUNCTION update_table_order_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_table_order_id UUID;
    v_total_amount DECIMAL(10,2);
    v_paid_from_items DECIMAL(10,2);
    v_paid_from_items_before DECIMAL(10,2);
    v_current_paid_amount DECIMAL(10,2);
    v_paid_by_amount DECIMAL(10,2) DEFAULT 0;
    v_final_paid_amount DECIMAL(10,2);
    v_no_items INTEGER;
BEGIN
    -- Obtener table_order_id
    IF TG_OP = 'DELETE' THEN
        SELECT uo.table_order_id INTO v_table_order_id
        FROM user_order uo WHERE uo.id = OLD.user_order_id;
    ELSE
        SELECT uo.table_order_id INTO v_table_order_id
        FROM user_order uo WHERE uo.id = NEW.user_order_id;
    END IF;

    -- Obtener el paid_amount actual (incluye pagos por monto + por items)
    SELECT paid_amount INTO v_current_paid_amount
    FROM table_order
    WHERE id = v_table_order_id;

    -- Calcular totales actuales de items (después del trigger) - INCLUYENDO extra_price
    SELECT
        COALESCE(SUM("do".quantity * ("do".price + COALESCE("do".extra_price, 0))), 0),
        COALESCE(SUM(CASE WHEN "do".payment_status = 'paid' THEN "do".quantity * ("do".price + COALESCE("do".extra_price, 0)) ELSE 0 END), 0),
        COALESCE(SUM("do".quantity), 0)
    INTO v_total_amount, v_paid_from_items, v_no_items
    FROM dish_order "do"
    JOIN user_order uo ON "do".user_order_id = uo.id
    WHERE uo.table_order_id = v_table_order_id;

    -- Calcular cuánto había pagado por items ANTES de este trigger
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'not_paid' AND NEW.payment_status = 'paid' THEN
        -- Si estamos pagando un item, calcular sin incluir este item - INCLUYENDO extra_price
        v_paid_from_items_before := v_paid_from_items - (NEW.quantity * (NEW.price + COALESCE(NEW.extra_price, 0)));
    ELSE
        v_paid_from_items_before := v_paid_from_items;
    END IF;

    -- Calcular cuánto se ha pagado por "monto" (no por items específicos)
    -- Es la diferencia entre el paid_amount actual y lo que estaba pagado por items antes
    v_paid_by_amount := GREATEST(0, v_current_paid_amount - v_paid_from_items_before);

    -- El paid_amount final es: pagos por items + pagos por monto
    v_final_paid_amount := v_paid_from_items + v_paid_by_amount;

    -- Actualizar table_order
    UPDATE table_order
    SET
        total_amount = v_total_amount,
        paid_amount = v_final_paid_amount,
        remaining_amount = v_total_amount - v_final_paid_amount,
        no_items = v_no_items,
        status = CASE
            WHEN v_final_paid_amount >= v_total_amount AND v_total_amount > 0 THEN 'paid'
            WHEN v_final_paid_amount > 0 THEN 'partial'
            ELSE 'not_paid'
        END
    WHERE id = v_table_order_id;

    -- Auto-cerrar cuenta si está totalmente pagada
    IF v_final_paid_amount > 0 AND v_final_paid_amount >= v_total_amount THEN
        PERFORM close_table_order_if_paid(v_table_order_id);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Recrear los triggers para usar la función actualizada
DROP TRIGGER IF EXISTS trigger_update_totals_on_dish_insert ON dish_order;
DROP TRIGGER IF EXISTS trigger_update_totals_on_dish_update ON dish_order;
DROP TRIGGER IF EXISTS trigger_update_totals_on_dish_delete ON dish_order;

CREATE TRIGGER trigger_update_totals_on_dish_insert
    AFTER INSERT ON dish_order
    FOR EACH ROW EXECUTE FUNCTION update_table_order_totals();

CREATE TRIGGER trigger_update_totals_on_dish_update
    AFTER UPDATE ON dish_order
    FOR EACH ROW EXECUTE FUNCTION update_table_order_totals();

CREATE TRIGGER trigger_update_totals_on_dish_delete
    AFTER DELETE ON dish_order
    FOR EACH ROW EXECUTE FUNCTION update_table_order_totals();

-- 11a. Actualizar función close_table_order_if_paid
-- Esta función es requerida por los triggers y otras funciones de pago
DROP FUNCTION IF EXISTS close_table_order_if_paid(UUID) CASCADE;

CREATE OR REPLACE FUNCTION close_table_order_if_paid(p_table_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_remaining_amount DECIMAL(10,2);
    v_table_id UUID;
BEGIN
    -- Verificar si queda algo por pagar
    SELECT remaining_amount, table_id
    INTO v_remaining_amount, v_table_id
    FROM table_order
    WHERE id = p_table_order_id;

    IF v_remaining_amount <= 0 THEN
        -- Cerrar la orden
        UPDATE table_order
        SET
            status = 'paid',
            closed_at = NOW()
        WHERE id = p_table_order_id;

        -- Liberar la mesa
        UPDATE tables
        SET status = 'available'
        WHERE id = v_table_id;

        -- Limpiar split_payments de esta mesa (si existe la tabla)
        DELETE FROM split_payments
        WHERE table_number = (
            SELECT table_number
            FROM tables
            WHERE id = v_table_id
        );

        -- Limpiar active_table_users de esta mesa
        DELETE FROM active_table_users
        WHERE table_number = (
            SELECT table_number
            FROM tables
            WHERE id = v_table_id
        );

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 11b. Actualizar pay_dish_order (no requiere cambios de restaurant_id porque usa dish_order_id directamente)
CREATE OR REPLACE FUNCTION pay_dish_order(p_dish_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_dish_price DECIMAL(10,2);
    v_table_order_id UUID;
BEGIN
    -- Verificar que el platillo existe y no está pagado - INCLUYENDO extra_price
    SELECT ("do".quantity * ("do".price + COALESCE("do".extra_price, 0))), uo.table_order_id
    INTO v_dish_price, v_table_order_id
    FROM dish_order "do"
    JOIN user_order uo ON "do".user_order_id = uo.id
    WHERE "do".id = p_dish_order_id AND "do".payment_status = 'not_paid';

    IF v_dish_price IS NULL THEN
        RAISE EXCEPTION 'Platillo no encontrado o ya está pagado';
    END IF;

    -- Marcar platillo como pagado
    UPDATE dish_order
    SET payment_status = 'paid'
    WHERE id = p_dish_order_id;

    -- Los totales se actualizan automáticamente por el trigger

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 12. Actualizar pay_table_amount para incluir restaurant_id
-- Primero eliminar todas las versiones anteriores de la función
DROP FUNCTION IF EXISTS pay_table_amount(INTEGER, DECIMAL);
DROP FUNCTION IF EXISTS pay_table_amount(INTEGER, DECIMAL, INTEGER);

-- Crear la nueva versión con restaurant_id
CREATE OR REPLACE FUNCTION pay_table_amount(
    p_table_number INTEGER,
    p_amount DECIMAL(10,2),
    p_restaurant_id INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_table_order_id UUID;
    v_current_paid DECIMAL(10,2);
    v_total_amount DECIMAL(10,2);
    v_new_paid_amount DECIMAL(10,2);
    v_remaining_amount DECIMAL(10,2);
BEGIN
    -- Buscar orden activa de la mesa (filtrando por restaurant_id si se proporciona)
    IF p_restaurant_id IS NOT NULL THEN
        SELECT "to".id, "to".paid_amount, "to".total_amount
        INTO v_table_order_id, v_current_paid, v_total_amount
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        WHERE t.table_number = p_table_number
        AND t.restaurant_id = p_restaurant_id
        AND "to".status IN ('not_paid', 'partial');
    ELSE
        -- Retrocompatibilidad
        SELECT "to".id, "to".paid_amount, "to".total_amount
        INTO v_table_order_id, v_current_paid, v_total_amount
        FROM table_order "to"
        JOIN tables t ON "to".table_id = t.id
        WHERE t.table_number = p_table_number
        AND "to".status IN ('not_paid', 'partial');
    END IF;

    IF v_table_order_id IS NULL THEN
        RAISE EXCEPTION 'No hay cuenta activa para la mesa %', p_table_number;
    END IF;

    -- Calcular nuevo monto pagado
    v_new_paid_amount := v_current_paid + p_amount;
    v_remaining_amount := v_total_amount - v_new_paid_amount;

    -- Validar que no se pague de más
    IF v_new_paid_amount > v_total_amount THEN
        RAISE EXCEPTION 'El monto a pagar ($%) excede lo adeudado ($%)',
                        p_amount, (v_total_amount - v_current_paid);
    END IF;

    -- Actualizar montos en table_order
    UPDATE table_order
    SET
        paid_amount = v_new_paid_amount,
        remaining_amount = v_remaining_amount,
        status = CASE
            WHEN v_new_paid_amount = 0 THEN 'not_paid'
            WHEN v_new_paid_amount < v_total_amount THEN 'partial'
            ELSE 'paid'
        END
    WHERE id = v_table_order_id;

    -- Auto-cerrar mesa si está completamente pagada
    IF v_remaining_amount <= 0 THEN
        PERFORM close_table_order_if_paid(v_table_order_id);
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- COMENTARIOS Y NOTAS IMPORTANTES
-- ===============================================
-- PASO CRÍTICO: Después de ejecutar este script, DEBES asignar restaurant_id
-- a todas las mesas existentes. Sin esto, los pagos y órdenes no funcionarán.

-- Opción 1: Asignar todas las mesas existentes a un restaurante específico
-- Primero, verifica qué restaurantes existen:
-- SELECT id, name FROM restaurants;

-- Luego asigna el restaurant_id (reemplaza 1 con el ID de tu restaurante):
-- UPDATE tables SET restaurant_id = 1 WHERE restaurant_id IS NULL;

-- Opción 2: Crear nuevas mesas para un restaurante específico
-- INSERT INTO tables (table_number, restaurant_id, status)
-- VALUES
--   (1, 1, 'available'),
--   (2, 1, 'available'),
--   (3, 1, 'available'),
--   (4, 1, 'available');

-- Verificar que todas las mesas tienen restaurant_id asignado:
-- SELECT table_number, restaurant_id, status FROM tables ORDER BY restaurant_id, table_number;
