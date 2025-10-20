-- ===============================================
-- SISTEMA DE REVIEWS PARA MENU ITEMS
-- ===============================================

-- Tabla de reviews de platillos (solo rating, sin texto)
CREATE TABLE IF NOT EXISTS menu_item_reviews (
    id SERIAL PRIMARY KEY,
    menu_item_id INTEGER NOT NULL,
    reviewer_identifier VARCHAR(255) NOT NULL, -- user_id de Clerk o guest_id
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    -- Prevenir múltiples reviews del mismo usuario al mismo platillo
    UNIQUE(menu_item_id, reviewer_identifier)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_menu_item_reviews_menu_item_id
    ON menu_item_reviews(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_reviews_reviewer
    ON menu_item_reviews(reviewer_identifier);
CREATE INDEX IF NOT EXISTS idx_menu_item_reviews_rating
    ON menu_item_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_menu_item_reviews_created_at
    ON menu_item_reviews(created_at DESC);

-- Trigger para actualizar updated_at (usa la función existente)
CREATE TRIGGER trigger_update_menu_item_reviews_updated_at
    BEFORE UPDATE ON menu_item_reviews
    FOR EACH ROW EXECUTE FUNCTION update_menu_updated_at_column();

-- Vista materializada para estadísticas agregadas (performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS menu_item_rating_stats AS
SELECT
    menu_item_id,
    COUNT(*) as total_reviews,
    ROUND(AVG(rating)::numeric, 2) as average_rating,
    COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star_count,
    COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star_count,
    COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star_count,
    COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star_count,
    COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star_count,
    MAX(created_at) as last_review_date
FROM menu_item_reviews
GROUP BY menu_item_id;

-- Índice único para la vista materializada
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_item_rating_stats_menu_item_id
    ON menu_item_rating_stats(menu_item_id);

-- Función para refrescar las estadísticas de rating
CREATE OR REPLACE FUNCTION refresh_menu_item_rating_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY menu_item_rating_stats;
END;
$$ LANGUAGE plpgsql;

-- Habilitar Row Level Security
ALTER TABLE menu_item_reviews ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad
CREATE POLICY "Allow read all reviews"
    ON menu_item_reviews FOR SELECT USING (true);

CREATE POLICY "Allow insert reviews with identifier"
    ON menu_item_reviews FOR INSERT
    WITH CHECK (reviewer_identifier IS NOT NULL);

CREATE POLICY "Allow update own reviews"
    ON menu_item_reviews FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow delete own reviews"
    ON menu_item_reviews FOR DELETE
    USING (true);
