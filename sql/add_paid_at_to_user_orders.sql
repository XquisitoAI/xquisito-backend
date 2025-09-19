-- Migration: Add paid_at field to user_orders table
-- This allows us to track when orders were paid and filter out paid orders for new sessions

-- Add paid_at column to user_orders table
ALTER TABLE user_orders
ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_orders_paid_at ON user_orders(paid_at);

-- Add comments for documentation
COMMENT ON COLUMN user_orders.paid_at IS 'Timestamp when the order was paid. NULL means unpaid/active order';

-- Optional: Add constraint to ensure paid_at cannot be in the future
ALTER TABLE user_orders
ADD CONSTRAINT chk_paid_at_not_future
CHECK (paid_at IS NULL OR paid_at <= NOW());

-- Verify the migration was successful by selecting table info
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_orders'
  AND column_name = 'paid_at';