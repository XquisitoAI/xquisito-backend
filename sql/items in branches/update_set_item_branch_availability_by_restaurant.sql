-- ===============================================
-- ACTUALIZACIÓN: set_item_branch_availability
-- Versión final usando restaurant_id
-- ===============================================

-- Eliminar función anterior si existe
DROP FUNCTION IF EXISTS set_item_branch_availability(INTEGER, UUID[], BOOLEAN);

-- Crear función final que recibe restaurant_id
CREATE OR REPLACE FUNCTION set_item_branch_availability(
    p_item_id INTEGER,
    p_restaurant_id INTEGER,
    p_selected_branch_ids UUID[]  -- Array de branch_ids seleccionados
)
RETURNS BOOLEAN AS $$
DECLARE
    v_client_id UUID;
    all_branches UUID[];
    branch_id UUID;
    is_selected BOOLEAN;
BEGIN
    -- 1. Obtener client_id del restaurante
    SELECT client_id
    INTO v_client_id
    FROM restaurants
    WHERE id = p_restaurant_id;

    IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'Restaurant % not found or has no client_id', p_restaurant_id;
    END IF;

    -- 2. Obtener todas las sucursales activas del cliente
    SELECT array_agg(id)
    INTO all_branches
    FROM branches
    WHERE client_id = v_client_id AND active = true;

    IF all_branches IS NULL OR array_length(all_branches, 1) IS NULL THEN
        RAISE EXCEPTION 'No active branches found for restaurant %', p_restaurant_id;
    END IF;

    -- 3. Eliminar todos los registros existentes para este item
    DELETE FROM item_branch_availability WHERE item_id = p_item_id;

    -- 4. Insertar un registro para CADA sucursal
    FOREACH branch_id IN ARRAY all_branches
    LOOP
        -- Verificar si esta sucursal está en las seleccionadas
        is_selected := branch_id = ANY(p_selected_branch_ids);

        INSERT INTO item_branch_availability (item_id, branch_id, is_available)
        VALUES (p_item_id, branch_id, is_selected);
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- EJEMPLOS DE USO
-- ===============================================

-- EJEMPLO 1: Usuario selecciona "Suc1" y "Suc2" (de 3 sucursales totales)
/*
SELECT set_item_branch_availability(
    123,                                    -- item_id
    1,                                      -- restaurant_id
    ARRAY['uuid-suc1', 'uuid-suc2']::UUID[] -- solo las seleccionadas
);

Resultado en DB:
┌─────────┬───────────┬──────────────┐
│ item_id │ branch_id │ is_available │
├─────────┼───────────┼──────────────┤
│ 123     │ uuid-suc1 │ true         │
│ 123     │ uuid-suc2 │ true         │
│ 123     │ uuid-suc3 │ false        │
└─────────┴───────────┴──────────────┘
*/

-- EJEMPLO 2: Usuario selecciona "Todas" (3 sucursales)
/*
SELECT set_item_branch_availability(
    123,
    1,
    ARRAY['uuid-suc1', 'uuid-suc2', 'uuid-suc3']::UUID[]
);

Resultado en DB:
┌─────────┬───────────┬──────────────┐
│ item_id │ branch_id │ is_available │
├─────────┼───────────┼──────────────┤
│ 123     │ uuid-suc1 │ true         │
│ 123     │ uuid-suc2 │ true         │
│ 123     │ uuid-suc3 │ true         │
└─────────┴───────────┴──────────────┘
*/

-- EJEMPLO 3: Usuario NO selecciona ninguna (item no disponible)
/*
SELECT set_item_branch_availability(
    123,
    1,
    ARRAY[]::UUID[]
);

Resultado en DB:
┌─────────┬───────────┬──────────────┐
│ item_id │ branch_id │ is_available │
├─────────┼───────────┼──────────────┤
│ 123     │ uuid-suc1 │ false        │
│ 123     │ uuid-suc2 │ false        │
│ 123     │ uuid-suc3 │ false        │
└─────────┴───────────┴──────────────┘
*/
