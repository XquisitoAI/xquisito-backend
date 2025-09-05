-- Create table for guest payment methods
-- Guests don't have permanent accounts, so we store their payment methods temporarily

CREATE TABLE IF NOT EXISTS guest_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id VARCHAR(255) NOT NULL,
    
    -- EcartPay tokenization data
    ecartpay_token VARCHAR(255) NOT NULL,
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure only one default card per guest
    CONSTRAINT unique_default_per_guest UNIQUE (guest_id, is_default) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_guest_payment_methods_guest_id ON guest_payment_methods(guest_id);
CREATE INDEX IF NOT EXISTS idx_guest_payment_methods_active ON guest_payment_methods(guest_id, is_active);
CREATE INDEX IF NOT EXISTS idx_guest_payment_methods_expires ON guest_payment_methods(expires_at);
CREATE INDEX IF NOT EXISTS idx_guest_payment_methods_table ON guest_payment_methods(table_number);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_guest_payment_methods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_guest_payment_methods_updated_at
    BEFORE UPDATE ON guest_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_guest_payment_methods_updated_at();

-- Function to ensure only one default payment method per guest
CREATE OR REPLACE FUNCTION ensure_single_default_guest_payment_method()
RETURNS TRIGGER AS $$
BEGIN
    -- If setting this payment method as default, unset all others for this guest
    IF NEW.is_default = true THEN
        UPDATE guest_payment_methods 
        SET is_default = false 
        WHERE guest_id = NEW.guest_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for default payment method constraint
CREATE TRIGGER ensure_single_default_guest_payment_method_trigger
    BEFORE INSERT OR UPDATE ON guest_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_default_guest_payment_method();

-- Function to clean up expired guest payment methods
CREATE OR REPLACE FUNCTION cleanup_expired_guest_payment_methods()
RETURNS void AS $$
BEGIN
    -- Delete expired guest payment methods
    DELETE FROM guest_payment_methods 
    WHERE expires_at < NOW() 
    AND is_active = true;
    
    -- Log cleanup results
    RAISE NOTICE 'Cleaned up expired guest payment methods';
END;
$$ language 'plpgsql';

-- Create a scheduled job to run cleanup (if using pg_cron extension)
-- SELECT cron.schedule('cleanup-guest-payments', '0 * * * *', 'SELECT cleanup_expired_guest_payment_methods();');

-- Manual cleanup command (run periodically)
-- SELECT cleanup_expired_guest_payment_methods();