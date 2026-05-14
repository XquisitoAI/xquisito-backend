-- ============================================================
-- order_daily_sequences — Secuencias diarias para folios de órdenes
-- Compartido por todos los servicios (Flex Bill, Pick & Go, Tap Order, Room Service, Tap & Pay)
-- Última verificación: 2026-05-14
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_daily_sequences (
  id                uuid  NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id     integer,
  branch_id         uuid,
  sequence_date     date  NOT NULL,
  last_folio_number integer NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  CONSTRAINT order_daily_sequences_pkey PRIMARY KEY (id),
  CONSTRAINT order_daily_sequences_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT order_daily_sequences_branch_id_sequence_date_key UNIQUE (branch_id, sequence_date)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_order_daily_seq_branch_date
  ON public.order_daily_sequences (branch_id, sequence_date);

-- RLS
ALTER TABLE public.order_daily_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on order_daily_sequences"
  ON public.order_daily_sequences FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read order_daily_sequences"
  ON public.order_daily_sequences FOR SELECT TO public USING (true);

CREATE POLICY "Authenticated users can insert order_daily_sequences"
  ON public.order_daily_sequences FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Authenticated users can update order_daily_sequences"
  ON public.order_daily_sequences FOR UPDATE TO public USING (true) WITH CHECK (true);
