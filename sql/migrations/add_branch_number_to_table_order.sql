-- ===============================================
-- MIGRATION: Add branch_number to table_order
-- ===============================================
-- This migration adds branch_number and restaurant_id columns to table_order table
-- Since table_order relates to tables via table_id, we'll extract branch info from there

DO $$
BEGIN
  -- Add branch_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_order'
    AND column_name = 'branch_number'
  ) THEN
    ALTER TABLE table_order
    ADD COLUMN branch_number INTEGER;

    RAISE NOTICE 'Added branch_number column to table_order';
  ELSE
    RAISE NOTICE 'branch_number column already exists in table_order';
  END IF;

  -- Add restaurant_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_order'
    AND column_name = 'restaurant_id'
  ) THEN
    ALTER TABLE table_order
    ADD COLUMN restaurant_id INTEGER;

    RAISE NOTICE 'Added restaurant_id column to table_order';
  ELSE
    RAISE NOTICE 'restaurant_id column already exists in table_order';
  END IF;

  -- Update existing records to have restaurant_id and branch_number from tables → branches
  UPDATE table_order "to"
  SET
    restaurant_id = b.restaurant_id,
    branch_number = b.branch_number
  FROM tables t
  JOIN branches b ON t.branch_id = b.id
  WHERE "to".table_id = t.id
  AND ("to".restaurant_id IS NULL OR "to".branch_number IS NULL);

  -- Add composite foreign key to branches table (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_table_order_branch'
  ) THEN
    ALTER TABLE table_order
    ADD CONSTRAINT fk_table_order_branch
    FOREIGN KEY (restaurant_id, branch_number)
    REFERENCES branches(restaurant_id, branch_number)
    ON DELETE SET NULL;

    RAISE NOTICE 'Added foreign key fk_table_order_branch';
  ELSE
    RAISE NOTICE 'Foreign key fk_table_order_branch already exists';
  END IF;

  -- Create index for better performance
  CREATE INDEX IF NOT EXISTS idx_table_order_restaurant_branch
  ON table_order (restaurant_id, branch_number);

  -- Make columns NOT NULL after setting values
  ALTER TABLE table_order
  ALTER COLUMN restaurant_id SET NOT NULL,
  ALTER COLUMN branch_number SET NOT NULL;

  RAISE NOTICE '✅ Migration completed: add_branch_number_to_table_order';
END $$;
