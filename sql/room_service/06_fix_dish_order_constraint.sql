-- ====================================================
-- Fix check_single_order_reference constraint
-- to support room_order_id
-- ====================================================

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
