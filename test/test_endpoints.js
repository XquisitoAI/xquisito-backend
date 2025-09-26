const axios = require('axios');

const BASE_URL = 'http://localhost:5000'; // Ajustar según tu puerto
const TABLE_NUMBER = 10; // Usar mesa 10 para tests (libre)

// Colores para output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

class TestRunner {
    constructor() {
        this.testResults = [];
        this.dishIds = [];
    }

    log(message, color = colors.reset) {
        console.log(`${color}${message}${colors.reset}`);
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async makeRequest(method, url, data = null) {
        try {
            const config = {
                method,
                url: `${BASE_URL}${url}`,
                headers: { 'Content-Type': 'application/json' }
            };

            if (data) config.data = data;

            const response = await axios(config);
            return { success: true, data: response.data, status: response.status };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data || error.message,
                status: error.response?.status || 500
            };
        }
    }

    async showTableStatus(step = '') {
        this.log(`\n📊 ${step} - ESTADO ACTUAL DE LA MESA ${TABLE_NUMBER}:`, colors.cyan);

        // Verificar estado de la mesa
        const tableStatus = await this.makeRequest('GET', `/api/tables/${TABLE_NUMBER}/summary`);
        if (tableStatus.success && tableStatus.data.data) {
            const summary = tableStatus.data.data;
            this.log(`   Mesa Status: ${summary.status}`, colors.yellow);
            this.log(`   Total: $${summary.total_amount}`, colors.yellow);
            this.log(`   Pagado: $${summary.paid_amount}`, colors.green);
            this.log(`   Restante: $${summary.remaining_amount}`, colors.red);
            this.log(`   Items: ${summary.no_items}`, colors.yellow);
        } else {
            this.log(`   ❌ Mesa sin cuenta activa`, colors.dim);
        }

        // Mostrar órdenes detalladas
        const orders = await this.makeRequest('GET', `/api/tables/${TABLE_NUMBER}/orders`);
        if (orders.success && orders.data.data?.length > 0) {
            this.log(`\n   📝 PLATILLOS ORDENADOS:`, colors.blue);
            orders.data.data.forEach((order, i) => {
                const statusColor = order.payment_status === 'paid' ? colors.green : colors.red;
                this.log(`      ${i+1}. ${order.item} x${order.quantity} - $${order.total_price} [${order.status}] ${statusColor}[${order.payment_status}]${colors.reset}`, colors.dim);
            });
        } else {
            this.log(`   📝 Sin platillos ordenados`, colors.dim);
        }

        this.log(`${'-'.repeat(60)}`, colors.dim);
    }

    async runTest(testName, testFunction) {
        this.log(`\n🧪 ${testName}`, colors.bright);
        try {
            await testFunction();
            this.log(`✅ ${testName} - PASSED`, colors.green);
            this.testResults.push({ name: testName, status: 'PASSED' });
        } catch (error) {
            this.log(`❌ ${testName} - FAILED: ${error.message}`, colors.red);
            this.testResults.push({ name: testName, status: 'FAILED', error: error.message });
        }
    }

    async runAllTests() {
        this.log(`\n${'='.repeat(60)}`, colors.bright);
        this.log(`🚀 INICIANDO PRUEBAS DE ENDPOINTS - MESA ${TABLE_NUMBER}`, colors.bright);
        this.log(`${'='.repeat(60)}`, colors.bright);

        await this.showTableStatus('INICIAL');

        // Test 1: Crear primera orden
        await this.runTest('Crear primera orden - Pizza', async () => {
            const response = await this.makeRequest('POST', `/api/tables/${TABLE_NUMBER}/dishes`, {
                userId: 'user123',
                item: 'Pizza Margherita',
                quantity: 2,
                price: 15.50
            });

            if (!response.success) {
                throw new Error(`Error creando orden: ${JSON.stringify(response.error)}`);
            }

            this.dishIds.push(response.data.data.dish_order_id);
            this.log(`   Dish ID: ${response.data.data.dish_order_id}`, colors.dim);
        });

        await this.showTableStatus('Después de 1era orden');
        await this.delay(1000);

        // Test 2: Crear segunda orden (mismo usuario)
        await this.runTest('Crear segunda orden - Coca Cola', async () => {
            const response = await this.makeRequest('POST', `/api/tables/${TABLE_NUMBER}/dishes`, {
                userId: 'user123',
                item: 'Coca Cola',
                quantity: 2,
                price: 3.00
            });

            if (!response.success) {
                throw new Error(`Error creando orden: ${JSON.stringify(response.error)}`);
            }

            this.dishIds.push(response.data.data.dish_order_id);
        });

        await this.showTableStatus('Después de 2da orden');
        await this.delay(1000);

        // Test 3: Crear orden de otro usuario
        await this.runTest('Crear orden de invitado - Hamburguesa', async () => {
            const response = await this.makeRequest('POST', `/api/tables/${TABLE_NUMBER}/dishes`, {
                guestName: 'María González',
                item: 'Hamburguesa Clásica',
                quantity: 1,
                price: 12.00
            });

            if (!response.success) {
                throw new Error(`Error creando orden: ${JSON.stringify(response.error)}`);
            }

            this.dishIds.push(response.data.data.dish_order_id);
        });

        await this.showTableStatus('Después de orden invitado');
        await this.delay(1000);

        // Test 4: Actualizar estado de cocina
        await this.runTest('Actualizar estado a cooking', async () => {
            if (this.dishIds.length === 0) throw new Error('No hay dishes para actualizar');

            const response = await this.makeRequest('PUT', `/api/dishes/${this.dishIds[0]}/status`, {
                status: 'cooking'
            });

            if (!response.success) {
                throw new Error(`Error actualizando estado: ${JSON.stringify(response.error)}`);
            }
        });

        await this.showTableStatus('Después de actualizar estado');
        await this.delay(1000);

        // Test 5: Pagar primer platillo
        await this.runTest('Pagar Pizza (pago parcial)', async () => {
            if (this.dishIds.length === 0) throw new Error('No hay dishes para pagar');

            const response = await this.makeRequest('POST', `/api/dishes/${this.dishIds[0]}/pay`);

            if (!response.success) {
                throw new Error(`Error pagando platillo: ${JSON.stringify(response.error)}`);
            }
        });

        await this.showTableStatus('Después de pago parcial');
        await this.delay(1000);

        // Test 6: Pagar segundo platillo
        await this.runTest('Pagar Coca Cola', async () => {
            if (this.dishIds.length < 2) throw new Error('No hay suficientes dishes');

            const response = await this.makeRequest('POST', `/api/dishes/${this.dishIds[1]}/pay`);

            if (!response.success) {
                throw new Error(`Error pagando platillo: ${JSON.stringify(response.error)}`);
            }
        });

        await this.showTableStatus('Después de 2do pago');
        await this.delay(1000);

        // Test 7: Pagar Hamburguesa también
        await this.runTest('Pagar Hamburguesa', async () => {
            if (this.dishIds.length < 3) throw new Error('No hay dish de hamburguesa');

            const response = await this.makeRequest('POST', `/api/dishes/${this.dishIds[2]}/pay`);

            if (!response.success) {
                throw new Error(`Error pagando hamburguesa: ${JSON.stringify(response.error)}`);
            }
        });

        await this.showTableStatus('Después de pagar hamburguesa');
        await this.delay(1000);

        // Test 8: Agregar nueva orden
        await this.runTest('Agregar Ensalada', async () => {
            const response = await this.makeRequest('POST', `/api/tables/${TABLE_NUMBER}/dishes`, {
                guestName: 'Pedro López',
                item: 'Ensalada César',
                quantity: 1,
                price: 8.50
            });

            if (!response.success) {
                throw new Error(`Error creando orden: ${JSON.stringify(response.error)}`);
            }

            this.dishIds.push(response.data.data.dish_order_id);
        });

        await this.showTableStatus('Después de nueva orden');
        await this.delay(1000);

        // Test 9: Pagar último platillo para cerrar mesa
        await this.runTest('Pagar Ensalada (cerrar mesa)', async () => {
            const lastDishId = this.dishIds[this.dishIds.length - 1];
            const response = await this.makeRequest('POST', `/api/dishes/${lastDishId}/pay`);

            if (!response.success) {
                throw new Error(`Error pagando último platillo: ${JSON.stringify(response.error)}`);
            }
        });

        await this.showTableStatus('FINAL - Mesa cerrada');

        // Test 10: Verificar que mesa está disponible
        await this.runTest('Verificar mesa disponible', async () => {
            const response = await this.makeRequest('GET', `/tables/${TABLE_NUMBER}/summary`);

            if (response.success && response.data.data) {
                throw new Error('La mesa debería estar cerrada (sin cuenta activa)');
            }

            this.log(`   ✅ Mesa correctamente cerrada`, colors.green);
        });

        // Mostrar resumen final
        this.showTestSummary();
    }

    showTestSummary() {
        this.log(`\n${'='.repeat(60)}`, colors.bright);
        this.log(`📊 RESUMEN DE PRUEBAS`, colors.bright);
        this.log(`${'='.repeat(60)}`, colors.bright);

        const passed = this.testResults.filter(t => t.status === 'PASSED').length;
        const failed = this.testResults.filter(t => t.status === 'FAILED').length;

        this.testResults.forEach(test => {
            const color = test.status === 'PASSED' ? colors.green : colors.red;
            this.log(`${color}${test.status === 'PASSED' ? '✅' : '❌'} ${test.name}${colors.reset}`);
            if (test.error) {
                this.log(`   Error: ${test.error}`, colors.dim);
            }
        });

        this.log(`\n📈 RESULTADOS:`, colors.bright);
        this.log(`   Exitosas: ${passed}`, colors.green);
        this.log(`   Fallidas: ${failed}`, colors.red);
        this.log(`   Total: ${this.testResults.length}`, colors.yellow);

        if (failed === 0) {
            this.log(`\n🎉 ¡TODAS LAS PRUEBAS PASARON!`, colors.green);
        } else {
            this.log(`\n⚠️  ${failed} prueba(s) fallaron`, colors.red);
        }
    }
}

// Ejecutar pruebas
const runner = new TestRunner();
runner.runAllTests().catch(error => {
    console.error('Error ejecutando pruebas:', error);
    process.exit(1);
});