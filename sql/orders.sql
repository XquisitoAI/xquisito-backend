-- Tabla de mesas
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number INTEGER NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orden por mesa (la cuenta activa)
CREATE TABLE table_order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL,
    no_items INT DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    paid_amount DECIMAL(10,2) DEFAULT 0,
    remaining_amount DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) CHECK (status IN ('not_paid', 'partial', 'paid')) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    CONSTRAINT fk_table FOREIGN KEY (table_id) REFERENCES tables(id)
);

-- Relación de usuarios con la orden
-- (puede ser usuario de Clerk o invitado)
CREATE TABLE user_order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_order_id UUID NOT NULL,
    user_id VARCHAR(255) NULL,  -- ID que viene de Clerk
    guest_name VARCHAR(255) NULL,
    CONSTRAINT fk_table_order FOREIGN KEY (table_order_id) REFERENCES table_order(id)
);

-- Platillos ordenados por usuario
CREATE TABLE dish_order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_order_id UUID NOT NULL,
    item VARCHAR(50) NOT NULL,
    quantity INT DEFAULT 1,
    price DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) CHECK (status IN ('pending', 'cooking', 'delivered')) NOT NULL,
    payment_status VARCHAR(20) CHECK (payment_status IN ('not_paid', 'paid')) NOT NULL,
    CONSTRAINT fk_user_order FOREIGN KEY (user_order_id) REFERENCES user_order(id)
);

-- ===============================================
-- FUNCIONES Y TRIGGERS PARA MANEJO DE ÓRDENES
-- ===============================================

-- 1. Función para abrir una nueva cuenta de mesa
CREATE OR REPLACE FUNCTION open_table_order(p_table_number INTEGER)
RETURNS UUID AS $$
DECLARE
    v_table_id UUID;
    v_order_id UUID;
BEGIN
    -- Verificar que la mesa existe y está disponible
    SELECT id INTO v_table_id
    FROM tables
    WHERE table_number = p_table_number AND status = 'available';

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Mesa % no está disponible', p_table_number;
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

-- 2. Función para agregar un usuario a una orden (si no existe)
CREATE OR REPLACE FUNCTION add_user_to_order(
    p_table_order_id UUID,
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_guest_name VARCHAR(255) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_user_order_id UUID;
BEGIN
    -- Verificar si el usuario ya existe en la orden
    SELECT id INTO v_user_order_id
    FROM user_order
    WHERE table_order_id = p_table_order_id
    AND (user_id = p_user_id OR guest_name = p_guest_name);

    -- Si no existe, crear nuevo user_order
    IF v_user_order_id IS NULL THEN
        INSERT INTO user_order (table_order_id, user_id, guest_name)
        VALUES (p_table_order_id, p_user_id, p_guest_name)
        RETURNING id INTO v_user_order_id;
    END IF;

    RETURN v_user_order_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Función principal para crear una nueva orden de platillo
CREATE OR REPLACE FUNCTION create_dish_order(
    p_table_number INTEGER,
    p_item VARCHAR(50),
    p_price DECIMAL(10,2),
    p_user_id VARCHAR(255) DEFAULT NULL,
    p_guest_name VARCHAR(255) DEFAULT NULL,
    p_quantity INTEGER DEFAULT 1
) RETURNS UUID AS $$
DECLARE
    v_table_order_id UUID;
    v_user_order_id UUID;
    v_dish_order_id UUID;
BEGIN
    -- Buscar orden activa para la mesa o crear una nueva
    SELECT "to".id INTO v_table_order_id
    FROM table_order "to"
    JOIN tables t ON "to".table_id = t.id
    WHERE t.table_number = p_table_number
    AND "to".status IN ('not_paid', 'partial');

    -- Si no hay orden activa, crear una nueva
    IF v_table_order_id IS NULL THEN
        v_table_order_id := open_table_order(p_table_number);
    END IF;

    -- Agregar usuario a la orden
    v_user_order_id := add_user_to_order(v_table_order_id, p_user_id, p_guest_name);

    -- Crear el platillo
    INSERT INTO dish_order (user_order_id, item, quantity, price, status, payment_status)
    VALUES (v_user_order_id, p_item, p_quantity, p_price, 'pending', 'not_paid')
    RETURNING id INTO v_dish_order_id;

    RETURN v_dish_order_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Función para pagar un platillo individual
CREATE OR REPLACE FUNCTION pay_dish_order(p_dish_order_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_dish_price DECIMAL(10,2);
    v_table_order_id UUID;
BEGIN
    -- Verificar que el platillo existe y no está pagado
    SELECT ("do".quantity * "do".price), uo.table_order_id
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

-- 5. Función para cerrar cuenta cuando todo está pagado
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

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- TRIGGERS PARA ACTUALIZAR TOTALES AUTOMÁTICAMENTE
-- ===============================================

-- Función para actualizar totales de table_order
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

    -- Calcular totales actuales de items (después del trigger)
    SELECT
        COALESCE(SUM("do".quantity * "do".price), 0),
        COALESCE(SUM(CASE WHEN "do".payment_status = 'paid' THEN "do".quantity * "do".price ELSE 0 END), 0),
        COALESCE(SUM("do".quantity), 0)
    INTO v_total_amount, v_paid_from_items, v_no_items
    FROM dish_order "do"
    JOIN user_order uo ON "do".user_order_id = uo.id
    WHERE uo.table_order_id = v_table_order_id;

    -- Calcular cuánto había pagado por items ANTES de este trigger
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'not_paid' AND NEW.payment_status = 'paid' THEN
        -- Si estamos pagando un item, calcular sin incluir este item
        v_paid_from_items_before := v_paid_from_items - (NEW.quantity * NEW.price);
    ELSE
        -- Para INSERT/DELETE, usar el valor actual de items pagados
        v_paid_from_items_before := v_paid_from_items;
    END IF;

    -- Calcular pagos por monto = total pagado actual - lo que había por items antes
    v_paid_by_amount := v_current_paid_amount - v_paid_from_items_before;
    IF v_paid_by_amount < 0 THEN
        v_paid_by_amount := 0;
    END IF;

    -- Total pagado = pagos por items (actual) + pagos por monto
    v_final_paid_amount := v_paid_from_items + v_paid_by_amount;

    -- Actualizar table_order
    UPDATE table_order
    SET
        total_amount = v_total_amount,
        paid_amount = v_final_paid_amount,
        remaining_amount = v_total_amount - v_final_paid_amount,
        no_items = v_no_items,
        status = CASE
            WHEN v_final_paid_amount = 0 THEN 'not_paid'
            WHEN v_final_paid_amount < v_total_amount THEN 'partial'
            ELSE 'paid'
        END
    WHERE id = v_table_order_id;

    -- Auto-cerrar cuenta si está totalmente pagada
    IF v_final_paid_amount > 0 AND v_final_paid_amount >= v_total_amount THEN
        PERFORM close_table_order_if_paid(v_table_order_id);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers para dish_order
CREATE TRIGGER trigger_update_totals_on_dish_insert
    AFTER INSERT ON dish_order
    FOR EACH ROW EXECUTE FUNCTION update_table_order_totals();

CREATE TRIGGER trigger_update_totals_on_dish_update
    AFTER UPDATE ON dish_order
    FOR EACH ROW EXECUTE FUNCTION update_table_order_totals();

CREATE TRIGGER trigger_update_totals_on_dish_delete
    AFTER DELETE ON dish_order
    FOR EACH ROW EXECUTE FUNCTION update_table_order_totals();

-- ===============================================
-- FUNCIONES ADICIONALES RECOMENDADAS
-- ===============================================


-- 7. Función para actualizar estado de cocina
CREATE OR REPLACE FUNCTION update_dish_status(
    p_dish_order_id UUID,
    p_new_status VARCHAR(20)
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE dish_order
    SET status = p_new_status
    WHERE id = p_dish_order_id
    AND p_new_status IN ('pending', 'cooking', 'delivered');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Platillo no encontrado o estado inválido';
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 8. Función para obtener resumen de cuenta de mesa
CREATE OR REPLACE FUNCTION get_table_order_summary(p_table_number INTEGER)
RETURNS TABLE (
    table_order_id UUID,
    table_number INTEGER,
    status VARCHAR(20),
    total_amount DECIMAL(10,2),
    paid_amount DECIMAL(10,2),
    remaining_amount DECIMAL(10,2),
    no_items INTEGER,
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        "to".id,
        t.table_number,
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
END;
$$ LANGUAGE plpgsql;

-- Función para pago por monto (sin marcar items específicos como pagados)
CREATE OR REPLACE FUNCTION pay_table_amount(
    p_table_number INTEGER,
    p_amount DECIMAL(10,2)
) RETURNS BOOLEAN AS $$
DECLARE
    v_table_order_id UUID;
    v_current_paid DECIMAL(10,2);
    v_total_amount DECIMAL(10,2);
    v_new_paid_amount DECIMAL(10,2);
    v_remaining_amount DECIMAL(10,2);
BEGIN
    -- Buscar orden activa de la mesa
    SELECT "to".id, "to".paid_amount, "to".total_amount
    INTO v_table_order_id, v_current_paid, v_total_amount
    FROM table_order "to"
    JOIN tables t ON "to".table_id = t.id
    WHERE t.table_number = p_table_number
    AND "to".status IN ('not_paid', 'partial');

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

