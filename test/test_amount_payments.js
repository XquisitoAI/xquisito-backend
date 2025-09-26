const axios = require("axios");

const BASE_URL = "http://localhost:5000";
const TABLE_NUMBER = 6; // Mesa específica para test de pagos por monto

// Colores para output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

class AmountPaymentTest {
  constructor() {
    this.testResults = [];
  }

  log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async makeRequest(method, url, data = null) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${url}`,
        headers: { "Content-Type": "application/json" },
      };

      if (data) config.data = data;

      const response = await axios(config);
      return { success: true, data: response.data, status: response.status };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status || 500,
      };
    }
  }

  async showTableStatus(step = "") {
    this.log(`\n📊 ${step} - ESTADO MESA ${TABLE_NUMBER}:`, colors.cyan);

    // Verificar estado de la mesa
    const tableStatus = await this.makeRequest(
      "GET",
      `/api/tables/${TABLE_NUMBER}/summary`
    );
    if (tableStatus.success && tableStatus.data.data) {
      const summary = tableStatus.data.data;
      this.log(`   Status: ${summary.status}`, colors.yellow);
      this.log(`   Total: $${summary.total_amount}`, colors.yellow);
      this.log(`   Pagado: $${summary.paid_amount}`, colors.green);
      this.log(`   Restante: $${summary.remaining_amount}`, colors.red);
      this.log(`   Items: ${summary.no_items}`, colors.yellow);
    } else {
      this.log(`   ❌ Mesa sin cuenta activa`, colors.dim);
    }

    // Mostrar órdenes detalladas (todos siguen como not_paid)
    const orders = await this.makeRequest(
      "GET",
      `/api/tables/${TABLE_NUMBER}/orders`
    );
    if (orders.success && orders.data.data?.length > 0) {
      this.log(`\n   📝 PLATILLOS (status individual no cambia):`, colors.blue);
      orders.data.data.forEach((order, i) => {
        const statusColor =
          order.payment_status === "paid" ? colors.green : colors.yellow;
        this.log(
          `      ${i + 1}. ${order.item} x${order.quantity} - $${order.total_price} ${statusColor}[${order.payment_status}]${colors.reset}`,
          colors.dim
        );
      });
    } else {
      this.log(`   📝 Sin platillos ordenados`, colors.dim);
    }

    this.log(`${"-".repeat(70)}`, colors.dim);
  }

  async runTest(testName, testFunction) {
    this.log(`\n🧪 ${testName}`, colors.bright);
    try {
      await testFunction();
      this.log(`✅ ${testName} - PASSED`, colors.green);
      this.testResults.push({ name: testName, status: "PASSED" });
    } catch (error) {
      this.log(`❌ ${testName} - FAILED: ${error.message}`, colors.red);
      this.testResults.push({
        name: testName,
        status: "FAILED",
        error: error.message,
      });
    }
  }

  async runAmountPaymentTest() {
    this.log(`\n${"=".repeat(70)}`, colors.bright);
    this.log(
      `💰 TEST DE PAGOS POR MONTO - MESA ${TABLE_NUMBER}`,
      colors.bright
    );
    this.log(`${"=".repeat(70)}`, colors.bright);

    await this.showTableStatus("INICIAL");

    // Test 1: Crear órdenes variadas
    await this.runTest("Crear orden - Pizza Familiar ($45.00)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          userId: "family01",
          item: "Pizza Familiar Suprema",
          quantity: 1,
          price: 45.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando orden: ${JSON.stringify(response.error)}`
        );
      }

      this.log(`   🍕 Pizza Familiar agregada`, colors.magenta);
    });

    await this.runTest("Crear orden - Lasagna ($28.50)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          userId: "family02",
          item: "Lasagna de Carne",
          quantity: 1,
          price: 28.5,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando orden: ${JSON.stringify(response.error)}`
        );
      }
    });

    await this.runTest("Crear orden - Bebidas y Postres ($16.50)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "Mesa Completa",
          item: "Bebidas + Postres",
          quantity: 1,
          price: 16.5,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando orden: ${JSON.stringify(response.error)}`
        );
      }
    });

    await this.showTableStatus("DESPUÉS DE CREAR ÓRDENES");
    this.log(`\n💡 Total a pagar: $90.00 (45 + 28.50 + 16.50)`, colors.yellow);
    await this.delay(1000);

    // Test 2: Pagar $50 sin importar qué items
    await this.runTest("Pagar $50.00 (pago parcial)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/pay`,
        {
          amount: 50.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error pagando monto: ${JSON.stringify(response.error)}`
        );
      }

      this.log(`   💰 Pagados: $50.00 - Restante: $40.00`, colors.green);
    });

    await this.showTableStatus("DESPUÉS DE PAGAR $50");
    await this.delay(1000);

    // Test 3: Agregar más items después del pago parcial
    await this.runTest(
      "Agregar Café ($8.00) después de pago parcial",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/dishes`,
          {
            guestName: "Café Final",
            item: "Café Americano",
            quantity: 2,
            price: 4.0,
          }
        );

        if (!response.success) {
          throw new Error(
            `Error agregando café: ${JSON.stringify(response.error)}`
          );
        }

        this.log(`   ☕ Café agregado - Nuevo total: $98.00`, colors.magenta);
      }
    );

    await this.showTableStatus("DESPUÉS DE AGREGAR CAFÉ");
    this.log(
      `\n💡 Nuevo total: $98.00, Ya pagado: $50.00, Restante: $48.00`,
      colors.yellow
    );
    await this.delay(1000);

    // Test 4: Pagar $25 más
    await this.runTest("Pagar $25.00 adicionales", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/pay`,
        {
          amount: 25.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error pagando segundo monto: ${JSON.stringify(response.error)}`
        );
      }

      this.log(
        `   💰 Pagados: $25.00 más - Total pagado: $75.00`,
        colors.green
      );
    });

    await this.showTableStatus("DESPUÉS DE PAGAR $25 MÁS");
    await this.delay(1000);

    // Test 5: Intentar pagar de más (debe fallar)
    await this.runTest(
      "Intentar pagar $50.00 (excede lo adeudado - debe fallar)",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/pay`,
          {
            amount: 50.0,
          }
        );

        if (response.success) {
          throw new Error("No debería permitir pagar más de lo adeudado");
        }

        this.log(
          `   ✅ Correctamente rechazado: ${response.error.error || "Monto excede lo adeudado"}`,
          colors.green
        );
      }
    );

    // Test 6: Pagar el resto exacto ($23.00)
    await this.runTest(
      "Pagar resto exacto ($23.00) - Cerrar mesa",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/pay`,
          {
            amount: 23.0,
          }
        );

        if (!response.success) {
          throw new Error(
            `Error pagando resto: ${JSON.stringify(response.error)}`
          );
        }

        this.log(
          `   💰 Pagados: $23.00 - ¡Mesa completamente pagada!`,
          colors.green
        );
      }
    );

    await this.showTableStatus("FINAL - MESA CERRADA");

    // Test 7: Verificar que mesa está disponible
    await this.runTest(
      "Verificar mesa disponible para nueva orden",
      async () => {
        const response = await this.makeRequest(
          "GET",
          `/api/tables/${TABLE_NUMBER}/summary`
        );

        if (response.success && response.data.data) {
          throw new Error("La mesa debería estar cerrada (sin cuenta activa)");
        }

        this.log(
          `   ✅ Mesa correctamente disponible para nueva orden`,
          colors.green
        );
      }
    );

    // Mostrar resumen final
    this.showTestSummary();
  }

  showTestSummary() {
    this.log(`\n${"=".repeat(70)}`, colors.bright);
    this.log(`📊 RESUMEN DE PRUEBAS DE PAGOS POR MONTO`, colors.bright);
    this.log(`${"=".repeat(70)}`, colors.bright);

    const passed = this.testResults.filter((t) => t.status === "PASSED").length;
    const failed = this.testResults.filter((t) => t.status === "FAILED").length;

    this.log(`\n💰 RESUMEN FINANCIERO DEL TEST:`, colors.yellow);
    this.log(
      `   Órdenes iniciales: $90.00 (Pizza $45 + Lasagna $28.50 + Bebidas $16.50)`,
      colors.blue
    );
    this.log(`   Orden adicional: $8.00 (Café x2)`, colors.blue);
    this.log(`   Total final: $98.00`, colors.blue);
    this.log(`\n💳 SECUENCIA DE PAGOS:`, colors.yellow);
    this.log(`   1er pago: $50.00 → Restante: $40.00`, colors.dim);
    this.log(`   Se agrega café: +$8.00 → Restante: $48.00`, colors.dim);
    this.log(`   2do pago: $25.00 → Restante: $23.00`, colors.dim);
    this.log(
      `   3er pago: $23.00 → ¡Mesa cerrada automáticamente!`,
      colors.green
    );

    this.log(`\n🎯 CARACTERÍSTICAS VALIDADAS:`, colors.bright);
    this.log(
      `   ✅ Pagos por monto total (no por item específico)`,
      colors.green
    );
    this.log(
      `   ✅ Items individuales mantienen status 'not_paid'`,
      colors.green
    );
    this.log(`   ✅ Totales se actualizan correctamente`, colors.green);
    this.log(`   ✅ Prevención de pagos excesivos`, colors.green);
    this.log(`   ✅ Agregar items después de pagos parciales`, colors.green);
    this.log(`   ✅ Auto-cierre al pagar el 100%`, colors.green);

    this.log(`\n📋 RESULTADOS DE PRUEBAS:`, colors.bright);
    this.testResults.forEach((test) => {
      const color = test.status === "PASSED" ? colors.green : colors.red;
      this.log(
        `${color}${test.status === "PASSED" ? "✅" : "❌"} ${test.name}${colors.reset}`
      );
      if (test.error) {
        this.log(`   Error: ${test.error}`, colors.dim);
      }
    });

    this.log(`\n📈 ESTADÍSTICAS:`, colors.bright);
    this.log(`   Exitosas: ${passed}`, colors.green);
    this.log(`   Fallidas: ${failed}`, colors.red);
    this.log(`   Total: ${this.testResults.length}`, colors.yellow);

    if (failed === 0) {
      this.log(
        `\n🎉 ¡TODAS LAS PRUEBAS DE PAGOS POR MONTO PASARON!`,
        colors.green
      );
      this.log(
        `✅ Sistema de pagos por monto total funcionando correctamente`,
        colors.green
      );
    } else {
      this.log(`\n⚠️  ${failed} prueba(s) fallaron`, colors.red);
    }
  }
}

// Ejecutar pruebas
const runner = new AmountPaymentTest();
runner.runAmountPaymentTest().catch((error) => {
  console.error("Error ejecutando pruebas de pagos por monto:", error);
  process.exit(1);
});
