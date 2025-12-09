-- ===============================================
-- MIGRATION: Add branch_number to split_payments
-- ===============================================
-- This migration adds branch_number and restaurant_id columns to split_payments table
-- and creates composite foreign key to branches table for referential integrity

DO $$
BEGIN
  -- Add branch_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'split_payments'
    AND column_name = 'branch_number'
  ) THEN
    ALTER TABLE split_payments
    ADD COLUMN branch_number INTEGER;

    RAISE NOTICE 'Added branch_number column to split_payments';
  ELSE
    RAISE NOTICE 'branch_number column already exists in split_payments';
  END IF;

  -- Add restaurant_id column if it doesn't exist (needed for composite FK)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'split_payments'
    AND column_name = 'restaurant_id'
  ) THEN
    ALTER TABLE split_payments
    ADD COLUMN restaurant_id INTEGER;

    RAISE NOTICE 'Added restaurant_id column to split_payments';
  ELSE
    RAISE NOTICE 'restaurant_id column already exists in split_payments';
  END IF;

  -- Add composite foreign key to branches table (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_split_payments_branch'
  ) THEN
    ALTER TABLE split_payments
    ADD CONSTRAINT fk_split_payments_branch
    FOREIGN KEY (restaurant_id, branch_number)
    REFERENCES branches(restaurant_id, branch_number)
    ON DELETE SET NULL;

    RAISE NOTICE 'Added foreign key fk_split_payments_branch';
  ELSE
    RAISE NOTICE 'Foreign key fk_split_payments_branch already exists';
  END IF;

  -- Create index for better performance
  CREATE INDEX IF NOT EXISTS idx_split_payments_restaurant_branch
  ON split_payments (restaurant_id, branch_number);

  -- Update existing records to have default values (if needed)
  -- You may want to customize this based on your data
  UPDATE split_payments
  SET restaurant_id = 1, branch_number = 1
  WHERE restaurant_id IS NULL OR branch_number IS NULL;

  -- Make columns NOT NULL after setting defaults
  ALTER TABLE split_payments
  ALTER COLUMN restaurant_id SET NOT NULL,
  ALTER COLUMN branch_number SET NOT NULL;

  RAISE NOTICE '✅ Migration completed: add_branch_number_to_split_payments';
END $$;
