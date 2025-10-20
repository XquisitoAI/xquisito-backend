-- ===============================================
-- SISTEMA DE REVIEWS PARA RESTAURANTES
-- ===============================================

-- Tabla de reviews de restaurantes (solo rating, sin texto)
-- Se crea una review cada vez que un usuario califica después de un pago
CREATE TABLE IF NOT EXISTS restaurant_reviews (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_restaurant_reviews_restaurant_id
    ON restaurant_reviews(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_reviews_rating
    ON restaurant_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_restaurant_reviews_created_at
    ON restaurant_reviews(created_at DESC);

-- Vista materializada para estadísticas agregadas (performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS restaurant_rating_stats AS
SELECT
    restaurant_id,
    COUNT(*) as total_reviews,
    ROUND(AVG(rating)::numeric, 2) as average_rating,
    COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star_count,
    COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star_count,
    COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star_count,
    COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star_count,
    COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star_count,
    MAX(created_at) as last_review_date
FROM restaurant_reviews
GROUP BY restaurant_id;

-- Índice único para la vista materializada
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_rating_stats_restaurant_id
    ON restaurant_rating_stats(restaurant_id);

-- Función para refrescar las estadísticas de rating
CREATE OR REPLACE FUNCTION refresh_restaurant_rating_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY restaurant_rating_stats;
END;
$$ LANGUAGE plpgsql;

-- Habilitar Row Level Security
ALTER TABLE restaurant_reviews ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad
CREATE POLICY "Allow read all restaurant reviews"
    ON restaurant_reviews FOR SELECT USING (true);

CREATE POLICY "Allow insert restaurant reviews"
    ON restaurant_reviews FOR INSERT
    WITH CHECK (restaurant_id IS NOT NULL);

CREATE POLICY "Allow update restaurant reviews"
    ON restaurant_reviews FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow delete restaurant reviews"
    ON restaurant_reviews FOR DELETE
    USING (true);
