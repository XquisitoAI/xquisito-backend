-- ====================================================
-- Rename Foreign Keys to Match PostgREST Convention
-- PostgREST expects: {source_table}_{column}_fkey
-- ====================================================

-- 1. Fix room_orders -> rooms FK
-- Drop old constraint
ALTER TABLE public.room_orders
DROP CONSTRAINT IF EXISTS fk_room_orders_room;

-- Add new constraint with PostgREST-compatible name
ALTER TABLE public.room_orders
ADD CONSTRAINT room_orders_room_id_fkey
  FOREIGN KEY (room_id)
  REFERENCES public.rooms(id)
  ON DELETE CASCADE;

-- 2. Verify dish_order -> room_orders FK follows convention
-- Check if it needs renaming
DO $$
BEGIN
  -- Check if old FK exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_dish_order_room_order'
    AND table_name = 'dish_order'
  ) THEN
    -- Drop old constraint
    ALTER TABLE public.dish_order
    DROP CONSTRAINT fk_dish_order_room_order;

    -- Add new constraint with PostgREST-compatible name
    ALTER TABLE public.dish_order
    ADD CONSTRAINT dish_order_room_order_id_fkey
      FOREIGN KEY (room_order_id)
      REFERENCES public.room_orders(id)
      ON DELETE CASCADE;

    RAISE NOTICE 'Renamed dish_order FK to dish_order_room_order_id_fkey';
  ELSE
    RAISE NOTICE 'dish_order FK already correctly named';
  END IF;
END $$;

COMMENT ON CONSTRAINT room_orders_room_id_fkey ON public.room_orders IS
'FK to rooms table - PostgREST compatible naming';

COMMENT ON CONSTRAINT dish_order_room_order_id_fkey ON public.dish_order IS
'FK to room_orders table - PostgREST compatible naming';
