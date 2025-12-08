-- ============================================================================
-- AUTO-GENERACIÓN DE MESAS AL CREAR/EDITAR SUCURSALES
-- ============================================================================

-- Función para crear mesas automáticamente al insertar branch
CREATE OR REPLACE FUNCTION auto_create_tables_on_branch_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Crear mesas numeradas del 1 al número especificado
  FOR i IN 1..NEW.tables LOOP
    INSERT INTO public.tables (
      table_number,
      status,
      restaurant_id,
      branch_id,
      created_at,
      updated_at
    ) VALUES (
      i,
      'available',
      (
        -- Obtener restaurant_id basado en client_id de la branch
        SELECT r.id
        FROM public.restaurants r
        WHERE r.client_id = NEW.client_id
        LIMIT 1
      ),
      NEW.id,
      NOW(),
      NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función para manejar edición de número de mesas
CREATE OR REPLACE FUNCTION auto_update_tables_on_branch_update()
RETURNS TRIGGER AS $$
DECLARE
  current_table_count INTEGER;
  table_diff INTEGER;
  restaurant_id_val INTEGER;
BEGIN
  -- Obtener restaurant_id
  SELECT r.id INTO restaurant_id_val
  FROM public.restaurants r
  WHERE r.client_id = NEW.client_id
  LIMIT 1;

  -- Contar mesas actuales de esta sucursal
  SELECT COUNT(*) INTO current_table_count
  FROM public.tables
  WHERE branch_id = NEW.id;

  table_diff := NEW.tables - current_table_count;

  -- Si aumentó el número de mesas, crear las nuevas
  IF table_diff > 0 THEN
    FOR i IN (current_table_count + 1)..(current_table_count + table_diff) LOOP
      INSERT INTO public.tables (
        table_number,
        status,
        restaurant_id,
        branch_id,
        created_at,
        updated_at
      ) VALUES (
        i,
        'available',
        restaurant_id_val,
        NEW.id,
        NOW(),
        NOW()
      );
    END LOOP;

  -- Si disminuyó el número de mesas, eliminar las últimas (solo si están 'available')
  ELSIF table_diff < 0 THEN
    -- Verificar que las mesas a eliminar no estén ocupadas
    IF EXISTS (
      SELECT 1 FROM public.tables
      WHERE branch_id = NEW.id
      AND table_number > NEW.tables
      AND status != 'available'
    ) THEN
      RAISE EXCEPTION 'No se pueden eliminar mesas que están ocupadas, reservadas o en mantenimiento';
    END IF;

    -- Eliminar mesas sobrantes (las de mayor número)
    DELETE FROM public.tables
    WHERE branch_id = NEW.id
    AND table_number > NEW.tables;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para crear mesas al insertar branch
DROP TRIGGER IF EXISTS trigger_auto_create_tables ON public.branches;
CREATE TRIGGER trigger_auto_create_tables
  AFTER INSERT ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_tables_on_branch_insert();

-- Trigger para actualizar mesas al editar branch
DROP TRIGGER IF EXISTS trigger_auto_update_tables ON public.branches;
CREATE TRIGGER trigger_auto_update_tables
  AFTER UPDATE OF tables ON public.branches
  FOR EACH ROW
  WHEN (OLD.tables IS DISTINCT FROM NEW.tables)
  EXECUTE FUNCTION auto_update_tables_on_branch_update();

-- Constraint para asegurar table_number único por branch_id
ALTER TABLE public.tables
DROP CONSTRAINT IF EXISTS unique_table_number_per_branch;

ALTER TABLE public.tables
ADD CONSTRAINT unique_table_number_per_branch
UNIQUE (branch_id, table_number);

-- Comentarios para documentación
COMMENT ON FUNCTION auto_create_tables_on_branch_insert() IS
'Crea mesas automáticamente al insertar una nueva sucursal. Genera mesas numeradas del 1 al número especificado en la sucursal.';

COMMENT ON FUNCTION auto_update_tables_on_branch_update() IS
'Actualiza el número de mesas automáticamente al editar una sucursal. Agrega o elimina mesas según el nuevo número especificado.';

COMMENT ON CONSTRAINT unique_table_number_per_branch ON public.tables IS
'Asegura que el número de mesa sea único dentro de cada sucursal.';