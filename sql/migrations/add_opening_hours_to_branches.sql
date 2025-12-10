-- ===============================================
-- MIGRATION: Add opening_hours to branches table
-- Description: Add opening_hours JSONB column to branches
--             to allow each branch to have specific schedules
-- ===============================================

-- Add opening_hours column to branches table
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS opening_hours JSONB;

-- Set default opening hours for existing branches (if they don't have any)
-- Using the same structure as restaurants table
UPDATE branches
SET opening_hours = '{
  "friday": {"is_closed": false, "open_time": "09:00", "close_time": "23:00"},
  "monday": {"is_closed": false, "open_time": "09:00", "close_time": "22:00"},
  "sunday": {"is_closed": false, "open_time": "10:00", "close_time": "20:00"},
  "tuesday": {"is_closed": false, "open_time": "09:00", "close_time": "22:00"},
  "saturday": {"is_closed": false, "open_time": "10:00", "close_time": "23:00"},
  "thursday": {"is_closed": false, "open_time": "09:00", "close_time": "22:00"},
  "wednesday": {"is_closed": false, "open_time": "09:00", "close_time": "22:00"}
}'::jsonb
WHERE opening_hours IS NULL;

-- Create index for better performance on opening_hours queries
CREATE INDEX IF NOT EXISTS idx_branches_opening_hours
ON branches USING GIN (opening_hours);

SELECT 'opening_hours column added to branches table' as status;

-- ===============================================
-- VERIFICATION QUERIES (commented out)
-- ===============================================

-- Check branches with their opening_hours
-- SELECT id, name, opening_hours
-- FROM branches
-- WHERE opening_hours IS NOT NULL
-- ORDER BY name;

-- Check structure consistency between restaurants and branches
-- SELECT
--   'restaurants' as table_name,
--   jsonb_object_keys(opening_hours) as days
-- FROM restaurants
-- WHERE opening_hours IS NOT NULL
-- LIMIT 1
-- UNION ALL
-- SELECT
--   'branches' as table_name,
--   jsonb_object_keys(opening_hours) as days
-- FROM branches
-- WHERE opening_hours IS NOT NULL
-- LIMIT 1;

-- ===============================================
-- NOTES:
-- ===============================================
-- - opening_hours column is NULLABLE to allow branches without specific schedules
-- - Default values are set for existing branches to maintain functionality
-- - JSONB structure matches restaurants table for consistency
-- - GIN index created for efficient JSON queries
-- - Each branch can now have independent opening hours