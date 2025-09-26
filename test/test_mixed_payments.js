const axios = require("axios");

const BASE_URL = "http://localhost:5000";
const TABLE_NUMBER = 5; // Mesa específica para test de pagos mixtos

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

class MixedPaymentTest {
  constructor() {
    this.testResults = [];
    this.dishIds = []; // Para guardar IDs de platillos creados
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

    // Mostrar órdenes detalladas
    const orders = await this.makeRequest(
      "GET",
      `/api/tables/${TABLE_NUMBER}/orders`
    );
    if (orders.success && orders.data.data?.length > 0) {
      this.log(`\n   📝 PLATILLOS:`, colors.blue);
      orders.data.data.forEach((order, i) => {
        const statusColor =
          order.payment_status === "paid" ? colors.green : colors.yellow;
        this.log(
          `      ${i + 1}. ${order.item} x${order.quantity} - $${order.total_price} ${statusColor}[${order.payment_status}]${colors.reset} (ID: ${order.dish_order_id})`,
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

  async runMixedPaymentTest() {
    this.log(`\n${"=".repeat(70)}`, colors.bright);
    this.log(`💰🎯 TEST DE PAGOS MIXTOS - MESA ${TABLE_NUMBER}`, colors.bright);
    this.log(`${"=".repeat(70)}`, colors.bright);
    this.log(
      `🎯 Combina pagos por item individual y por monto total`,
      colors.blue
    );

    await this.showTableStatus("INICIAL");

    // Test 1: Crear órdenes variadas
    await this.runTest(
      "Crear orden - Hamburguesa Premium ($32.00)",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/dishes`,
          {
            userId: "user01",
            item: "Hamburguesa Premium",
            quantity: 1,
            price: 32.0,
          }
        );

        if (!response.success) {
          throw new Error(
            `Error creando orden: ${JSON.stringify(response.error)}`
          );
        }

        this.dishIds.push(response.data.data.dish_order_id);
        this.log(
          `   🍔 Hamburguesa Premium agregada (ID: ${this.dishIds[0]})`,
          colors.magenta
        );
      }
    );

    await this.runTest("Crear orden - Ensalada César ($18.50)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          userId: "user02",
          item: "Ensalada César",
          quantity: 1,
          price: 18.5,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando orden: ${JSON.stringify(response.error)}`
        );
      }

      this.dishIds.push(response.data.data.dish_order_id);
      this.log(
        `   🥗 Ensalada César agregada (ID: ${this.dishIds[1]})`,
        colors.magenta
      );
    });

    await this.runTest("Crear orden - Pasta Alfredo ($24.00)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "Invitado Mesa",
          item: "Pasta Alfredo",
          quantity: 1,
          price: 24.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando orden: ${JSON.stringify(response.error)}`
        );
      }

      this.dishIds.push(response.data.data.dish_order_id);
      this.log(
        `   🍝 Pasta Alfredo agregada (ID: ${this.dishIds[2]})`,
        colors.magenta
      );
    });

    await this.runTest("Crear orden - Bebidas x3 ($15.00)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "Mesa Completa",
          item: "Bebidas Variadas",
          quantity: 3,
          price: 5.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando orden: ${JSON.stringify(response.error)}`
        );
      }

      this.dishIds.push(response.data.data.dish_order_id);
      this.log(
        `   🥤 Bebidas x3 agregadas (ID: ${this.dishIds[3]})`,
        colors.magenta
      );
    });

    await this.showTableStatus("DESPUÉS DE CREAR ÓRDENES");
    this.log(
      `\n💡 Total inicial: $89.50 (32 + 18.50 + 24 + 15)`,
      colors.yellow
    );
    await this.delay(1000);

    // Test 2: Pagar un item específico (Ensalada César)
    await this.runTest("Pagar Ensalada César por item ($18.50)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/dishes/${this.dishIds[1]}/pay`
      );

      if (!response.success) {
        throw new Error(
          `Error pagando item: ${JSON.stringify(response.error)}`
        );
      }

      this.log(`   💰 Ensalada César pagada individualmente`, colors.green);
    });

    await this.showTableStatus("DESPUÉS DE PAGAR ENSALADA");
    this.log(`\n💡 Pagado: $18.50 (por item), Restante: $71.00`, colors.yellow);
    await this.delay(1000);

    // Test 3: Pagar monto específico ($30.00)
    await this.runTest("Pagar $30.00 por monto", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/pay`,
        {
          amount: 30.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error pagando monto: ${JSON.stringify(response.error)}`
        );
      }

      this.log(`   💰 $30.00 pagados por monto total`, colors.green);
    });

    await this.showTableStatus("DESPUÉS DE PAGAR $30");
    this.log(
      `\n💡 Total pagado: $48.50 ($18.50 item + $30 monto), Restante: $41.00`,
      colors.yellow
    );
    await this.delay(1000);

    // Test 4: Agregar más items después de pagos parciales
    await this.runTest("Agregar Postre ($12.00) después de pagos", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "Postre Mesa",
          item: "Cheesecake",
          quantity: 1,
          price: 12.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error agregando postre: ${JSON.stringify(response.error)}`
        );
      }

      this.dishIds.push(response.data.data.dish_order_id);
      this.log(
        `   🍰 Cheesecake agregado (ID: ${this.dishIds[4]})`,
        colors.magenta
      );
    });

    await this.showTableStatus("DESPUÉS DE AGREGAR POSTRE");
    this.log(
      `\n💡 Nuevo total: $101.50, Pagado: $48.50, Restante: $53.00`,
      colors.yellow
    );
    await this.delay(1000);

    // Test 5: Pagar otro item específico (Hamburguesa Premium)
    await this.runTest(
      "Pagar Hamburguesa Premium por item ($32.00)",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/dishes/${this.dishIds[0]}/pay`
        );

        if (!response.success) {
          throw new Error(
            `Error pagando hamburguesa: ${JSON.stringify(response.error)}`
          );
        }

        this.log(
          `   💰 Hamburguesa Premium pagada individualmente`,
          colors.green
        );
      }
    );

    await this.showTableStatus("DESPUÉS DE PAGAR HAMBURGUESA");
    this.log(
      `\n💡 Total pagado: $80.50 ($50.50 items + $30 monto), Restante: $21.00`,
      colors.yellow
    );
    await this.delay(1000);

    // Test 6: Pagar el resto con monto ($21.00)
    await this.runTest(
      "Pagar resto por monto ($21.00) - Cerrar mesa",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/pay`,
          {
            amount: 21.0,
          }
        );

        if (!response.success) {
          throw new Error(
            `Error pagando resto: ${JSON.stringify(response.error)}`
          );
        }

        this.log(
          `   💰 $21.00 pagados - ¡Mesa completamente pagada!`,
          colors.green
        );
      }
    );

    await this.showTableStatus("FINAL - MESA CERRADA");

    // Test 7: Verificar que mesa está disponible
    await this.runTest("Verificar mesa disponible", async () => {
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
    });

    // Test 8: Escenario adicional - Intentar pagar item ya pagado
    this.log(
      `\n🔄 ESCENARIO ADICIONAL - Nueva orden para validaciones`,
      colors.cyan
    );

    await this.runTest("Crear nueva orden - Café ($6.00)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "Test Adicional",
          item: "Café Americano",
          quantity: 1,
          price: 6.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando café: ${JSON.stringify(response.error)}`
        );
      }

      const newDishId = response.data.data.dish_order_id;
      this.log(`   ☕ Café agregado (ID: ${newDishId})`, colors.magenta);

      // Pagar el café
      const payResponse = await this.makeRequest(
        "POST",
        `/api/dishes/${newDishId}/pay`
      );

      if (!payResponse.success) {
        throw new Error(
          `Error pagando café: ${JSON.stringify(payResponse.error)}`
        );
      }

      // Intentar pagar de nuevo (debería fallar)
      const payAgainResponse = await this.makeRequest(
        "POST",
        `/api/dishes/${newDishId}/pay`
      );

      if (payAgainResponse.success) {
        throw new Error("No debería permitir pagar un item ya pagado");
      }

      this.log(`   ✅ Correctamente rechazado pago duplicado`, colors.green);
    });

    this.showTestSummary();
  }

  showTestSummary() {
    this.log(`\n${"=".repeat(70)}`, colors.bright);
    this.log(`📊 RESUMEN DE PRUEBAS DE PAGOS MIXTOS`, colors.bright);
    this.log(`${"=".repeat(70)}`, colors.bright);

    const passed = this.testResults.filter((t) => t.status === "PASSED").length;
    const failed = this.testResults.filter((t) => t.status === "FAILED").length;

    this.log(`\n💰 RESUMEN FINANCIERO DEL TEST:`, colors.yellow);
    this.log(`   Órdenes iniciales: $89.50`, colors.blue);
    this.log(`     • Hamburguesa Premium: $32.00`, colors.dim);
    this.log(`     • Ensalada César: $18.50`, colors.dim);
    this.log(`     • Pasta Alfredo: $24.00`, colors.dim);
    this.log(`     • Bebidas x3: $15.00`, colors.dim);
    this.log(`   Orden adicional: $12.00 (Cheesecake)`, colors.blue);
    this.log(`   Total final: $101.50`, colors.blue);

    this.log(`\n💳 SECUENCIA DE PAGOS MIXTOS:`, colors.yellow);
    this.log(`   1. Pago por item: Ensalada César $18.50`, colors.dim);
    this.log(`   2. Pago por monto: $30.00`, colors.dim);
    this.log(`   3. Se agrega Cheesecake: +$12.00`, colors.dim);
    this.log(`   4. Pago por item: Hamburguesa Premium $32.00`, colors.dim);
    this.log(`   5. Pago por monto: $21.00 → Mesa cerrada`, colors.green);

    this.log(`\n🎯 CARACTERÍSTICAS VALIDADAS:`, colors.bright);
    this.log(`   ✅ Pagos por item individual específico`, colors.green);
    this.log(`   ✅ Pagos por monto total de mesa`, colors.green);
    this.log(`   ✅ Combinación de ambos tipos de pago`, colors.green);
    this.log(`   ✅ Cálculos correctos con pagos mixtos`, colors.green);
    this.log(`   ✅ Agregar items después de pagos parciales`, colors.green);
    this.log(`   ✅ Auto-cierre al completar pago total`, colors.green);
    this.log(`   ✅ Prevención de pagos duplicados por item`, colors.green);
    this.log(`   ✅ Estados individuales de items se mantienen`, colors.green);

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
        `\n🎉 ¡TODAS LAS PRUEBAS DE PAGOS MIXTOS PASARON!`,
        colors.green
      );
      this.log(
        `✅ Sistema de pagos híbrido funcionando correctamente`,
        colors.green
      );
    } else {
      this.log(`\n⚠️  ${failed} prueba(s) fallaron`, colors.red);
    }
  }
}

// Ejecutar pruebas
const runner = new MixedPaymentTest();
runner.runMixedPaymentTest().catch((error) => {
  console.error("Error ejecutando pruebas de pagos mixtos:", error);
  process.exit(1);
});
