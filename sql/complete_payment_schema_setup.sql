-- Complete Payment Methods Schema Setup
-- This script sets up the complete payment system for both registered users and guests
-- Execute this in Supabase SQL Editor

-- ==========================================
-- 1. ENSURE USERS TABLE EXISTS (Registered Users)
-- ==========================================

-- This table should already exist, but ensure it's properly set up
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  age INTEGER CHECK (age >= 18 AND age <= 100),
  gender VARCHAR(50) CHECK (gender IN ('male', 'female', 'non-binary', 'prefer-not-to-say')),
  phone VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 2. RECREATE USER_PAYMENT_METHODS TABLE (Registered Users)
-- ==========================================

-- Drop existing table if it has wrong foreign key
DROP TABLE IF EXISTS user_payment_methods CASCADE;

-- Create user_payment_methods table with correct foreign key reference
CREATE TABLE user_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Reference to public.users.clerk_user_id (NOT auth.users.id)
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
-- 3. CREATE GUEST_PAYMENT_METHODS TABLE (Guest Users)
-- ==========================================

-- Create guest_payment_methods table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS guest_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id VARCHAR(255) NOT NULL,

    -- EcartPay tokenization data
    ecartpay_token VARCHAR(255) NOT NULL UNIQUE,
    ecartpay_customer_id VARCHAR(255),

    -- Safe card metadata (no sensitive data)
    last_four_digits VARCHAR(4) NOT NULL,
    card_type VARCHAR(50) NOT NULL,
    card_brand VARCHAR(50),
    expiry_month INTEGER NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year INTEGER NOT NULL CHECK (expiry_year >= EXTRACT(YEAR FROM CURRENT_DATE)),

    -- Card holder information
    cardholder_name VARCHAR(255),

    -- Billing address (for validation)
    billing_country VARCHAR(3),
    billing_postal_code VARCHAR(20),

    -- Guest context
    table_number VARCHAR(50),
    session_data JSONB DEFAULT '{}',

    -- Status and metadata
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    -- Automatic cleanup - guest payment methods expire after 24 hours
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 4. CREATE INDEXES FOR PERFORMANCE
-- ==========================================

-- Indexes for user_payment_methods
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_clerk_user_id ON user_payment_methods(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_active ON user_payment_methods(clerk_user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_token ON user_payment_methods(ecartpay_token);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_default ON user_payment_methods(clerk_user_id, is_default);

-- Indexes for guest_payment_methods
CREATE INDEX IF NOT EXISTS idx_guest_payment_methods_guest_id ON guest_payment_methods(guest_id);
CREATE INDEX IF NOT EXISTS idx_guest_payment_methods_active ON guest_payment_methods(guest_id, is_active);
CREATE INDEX IF NOT EXISTS idx_guest_payment_methods_expires ON guest_payment_methods(expires_at);
CREATE INDEX IF NOT EXISTS idx_guest_payment_methods_table ON guest_payment_methods(table_number);
CREATE INDEX IF NOT EXISTS idx_guest_payment_methods_token ON guest_payment_methods(ecartpay_token);

-- ==========================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_payment_methods ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 6. CREATE RLS POLICIES
-- ==========================================

-- Users table policies
DROP POLICY IF EXISTS "Allow backend user management" ON public.users;
CREATE POLICY "Allow backend user management" ON public.users
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- User payment methods policies
DROP POLICY IF EXISTS "Allow backend payment method management" ON user_payment_methods;
CREATE POLICY "Allow backend payment method management" ON user_payment_methods
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Guest payment methods policies
DROP POLICY IF EXISTS "Allow backend guest payment management" ON guest_payment_methods;
CREATE POLICY "Allow backend guest payment management" ON guest_payment_methods
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ==========================================
-- 7. GRANT PERMISSIONS
-- ==========================================

-- Grant permissions for users table
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users TO anon;

-- Grant permissions for user_payment_methods
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO anon;

-- Grant permissions for guest_payment_methods
GRANT SELECT, INSERT, UPDATE, DELETE ON guest_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON guest_payment_methods TO anon;

-- ==========================================
-- 8. CREATE HELPER FUNCTIONS
-- ==========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to ensure only one default payment method per user (registered)
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

-- Function to ensure only one default payment method per guest
CREATE OR REPLACE FUNCTION ensure_single_default_guest_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE guest_payment_methods
        SET is_default = false
        WHERE guest_id = NEW.guest_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to clean up expired guest payment methods
CREATE OR REPLACE FUNCTION cleanup_expired_guest_payment_methods()
RETURNS void AS $$
BEGIN
    DELETE FROM guest_payment_methods
    WHERE expires_at < NOW()
    AND is_active = true;

    RAISE NOTICE 'Cleaned up expired guest payment methods';
END;
$$ language 'plpgsql';

-- ==========================================
-- 9. CREATE TRIGGERS
-- ==========================================

-- Triggers for updating updated_at timestamp
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_payment_methods_updated_at ON user_payment_methods;
CREATE TRIGGER update_user_payment_methods_updated_at
    BEFORE UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_guest_payment_methods_updated_at ON guest_payment_methods;
CREATE TRIGGER update_guest_payment_methods_updated_at
    BEFORE UPDATE ON guest_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for ensuring single default payment method
DROP TRIGGER IF EXISTS ensure_single_default_user_payment_method_trigger ON user_payment_methods;
CREATE TRIGGER ensure_single_default_user_payment_method_trigger
    BEFORE INSERT OR UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_user_payment_method();

DROP TRIGGER IF EXISTS ensure_single_default_guest_payment_method_trigger ON guest_payment_methods;
CREATE TRIGGER ensure_single_default_guest_payment_method_trigger
    BEFORE INSERT OR UPDATE ON guest_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_guest_payment_method();

-- ==========================================
-- 10. CREATE UNIQUE CONSTRAINTS
-- ==========================================

-- Ensure only one default per user (registered users)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_default_per_user
    ON user_payment_methods(clerk_user_id)
    WHERE is_default = true;

-- Ensure only one default per guest
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_default_per_guest
    ON guest_payment_methods(guest_id)
    WHERE is_default = true;

-- ==========================================
-- 11. ADD TABLE COMMENTS
-- ==========================================

COMMENT ON TABLE public.users IS 'Registered users from Clerk authentication';
COMMENT ON TABLE user_payment_methods IS 'Tokenized payment methods for registered users';
COMMENT ON TABLE guest_payment_methods IS 'Temporary tokenized payment methods for guest users (24h expiry)';

-- ==========================================
-- 12. VERIFICATION QUERIES
-- ==========================================

-- Uncomment these to verify the setup:
-- SELECT 'Users table' as table_name, count(*) as row_count FROM public.users
-- UNION ALL
-- SELECT 'User payment methods', count(*) FROM user_payment_methods
-- UNION ALL
-- SELECT 'Guest payment methods', count(*) FROM guest_payment_methods;

-- Check foreign key relationships:
-- SELECT conname, conrelid::regclass, confrelid::regclass
-- FROM pg_constraint
-- WHERE contype = 'f'
-- AND (conrelid::regclass::text LIKE '%payment_methods%' OR confrelid::regclass::text LIKE '%users%');

-- ==========================================
-- END OF SCRIPT
-- ==========================================

-- Execute this script in Supabase SQL Editor to set up the complete payment system
-- After execution, both registered users and guests will have proper payment method support