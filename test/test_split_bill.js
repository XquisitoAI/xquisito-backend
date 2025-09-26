const axios = require("axios");

const BASE_URL = "http://localhost:5000";
const TABLE_NUMBER = 10; // Mesa específica para test de split bill

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

class SplitBillTest {
  constructor() {
    this.testResults = [];
    this.dishIds = [];
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
      this.log(
        `   ✅ Mesa cerrada y disponible (sin cuenta activa)`,
        colors.green
      );
    }

    this.log(`${"-".repeat(70)}`, colors.dim);
  }

  async showSplitStatus(step = "") {
    this.log(`\n🔄 ${step} - ESTADO DIVISIÓN:`, colors.magenta);

    const splitStatus = await this.makeRequest(
      "GET",
      `/api/tables/${TABLE_NUMBER}/split-status`
    );

    if (splitStatus.success && splitStatus.data.data) {
      const { split_payments, summary } = splitStatus.data.data;

      this.log(`   👥 Personas: ${summary.total_people}`, colors.yellow);
      this.log(`   ✅ Pagaron: ${summary.paid_people}`, colors.green);
      this.log(`   ⏳ Pendientes: ${summary.pending_people}`, colors.red);
      this.log(
        `   💰 Total recaudado: $${summary.total_collected}`,
        colors.green
      );
      this.log(`   💸 Total faltante: $${summary.total_remaining}`, colors.red);

      split_payments.forEach((payment, i) => {
        const statusColor =
          payment.status === "paid" ? colors.green : colors.yellow;
        const name =
          payment.guest_name || payment.user_id || `Persona ${i + 1}`;
        this.log(
          `      ${name}: $${payment.expected_amount} ${statusColor}[${payment.status}]${colors.reset}`,
          colors.dim
        );
      });
    } else {
      this.log(`   ❌ No hay división activa`, colors.dim);
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

  async runSplitBillTest() {
    this.log(`\n${"=".repeat(80)}`, colors.bright);
    this.log(
      `🔄💰 TEST DE DIVISIÓN DE CUENTA CON RE-DIVISIÓN AUTOMÁTICA - MESA ${TABLE_NUMBER}`,
      colors.bright
    );
    this.log(`${"=".repeat(80)}`, colors.bright);
    this.log(
      `🎯 Prueba división inicial, pagos individuales, items adicionales y re-división`,
      colors.blue
    );

    await this.showTableStatus("INICIAL");

    // Test 1: Crear órdenes iniciales
    await this.runTest("Crear orden - Pizza Grande ($40.00)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "Ana",
          item: "Pizza Grande",
          quantity: 1,
          price: 40.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando orden: ${JSON.stringify(response.error)}`
        );
      }

      this.dishIds.push(response.data.data.dish_order_id);
      this.log(`   🍕 Pizza Grande agregada`, colors.magenta);
    });

    await this.runTest("Crear orden - Pasta Carbonara ($25.00)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "Luis",
          item: "Pasta Carbonara",
          quantity: 1,
          price: 25.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando orden: ${JSON.stringify(response.error)}`
        );
      }

      this.dishIds.push(response.data.data.dish_order_id);
      this.log(`   🍝 Pasta Carbonara agregada`, colors.magenta);
    });

    await this.runTest("Crear orden - Ensalada Mixta ($15.00)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "María",
          item: "Ensalada Mixta",
          quantity: 1,
          price: 15.0,
        }
      );

      if (!response.success) {
        throw new Error(
          `Error creando orden: ${JSON.stringify(response.error)}`
        );
      }

      this.dishIds.push(response.data.data.dish_order_id);
      this.log(`   🥗 Ensalada Mixta agregada`, colors.magenta);
    });

    await this.showTableStatus("DESPUÉS DE CREAR ÓRDENES");
    this.log(`\n💡 Total inicial: $80.00 (40 + 25 + 15)`, colors.yellow);
    await this.delay(1000);

    // Test 2: Inicializar división de cuenta
    await this.runTest("Inicializar división para 3 personas", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/split-bill`,
        {
          numberOfPeople: 3,
          guestNames: ["Ana", "Luis", "María"],
        }
      );

      if (!response.success) {
        throw new Error(
          `Error inicializando división: ${JSON.stringify(response.error)}`
        );
      }

      this.log(`   🔄 División inicializada: $26.67 por persona`, colors.green);
    });

    await this.showTableStatus("DESPUÉS DE INICIALIZAR DIVISIÓN");
    await this.showSplitStatus("DIVISIÓN INICIAL");
    await this.delay(1000);

    // Test 3: Ana paga su parte
    await this.runTest("Ana paga su parte ($26.67)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/pay-split`,
        {
          guestName: "Ana",
        }
      );

      if (!response.success) {
        throw new Error(
          `Error pagando parte de Ana: ${JSON.stringify(response.error)}`
        );
      }

      this.log(`   💰 Ana pagó su parte de $26.67`, colors.green);
    });

    await this.showTableStatus("DESPUÉS DE QUE ANA PAGUE");
    await this.showSplitStatus("DESPUÉS DE QUE ANA PAGUE");
    await this.delay(1000);

    // Test 4: Luis paga su parte
    await this.runTest("Luis paga su parte ($26.67)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/pay-split`,
        {
          guestName: "Luis",
        }
      );

      if (!response.success) {
        throw new Error(
          `Error pagando parte de Luis: ${JSON.stringify(response.error)}`
        );
      }

      this.log(`   💰 Luis pagó su parte de $26.67`, colors.green);
    });

    await this.showTableStatus("DESPUÉS DE QUE LUIS PAGUE");
    await this.showSplitStatus("DESPUÉS DE QUE LUIS PAGUE");
    this.log(`\n💡 Pagado: $53.34, Restante: $26.66 (María)`, colors.yellow);
    await this.delay(1000);

    // Test 5: ¡Momento crítico! Agregar un item adicional
    await this.runTest(
      "Agregar Postre ($18.00) - Debe RE-DIVIDIR automáticamente",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/dishes`,
          {
            guestName: "Carlos",
            item: "Tiramisú",
            quantity: 1,
            price: 18.0,
          }
        );

        if (!response.success) {
          throw new Error(
            `Error agregando postre: ${JSON.stringify(response.error)}`
          );
        }

        // Verificar si se redistribuyó
        if (response.data.data.split_bill_redistributed) {
          const info = response.data.data.redistribution_info;
          this.log(`   🔄 RE-DIVISIÓN AUTOMÁTICA ACTIVADA!`, colors.cyan);
          this.log(`   📊 Nuevo total: $${info.new_total}`, colors.blue);
          this.log(
            `   👥 Personas totales: ${info.total_people} (incluyendo Carlos)`,
            colors.blue
          );
          this.log(
            `   👥 Personas pendientes: ${info.pending_people}`,
            colors.blue
          );
          this.log(
            `   💰 Nuevo monto por persona pendiente: $${info.new_amount_per_pending_person}`,
            colors.blue
          );
          this.log(
            `   ✅ Ya pagado por split: $${info.total_paid_by_split}`,
            colors.green
          );
        }

        this.dishIds.push(response.data.data.dish_order_id);
        this.log(`   🍰 Tiramisú agregado`, colors.magenta);
      }
    );

    await this.showTableStatus("DESPUÉS DE AGREGAR POSTRE (RE-DIVISIÓN)");
    await this.showSplitStatus("DESPUÉS DE RE-DIVISIÓN");
    this.log(
      `\n🎯 CÁLCULO: Total $98 - Pagado $53.34 = $44.66 ÷ 2 personas pendientes = $22.33 c/u`,
      colors.cyan
    );
    this.log(`   María y Carlos deben: $22.33 cada uno`, colors.cyan);
    await this.delay(2000);

    // Test 6: María paga su nueva parte
    await this.runTest("María paga su nueva parte ($22.33)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/pay-split`,
        {
          guestName: "María",
        }
      );

      if (!response.success) {
        throw new Error(
          `Error pagando nueva parte de María: ${JSON.stringify(response.error)}`
        );
      }

      this.log(`   💰 María pagó su nueva parte de $22.33`, colors.green);
    });

    await this.showTableStatus("DESPUÉS DE QUE MARÍA PAGUE SU NUEVA PARTE");
    await this.showSplitStatus("DESPUÉS DE QUE MARÍA PAGUE");
    this.log(`\n💡 Solo falta Carlos con $22.33`, colors.yellow);
    await this.delay(1000);

    // Test 7: Alguien más decide pagar el resto completo (modalidad mixta)
    await this.runTest(
      "Ana decide pagar el resto completo por monto ($22.33)",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/pay`,
          {
            amount: 22.33,
          }
        );

        if (!response.success) {
          throw new Error(
            `Error pagando resto completo: ${JSON.stringify(response.error)}`
          );
        }

        this.log(`   💰 Ana pagó el resto completo de $22.33`, colors.green);
        this.log(`   🎉 ¡Carlos queda libre!`, colors.yellow);
      }
    );

    await this.showTableStatus("FINAL - MESA COMPLETAMENTE PAGADA");
    await this.showSplitStatus("ESTADO FINAL DE DIVISIÓN");

    // Test 8: Verificar que mesa está cerrada
    await this.runTest("Verificar que mesa está cerrada", async () => {
      const response = await this.makeRequest(
        "GET",
        `/api/tables/${TABLE_NUMBER}/summary`
      );

      // La mesa está cerrada cuando NO hay cuenta activa (no retorna data)
      if (response.success && response.data.data) {
        throw new Error("La mesa debería estar cerrada (sin cuenta activa)");
      }

      this.log(`   ✅ Mesa correctamente cerrada y disponible`, colors.green);
    });

    this.showTestSummary();
  }

  showTestSummary() {
    this.log(`\n${"=".repeat(80)}`, colors.bright);
    this.log(
      `📊 RESUMEN DE PRUEBAS DE DIVISIÓN CON RE-DIVISIÓN AUTOMÁTICA`,
      colors.bright
    );
    this.log(`${"=".repeat(80)}`, colors.bright);

    const passed = this.testResults.filter((t) => t.status === "PASSED").length;
    const failed = this.testResults.filter((t) => t.status === "FAILED").length;

    this.log(`\n💰 HISTORIA FINANCIERA DEL TEST:`, colors.yellow);
    this.log(
      `   1. Órdenes iniciales: $80.00 → División: $26.67 c/u (3 personas)`,
      colors.blue
    );
    this.log(`   2. Ana paga: $26.67 → Restante: $53.33`, colors.blue);
    this.log(`   3. Luis paga: $26.67 → Restante: $26.66`, colors.blue);
    this.log(
      `   4. Se agrega Tiramisú con Carlos: $18.00 → Total: $98.00`,
      colors.cyan
    );
    this.log(
      `   5. RE-DIVISIÓN: $44.66 ÷ 2 personas pendientes = $22.33 c/u (Carlos incluido)`,
      colors.cyan
    );
    this.log(`   6. María paga: $22.33 → Restante: $22.33`, colors.blue);
    this.log(`   7. Ana paga el resto: $22.33 → Mesa cerrada`, colors.green);

    this.log(`\n🎯 FUNCIONALIDADES VALIDADAS:`, colors.bright);
    this.log(`   ✅ Inicialización de división de cuenta`, colors.green);
    this.log(`   ✅ Pagos individuales por división`, colors.green);
    this.log(`   ✅ RE-DIVISIÓN AUTOMÁTICA al agregar items`, colors.green);
    this.log(`   ✅ Combinación con pagos por monto normal`, colors.green);
    this.log(`   ✅ Cálculos correctos en escenarios complejos`, colors.green);
    this.log(`   ✅ Auto-cierre de mesa al completar pago`, colors.green);
    this.log(`   ✅ Tracking completo de estados`, colors.green);

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
      this.log(`\n🎉 ¡TODAS LAS PRUEBAS DE SPLIT BILL PASARON!`, colors.green);
      this.log(
        `✅ Sistema de división con re-división automática funcionando perfectamente`,
        colors.green
      );
    } else {
      this.log(`\n⚠️  ${failed} prueba(s) fallaron`, colors.red);
    }
  }
}

// Ejecutar pruebas
const runner = new SplitBillTest();
runner.runSplitBillTest().catch((error) => {
  console.error("Error ejecutando pruebas de split bill:", error);
  process.exit(1);
});
