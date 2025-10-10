-- Migration: Add payment method tracking to user_order table
-- This allows tracking which payment method each user used to pay their portion of the bill

-- Add payment method columns to user_order
ALTER TABLE user_order
ADD COLUMN payment_method_id INTEGER,
ADD COLUMN payment_card_last_four VARCHAR(4),
ADD COLUMN payment_card_type VARCHAR(20);

-- Add comments for documentation
COMMENT ON COLUMN user_order.payment_method_id IS 'ID of the payment method used (from user_payment_methods or guest_payment_methods)';
COMMENT ON COLUMN user_order.payment_card_last_four IS 'Last 4 digits of the card used for payment';
COMMENT ON COLUMN user_order.payment_card_type IS 'Type of card used (visa, mastercard, amex, etc.)';

-- Note: We don't add foreign key constraints because payment_method_id could reference
-- either user_payment_methods OR guest_payment_methods tables depending on user type
