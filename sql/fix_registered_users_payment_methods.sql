-- Fix user_payment_methods table for registered users only
-- This script corrects ONLY the registered users payment methods table
-- Does NOT touch guest payment methods (those are working correctly)

-- ==========================================
-- 1. DROP EXISTING user_payment_methods TABLE
-- ==========================================

-- Remove the incorrectly configured table
DROP TABLE IF EXISTS user_payment_methods CASCADE;

-- ==========================================
-- 2. RECREATE user_payment_methods TABLE (Registered Users Only)
-- ==========================================

CREATE TABLE user_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Correct reference to public.users.clerk_user_id (NOT auth.users.id)
    clerk_user_id VARCHAR(255) NOT NULL,

    -- EcartPay tokenization data
    ecartpay_token VARCHAR(255) NOT NULL UNIQUE,
    ecartpay_customer_id VARCHAR(255),

    -- Safe card metadata (no sensitive data)
    last_four_digits VARCHAR(4) NOT NULL,
    card_type VARCHAR(50) NOT NULL, -- visa, mastercard, amex, etc.
    card_brand VARCHAR(50), -- specific brand name
    expiry_month INTEGER NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year INTEGER NOT NULL CHECK (expiry_year >= EXTRACT(YEAR FROM CURRENT_DATE)),

    -- Card holder information
    cardholder_name VARCHAR(255),

    -- Billing address (for validation)
    billing_country VARCHAR(3), -- ISO country code
    billing_postal_code VARCHAR(20),

    -- Status and metadata
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Foreign key constraint to public.users table
    CONSTRAINT fk_user_payment_methods_user
        FOREIGN KEY (clerk_user_id)
        REFERENCES public.users(clerk_user_id)
        ON DELETE CASCADE
);

-- ==========================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_user_payment_methods_clerk_user_id ON user_payment_methods(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_active ON user_payment_methods(clerk_user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_token ON user_payment_methods(ecartpay_token);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_default ON user_payment_methods(clerk_user_id, is_default);

-- ==========================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 5. CREATE RLS POLICY
-- ==========================================

CREATE POLICY "Allow backend payment method management" ON user_payment_methods
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ==========================================
-- 6. GRANT PERMISSIONS
-- ==========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO anon;

-- ==========================================
-- 7. CREATE HELPER FUNCTIONS (if they don't exist)
-- ==========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to ensure only one default payment method per registered user
CREATE OR REPLACE FUNCTION ensure_single_default_user_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE user_payment_methods
        SET is_default = false
        WHERE clerk_user_id = NEW.clerk_user_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ==========================================
-- 8. CREATE TRIGGERS
-- ==========================================

-- Trigger for updating updated_at timestamp
CREATE TRIGGER update_user_payment_methods_updated_at
    BEFORE UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for ensuring single default payment method
CREATE TRIGGER ensure_single_default_user_payment_method_trigger
    BEFORE INSERT OR UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_user_payment_method();

-- ==========================================
-- 9. CREATE UNIQUE CONSTRAINT
-- ==========================================

-- Ensure only one default per registered user
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_default_per_user
    ON user_payment_methods(clerk_user_id)
    WHERE is_default = true;

-- ==========================================
-- 10. ADD TABLE COMMENT
-- ==========================================

COMMENT ON TABLE user_payment_methods IS 'Tokenized payment methods for registered users (Clerk authentication)';

-- ==========================================
-- 11. VERIFICATION
-- ==========================================

-- Verify the foreign key relationship exists
SELECT
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as referenced_table
FROM pg_constraint
WHERE contype = 'f'
AND conrelid::regclass = 'user_payment_methods'::regclass;

-- ==========================================
-- END OF SCRIPT
-- ==========================================

-- This script ONLY fixes the registered users payment methods table
-- Guest payment methods are left untouched as they are working correctly