-- ===============================================
-- Add UNIQUE constraint on (restaurant_id, branch_number) to branches table
-- ===============================================
-- This is required before we can create foreign keys referencing these columns

-- First, verify branches has both columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'branches'
AND column_name IN ('restaurant_id', 'branch_number');

-- Add the unique constraint
ALTER TABLE branches
ADD CONSTRAINT branches_restaurant_branch_unique
UNIQUE (restaurant_id, branch_number);

SELECT 'Unique constraint added to branches table' as status;
