-- ============================================================
-- restaurant_reviews — Reseñas generales de restaurante
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.restaurant_reviews (
  id            serial  NOT NULL,
  restaurant_id integer NOT NULL,
  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at    timestamptz DEFAULT now(),

  CONSTRAINT restaurant_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT restaurant_reviews_restaurant_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_restaurant_reviews_restaurant ON public.restaurant_reviews (restaurant_id);

-- RLS
ALTER TABLE public.restaurant_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read all restaurant reviews"
  ON public.restaurant_reviews FOR SELECT TO public USING (true);

CREATE POLICY "Allow insert restaurant reviews"
  ON public.restaurant_reviews FOR INSERT TO public
  WITH CHECK (restaurant_id IS NOT NULL);

CREATE POLICY "Allow update restaurant reviews"
  ON public.restaurant_reviews FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete restaurant reviews"
  ON public.restaurant_reviews FOR DELETE TO public USING (true);
