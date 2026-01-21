const supabase = require('../config/supabase');

// Mapeo de nombres de servicios: Frontend -> SQL
const SERVICE_NAME_MAP = {
    'flex-bill': 'flexbill',
    'pick-n-go': 'pick_and_go',
    'tap-order-pay': 'tap_order',
    'tap-pay': 'tap_pay',
    'room-service': 'room_service'
};

// Mapeo inverso: SQL -> Frontend
const SERVICE_NAME_MAP_REVERSE = {
    'flexbill': 'flex-bill',
    'pick_and_go': 'pick-n-go',
    'tap_order': 'tap-order-pay',
    'tap_pay': 'tap-pay',
    'room_service': 'room-service'
};

class AnalyticsService {
    /**
     * Obtiene métricas del dashboard con filtros aplicados
     * @param {Object} filters - Filtros para las métricas
     * @param {number} filters.restaurant_id - ID del restaurante
     * @param {string} filters.start_date - Fecha de inicio (ISO string)
     * @param {string} filters.end_date - Fecha de fin (ISO string)
     * @param {string} filters.gender - Género ('todos', 'hombre', 'mujer', 'otro')
     * @param {string} filters.age_range - Rango de edad ('todos', '14-17', '18-25', '26-35', '36-45', '46+')
     * @param {string} filters.granularity - Granularidad ('hora', 'dia', 'mes', 'ano')
     * @returns {Promise<Object>} Métricas del dashboard
     */
    async getDashboardMetrics(filters) {
        const {
            restaurant_id,
            branch_id,  // ✅ NUEVO: Extraer branch_id
            start_date,
            end_date,
            gender = 'todos',
            age_range = 'todos',
            granularity = 'dia'
        } = filters;

        try {
            const { data, error } = await supabase.rpc('get_dashboard_metrics', {
                p_restaurant_id: restaurant_id || null,
                p_branch_id: branch_id || null,  // ✅ NUEVO: Pasar branch_id
                p_start_date: start_date || null,
                p_end_date: end_date || null,
                p_gender: gender,
                p_age_range: age_range,
                p_granularity: granularity
            });

            if (error) {
                console.error('Error in getDashboardMetrics:', error);
                throw error;
            }

            // Procesar y formatear los datos
            const processedData = this.processDashboardData(data, granularity);
            return processedData;

        } catch (error) {
            console.error('Error fetching dashboard metrics:', error);
            throw new Error(`Error fetching dashboard metrics: ${error.message}`);
        }
    }

    /**
     * Obtiene órdenes activas del restaurante
     * @param {number} restaurant_id - ID del restaurante
     * @returns {Promise<Array>} Lista de órdenes activas
     */
    /**
     * Obtiene órdenes del restaurante con paginación, filtros y detalles de items
     * @param {number} restaurant_id - ID del restaurante
     * @param {number} limit - Límite de órdenes a retornar (default: 5)
     * @param {number} offset - Offset para paginación (default: 0)
     * @param {string} status - Estado de las órdenes ('todos', 'not_paid', 'partial', 'paid')
     * @returns {Promise<Object>} Órdenes con paginación y detalles
     */
    async getActiveOrders(restaurant_id, limit = 5, offset = 0, status = 'todos', dateFilter = 'hoy') {
        try {
            const { data, error } = await supabase.rpc('get_orders_with_pagination', {
                p_restaurant_id: restaurant_id || null,
                p_limit: limit,
                p_offset: offset,
                p_status: status,
                p_date_filter: dateFilter,
                p_start_date: null,
                p_end_date: null
            });

            if (error) {
                console.error('Error in getActiveOrders:', error);
                throw error;
            }

            // Si la función SQL devuelve un objeto con orders, total_count, etc.
            if (data && typeof data === 'object' && 'orders' in data) {
                return {
                    orders: data.orders || [],
                    total_count: data.total_count || 0,
                    has_more: data.has_more || false
                };
            }

            // Si devuelve directamente un array (fallback para compatibilidad)
            return {
                orders: data || [],
                total_count: Array.isArray(data) ? data.length : 0,
                has_more: false
            };

        } catch (error) {
            console.error('Error fetching active orders:', error);
            throw new Error(`Error fetching active orders: ${error.message}`);
        }
    }

    /**
     * Obtiene el artículo más vendido
     * @param {Object} filters - Filtros para el artículo más vendido
     * @returns {Promise<Object>} Artículo más vendido
     */
    async getTopSellingItem(filters) {
        const {
            restaurant_id,
            branch_id,  // ✅ NUEVO: Extraer branch_id
            start_date,
            end_date
        } = filters;

        try {
            const { data, error } = await supabase.rpc('get_top_selling_item', {
                p_restaurant_id: restaurant_id || null,
                p_branch_id: branch_id || null,  // ✅ NUEVO: Pasar branch_id
                p_start_date: start_date || null,
                p_end_date: end_date || null
            });

            if (error) {
                console.error('Error in getTopSellingItem:', error);
                throw error;
            }

            return data || { nombre: 'Sin datos', unidades_vendidas: 0 };

        } catch (error) {
            console.error('Error fetching top selling item:', error);
            throw new Error(`Error fetching top selling item: ${error.message}`);
        }
    }

    /**
     * Obtiene datos completos del dashboard incluyendo métricas, gráfico y datos adicionales
     * @param {Object} filters - Filtros aplicados
     * @returns {Promise<Object>} Datos completos del dashboard
     */
    async getCompleteDashboardData(filters) {
        try {
            // Ejecutar todas las consultas en paralelo para mejor performance
            const [metricsData, topSellingItem] = await Promise.all([
                this.getDashboardMetrics(filters),
                this.getTopSellingItem(filters)
            ]);

            return {
                ...metricsData,
                articulo_mas_vendido: topSellingItem,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error fetching complete dashboard data:', error);
            throw new Error(`Error fetching complete dashboard data: ${error.message}`);
        }
    }

    /**
     * Procesa y formatea los datos del dashboard
     * @param {Object} rawData - Datos crudos de la función SQL
     * @param {string} granularity - Granularidad seleccionada
     * @returns {Object} Datos procesados y formateados
     */
    processDashboardData(rawData, granularity) {
        if (!rawData) {
            return this.getEmptyDashboardData(granularity);
        }

        const { metricas, grafico, filtros_aplicados, tiempo_promedio_mesa } = rawData;

        // Formatear métricas
        const formattedMetrics = {
            ventasTotales: parseFloat(metricas?.ventas_totales || 0),
            ordenesActivas: parseInt(metricas?.ordenes_activas || 0),
            pedidos: parseInt(metricas?.pedidos || 0),
            ticketPromedio: parseFloat(metricas?.ticket_promedio || 0)
        };

        // Formatear datos del gráfico
        const formattedChart = this.formatChartData(grafico || [], granularity);

        return {
            metricas: formattedMetrics,
            grafico: formattedChart,
            tiempo_promedio_mesa: tiempo_promedio_mesa || null,
            filtros_aplicados: filtros_aplicados || {},
            success: true
        };
    }

    /**
     * Formatea los datos del gráfico según la granularidad
     * @param {Array} chartData - Datos del gráfico
     * @param {string} granularity - Granularidad
     * @returns {Array} Datos del gráfico formateados
     */
    formatChartData(chartData, granularity) {
        if (!Array.isArray(chartData) || chartData.length === 0) {
            return this.generateEmptyChartData(granularity);
        }

        return chartData.map(item => ({
            ...item,
            ingresos: parseFloat(item.ingresos || 0)
        }));
    }

    /**
     * Genera datos vacíos para el gráfico según la granularidad
     * @param {string} granularity - Granularidad
     * @returns {Array} Datos vacíos del gráfico
     */
    generateEmptyChartData(granularity) {
        const currentDate = new Date();
        const data = [];

        switch (granularity) {
            case 'hora':
                for (let i = 0; i < 24; i++) {
                    data.push({ hora: i, ingresos: 0 });
                }
                break;
            case 'dia':
                const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
                for (let i = 1; i <= daysInMonth; i++) {
                    data.push({ dia: i, ingresos: 0 });
                }
                break;
            case 'mes':
                for (let i = 1; i <= 12; i++) {
                    data.push({ mes: i, ingresos: 0 });
                }
                break;
            case 'ano':
                const currentYear = currentDate.getFullYear();
                for (let i = 0; i < 7; i++) {
                    data.push({ ano: currentYear + i, ingresos: 0 });
                }
                break;
            default:
                break;
        }

        return data;
    }

    /**
     * Retorna estructura de datos vacía para el dashboard
     * @param {string} granularity - Granularidad
     * @returns {Object} Datos vacíos del dashboard
     */
    getEmptyDashboardData(granularity) {
        return {
            metricas: {
                ventasTotales: 0,
                ordenesActivas: 0,
                pedidos: 0,
                ticketPromedio: 0
            },
            grafico: this.generateEmptyChartData(granularity),
            filtros_aplicados: {},
            success: true
        };
    }

    /**
     * Obtiene lista de restaurantes disponibles para el usuario
     * @param {string} clerkUserId - ID del usuario de Clerk
     * @returns {Promise<Array>} Lista de restaurantes
     */
    async getUserRestaurants(clerkUserId) {
        try {
            // Primero obtenemos el ID interno del usuario
            const { data: userData, error: userError } = await supabase
                .from('user_admin_portal')
                .select('id')
                .eq('clerk_user_id', clerkUserId)
                .eq('is_active', true)
                .single();

            if (userError) {
                console.error('Error getting user by clerk_user_id:', userError);
                throw userError;
            }

            if (!userData) {
                return [];
            }

            // Ahora obtenemos los restaurantes del usuario
            const { data: restaurants, error: restaurantsError } = await supabase
                .from('restaurants')
                .select('id, name, is_active')
                .eq('user_id', userData.id)
                .eq('is_active', true);

            if (restaurantsError) {
                console.error('Error getting user restaurants:', restaurantsError);
                throw restaurantsError;
            }

            return restaurants || [];

        } catch (error) {
            console.error('Error fetching user restaurants:', error);
            throw new Error(`Error fetching user restaurants: ${error.message}`);
        }
    }

    /**
     * Obtiene métricas del dashboard consolidando TODOS los servicios
     * Usa la función get_dashboard_metrics_all_services que incluye:
     * FlexBill, Pick&Go, Room Service, Tap Order, Tap Pay
     *
     * @param {Object} filters - Filtros para las métricas
     * @param {number} filters.restaurant_id - ID del restaurante
     * @param {string} filters.branch_id - UUID de la sucursal
     * @param {string} filters.start_date - Fecha de inicio (ISO string)
     * @param {string} filters.end_date - Fecha de fin (ISO string)
     * @param {string} filters.granularity - Granularidad ('hora', 'dia', 'mes', 'ano')
     * @param {string} filters.service_type - Tipo de servicio ('flex-bill', 'pick-n-go', 'tap-order-pay', 'tap-pay', 'room-service', o null para todos)
     * @param {string} filters.gender - Género ('todos', 'hombre', 'mujer')
     * @param {string} filters.age_range - Rango de edad ('todos', '14-17', '18-25', '26-35', '36-45', '46+')
     * @returns {Promise<Object>} Métricas del dashboard de todos los servicios
     */
    async getDashboardMetricsAllServices(filters) {
        const {
            restaurant_id,
            branch_id,
            start_date,
            end_date,
            granularity = 'dia',
            service_type = null,
            gender = 'todos',
            age_range = 'todos'
        } = filters;

        try {
            // Mapear nombre de servicio del frontend al formato SQL
            const sqlServiceType = service_type ? (SERVICE_NAME_MAP[service_type] || service_type) : null;

            const { data, error } = await supabase.rpc('get_dashboard_metrics_all_services', {
                p_restaurant_id: restaurant_id || null,
                p_branch_id: branch_id || null,
                p_start_date: start_date || null,
                p_end_date: end_date || null,
                p_granularity: granularity,
                p_service_type: sqlServiceType,
                p_gender: gender,
                p_age_range: age_range
            });

            if (error) {
                console.error('Error in getDashboardMetricsAllServices:', error);
                throw error;
            }

            // Procesar y formatear los datos
            const processedData = this.processAllServicesData(data, granularity);
            return processedData;

        } catch (error) {
            console.error('Error fetching dashboard metrics (all services):', error);
            throw new Error(`Error fetching dashboard metrics (all services): ${error.message}`);
        }
    }

    /**
     * Procesa y formatea los datos del dashboard de todos los servicios
     * @param {Object} rawData - Datos crudos de la función SQL
     * @param {string} granularity - Granularidad seleccionada
     * @returns {Object} Datos procesados y formateados
     */
    processAllServicesData(rawData, granularity) {
        if (!rawData) {
            return this.getEmptyAllServicesData(granularity);
        }

        const {
            metricas,
            grafico,
            desglose_por_servicio,
            articulo_mas_vendido,
            filtros_aplicados,
            servicios_disponibles
        } = rawData;

        // Formatear métricas principales
        const formattedMetrics = {
            ventasTotales: parseFloat(metricas?.ventas_totales || 0),
            propinasTotales: parseFloat(metricas?.propinas_totales || 0),
            ingresosTotales: parseFloat(metricas?.ingresos_totales || 0),
            totalTransacciones: parseInt(metricas?.total_transacciones || 0),
            ticketPromedio: parseFloat(metricas?.ticket_promedio || 0)
        };

        // Formatear desglose por servicio (convertir nombres SQL a frontend)
        const formattedBreakdown = {};
        if (desglose_por_servicio) {
            for (const [sqlName, data] of Object.entries(desglose_por_servicio)) {
                const frontendName = SERVICE_NAME_MAP_REVERSE[sqlName] || sqlName;
                formattedBreakdown[frontendName] = {
                    ventas: parseFloat(data.ventas || 0),
                    transacciones: parseInt(data.transacciones || 0)
                };
            }
        }

        // Formatear datos del gráfico
        const formattedChart = this.formatChartData(grafico || [], granularity);

        return {
            metricas: formattedMetrics,
            grafico: formattedChart,
            desglose_por_servicio: formattedBreakdown,
            articulo_mas_vendido: articulo_mas_vendido || { nombre: 'Sin datos', unidades_vendidas: 0 },
            filtros_aplicados: filtros_aplicados || {},
            servicios_disponibles: servicios_disponibles || [],
            success: true
        };
    }

    /**
     * Retorna estructura de datos vacía para el dashboard de todos los servicios
     * @param {string} granularity - Granularidad
     * @returns {Object} Datos vacíos del dashboard
     */
    getEmptyAllServicesData(granularity) {
        return {
            metricas: {
                ventasTotales: 0,
                propinasTotales: 0,
                ingresosTotales: 0,
                totalTransacciones: 0,
                ticketPromedio: 0
            },
            grafico: this.generateEmptyChartData(granularity),
            desglose_por_servicio: {},
            articulo_mas_vendido: { nombre: 'Sin datos', unidades_vendidas: 0 },
            filtros_aplicados: {},
            servicios_disponibles: ['flex-bill', 'tap-order-pay', 'pick-n-go', 'room-service', 'tap-pay'],
            success: true
        };
    }
}

module.exports = new AnalyticsService();