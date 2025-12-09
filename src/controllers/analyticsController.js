const analyticsService = require('../services/analyticsService');

class AnalyticsController {
    /**
     * Obtiene métricas del dashboard
     * GET /api/analytics/dashboard/metrics
     * Query params: restaurant_id, start_date, end_date, gender, age_range, granularity
     */
    async getDashboardMetrics(req, res) {
        try {
            const filters = {
                restaurant_id: req.query.restaurant_id ? parseInt(req.query.restaurant_id) : null,
                branch_id: req.query.branch_id || null,  // ✅ NUEVO: Filtro por sucursal
                start_date: req.query.start_date || null,
                end_date: req.query.end_date || null,
                gender: req.query.gender || 'todos',
                age_range: req.query.age_range || 'todos',
                granularity: req.query.granularity || 'dia'
            };

            // Validar granularidad
            const validGranularities = ['hora', 'dia', 'mes', 'ano'];
            if (!validGranularities.includes(filters.granularity)) {
                return res.status(400).json({
                    success: false,
                    error: 'Granularidad inválida. Debe ser: hora, dia, mes, o ano'
                });
            }

            // Validar género
            const validGenders = ['todos', 'hombre', 'mujer', 'otro'];
            if (!validGenders.includes(filters.gender)) {
                return res.status(400).json({
                    success: false,
                    error: 'Género inválido. Debe ser: todos, hombre, mujer, o otro'
                });
            }

            // Validar rango de edad
            const validAgeRanges = ['todos', '14-17', '18-25', '26-35', '36-45', '46+'];
            if (!validAgeRanges.includes(filters.age_range)) {
                return res.status(400).json({
                    success: false,
                    error: 'Rango de edad inválido. Debe ser: todos, 14-17, 18-25, 26-35, 36-45, 46+'
                });
            }

            const data = await analyticsService.getDashboardMetrics(filters);

            res.json({
                success: true,
                data: data,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getDashboardMetrics controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtiene datos completos del dashboard incluyendo métricas y datos adicionales
     * GET /api/analytics/dashboard/complete
     * Query params: restaurant_id, start_date, end_date, gender, age_range, granularity
     */
    async getCompleteDashboardData(req, res) {

        try {
            const filters = {
                restaurant_id: req.query.restaurant_id ? parseInt(req.query.restaurant_id) : null,
                branch_id: req.query.branch_id || null,  // ✅ NUEVO: Filtro por sucursal
                start_date: req.query.start_date || null,
                end_date: req.query.end_date || null,
                gender: req.query.gender || 'todos',
                age_range: req.query.age_range || 'todos',
                granularity: req.query.granularity || 'dia'
            };

            // 🔍 LOG TEMPORAL: Verificar filtros recibidos
            console.log('🎯 [getCompleteDashboardData] Filtros recibidos:', JSON.stringify(filters, null, 2));

            const data = await analyticsService.getCompleteDashboardData(filters);            

            res.json({
                success: true,
                data: data,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getCompleteDashboardData controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtiene órdenes del restaurante con paginación y detalles de items
     * GET /api/analytics/dashboard/orders/:restaurant_id
     * Query params: limit (default: 5), offset (default: 0), status (default: 'todos'), dateFilter (default: 'hoy')
     */
    async getActiveOrders(req, res) {
        try {
            const { restaurant_id } = req.params;
            const limit = parseInt(req.query.limit) || 5;
            const offset = parseInt(req.query.offset) || 0;
            const status = req.query.status || 'todos'; // 'todos', 'not_paid', 'partial', 'paid'
            const dateFilter = req.query.dateFilter || 'hoy'; // 'hoy', 'ayer', 'semana', 'mes', 'todos'

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante inválido'
                });
            }

            // Validar parámetros de paginación
            if (limit < 1 || limit > 50) {
                return res.status(400).json({
                    success: false,
                    error: 'El límite debe estar entre 1 y 50'
                });
            }

            if (offset < 0) {
                return res.status(400).json({
                    success: false,
                    error: 'El offset debe ser mayor o igual a 0'
                });
            }

            const data = await analyticsService.getActiveOrders(
                parseInt(restaurant_id),
                limit,
                offset,
                status,
                dateFilter
            );


            res.json({
                success: true,
                data: {
                    orders: data.orders || [],
                    pagination: {
                        limit: limit,
                        offset: offset,
                        returned_count: Array.isArray(data.orders) ? data.orders.length : 0,
                        total_count: data.total_count || 0,
                        has_more: data.has_more || false
                    },
                    filters: {
                        restaurant_id: parseInt(restaurant_id),
                        status: status,
                        dateFilter: dateFilter
                    }
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getActiveOrders controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtiene el artículo más vendido
     * GET /api/analytics/dashboard/top-selling-item
     * Query params: restaurant_id, start_date, end_date
     */
    async getTopSellingItem(req, res) {
        try {
            const filters = {
                restaurant_id: req.query.restaurant_id ? parseInt(req.query.restaurant_id) : null,
                start_date: req.query.start_date || null,
                end_date: req.query.end_date || null
            };

            const data = await analyticsService.getTopSellingItem(filters);

            res.json({
                success: true,
                data: data,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getTopSellingItem controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtiene restaurantes disponibles para el usuario autenticado
     * GET /api/analytics/restaurants
     */
    async getUserRestaurants(req, res) {
        try {
            // Obtener user ID de Clerk desde el middleware de autenticación
            const clerkUserId = req.user?.id;

            if (!clerkUserId) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
            }

            const data = await analyticsService.getUserRestaurants(clerkUserId);

            res.json({
                success: true,
                data: data,
                count: Array.isArray(data) ? data.length : 0,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getUserRestaurants controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Endpoint de prueba para verificar conexión
     * GET /api/analytics/health
     */
    async healthCheck(req, res) {
        try {
            res.json({
                success: true,
                message: 'Analytics API funcionando correctamente',
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Error en health check',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Obtiene resumen rápido de métricas
     * GET /api/analytics/dashboard/summary/:restaurant_id
     */
    async getDashboardSummary(req, res) {
        try {
            const { restaurant_id } = req.params;

            if (!restaurant_id || isNaN(parseInt(restaurant_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'ID de restaurante inválido'
                });
            }

            // Obtener métricas del día actual
            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
            const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

            const filters = {
                restaurant_id: parseInt(restaurant_id),
                start_date: startOfDay,
                end_date: endOfDay,
                gender: 'todos',
                age_range: 'todos',
                granularity: 'hora'
            };

            const data = await analyticsService.getDashboardMetrics(filters);

            res.json({
                success: true,
                data: {
                    ...data,
                    fecha: today.toISOString().split('T')[0],
                    periodo: 'hoy'
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in getDashboardSummary controller:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Endpoint de debug para verificar datos del usuario
     * GET /api/analytics/debug/user-info
     */
    async debugUserInfo(req, res) {
        try {
            const clerkUserId = req.user?.id;

            if (!clerkUserId) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
            }

            const supabase = require('../config/supabase');

            // Verificar usuario en user_admin_portal
            const { data: userData, error: userError } = await supabase
                .from('user_admin_portal')
                .select('*')
                .eq('clerk_user_id', clerkUserId);

            // Verificar restaurantes si el usuario existe
            let restaurantData = [];
            if (userData && userData.length > 0) {
                const { data: restaurants, error: restaurantError } = await supabase
                    .from('restaurants')
                    .select('*')
                    .eq('user_id', userData[0].id);

                restaurantData = restaurants || [];
            }

            // Verificar estructura de tablas relacionadas con orders
            let tableStructures = {};
            try {
                // Verificar una orden de ejemplo para ver la estructura
                const { data: sampleOrder } = await supabase
                    .from('table_orders')
                    .select('*')
                    .limit(1);

                const { data: sampleDetailedOrder } = await supabase
                    .from('detailed_order')
                    .select('*')
                    .limit(1);

                const { data: sampleMenuItem } = await supabase
                    .from('menu_items')
                    .select('*')
                    .limit(1);

                tableStructures = {
                    table_orders: sampleOrder?.[0] ? Object.keys(sampleOrder[0]) : [],
                    detailed_order: sampleDetailedOrder?.[0] ? Object.keys(sampleDetailedOrder[0]) : [],
                    menu_items: sampleMenuItem?.[0] ? Object.keys(sampleMenuItem[0]) : []
                };
            } catch (err) {
                tableStructures.error = err.message;
            }

            res.json({
                success: true,
                debug_info: {
                    clerk_user_id: clerkUserId,
                    user_in_db: userData || [],
                    user_count: userData ? userData.length : 0,
                    restaurants: restaurantData,
                    restaurant_count: restaurantData.length,
                    table_structures: tableStructures,
                    req_user_full: req.user
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in debugUserInfo:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = new AnalyticsController();