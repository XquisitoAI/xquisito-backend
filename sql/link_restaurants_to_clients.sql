-- ============================================
-- MIGRATION: Link Restaurants to Clients
-- Description:
--   1. Add client_id column to restaurants table
--   2. Create foreign key relationship to clients table
--   3. Allow restaurants to be linked to clients (main portal)
-- ============================================

-- Step 1: Add client_id to restaurants table
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS client_id UUID;

-- Step 2: Add foreign key constraint
ALTER TABLE restaurants
ADD CONSTRAINT fk_restaurants_client
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- Step 3: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_restaurants_client_id ON restaurants(client_id);

-- ============================================
-- NOTES:
-- ============================================
-- - client_id is NULLABLE because existing restaurants may not have a client yet
-- - ON DELETE SET NULL allows restaurants to exist even if client is deleted
-- - This creates a link between Admin Portal (restaurants) and Main Portal (clients/branches)
-- - A restaurant can now have multiple branches through its client_id

-- ============================================
-- VERIFICATION QUERIES (commented out)
-- ============================================

-- Check restaurants with their client_id
-- SELECT id, name, client_id, is_active
-- FROM restaurants
-- ORDER BY client_id, name;

-- Check clients with their linked restaurants
-- SELECT
--   c.id as client_id,
--   c.name as client_name,
--   r.id as restaurant_id,
--   r.name as restaurant_name
-- FROM clients c
-- LEFT JOIN restaurants r ON r.client_id = c.id
-- ORDER BY c.name, r.name;

-- ============================================
-- ROLLBACK (if needed)
-- ============================================

-- To rollback this migration:
-- ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS fk_restaurants_client;
-- ALTER TABLE restaurants DROP COLUMN IF EXISTS client_id;
-- DROP INDEX IF EXISTS idx_restaurants_client_id;
