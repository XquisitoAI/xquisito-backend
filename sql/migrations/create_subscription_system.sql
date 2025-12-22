-- Migration: Create Subscription System Tables
-- Date: 2025-12-18
-- Purpose: Implement subscription/pricing system with plan restrictions

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('basico', 'premium', 'ultra')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'cancelled', 'expired')),
    ecartpay_customer_id VARCHAR(255),
    ecartpay_subscription_id VARCHAR(255),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    auto_renew BOOLEAN DEFAULT true,
    price_paid DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'MXN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(restaurant_id) -- One active subscription per restaurant
);

-- Create plan_usage table to track feature usage
CREATE TABLE IF NOT EXISTS plan_usage (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    feature_type VARCHAR(50) NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(subscription_id, feature_type, period_start) -- One usage record per feature per period
);

-- Create subscription_transactions table for payment history
CREATE TABLE IF NOT EXISTS subscription_transactions (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    ecartpay_payment_id VARCHAR(255),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('payment', 'refund', 'chargeback')),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_restaurant_id ON subscriptions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_type ON subscriptions(plan_type);
CREATE INDEX IF NOT EXISTS idx_plan_usage_subscription_id ON plan_usage(subscription_id);
CREATE INDEX IF NOT EXISTS idx_plan_usage_feature_type ON plan_usage(feature_type);
CREATE INDEX IF NOT EXISTS idx_subscription_transactions_subscription_id ON subscription_transactions(subscription_id);

-- Create plan_configurations table if it doesn't exist
CREATE TABLE IF NOT EXISTS plan_configurations (
    id SERIAL PRIMARY KEY,
    plan_type VARCHAR(20) NOT NULL,
    feature_name VARCHAR(50) NOT NULL,
    feature_limit INTEGER NOT NULL, -- -1 means unlimited, 0 means disabled, positive number means limit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(plan_type, feature_name)
);

-- Insert default plan configurations (updated to match controller)
INSERT INTO plan_configurations (plan_type, feature_name, feature_limit, created_at) VALUES
-- Plan Básico limits (1 campaign per month as per controller)
('basico', 'campaigns_per_month', 1, NOW()),
('basico', 'customers_per_campaign', 100, NOW()),
('basico', 'segments_total', 3, NOW()),
('basico', 'advanced_analytics', 0, NOW()), -- 0 = disabled, 1 = enabled
('basico', 'priority_support', 0, NOW()),

-- Plan Premium limits (5 campaigns per month as per controller)
('premium', 'campaigns_per_month', 5, NOW()),
('premium', 'customers_per_campaign', 500, NOW()),
('premium', 'segments_total', 10, NOW()),
('premium', 'advanced_analytics', 1, NOW()),
('premium', 'priority_support', 1, NOW()),

-- Plan Ultra limits (10 campaigns per month as per controller)
('ultra', 'campaigns_per_month', 10, NOW()),
('ultra', 'customers_per_campaign', -1, NOW()), -- -1 = unlimited
('ultra', 'segments_total', -1, NOW()),
('ultra', 'advanced_analytics', 1, NOW()),
('ultra', 'priority_support', 1, NOW())
ON CONFLICT (plan_type, feature_name) DO NOTHING;

-- Add updated_at trigger for subscriptions
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscriptions_updated_at();

-- Add updated_at trigger for plan_usage
CREATE OR REPLACE FUNCTION update_plan_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_plan_usage_updated_at
    BEFORE UPDATE ON plan_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_plan_usage_updated_at();

-- Add updated_at trigger for subscription_transactions
CREATE OR REPLACE FUNCTION update_subscription_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_subscription_transactions_updated_at
    BEFORE UPDATE ON subscription_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_transactions_updated_at();

-- Function to check if restaurant has access to a specific feature
CREATE OR REPLACE FUNCTION check_restaurant_feature_access(
    p_restaurant_id INTEGER,
    p_feature_name VARCHAR(50)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_plan_type VARCHAR(20);
    v_feature_limit INTEGER;
    v_current_usage INTEGER DEFAULT 0;
    v_subscription_active BOOLEAN DEFAULT false;
BEGIN
    -- Get current subscription and plan type
    SELECT
        plan_type,
        (status = 'active' AND (end_date IS NULL OR end_date > NOW())) as is_active
    INTO v_plan_type, v_subscription_active
    FROM subscriptions
    WHERE restaurant_id = p_restaurant_id;

    -- If no subscription or inactive, deny access
    IF NOT FOUND OR NOT v_subscription_active THEN
        RETURN false;
    END IF;

    -- Get feature limit for the plan
    SELECT feature_limit
    INTO v_feature_limit
    FROM plan_configurations
    WHERE plan_type = v_plan_type AND feature_name = p_feature_name;

    -- If feature not found in configuration, deny access
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- If feature is disabled (0), deny access
    IF v_feature_limit = 0 THEN
        RETURN false;
    END IF;

    -- If unlimited (-1), allow access
    IF v_feature_limit = -1 THEN
        RETURN true;
    END IF;

    -- For limited features, check current usage in current period
    SELECT COALESCE(usage_count, 0)
    INTO v_current_usage
    FROM plan_usage pu
    JOIN subscriptions s ON s.id = pu.subscription_id
    WHERE s.restaurant_id = p_restaurant_id
    AND pu.feature_type = p_feature_name
    AND pu.period_start <= NOW()
    AND pu.period_end > NOW();

    -- Return true if under limit
    RETURN v_current_usage < v_feature_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to increment feature usage
CREATE OR REPLACE FUNCTION increment_feature_usage(
    p_restaurant_id INTEGER,
    p_feature_name VARCHAR(50),
    p_increment INTEGER DEFAULT 1
)
RETURNS BOOLEAN AS $$
DECLARE
    v_subscription_id INTEGER;
    v_period_start TIMESTAMP WITH TIME ZONE;
    v_period_end TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get subscription ID
    SELECT id INTO v_subscription_id
    FROM subscriptions
    WHERE restaurant_id = p_restaurant_id
    AND status = 'active';

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Calculate current period (monthly)
    v_period_start := date_trunc('month', NOW());
    v_period_end := v_period_start + INTERVAL '1 month';

    -- Insert or update usage
    INSERT INTO plan_usage (
        subscription_id,
        feature_type,
        usage_count,
        period_start,
        period_end
    ) VALUES (
        v_subscription_id,
        p_feature_name,
        p_increment,
        v_period_start,
        v_period_end
    )
    ON CONFLICT (subscription_id, feature_type, period_start)
    DO UPDATE SET
        usage_count = plan_usage.usage_count + p_increment,
        updated_at = NOW();

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to get restaurant's current plan info
CREATE OR REPLACE FUNCTION get_restaurant_plan_info(p_restaurant_id INTEGER)
RETURNS TABLE (
    plan_type VARCHAR(20),
    status VARCHAR(20),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    auto_renew BOOLEAN,
    days_remaining INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.plan_type,
        s.status,
        s.start_date,
        s.end_date,
        s.auto_renew,
        CASE
            WHEN s.end_date IS NULL THEN NULL
            ELSE EXTRACT(days FROM s.end_date - NOW())::INTEGER
        END as days_remaining
    FROM subscriptions s
    WHERE s.restaurant_id = p_restaurant_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE subscriptions IS 'Stores restaurant subscription information';
COMMENT ON TABLE plan_usage IS 'Tracks feature usage per subscription period';
COMMENT ON TABLE subscription_transactions IS 'Payment transaction history';
COMMENT ON TABLE plan_configurations IS 'Defines limits for each plan type';
COMMENT ON FUNCTION check_restaurant_feature_access IS 'Checks if restaurant can access a specific feature';
COMMENT ON FUNCTION increment_feature_usage IS 'Increments usage counter for a feature';
COMMENT ON FUNCTION get_restaurant_plan_info IS 'Returns current plan information for a restaurant';