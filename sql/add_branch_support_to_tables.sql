-- ============================================
-- MIGRATION: Add Branch Support to Tables
-- Description:
--   1. Add branch_number column to branches table (incremental per client)
--   2. Add branch_id column to tables table (FK to branches)
--   3. Create unique constraint on (branch_id, table_number)
--   4. Create function to auto-increment branch_number per client
-- ============================================

-- Step 1: Add branch_number to branches table
-- This will be auto-incremented per client
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS branch_number INTEGER;

-- Step 2: Create function to auto-generate branch_number
CREATE OR REPLACE FUNCTION set_branch_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Get the max branch_number for this client and increment by 1
  SELECT COALESCE(MAX(branch_number), 0) + 1
  INTO NEW.branch_number
  FROM branches
  WHERE client_id = NEW.client_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger to auto-set branch_number before insert
DROP TRIGGER IF EXISTS trigger_set_branch_number ON branches;
CREATE TRIGGER trigger_set_branch_number
  BEFORE INSERT ON branches
  FOR EACH ROW
  WHEN (NEW.branch_number IS NULL)
  EXECUTE FUNCTION set_branch_number();

-- Step 4: Update existing branches with branch_number
-- This sets branch_number for existing records (grouped by client_id)
WITH numbered_branches AS (
  SELECT
    id,
    client_id,
    ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at) as new_number
  FROM branches
  WHERE branch_number IS NULL
)
UPDATE branches b
SET branch_number = nb.new_number
FROM numbered_branches nb
WHERE b.id = nb.id;

-- Step 5: Make branch_number NOT NULL after populating existing data
ALTER TABLE branches
ALTER COLUMN branch_number SET NOT NULL;

-- Step 6: Add unique constraint on (client_id, branch_number)
ALTER TABLE branches
ADD CONSTRAINT branches_client_branch_number_unique
UNIQUE (client_id, branch_number);

-- Step 7: Add branch_id to tables table
ALTER TABLE tables
ADD COLUMN IF NOT EXISTS branch_id UUID;

-- Step 8: Add foreign key constraint
ALTER TABLE tables
ADD CONSTRAINT fk_tables_branch
FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

-- Step 9: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_tables_branch_id ON tables(branch_id);

-- Step 10: Drop old unique constraint on (restaurant_id, table_number)
ALTER TABLE tables
DROP CONSTRAINT IF EXISTS tables_restaurant_table_unique;

-- Step 11: Add new unique constraint on (branch_id, table_number)
-- This allows table_number to reset per branch (e.g., Branch 1: tables 1-12, Branch 2: tables 1-8)
ALTER TABLE tables
ADD CONSTRAINT tables_branch_table_unique
UNIQUE (branch_id, table_number);

-- Step 12: Create index on branch_number for queries
CREATE INDEX IF NOT EXISTS idx_branches_branch_number ON branches(branch_number);

-- ============================================
-- VERIFICATION QUERIES (commented out)
-- ============================================

-- Check branches with their numbers
-- SELECT id, client_id, name, branch_number, tables, active
-- FROM branches
-- ORDER BY client_id, branch_number;

-- Check tables with branch_id
-- SELECT id, table_number, restaurant_id, branch_id, status
-- FROM tables
-- ORDER BY branch_id, table_number;

-- ============================================
-- ROLLBACK (if needed)
-- ============================================

-- To rollback this migration:
-- DROP TRIGGER IF EXISTS trigger_set_branch_number ON branches;
-- DROP FUNCTION IF EXISTS set_branch_number();
-- ALTER TABLE tables DROP CONSTRAINT IF EXISTS fk_tables_branch;
-- ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_branch_table_unique;
-- ALTER TABLE tables DROP COLUMN IF EXISTS branch_id;
-- ALTER TABLE branches DROP CONSTRAINT IF EXISTS branches_client_branch_number_unique;
-- ALTER TABLE branches DROP COLUMN IF EXISTS branch_number;
-- DROP INDEX IF EXISTS idx_tables_branch_id;
-- DROP INDEX IF EXISTS idx_branches_branch_number;
