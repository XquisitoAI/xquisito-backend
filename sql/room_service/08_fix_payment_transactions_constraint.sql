-- ====================================================
-- Fix check_single_payment_order_type constraint
-- to support id_room_order
-- ====================================================

-- Drop the old constraint that doesn't include id_room_order
ALTER TABLE public.payment_transactions
DROP CONSTRAINT IF EXISTS check_single_payment_order_type;

-- Create new constraint that supports all four order types:
-- 1. id_table_order (xquisito-fronted / flex-bill)
-- 2. id_tap_orders_and_pay (tap-order-and-pay)
-- 3. id_pick_and_go_order (pick-and-go)
-- 4. id_room_order (room-service)
-- 5. id_tap_pay_order
ALTER TABLE public.payment_transactions
ADD CONSTRAINT check_single_payment_order_type CHECK (
  (
    -- Exactly ONE of these fields must be NOT NULL
    (CASE WHEN id_table_order IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN id_tap_orders_and_pay IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN id_pick_and_go_order IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN id_room_order IS NOT NULL THEN 1 ELSE 0 END)+
    (CASE WHEN id_tap_pay_order IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1
);

COMMENT ON CONSTRAINT check_single_payment_order_type ON public.payment_transactions IS
'Ensures exactly one order reference is set: id_table_order, id_tap_orders_and_pay, id_pick_and_go_order, or id_room_order';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '✅ Payment transactions constraint updated to support id_room_order';
END $$;
