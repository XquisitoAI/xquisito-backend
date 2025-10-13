-- Agregar campo opening_hours a la tabla restaurants
-- Este campo almacenará los horarios de operación en formato JSON

ALTER TABLE restaurants
ADD COLUMN opening_hours JSONB DEFAULT '{
  "monday": {"is_closed": false, "open_time": "09:00", "close_time": "22:00"},
  "tuesday": {"is_closed": false, "open_time": "09:00", "close_time": "22:00"},
  "wednesday": {"is_closed": false, "open_time": "09:00", "close_time": "22:00"},
  "thursday": {"is_closed": false, "open_time": "09:00", "close_time": "22:00"},
  "friday": {"is_closed": false, "open_time": "09:00", "close_time": "23:00"},
  "saturday": {"is_closed": false, "open_time": "10:00", "close_time": "23:00"},
  "sunday": {"is_closed": false, "open_time": "10:00", "close_time": "20:00"}
}';

-- Comentario:
-- - is_closed: false = abierto, true = cerrado todo el día
-- - open_time/close_time: formato HH:MM (24 horas)
-- - Los horarios por defecto son típicos de un restaurante