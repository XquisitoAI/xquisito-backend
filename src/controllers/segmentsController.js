const segmentsService = require('../services/segmentsService');

class SegmentsController {
    /**
     * Obtener todos los segmentos de un restaurante
     * GET /api/rewards/segments?restaurant_id=X
     */
    async getSegments(req, res) {
        try {
            const { restaurant_id } = req.query;

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante es requerido y debe ser un número válido'
                });
            }

            const segments = await segmentsService.getSegmentsByRestaurant(parseInt(restaurant_id));

            res.json({
                success: true,
                data: segments,
                count: segments.length,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getSegments controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Crear un nuevo segmento
     * POST /api/rewards/segments
     */
    async createSegment(req, res) {
        try {
            const { restaurant_id, segment_name, filters, active_filters_count } = req.body;

            // Validaciones básicas
            if (!restaurant_id || !segment_name || !filters) {
                return res.status(400).json({
                    success: false,
                    error: 'restaurant_id, segment_name y filters son requeridos'
                });
            }

            if (typeof restaurant_id !== 'number' || isNaN(restaurant_id)) {
                return res.status(400).json({
                    success: false,
                    error: 'restaurant_id debe ser un número válido'
                });
            }

            if (typeof segment_name !== 'string' || segment_name.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    error: 'segment_name debe ser un texto de al menos 2 caracteres'
                });
            }

            // Validar filtros
            const filterValidation = segmentsService.validateFilters(filters);
            if (!filterValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    error: 'Filtros no válidos',
                    details: filterValidation.errors
                });
            }

            const segmentData = {
                restaurant_id,
                segment_name: segment_name.trim(),
                filters,
                active_filters_count: active_filters_count || 0
            };

            const newSegment = await segmentsService.createSegment(segmentData);

            res.status(201).json({
                success: true,
                data: newSegment,
                message: 'Segmento creado exitosamente',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in createSegment controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Actualizar un segmento existente
     * PUT /api/rewards/segments/:id
     */
    async updateSegment(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            if (!id || typeof id !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'ID de segmento inválido'
                });
            }

            // Validar filtros si se proporcionan
            if (updateData.filters) {
                const filterValidation = segmentsService.validateFilters(updateData.filters);
                if (!filterValidation.isValid) {
                    return res.status(400).json({
                        success: false,
                        error: 'Filtros no válidos',
                        details: filterValidation.errors
                    });
                }
            }

            const updatedSegment = await segmentsService.updateSegment(id, updateData);

            res.json({
                success: true,
                data: updatedSegment,
                message: 'Segmento actualizado exitosamente',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in updateSegment controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Eliminar un segmento
     * DELETE /api/rewards/segments/:id
     */
    async deleteSegment(req, res) {
        try {
            const { id } = req.params;

            if (!id || typeof id !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'ID de segmento inválido'
                });
            }

            await segmentsService.deleteSegment(id);

            res.json({
                success: true,
                message: 'Segmento eliminado exitosamente',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in deleteSegment controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Preview de segmento - calcular cuántos clientes coinciden
     * POST /api/rewards/segments/preview
     */
    async previewSegment(req, res) {
        try {
            const { restaurant_id, filters } = req.body;

            if (!restaurant_id || !filters) {
                return res.status(400).json({
                    success: false,
                    error: 'restaurant_id y filters son requeridos'
                });
            }

            if (typeof restaurant_id !== 'number' || isNaN(restaurant_id)) {
                return res.status(400).json({
                    success: false,
                    error: 'restaurant_id debe ser un número válido'
                });
            }

            // Validar filtros
            const filterValidation = segmentsService.validateFilters(filters);
            if (!filterValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    error: 'Filtros no válidos',
                    details: filterValidation.errors
                });
            }

            const customerCount = await segmentsService.previewSegment(restaurant_id, filters);

            res.json({
                success: true,
                data: {
                    customer_count: customerCount,
                    filters_applied: filters
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in previewSegment controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtener un segmento por ID
     * GET /api/rewards/segments/:id
     */
    async getSegmentById(req, res) {
        try {
            const { id } = req.params;

            if (!id || typeof id !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'ID de segmento inválido'
                });
            }

            const segment = await segmentsService.getSegmentById(id);

            res.json({
                success: true,
                data: segment,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getSegmentById controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = new SegmentsController();