-- ====================================================
-- Migración: Agregar item_features a cart_items si no existe
-- ====================================================

-- Verificar y agregar la columna item_features si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'cart_items'
        AND column_name = 'item_features'
    ) THEN
        ALTER TABLE cart_items
        ADD COLUMN item_features TEXT[] DEFAULT ARRAY[]::TEXT[];

        RAISE NOTICE 'Columna item_features agregada a cart_items';
    ELSE
        RAISE NOTICE 'Columna item_features ya existe en cart_items';
    END IF;
END $$;
