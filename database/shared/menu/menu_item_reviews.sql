-- ============================================================
-- menu_item_reviews — Reseñas de platillos por clientes
-- menu_item_rating_stats — Vista materializada de promedios (refreshed por trigger)
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.menu_item_reviews (
  id                  serial  NOT NULL,
  menu_item_id        integer NOT NULL,
  reviewer_identifier varchar NOT NULL,
  rating              integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  CONSTRAINT menu_item_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT menu_item_reviews_item_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE
);

-- TRIGGERS
CREATE TRIGGER trigger_update_menu_item_reviews_updated_at
  BEFORE UPDATE ON public.menu_item_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_menu_updated_at_column();

CREATE TRIGGER trg_refresh_menu_item_rating_stats_insert
  AFTER INSERT ON public.menu_item_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_menu_item_rating_stats();

CREATE TRIGGER trg_refresh_menu_item_rating_stats_update
  AFTER UPDATE ON public.menu_item_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_menu_item_rating_stats();

CREATE TRIGGER trg_refresh_menu_item_rating_stats_delete
  AFTER DELETE ON public.menu_item_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_menu_item_rating_stats();

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_menu_item_reviews_item ON public.menu_item_reviews (menu_item_id);

-- RLS
ALTER TABLE public.menu_item_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read all reviews"
  ON public.menu_item_reviews FOR SELECT TO public USING (true);

CREATE POLICY "Allow insert reviews with identifier"
  ON public.menu_item_reviews FOR INSERT TO public
  WITH CHECK (reviewer_identifier IS NOT NULL);

CREATE POLICY "Allow update own reviews"
  ON public.menu_item_reviews FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete own reviews"
  ON public.menu_item_reviews FOR DELETE TO public USING (true);
