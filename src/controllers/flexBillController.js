const flexBillService = require('../services/flexBillService');

class FlexBillController {
    /**
     * Health check endpoint para FlexBill
     * @route GET /api/flex-bill/health
     */
    async healthCheck(req, res) {
        try {
            res.status(200).json({
                status: 'OK',
                service: 'FlexBill Dashboard',
                message: 'FlexBill service is running',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'FlexBill service health check failed',
                error: error.message
            });
        }
    }

    /**
     * Obtiene métricas del dashboard FlexBill
     * @route GET /api/flex-bill/dashboard/metrics
     */
    async getFlexBillMetrics(req, res) {
        try {
            const {
                restaurant_id,
                time_range = 'daily',
                start_date,
                end_date
            } = req.query;

            // Validar parámetros requeridos
            if (!restaurant_id) {
                return res.status(400).json({
                    success: false,
                    message: 'restaurant_id is required'
                });
            }

            const filters = {
                restaurant_id: parseInt(restaurant_id),
                time_range,
                start_date,
                end_date
            };

            const result = await flexBillService.getFlexBillMetrics(filters);

            res.status(200).json(result);

        } catch (error) {
            console.error('Error in getFlexBillMetrics:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching FlexBill metrics',
                error: error.message
            });
        }
    }

    /**
     * Obtiene datos de gráficos para FlexBill
     * @route GET /api/flex-bill/dashboard/charts
     */
    async getFlexBillChartData(req, res) {
        try {
            const {
                restaurant_id,
                time_range = 'daily'
            } = req.query;

            if (!restaurant_id) {
                return res.status(400).json({
                    success: false,
                    message: 'restaurant_id is required'
                });
            }

            const filters = {
                restaurant_id: parseInt(restaurant_id),
                time_range
            };

            const result = await flexBillService.getFlexBillChartData(filters);

            res.status(200).json(result);

        } catch (error) {
            console.error('Error in getFlexBillChartData:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching FlexBill chart data',
                error: error.message
            });
        }
    }

    /**
     * Obtiene análisis de pagos para FlexBill
     * @route GET /api/flex-bill/dashboard/payment-analytics
     */
    async getPaymentAnalytics(req, res) {
        try {
            const { restaurant_id } = req.query;

            if (!restaurant_id) {
                return res.status(400).json({
                    success: false,
                    message: 'restaurant_id is required'
                });
            }

            const filters = {
                restaurant_id: parseInt(restaurant_id)
            };

            const result = await flexBillService.getPaymentAnalytics(filters);

            res.status(200).json(result);

        } catch (error) {
            console.error('Error in getPaymentAnalytics:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching payment analytics',
                error: error.message
            });
        }
    }

    /**
     * Obtiene uso de mesas para FlexBill
     * @route GET /api/flex-bill/dashboard/table-usage
     */
    async getTableUsage(req, res) {
        try {
            const { restaurant_id } = req.query;

            if (!restaurant_id) {
                return res.status(400).json({
                    success: false,
                    message: 'restaurant_id is required'
                });
            }

            const filters = {
                restaurant_id: parseInt(restaurant_id)
            };

            const result = await flexBillService.getTableUsage(filters);

            res.status(200).json(result);

        } catch (error) {
            console.error('Error in getTableUsage:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching table usage',
                error: error.message
            });
        }
    }

    /**
     * Obtiene todos los datos del dashboard FlexBill
     * @route GET /api/flex-bill/dashboard/complete
     */
    async getCompleteDashboardData(req, res) {
        try {
            const {
                restaurant_id,
                time_range = 'daily',
                start_date,
                end_date
            } = req.query;

            if (!restaurant_id) {
                return res.status(400).json({
                    success: false,
                    message: 'restaurant_id is required'
                });
            }

            const filters = {
                restaurant_id: parseInt(restaurant_id),
                time_range,
                start_date,
                end_date
            };

            const result = await flexBillService.getCompleteDashboardData(filters);

            res.status(200).json(result);

        } catch (error) {
            console.error('Error in getCompleteDashboardData:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching complete FlexBill dashboard data',
                error: error.message
            });
        }
    }

    /**
     * Información de debug del usuario (para desarrollo)
     * @route GET /api/flex-bill/debug/user-info
     */
    async debugUserInfo(req, res) {
        try {
            const userInfo = {
                clerk_user_id: req.user?.clerk_user_id || 'No disponible',
                user_data: req.user || 'No disponible',
                timestamp: new Date().toISOString()
            };

            res.status(200).json({
                success: true,
                debug_info: userInfo,
                message: 'Debug information retrieved successfully'
            });

        } catch (error) {
            console.error('Error in debugUserInfo:', error);
            res.status(500).json({
                success: false,
                message: 'Error getting debug info',
                error: error.message
            });
        }
    }
}

module.exports = new FlexBillController();