-- Tabla temporal para trackear usuarios activos en cada mesa
-- Permite manejar correctamente las re-divisiones y modalidades mixtas de pago

CREATE TABLE IF NOT EXISTS active_table_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number INTEGER NOT NULL,
    user_id UUID,
    guest_name TEXT,

    -- Tracking de diferentes tipos de pagos
    total_paid_individual DECIMAL(10,2) DEFAULT 0, -- Pagos por items específicos
    total_paid_amount DECIMAL(10,2) DEFAULT 0,     -- Pagos por monto general
    total_paid_split DECIMAL(10,2) DEFAULT 0,      -- Pagos por split bill

    -- Estado en split bill
    is_in_split BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_user_per_table UNIQUE (table_number, user_id, guest_name),
    CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_active_table_users_table
ON active_table_users (table_number);

CREATE INDEX IF NOT EXISTS idx_active_table_users_user
ON active_table_users (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_active_table_users_guest
ON active_table_users (guest_name) WHERE guest_name IS NOT NULL;