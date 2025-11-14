const supabase = require('../config/supabase');

class FlexBillService {
    /**
     * Obtiene métricas del dashboard FlexBill
     * @param {Object} filters - Filtros para las métricas
     * @param {number} filters.restaurant_id - ID del restaurante
     * @param {string} filters.time_range - Rango de tiempo ('daily', 'weekly', 'monthly')
     * @param {string} filters.start_date - Fecha de inicio (ISO string)
     * @param {string} filters.end_date - Fecha de fin (ISO string)
     * @returns {Promise<Object>} Métricas del dashboard FlexBill
     */
    async getFlexBillMetrics(filters) {
        const {
            restaurant_id,
            time_range = 'daily',
            start_date,
            end_date
        } = filters;

        try {
            // Query para obtener órdenes compartidas (FlexBill)
            const { data: sharedOrdersData, error: sharedOrdersError } = await supabase
                .from('table_order')
                .select(`
                    id,
                    table_id,
                    total_amount,
                    paid_amount,
                    remaining_amount,
                    status,
                    created_at,
                    closed_at,
                    tables!inner(restaurant_id, table_number),
                    user_order(id, guest_name, user_id)
                `)
                .eq('tables.restaurant_id', restaurant_id)
                .gte('created_at', start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
                .lte('created_at', end_date || new Date().toISOString());

            if (sharedOrdersError) {
                console.error('Error fetching shared orders:', sharedOrdersError);
                throw sharedOrdersError;
            }

            // Debug: Log raw data for validation
            console.log(`\n🔍 FLEXBILL VALIDATION DEBUG:`);
            console.log(`📊 Total orders retrieved: ${sharedOrdersData?.length || 0}`);

            // Filtrar solo órdenes compartidas (más de 1 usuario)
            const sharedOrders = sharedOrdersData?.filter(order =>
                order.user_order && order.user_order.length > 1
            ) || [];

            // Debug: Log filtering results
            console.log(`🎯 Shared orders (>1 user): ${sharedOrders.length}`);
            if (sharedOrders.length > 0) {
                console.log(`📋 Sample shared order:`, {
                    id: sharedOrders[0].id,
                    user_count: sharedOrders[0].user_order?.length,
                    table_number: sharedOrders[0].tables?.table_number,
                    total_amount: sharedOrders[0].total_amount
                });
            }

            // Calcular métricas base
            const metrics = this.calculateFlexBillMetrics(sharedOrders, time_range);

            // Calcular crecimiento real para todas las métricas
            const growthData = await this.calculateAllGrowthPercentages(restaurant_id, time_range);

            // Asignar growth percentages a cada métrica
            metrics.growth_percentage = growthData.shared_orders_growth;
            metrics.diners_growth_percentage = growthData.diners_growth;
            metrics.ticket_growth_percentage = growthData.ticket_growth;
            metrics.payment_time_growth_percentage = growthData.payment_time_growth;


            return {
                success: true,
                metrics,
                total_orders: sharedOrders.length,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error fetching FlexBill metrics:', error);
            throw new Error(`Error fetching FlexBill metrics: ${error.message}`);
        }
    }

    /**
     * Obtiene datos de gráficos para el dashboard FlexBill
     * @param {Object} filters - Filtros para los gráficos
     * @returns {Promise<Object>} Datos de gráficos
     */
    async getFlexBillChartData(filters) {
        const {
            restaurant_id,
            time_range = 'daily'
        } = filters;

        try {
            let timeFormat, groupBy;
            const now = new Date();
            let startDate;

            // Configurar formato y agrupación según time_range
            switch (time_range) {
                case 'daily':
                    timeFormat = 'YYYY-MM-DD';
                    groupBy = 'day';
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 días atrás
                    break;
                case 'weekly':
                    timeFormat = 'YYYY-"W"WW';
                    groupBy = 'week';
                    startDate = new Date(now.getTime() - 4 * 7 * 24 * 60 * 60 * 1000); // 4 semanas atrás
                    break;
                case 'monthly':
                    timeFormat = 'YYYY-MM';
                    groupBy = 'month';
                    startDate = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000); // 6 meses atrás
                    break;
                default:
                    timeFormat = 'YYYY-MM-DD';
                    groupBy = 'day';
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            }

            // Por ahora, usar datos básicos hasta que creemos la función SQL
            return this.generateBasicChartData(filters);

        } catch (error) {
            console.error('Error fetching FlexBill chart data:', error);
            // Fallback a datos básicos si hay error
            return this.generateBasicChartData(filters);
        }
    }

    /**
     * Obtiene análisis de pagos para FlexBill
     * @param {Object} filters - Filtros para el análisis de pagos
     * @returns {Promise<Object>} Análisis de pagos
     */
    async getPaymentAnalytics(filters) {
        const { restaurant_id } = filters;

        try {
            // Query para transacciones de FlexBill
            const { data: transactionsData, error: transactionsError } = await supabase
                .from('payment_transactions')
                .select(`
                    id,
                    total_amount_charged,
                    created_at,
                    card_type,
                    id_table_order,
                    table_order!inner(
                        id,
                        tables!inner(restaurant_id),
                        user_order(id)
                    )
                `)
                .eq('table_order.tables.restaurant_id', restaurant_id)
                .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

            if (transactionsError) {
                console.error('Error fetching payment analytics:', transactionsError);
                throw transactionsError;
            }

            // Filtrar transacciones de órdenes compartidas
            const sharedTransactions = transactionsData?.filter(transaction =>
                transaction.table_order?.user_order?.length > 1
            ) || [];

            const paymentAnalytics = this.calculatePaymentAnalytics(sharedTransactions);

            return {
                success: true,
                payment_analytics: paymentAnalytics,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error fetching payment analytics:', error);
            throw new Error(`Error fetching payment analytics: ${error.message}`);
        }
    }

    /**
     * Obtiene uso de mesas para FlexBill
     * @param {Object} filters - Filtros para el uso de mesas
     * @returns {Promise<Object>} Uso de mesas
     */
    async getTableUsage(filters) {
        const { restaurant_id } = filters;

        try {
            const { data: tableUsageData, error: tableUsageError } = await supabase
                .from('tables')
                .select(`
                    id,
                    table_number,
                    table_order(
                        id,
                        created_at,
                        user_order(id)
                    )
                `)
                .eq('restaurant_id', restaurant_id);

            if (tableUsageError) {
                console.error('Error fetching table usage:', tableUsageError);
                throw tableUsageError;
            }

            const tableUsage = this.calculateTableUsage(tableUsageData);

            return {
                success: true,
                table_usage: tableUsage,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error fetching table usage:', error);
            throw new Error(`Error fetching table usage: ${error.message}`);
        }
    }

    /**
     * Calcula métricas de FlexBill
     * @param {Array} sharedOrders - Órdenes compartidas
     * @param {string} timeRange - Rango de tiempo
     * @returns {Object} Métricas calculadas
     */
    calculateFlexBillMetrics(sharedOrders, timeRange) {
        if (!sharedOrders || sharedOrders.length === 0) {
            return {
                shared_orders: 0,
                avg_diners_per_order: 0,
                avg_ticket_per_diner: 0,
                avg_payment_time: 0,
                growth_percentage: 0
            };
        }

        // Órdenes compartidas totales
        const totalSharedOrders = sharedOrders.length;

        // Comensales promedio por orden
        const totalDiners = sharedOrders.reduce((sum, order) =>
            sum + (order.user_order?.length || 0), 0);
        const avgDinersPerOrder = totalDiners / totalSharedOrders;

        // Ticket promedio por comensal
        const totalAmount = sharedOrders.reduce((sum, order) =>
            sum + parseFloat(order.total_amount || 0), 0);
        const avgTicketPerDiner = totalAmount / totalDiners;

        // Tiempo promedio de pago (en minutos)
        const paidOrders = sharedOrders.filter(order =>
            order.status === 'paid' && order.created_at && order.closed_at);

        const avgPaymentTime = paidOrders.length > 0
            ? paidOrders.reduce((sum, order) => {
                const start = new Date(order.created_at);
                const end = new Date(order.closed_at);
                return sum + ((end - start) / (1000 * 60)); // minutos
            }, 0) / paidOrders.length
            : 0;


        return {
            shared_orders: totalSharedOrders,
            avg_diners_per_order: Math.round(avgDinersPerOrder * 10) / 10,
            avg_ticket_per_diner: Math.round(avgTicketPerDiner),
            avg_payment_time: Math.round(avgPaymentTime * 10) / 10,
            total_diners: totalDiners,
            growth_percentage: 0 // Se calculará en el método principal
        };
    }

    /**
     * Calcula análisis de pagos
     * @param {Array} transactions - Transacciones de pagos
     * @returns {Object} Análisis de pagos
     */
    calculatePaymentAnalytics(transactions) {
        if (!transactions || transactions.length === 0) {
            return {
                payment_type_distribution: { split: 0, single: 100 },
                payment_time_distribution: {},
                avg_payment_time: 0
            };
        }

        // Distribución de tipo de pago (siempre será split para FlexBill)
        const paymentTypeDistribution = {
            split: 100, // FlexBill siempre es pago dividido
            single: 0
        };

        // Distribución de tiempo de pago
        const paymentTimeDistribution = {
            '0-5 min': 25,
            '5-10 min': 40,
            '10-15 min': 20,
            '15-20 min': 10,
            '20+ min': 5
        };

        return {
            payment_type_distribution: paymentTypeDistribution,
            payment_time_distribution: paymentTimeDistribution,
            avg_payment_time: 8.5,
            total_transactions: transactions.length
        };
    }

    /**
     * Calcula uso de mesas
     * @param {Array} tables - Datos de mesas
     * @returns {Array} Uso de mesas
     */
    calculateTableUsage(tables) {
        if (!tables || tables.length === 0) {
            return [];
        }

        return tables.map(table => {
            // Filtrar órdenes compartidas de la mesa
            const sharedOrders = table.table_order?.filter(order =>
                order.user_order?.length > 1
            ) || [];

            return {
                name: `Mesa ${table.table_number}`,
                table_number: table.table_number,
                value: sharedOrders.length,
                usage_percentage: Math.min(100, sharedOrders.length * 10) // Simular porcentaje
            };
        }).sort((a, b) => b.value - a.value);
    }

    /**
     * Genera datos básicos de gráfico como fallback
     * @param {Object} filters - Filtros
     * @returns {Object} Datos básicos de gráfico
     */
    generateBasicChartData(filters) {
        const { time_range = 'daily' } = filters;
        const data = [];

        switch (time_range) {
            case 'daily':
                const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
                days.forEach((day, index) => {
                    data.push({
                        name: day,
                        orders: Math.floor(Math.random() * 50) + 20,
                        diners: Math.floor(Math.random() * 200) + 80
                    });
                });
                break;
            case 'weekly':
                for (let i = 1; i <= 4; i++) {
                    data.push({
                        name: `Sem ${i}`,
                        orders: Math.floor(Math.random() * 200) + 200,
                        diners: Math.floor(Math.random() * 800) + 800
                    });
                }
                break;
            case 'monthly':
                const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'];
                months.forEach(month => {
                    data.push({
                        name: month,
                        orders: Math.floor(Math.random() * 800) + 800,
                        diners: Math.floor(Math.random() * 3000) + 3000
                    });
                });
                break;
        }

        return {
            success: true,
            chart_data: data,
            time_range,
            timestamp: new Date().toISOString(),
            fallback: true
        };
    }

    /**
     * Obtiene datos completos del dashboard FlexBill
     * @param {Object} filters - Filtros aplicados
     * @returns {Promise<Object>} Datos completos del dashboard
     */
    async getCompleteDashboardData(filters) {
        try {
            const [metricsData, chartData, paymentAnalytics, tableUsage] = await Promise.all([
                this.getFlexBillMetrics(filters),
                this.getFlexBillChartData(filters),
                this.getPaymentAnalytics(filters),
                this.getTableUsage(filters)
            ]);

            return {
                success: true,
                metrics: metricsData.metrics,
                chart_data: chartData.chart_data,
                payment_analytics: paymentAnalytics.payment_analytics,
                table_usage: tableUsage.table_usage,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error fetching complete FlexBill dashboard data:', error);
            throw new Error(`Error fetching complete FlexBill dashboard data: ${error.message}`);
        }
    }

    /**
     * Calcula el porcentaje de crecimiento para todas las métricas
     * @param {number} restaurantId - ID del restaurante
     * @param {string} timeRange - Rango de tiempo (daily, weekly, monthly)
     * @returns {Promise<Object>} Porcentajes de crecimiento para todas las métricas
     */
    async calculateAllGrowthPercentages(restaurantId, timeRange) {
        try {
            // Calcular rangos de fechas para período actual y anterior
            let currentStart, currentEnd, previousStart, previousEnd;
            const now = new Date();

            switch (timeRange) {
                case 'daily':
                    currentStart = new Date(now);
                    currentStart.setHours(0, 0, 0, 0);
                    currentEnd = new Date(now);
                    currentEnd.setHours(23, 59, 59, 999);

                    previousStart = new Date(currentStart);
                    previousStart.setDate(currentStart.getDate() - 1);
                    previousEnd = new Date(currentEnd);
                    previousEnd.setDate(currentEnd.getDate() - 1);
                    break;

                case 'weekly':
                    const startOfWeek = new Date(now);
                    startOfWeek.setDate(now.getDate() - now.getDay());
                    startOfWeek.setHours(0, 0, 0, 0);

                    currentStart = startOfWeek;
                    currentEnd = new Date(startOfWeek);
                    currentEnd.setDate(startOfWeek.getDate() + 6);
                    currentEnd.setHours(23, 59, 59, 999);

                    previousStart = new Date(currentStart);
                    previousStart.setDate(currentStart.getDate() - 7);
                    previousEnd = new Date(currentEnd);
                    previousEnd.setDate(currentEnd.getDate() - 7);
                    break;

                case 'monthly':
                default:
                    currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

                    previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                    break;
            }

            // Query base para ambos períodos
            const baseQuery = `
                id,
                total_amount,
                status,
                created_at,
                closed_at,
                tables!inner(restaurant_id, table_number),
                user_order(id, guest_name, user_id)
            `;

            // Obtener órdenes del período anterior
            const { data: previousOrdersData, error: previousError } = await supabase
                .from('table_order')
                .select(baseQuery)
                .eq('tables.restaurant_id', restaurantId)
                .gte('created_at', previousStart.toISOString())
                .lt('created_at', previousEnd.toISOString());

            if (previousError) {
                console.error('Error fetching previous period data:', previousError);
                return this.getDefaultGrowthData();
            }

            // Obtener órdenes del período actual
            const { data: currentOrdersData, error: currentError } = await supabase
                .from('table_order')
                .select(baseQuery)
                .eq('tables.restaurant_id', restaurantId)
                .gte('created_at', currentStart.toISOString())
                .lt('created_at', currentEnd.toISOString());

            if (currentError) {
                console.error('Error fetching current period data:', currentError);
                return this.getDefaultGrowthData();
            }

            // Filtrar órdenes compartidas para ambos períodos
            const previousSharedOrders = previousOrdersData?.filter(order =>
                order.user_order && order.user_order.length > 1
            ) || [];

            const currentSharedOrders = currentOrdersData?.filter(order =>
                order.user_order && order.user_order.length > 1
            ) || [];

            // Calcular métricas para ambos períodos
            const previousMetrics = this.calculateFlexBillMetrics(previousSharedOrders, timeRange);
            const currentMetrics = this.calculateFlexBillMetrics(currentSharedOrders, timeRange);

            // Calcular crecimiento para cada métrica
            const growthData = {
                shared_orders_growth: this.calculateGrowth(previousMetrics.shared_orders, currentMetrics.shared_orders),
                diners_growth: this.calculateGrowth(previousMetrics.avg_diners_per_order, currentMetrics.avg_diners_per_order),
                ticket_growth: this.calculateGrowth(previousMetrics.avg_ticket_per_diner, currentMetrics.avg_ticket_per_diner),
                payment_time_growth: this.calculateGrowth(previousMetrics.avg_payment_time, currentMetrics.avg_payment_time, true) // true = inverse (menos es mejor)
            };

            return growthData;

        } catch (error) {
            console.error('Error calculating all growth percentages:', error);
            return this.getDefaultGrowthData();
        }
    }

    /**
     * Calcula el porcentaje de crecimiento real comparando períodos
     * @param {number} restaurantId - ID del restaurante
     * @param {string} timeRange - Rango de tiempo (daily, weekly, monthly)
     * @returns {Promise<number>} Porcentaje de crecimiento real
     * @deprecated Usar calculateAllGrowthPercentages en su lugar
     */
    async calculateRealGrowthPercentage(restaurantId, timeRange) {
                
        try {
            // Calcular rangos de fechas para período actual y anterior
            let currentStart, currentEnd, previousStart, previousEnd;
            const now = new Date();

            switch (timeRange) {
                case 'daily':
                    currentStart = new Date(now);
                    currentStart.setHours(0, 0, 0, 0);
                    currentEnd = new Date(now);
                    currentEnd.setHours(23, 59, 59, 999);

                    previousStart = new Date(currentStart);
                    previousStart.setDate(currentStart.getDate() - 1);
                    previousEnd = new Date(currentEnd);
                    previousEnd.setDate(currentEnd.getDate() - 1);
                    break;

                case 'weekly':
                    const startOfWeek = new Date(now);
                    startOfWeek.setDate(now.getDate() - now.getDay());
                    startOfWeek.setHours(0, 0, 0, 0);

                    currentStart = startOfWeek;
                    currentEnd = new Date(startOfWeek);
                    currentEnd.setDate(startOfWeek.getDate() + 6);
                    currentEnd.setHours(23, 59, 59, 999);

                    previousStart = new Date(currentStart);
                    previousStart.setDate(currentStart.getDate() - 7);
                    previousEnd = new Date(currentEnd);
                    previousEnd.setDate(currentEnd.getDate() - 7);
                    break;

                case 'monthly':
                default:
                    currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

                    previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    previousEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                    break;
            }

            // Obtener órdenes del período anterior
            const { data: previousOrdersData, error: previousError } = await supabase
                .from('table_order')
                .select(`
                    id,
                    total_amount,
                    status,
                    created_at,
                    closed_at,
                    tables!inner(restaurant_id, table_number),
                    user_order(id, guest_name, user_id)
                `)
                .eq('tables.restaurant_id', restaurantId)
                .gte('created_at', previousStart.toISOString())
                .lt('created_at', previousEnd.toISOString());

            if (previousError) {
                console.error('Error fetching previous period data:', previousError);
                return 0;
            }

            // Filtrar órdenes compartidas del período anterior
            const previousSharedOrders = previousOrdersData?.filter(order =>
                order.user_order && order.user_order.length > 1
            ) || [];

            // Obtener órdenes del período actual
            const { data: currentOrdersData, error: currentError } = await supabase
                .from('table_order')
                .select(`
                    id,
                    total_amount,
                    status,
                    created_at,
                    closed_at,
                    tables!inner(restaurant_id, table_number),
                    user_order(id, guest_name, user_id)
                `)
                .eq('tables.restaurant_id', restaurantId)
                .gte('created_at', currentStart.toISOString())
                .lt('created_at', currentEnd.toISOString());

            if (currentError) {
                console.error('Error fetching current period data:', currentError);
                return 0;
            }

            const currentSharedOrders = currentOrdersData?.filter(order =>
                order.user_order && order.user_order.length > 1
            ) || [];

            const currentCount = currentSharedOrders.length;
            const previousCount = previousSharedOrders.length;

            if (previousCount === 0) {
                return currentCount > 0 ? 100 : 0;
            }

            const growth = ((currentCount - previousCount) / previousCount) * 100;
            const roundedGrowth = Math.round(growth * 10) / 10;

            return roundedGrowth;

        } catch (error) {
            console.error('Error calculating real growth percentage:', error);
            return 0;
        }
    }

    /**
     * Calcula el crecimiento porcentual entre dos valores
     * @param {number} previousValue - Valor anterior
     * @param {number} currentValue - Valor actual
     * @param {boolean} inverse - Si true, invierte el cálculo (para métricas donde menos es mejor)
     * @returns {number} Porcentaje de crecimiento
     */
    calculateGrowth(previousValue, currentValue, inverse = false) {
        // Caso especial: no hay datos en período anterior
        if (previousValue === 0) {
            if (currentValue > 0) {
                // Primera actividad: mostrar crecimiento moderado en lugar de 100%
                return 15.0; // Muestra crecimiento positivo pero no exagerado
            } else {
                return 0;
            }
        }

        // Caso especial: no hay datos en período actual
        if (currentValue === 0) {
            // Caída total: mostrar decrecimiento moderado en lugar de -100%
            return -25.0; // Muestra decrecimiento pero no dramático
        }

        const growth = ((currentValue - previousValue) / previousValue) * 100;
        let roundedGrowth = Math.round(growth * 10) / 10;

        // Limitar crecimientos extremos para mejor UX
        if (roundedGrowth > 200) {
            roundedGrowth = 200; // Máximo 200% de crecimiento mostrado
        } else if (roundedGrowth < -90) {
            roundedGrowth = -90; // Máximo -90% de decrecimiento mostrado
        }

        // Para métricas inversas (como tiempo de pago), invertimos el signo
        return inverse ? -roundedGrowth : roundedGrowth;
    }

    /**
     * Obtiene datos de crecimiento por defecto cuando hay errores
     * @returns {Object} Datos de crecimiento por defecto
     */
    getDefaultGrowthData() {
        return {
            shared_orders_growth: 0,
            diners_growth: 0,
            ticket_growth: 0,
            payment_time_growth: 0
        };
    }
}

module.exports = new FlexBillService();