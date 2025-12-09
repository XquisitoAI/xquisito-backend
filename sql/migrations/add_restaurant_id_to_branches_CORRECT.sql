-- ===============================================
-- Add restaurant_id to branches table
-- ===============================================
-- This is needed because branches belong to restaurants, not directly to clients

-- Step 1: Add restaurant_id column to branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;

-- Step 2: Populate restaurant_id from existing data
-- Match branches to restaurants using client_id
UPDATE branches b
SET restaurant_id = r.id
FROM restaurants r
WHERE b.client_id = r.client_id
AND b.restaurant_id IS NULL;

-- Verify: Check if any branches don't have a restaurant_id
-- (This would indicate branches with client_id that don't have a matching restaurant)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM branches WHERE restaurant_id IS NULL) THEN
    RAISE NOTICE 'WARNING: Some branches could not be matched to a restaurant. Setting default restaurant_id = 1';
    UPDATE branches SET restaurant_id = 1 WHERE restaurant_id IS NULL;
  ELSE
    RAISE NOTICE 'All branches successfully matched to restaurants';
  END IF;
END $$;

-- Step 3: Make restaurant_id NOT NULL
ALTER TABLE branches ALTER COLUMN restaurant_id SET NOT NULL;

-- Step 4: Add foreign key to restaurants table (if needed)
ALTER TABLE branches
ADD CONSTRAINT fk_branches_restaurant
FOREIGN KEY (restaurant_id)
REFERENCES restaurants(id)
ON DELETE CASCADE;

-- Step 5: Add unique constraint on (restaurant_id, branch_number)
-- This is required for the foreign keys from other tables
ALTER TABLE branches
ADD CONSTRAINT branches_restaurant_branch_unique
UNIQUE (restaurant_id, branch_number);

-- Step 6: Create index
CREATE INDEX IF NOT EXISTS idx_branches_restaurant_id
ON branches (restaurant_id);

SELECT 'restaurant_id added to branches table' as status;
