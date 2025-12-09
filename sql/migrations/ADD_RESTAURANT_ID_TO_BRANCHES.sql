-- ===============================================
-- Add restaurant_id to branches table
-- ===============================================

-- Add restaurant_id column
ALTER TABLE branches ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;

-- Set restaurant_id = client_id for existing rows (or update as needed)
-- You'll need to adjust this UPDATE based on your business logic
UPDATE branches SET restaurant_id = 1 WHERE restaurant_id IS NULL;

-- Make NOT NULL
ALTER TABLE branches ALTER COLUMN restaurant_id SET NOT NULL;

-- Add unique constraint
ALTER TABLE branches
ADD CONSTRAINT branches_restaurant_branch_unique
UNIQUE (restaurant_id, branch_number);

SELECT 'restaurant_id added to branches table' as status;
