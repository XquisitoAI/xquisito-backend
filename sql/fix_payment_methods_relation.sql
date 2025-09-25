-- Fix user_payment_methods table to properly reference public.users table
-- This script corrects the foreign key relationship for Clerk-based authentication

-- First, drop the existing table if it exists (with all dependencies)
DROP TABLE IF EXISTS user_payment_methods CASCADE;

-- Recreate the user_payment_methods table with correct foreign key reference
CREATE TABLE IF NOT EXISTS user_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Reference to public.users.clerk_user_id instead of auth.users.id
    clerk_user_id VARCHAR(255) NOT NULL,

    -- EcartPay tokenization data
    ecartpay_token VARCHAR(255) NOT NULL,
    ecartpay_customer_id VARCHAR(255),

    -- Safe card metadata (no sensitive data)
    last_four_digits VARCHAR(4) NOT NULL,
    card_type VARCHAR(50) NOT NULL, -- visa, mastercard, amex, etc.
    card_brand VARCHAR(50), -- specific brand name
    expiry_month INTEGER NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year INTEGER NOT NULL CHECK (expiry_year >= EXTRACT(YEAR FROM CURRENT_DATE)),

    -- Card holder information (encrypted if sensitive)
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_clerk_user_id ON user_payment_methods(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_active ON user_payment_methods(clerk_user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_token ON user_payment_methods(ecartpay_token);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_default ON user_payment_methods(clerk_user_id, is_default);

-- Enable Row Level Security (RLS)
ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for Clerk-based authentication
-- Note: Since we're using Clerk, we need to handle authorization in the application layer
-- These policies allow backend operations while maintaining data isolation

-- Allow backend to manage payment methods for any user (backend will enforce user ownership)
CREATE POLICY "Allow backend payment method management" ON user_payment_methods
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_payment_methods TO anon;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_payment_methods_updated_at
    BEFORE UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one default payment method per user
CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    -- If setting this payment method as default, unset all others for this user
    IF NEW.is_default = true THEN
        UPDATE user_payment_methods
        SET is_default = false
        WHERE clerk_user_id = NEW.clerk_user_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for default payment method constraint
CREATE TRIGGER ensure_single_default_payment_method_trigger
    BEFORE INSERT OR UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_payment_method();

-- Add unique constraint to ensure only one default per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_default_per_user
    ON user_payment_methods(clerk_user_id)
    WHERE is_default = true;

-- Add comment to table
COMMENT ON TABLE user_payment_methods IS 'Tokenized payment methods for registered users (Clerk authentication)';