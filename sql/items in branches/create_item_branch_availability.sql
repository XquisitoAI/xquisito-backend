-- ===============================================
-- SISTEMA DE DISPONIBILIDAD DE ITEMS POR SUCURSAL
-- ===============================================
-- Description:
--   This migration creates the item_branch_availability table
--   to control which menu items are available at each branch.
--   This allows restaurants with multiple branches to have
--   different menu offerings per location.
-- ===============================================

-- Step 1: Create item_branch_availability table
CREATE TABLE IF NOT EXISTS item_branch_availability (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    branch_id UUID NOT NULL,
    is_available BOOLEAN DEFAULT true,
    -- Optional fields for future features:
    -- stock INTEGER,
    -- branch_specific_price DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Foreign Keys
    CONSTRAINT fk_item_branch_availability_item
        FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_branch_availability_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,

    -- Unique constraint: one item can only have one availability record per branch
    CONSTRAINT item_branch_availability_unique
        UNIQUE (item_id, branch_id)
);

-- Step 2: Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_item_branch_availability_item_id
    ON item_branch_availability(item_id);

CREATE INDEX IF NOT EXISTS idx_item_branch_availability_branch_id
    ON item_branch_availability(branch_id);

CREATE INDEX IF NOT EXISTS idx_item_branch_availability_is_available
    ON item_branch_availability(is_available);

-- Composite index for common query pattern (branch + available items)
CREATE INDEX IF NOT EXISTS idx_item_branch_availability_branch_available
    ON item_branch_availability(branch_id, is_available)
    WHERE is_available = true;

-- Step 3: Create trigger for updated_at
CREATE TRIGGER trigger_update_item_branch_availability_updated_at
    BEFORE UPDATE ON item_branch_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 4: Enable Row Level Security
ALTER TABLE item_branch_availability ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policy (allow all for now, adjust based on auth requirements)
DROP POLICY IF EXISTS "Allow all operations on item_branch_availability" ON item_branch_availability;
CREATE POLICY "Allow all operations on item_branch_availability"
    ON item_branch_availability
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ===============================================
-- FUNCTION: Get menu filtered by branch
-- ===============================================
-- This function returns the complete menu (sections + items)
-- filtered by branch availability
-- ===============================================

CREATE OR REPLACE FUNCTION get_menu_by_branch(p_restaurant_id INTEGER, p_branch_id UUID)
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', ms.id,
                'name', ms.name,
                'is_active', ms.is_active,
                'display_order', ms.display_order,
                'created_at', ms.created_at,
                'updated_at', ms.updated_at,
                'items', COALESCE(items.items, '[]'::jsonb)
            ) ORDER BY ms.display_order, ms.id
        )
        FROM menu_sections ms
        LEFT JOIN (
            SELECT
                mi.section_id,
                jsonb_agg(
                    jsonb_build_object(
                        'id', mi.id,
                        'name', mi.name,
                        'description', mi.description,
                        'image_url', mi.image_url,
                        'price', mi.price,
                        'discount', mi.discount,
                        'custom_fields', mi.custom_fields,
                        'is_available', mi.is_available,
                        'display_order', mi.display_order,
                        'created_at', mi.created_at,
                        'updated_at', mi.updated_at
                    ) ORDER BY mi.display_order, mi.id
                ) as items
            FROM menu_items mi
            LEFT JOIN item_branch_availability iba
                ON mi.id = iba.item_id AND iba.branch_id = p_branch_id
            WHERE mi.is_available = true
                -- Item is available if:
                -- 1. No branch-specific availability record exists (available everywhere by default)
                -- 2. OR branch-specific record exists and is_available = true
                AND (iba.id IS NULL OR iba.is_available = true)
            GROUP BY mi.section_id
        ) items ON ms.id = items.section_id
        WHERE ms.restaurant_id = p_restaurant_id
            AND ms.is_active = true
    );
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- FUNCTION: Get branches where an item is available
-- ===============================================

CREATE OR REPLACE FUNCTION get_item_available_branches(p_item_id INTEGER)
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', b.id,
                'name', b.name,
                'branch_number', b.branch_number,
                'is_available', COALESCE(iba.is_available, true)
            )
        )
        FROM branches b
        CROSS JOIN menu_items mi
        LEFT JOIN item_branch_availability iba
            ON b.id = iba.branch_id AND mi.id = iba.item_id
        WHERE mi.id = p_item_id
            AND b.client_id = (
                SELECT r.user_id
                FROM menu_sections ms
                JOIN restaurants r ON ms.restaurant_id = r.id
                WHERE ms.id = mi.section_id
                LIMIT 1
            )
    );
END;
$$ LANGUAGE plpgsql;

-- ===============================================
-- NOTA IMPORTANTE: FUNCIÓN ACTUALIZADA
-- ===============================================
-- La función set_item_branch_availability ha sido actualizada.
-- Ejecutar el archivo: update_set_item_branch_availability_by_restaurant.sql
-- después de este archivo para obtener la versión correcta.
-- ===============================================

-- ===============================================
-- COMMENTS FOR DOCUMENTATION
-- ===============================================

COMMENT ON TABLE item_branch_availability IS
    'Controls which menu items are available at each branch. Each item should have a record for EACH branch of the restaurant, with is_available = true/false.';

COMMENT ON COLUMN item_branch_availability.item_id IS
    'Reference to the menu item';

COMMENT ON COLUMN item_branch_availability.branch_id IS
    'Reference to the branch where this availability setting applies';

COMMENT ON COLUMN item_branch_availability.is_available IS
    'Whether the item is available at this branch. true = available, false = not available. For backwards compatibility, if no record exists, item is considered available.';

COMMENT ON FUNCTION get_menu_by_branch(INTEGER, UUID) IS
    'Returns the complete menu (sections with items) filtered by branch availability. Only includes items where is_available = true OR no record exists (backwards compatibility).';

COMMENT ON FUNCTION get_item_available_branches(INTEGER) IS
    'Returns all branches for a restaurant along with the availability status of the specified item at each branch.';
