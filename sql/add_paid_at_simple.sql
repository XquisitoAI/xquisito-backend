-- Simple migration script for Supabase editor
-- Execute each statement one by one if needed

-- 1. Add the paid_at column
ALTER TABLE user_orders ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Add index for performance
CREATE INDEX IF NOT EXISTS idx_user_orders_paid_at ON user_orders(paid_at);

-- 3. Add constraint (optional)
ALTER TABLE user_orders ADD CONSTRAINT chk_paid_at_not_future CHECK (paid_at IS NULL OR paid_at <= NOW());