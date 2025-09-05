-- Create table for storing tokenized payment methods
-- This table stores only tokens and metadata, NEVER actual card numbers for PCI compliance

CREATE TABLE IF NOT EXISTS user_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
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
    
    -- Ensure only one default card per user
    CONSTRAINT unique_default_per_user UNIQUE (user_id, is_default) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_user_id ON user_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_active ON user_payment_methods(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_token ON user_payment_methods(ecartpay_token);

-- Enable Row Level Security (RLS)
ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own payment methods
CREATE POLICY "Users can view own payment methods" ON user_payment_methods
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own payment methods
CREATE POLICY "Users can insert own payment methods" ON user_payment_methods
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own payment methods
CREATE POLICY "Users can update own payment methods" ON user_payment_methods
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own payment methods
CREATE POLICY "Users can delete own payment methods" ON user_payment_methods
    FOR DELETE USING (auth.uid() = user_id);

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
        WHERE user_id = NEW.user_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for default payment method constraint
CREATE TRIGGER ensure_single_default_payment_method_trigger
    BEFORE INSERT OR UPDATE ON user_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_payment_method();