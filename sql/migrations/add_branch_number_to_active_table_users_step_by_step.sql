-- ===============================================
-- MIGRATION: Add branch_number to active_table_users (Step by Step)
-- ===============================================
-- Execute this ENTIRE script at once. Do NOT execute line by line.

-- Step 1: Add columns
ALTER TABLE active_table_users ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;
ALTER TABLE active_table_users ADD COLUMN IF NOT EXISTS branch_number INTEGER;

-- Step 2: Drop old constraints
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS unique_user_per_table;
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS fk_active_table_users_branch;
ALTER TABLE active_table_users DROP CONSTRAINT IF EXISTS unique_user_per_restaurant_branch_table;

-- Step 3: Update existing data
UPDATE active_table_users SET restaurant_id = 1 WHERE restaurant_id IS NULL;
UPDATE active_table_users SET branch_number = 1 WHERE branch_number IS NULL;

-- Step 4: Set NOT NULL
ALTER TABLE active_table_users ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE active_table_users ALTER COLUMN branch_number SET NOT NULL;

-- Step 5: Create index
CREATE INDEX IF NOT EXISTS idx_active_table_users_restaurant_branch ON active_table_users (restaurant_id, branch_number);

-- Step 6: Add foreign key
ALTER TABLE active_table_users ADD CONSTRAINT fk_active_table_users_branch FOREIGN KEY (restaurant_id, branch_number) REFERENCES branches(restaurant_id, branch_number) ON DELETE CASCADE;

-- Step 7: Add unique constraint
ALTER TABLE active_table_users ADD CONSTRAINT unique_user_per_restaurant_branch_table UNIQUE (restaurant_id, branch_number, table_number, user_id, guest_name);
