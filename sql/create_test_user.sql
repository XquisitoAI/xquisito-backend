-- Create a test user for development and testing
-- This should only be used in development/sandbox environment

-- Insert test user into auth.users table
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  role,
  aud
) VALUES (
  'test-user-123',
  'test@xquisito.com',
  '$2a$10$dummypasswordhash',
  NOW(),
  NOW(),
  NOW(),
  'authenticated',
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Insert corresponding identity record
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
) VALUES (
  'test-identity-123',
  'test-user-123',
  '{"sub": "test-user-123", "email": "test@xquisito.com"}',
  'email',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Verify the test user was created
SELECT 
  id, 
  email, 
  created_at,
  email_confirmed_at
FROM auth.users 
WHERE id = 'test-user-123';