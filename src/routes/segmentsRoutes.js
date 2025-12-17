const express = require('express');
const router = express.Router();
const segmentsController = require('../controllers/segmentsController');
const { adminPortalAuth } = require('../middleware/clerkAdminPortalAuth');

/**
 * @route GET /api/rewards/segments
 * @desc Obtener todos los segmentos de un restaurante
 * @access Private (Admin Portal)
 * @query {number} restaurant_id - ID del restaurante
 */
router.get('/', adminPortalAuth, segmentsController.getSegments);

/**
 * @route GET /api/rewards/segments/:id
 * @desc Obtener un segmento por ID
 * @access Private (Admin Portal)
 * @param {number} id - ID del segmento
 */
router.get('/:id', adminPortalAuth, segmentsController.getSegmentById);

/**
 * @route POST /api/rewards/segments
 * @desc Crear un nuevo segmento
 * @access Private (Admin Portal)
 * @body {Object} segmentData - Datos del segmento
 * @body {number} segmentData.restaurant_id - ID del restaurante
 * @body {string} segmentData.segment_name - Nombre del segmento
 * @body {Object} segmentData.filters - Filtros de segmentación
 * @body {number} segmentData.active_filters_count - Número de filtros activos
 */
router.post('/', adminPortalAuth, segmentsController.createSegment);

/**
 * @route POST /api/rewards/segments/preview
 * @desc Preview de segmento - calcular cuántos clientes coinciden
 * @access Private (Admin Portal)
 * @body {Object} previewData - Datos para el preview
 * @body {number} previewData.restaurant_id - ID del restaurante
 * @body {Object} previewData.filters - Filtros de segmentación
 */
router.post('/preview', adminPortalAuth, segmentsController.previewSegment);

/**
 * @route PUT /api/rewards/segments/:id
 * @desc Actualizar un segmento existente
 * @access Private (Admin Portal)
 * @param {number} id - ID del segmento
 * @body {Object} updateData - Datos a actualizar
 */
router.put('/:id', adminPortalAuth, segmentsController.updateSegment);

/**
 * @route DELETE /api/rewards/segments/:id
 * @desc Eliminar un segmento
 * @access Private (Admin Portal)
 * @param {number} id - ID del segmento
 */
router.delete('/:id', adminPortalAuth, segmentsController.deleteSegment);

module.exports = router;