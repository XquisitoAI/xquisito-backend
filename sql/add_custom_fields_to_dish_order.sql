-- Agregar columnas custom_fields y extra_price a la tabla dish_order

-- Agregar columna custom_fields para almacenar las opciones seleccionadas en formato JSON
ALTER TABLE dish_order
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT NULL;

-- Agregar columna extra_price para almacenar el precio adicional de custom fields
ALTER TABLE dish_order
ADD COLUMN IF NOT EXISTS extra_price DECIMAL(10,2) DEFAULT 0;

-- Comentarios para documentar las columnas
COMMENT ON COLUMN dish_order.custom_fields IS 'JSON array con los custom fields seleccionados: [{fieldId, fieldName, selectedOptions: [{optionId, optionName, price}]}]';
COMMENT ON COLUMN dish_order.extra_price IS 'Precio adicional por las opciones de custom fields seleccionadas';
