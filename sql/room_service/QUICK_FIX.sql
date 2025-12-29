-- ====================================================
-- QUICK FIX: Execute these two critical migrations
-- to resolve the current errors
-- ====================================================

-- =====================================================
-- FIX 1: Update check constraint to support room_order_id
-- =====================================================

-- Drop the old constraint that doesn't include room_order_id
ALTER TABLE public.dish_order
DROP CONSTRAINT IF EXISTS check_single_order_reference;

-- Create new constraint that supports all four order types:
-- 1. user_order_id (legacy table orders from xquisito-fronted)
-- 2. tap_order_id (tap-order-and-pay)
-- 3. pick_and_go_order_id (pick-and-go)
-- 4. room_order_id (room-service)
ALTER TABLE public.dish_order
ADD CONSTRAINT check_single_order_reference CHECK (
  (
    -- Exactly ONE of these fields must be NOT NULL
    (CASE WHEN user_order_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN tap_order_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN pick_and_go_order_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN room_order_id IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1
);

COMMENT ON CONSTRAINT check_single_order_reference ON public.dish_order IS
'Ensures exactly one order reference is set: user_order_id, tap_order_id, pick_and_go_order_id, or room_order_id';

-- =====================================================
-- FIX 2: Rename Foreign Keys to Match PostgREST Convention
-- =====================================================

-- Fix room_orders -> rooms FK
ALTER TABLE public.room_orders
DROP CONSTRAINT IF EXISTS fk_room_orders_room;

ALTER TABLE public.room_orders
ADD CONSTRAINT room_orders_room_id_fkey
  FOREIGN KEY (room_id)
  REFERENCES public.rooms(id)
  ON DELETE CASCADE;

-- Fix dish_order -> room_orders FK
ALTER TABLE public.dish_order
DROP CONSTRAINT IF EXISTS fk_dish_order_room_order;

ALTER TABLE public.dish_order
ADD CONSTRAINT dish_order_room_order_id_fkey
  FOREIGN KEY (room_order_id)
  REFERENCES public.room_orders(id)
  ON DELETE CASCADE;

-- =====================================================
-- FIX 3: Update payment_transactions constraint
-- =====================================================

-- Drop the old constraint that doesn't include id_room_order
ALTER TABLE public.payment_transactions
DROP CONSTRAINT IF EXISTS check_single_payment_order_type;

-- Create new constraint that supports all four order types
ALTER TABLE public.payment_transactions
ADD CONSTRAINT check_single_payment_order_type CHECK (
  (
    -- Exactly ONE of these fields must be NOT NULL
    (CASE WHEN id_table_order IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN id_tap_orders_and_pay IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN id_pick_and_go_order IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN id_room_order IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1
);

COMMENT ON CONSTRAINT check_single_payment_order_type ON public.payment_transactions IS
'Ensures exactly one order reference is set: id_table_order, id_tap_orders_and_pay, id_pick_and_go_order, or id_room_order';

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
FROM information_schema.table_constraints AS tc
WHERE tc.table_name IN ('room_orders', 'dish_order')
  AND tc.constraint_type IN ('FOREIGN KEY', 'CHECK')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Quick fixes applied successfully!';
  RAISE NOTICE '✅ Check constraint updated to support room_order_id';
  RAISE NOTICE '✅ Foreign keys renamed for PostgREST compatibility';
END $$;
