const supabase = require('../config/supabase');

class SegmentsService {
    /**
     * Obtener todos los segmentos de un restaurante
     * @param {number} restaurantId - ID del restaurante
     * @returns {Promise<Array>} Lista de segmentos
     */
    async getSegmentsByRestaurant(restaurantId) {
        try {
            const { data, error } = await supabase
                .from('customer_segments')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error getting segments:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            console.error('Error in getSegmentsByRestaurant:', error);
            throw new Error(`Error fetching segments: ${error.message}`);
        }
    }

    /**
     * Crear un nuevo segmento
     * @param {Object} segmentData - Datos del segmento
     * @param {number} segmentData.restaurant_id - ID del restaurante
     * @param {string} segmentData.segment_name - Nombre del segmento
     * @param {Object} segmentData.filters - Filtros aplicados
     * @param {number} segmentData.active_filters_count - Número de filtros activos
     * @returns {Promise<Object>} Segmento creado
     */
    async createSegment(segmentData) {
        try {
            const { restaurant_id, segment_name, filters, active_filters_count } = segmentData;

            // Calcular número estimado de clientes
            const estimated_customers = await this.previewSegment(restaurant_id, filters);

            const { data, error } = await supabase
                .from('customer_segments')
                .insert([{
                    restaurant_id,
                    segment_name,
                    filters: JSON.stringify(filters),
                    active_filters_count,
                    estimated_customers
                }])
                .select()
                .single();

            if (error) {
                if (error.code === '23505') { // Unique constraint violation
                    throw new Error(`Ya existe un segmento con el nombre "${segment_name}" para este restaurante`);
                }
                console.error('Error creating segment:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Error in createSegment:', error);
            throw new Error(`Error creating segment: ${error.message}`);
        }
    }

    /**
     * Actualizar un segmento existente
     * @param {number} segmentId - ID del segmento
     * @param {Object} updateData - Datos a actualizar
     * @returns {Promise<Object>} Segmento actualizado
     */
    async updateSegment(segmentId, updateData) {
        try {
            const { segment_name, filters, active_filters_count, restaurant_id } = updateData;

            // Recalcular número estimado de clientes si se actualizaron los filtros
            let estimated_customers;
            if (filters && restaurant_id) {
                estimated_customers = await this.previewSegment(restaurant_id, filters);
            }

            const updateObject = {
                ...(segment_name && { segment_name }),
                ...(filters && { filters: JSON.stringify(filters) }),
                ...(active_filters_count !== undefined && { active_filters_count }),
                ...(estimated_customers !== undefined && { estimated_customers })
            };

            const { data, error } = await supabase
                .from('customer_segments')
                .update(updateObject)
                .eq('id', segmentId)
                .select()
                .single();

            if (error) {
                if (error.code === '23505') { // Unique constraint violation
                    throw new Error(`Ya existe un segmento con el nombre "${segment_name}" para este restaurante`);
                }
                console.error('Error updating segment:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Error in updateSegment:', error);
            throw new Error(`Error updating segment: ${error.message}`);
        }
    }

    /**
     * Eliminar un segmento
     * @param {string} segmentId - ID del segmento (UUID)
     * @returns {Promise<boolean>} True si se eliminó correctamente
     */
    async deleteSegment(segmentId) {
        try {
            const { error } = await supabase
                .from('customer_segments')
                .delete()
                .eq('id', segmentId);

            if (error) {
                console.error('Error deleting segment:', error);
                throw error;
            }

            return true;
        } catch (error) {
            console.error('Error in deleteSegment:', error);
            throw new Error(`Error deleting segment: ${error.message}`);
        }
    }

    /**
     * Preview de segmento - calcula cuántos clientes coinciden sin guardar
     * @param {number} restaurantId - ID del restaurante
     * @param {Object} filters - Filtros a aplicar
     * @returns {Promise<number>} Número de clientes que coinciden
     */
    async previewSegment(restaurantId, filters) {
        try {
            const { data, error } = await supabase.rpc('calculate_customer_segment_preview', {
                p_restaurant_id: restaurantId,
                p_filters: filters
            });

            if (error) {
                console.error('Error in segment preview:', error);
                throw error;
            }

            return data || 0;
        } catch (error) {
            console.error('Error in previewSegment:', error);
            throw new Error(`Error calculating segment preview: ${error.message}`);
        }
    }

    /**
     * Obtener un segmento por ID
     * @param {string} segmentId - ID del segmento (UUID)
     * @returns {Promise<Object>} Datos del segmento
     */
    async getSegmentById(segmentId) {
        try {
            const { data, error } = await supabase
                .from('customer_segments')
                .select('*')
                .eq('id', segmentId)
                .single();

            if (error) {
                console.error('Error getting segment by ID:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Error in getSegmentById:', error);
            throw new Error(`Error fetching segment: ${error.message}`);
        }
    }

    /**
     * Validar filtros de segmentación
     * @param {Object} filters - Filtros a validar
     * @returns {Object} { isValid: boolean, errors: string[] }
     */
    validateFilters(filters) {
        const errors = [];
        const validFilters = ['gender', 'age_range', 'number_of_visits', 'single_purchase_total', 'last_visit'];

        const validValues = {
            gender: ['all', 'male', 'female', 'other'],
            age_range: ['all', '18-25', '26-35', '36-45', '46-55', '56+'],
            number_of_visits: ['all', '1', '2-5', 'more_than_5', 'more_than_10'],
            single_purchase_total: ['all', 'less_than_200', '200-500', 'greater_than_500', 'greater_than_1000'],
            last_visit: ['all', 'last_7_days', 'last_30_days', 'last_90_days', 'more_than_90_days']
        };

        // Validar que solo se usen filtros válidos
        Object.keys(filters).forEach(filterKey => {
            if (!validFilters.includes(filterKey)) {
                errors.push(`Filtro no válido: ${filterKey}`);
            }
        });

        // Validar valores de filtros
        Object.entries(filters).forEach(([filterKey, filterValue]) => {
            if (validValues[filterKey] && !validValues[filterKey].includes(filterValue)) {
                errors.push(`Valor no válido para ${filterKey}: ${filterValue}`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = new SegmentsService();