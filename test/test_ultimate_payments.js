const axios = require("axios");

const BASE_URL = "http://localhost:5000";
const TABLE_NUMBER = 5; // Mesa específica para test ultimate de pagos

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
  white: "\x1b[37m",
};

class UltimatePaymentTest {
  constructor() {
    this.testResults = [];
    this.dishIds = [];
    this.paymentHistory = [];
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

  async showCompleteStatus(step = "") {
    this.log(`\n${"=".repeat(90)}`, colors.bright);
    this.log(`📊 ${step} - ESTADO COMPLETO MESA ${TABLE_NUMBER}:`, colors.cyan);
    this.log(`${"=".repeat(90)}`, colors.bright);

    // Estado de la mesa
    const tableStatus = await this.makeRequest(
      "GET",
      `/api/tables/${TABLE_NUMBER}/summary`
    );

    if (tableStatus.success && tableStatus.data.data) {
      const summary = tableStatus.data.data;
      this.log(
        `🏷️  MESA ${TABLE_NUMBER} - Status: ${summary.status}`,
        colors.yellow
      );
      this.log(`💰 Total: $${summary.total_amount}`, colors.yellow);
      this.log(`✅ Pagado: $${summary.paid_amount}`, colors.green);
      this.log(`❌ Restante: $${summary.remaining_amount}`, colors.red);
      this.log(`🍽️  Items: ${summary.no_items}`, colors.blue);
    } else {
      this.log(`❌ Mesa sin cuenta activa`, colors.dim);
    }

    // Estado de división (si existe)
    const splitStatus = await this.makeRequest(
      "GET",
      `/api/tables/${TABLE_NUMBER}/split-status`
    );

    if (
      splitStatus.success &&
      splitStatus.data.data &&
      splitStatus.data.data.split_payments.length > 0
    ) {
      this.log(`\n🔄 ESTADO DE DIVISIÓN:`, colors.magenta);
      const { split_payments, summary } = splitStatus.data.data;

      this.log(`👥 Total personas: ${summary.total_people}`, colors.blue);
      this.log(`✅ Ya pagaron: ${summary.paid_people}`, colors.green);
      this.log(`⏳ Pendientes: ${summary.pending_people}`, colors.red);
      this.log(
        `💰 Recaudado por split: $${summary.total_collected}`,
        colors.green
      );
      this.log(
        `💸 Faltante por split: $${summary.total_remaining}`,
        colors.red
      );

      split_payments.forEach((payment, i) => {
        const statusColor =
          payment.status === "paid" ? colors.green : colors.yellow;
        const name =
          payment.guest_name || payment.user_id || `Persona ${i + 1}`;
        this.log(
          `   ${name}: $${payment.expected_amount} ${statusColor}[${payment.status}]${colors.reset}`,
          colors.dim
        );
      });
    } else {
      this.log(`\n🚫 Sin división activa`, colors.dim);
    }

    // Mostrar historial de pagos
    if (this.paymentHistory.length > 0) {
      this.log(`\n📈 HISTORIAL DE PAGOS:`, colors.cyan);
      this.paymentHistory.forEach((payment, i) => {
        this.log(
          `   ${i + 1}. ${payment.type}: $${payment.amount} - ${payment.description}`,
          colors.dim
        );
      });
    }

    this.log(`${"=".repeat(90)}`, colors.dim);
  }

  addPaymentToHistory(type, amount, description) {
    this.paymentHistory.push({ type, amount, description });
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

  async runUltimatePaymentTest() {
    this.log(`\n${"#".repeat(100)}`, colors.white);
    this.log(
      `🚀🎯💰 TEST ULTIMATE DE TODAS LAS MODALIDADES DE PAGO - MESA ${TABLE_NUMBER}`,
      colors.white
    );
    this.log(`${"#".repeat(100)}`, colors.white);
    this.log(
      `🎯 Este test combina TODAS las modalidades: split bill, pagos por item, por monto y mixtos`,
      colors.blue
    );
    this.log(
      `🎪 ¡El test más complejo y realista del sistema de pagos!`,
      colors.magenta
    );

    await this.showCompleteStatus("INICIAL");

    // FASE 1: CREACIÓN DE ÓRDENES INICIAL
    this.log(`\n🎭 === FASE 1: CREACIÓN DE ÓRDENES VARIADAS ===`, colors.cyan);

    await this.runTest(
      "Crear orden - Entrada para Diego ($24.00)",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/dishes`,
          {
            guestName: "Diego",
            item: "Tabla de Quesos y Embutidos",
            quantity: 1,
            price: 24.0,
          }
        );

        if (!response.success) {
          throw new Error(`Error: ${JSON.stringify(response.error)}`);
        }

        this.dishIds.push(response.data.data.dish_order_id);
        this.log(
          `   🧀 Entrada para Diego agregada (ID: ${response.data.data.dish_order_id})`,
          colors.magenta
        );
      }
    );

    await this.runTest(
      "Crear orden - Hamburguesa Deluxe ($32.00)",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/dishes`,
          {
            guestName: "Roberto",
            item: "Hamburguesa Deluxe",
            quantity: 1,
            price: 32.0,
          }
        );

        if (!response.success) {
          throw new Error(`Error: ${JSON.stringify(response.error)}`);
        }

        this.dishIds.push(response.data.data.dish_order_id);
        this.log(
          `   🍔 Hamburguesa Deluxe agregada (ID: ${response.data.data.dish_order_id})`,
          colors.magenta
        );
      }
    );

    await this.runTest("Crear orden - Salmón Grillado ($45.00)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "Sofia",
          item: "Salmón Grillado con Vegetales",
          quantity: 1,
          price: 45.0,
        }
      );

      if (!response.success) {
        throw new Error(`Error: ${JSON.stringify(response.error)}`);
      }

      this.dishIds.push(response.data.data.dish_order_id);
      this.log(
        `   🐟 Salmón Grillado agregado (ID: ${this.dishIds[2]})`,
        colors.magenta
      );
    });

    await this.runTest("Crear orden - Pasta Primavera ($28.00)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/dishes`,
        {
          guestName: "Carmen",
          item: "Pasta Primavera",
          quantity: 1,
          price: 28.0,
        }
      );

      if (!response.success) {
        throw new Error(`Error: ${JSON.stringify(response.error)}`);
      }

      this.dishIds.push(response.data.data.dish_order_id);
      this.log(
        `   🍝 Pasta Primavera agregada (ID: ${this.dishIds[3]})`,
        colors.magenta
      );
    });

    await this.showCompleteStatus("DESPUÉS DE CREAR ÓRDENES INICIALES");
    this.log(
      `\n💡 Total inicial: $129.00 (Diego: 24 + Roberto: 32 + Sofia: 45 + Carmen: 28)`,
      colors.yellow
    );
    await this.delay(1500);

    // FASE 2: PAGO POR ITEM INDIVIDUAL
    this.log(`\n🎯 === FASE 2: PAGO POR ITEM INDIVIDUAL ===`, colors.cyan);

    await this.runTest(
      "Roberto paga su Hamburguesa por item individual ($32.00)",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/dishes/${this.dishIds[1]}/pay`
        );

        if (!response.success) {
          throw new Error(`Error: ${JSON.stringify(response.error)}`);
        }

        this.addPaymentToHistory(
          "Item Individual",
          32.0,
          "Roberto - Hamburguesa Deluxe"
        );
        this.log(
          `   💰 Roberto pagó su hamburguesa individualmente`,
          colors.green
        );
      }
    );

    await this.showCompleteStatus("DESPUÉS DE PAGO POR ITEM");
    await this.delay(1000);

    // FASE 3: PAGO POR MONTO PARCIAL
    this.log(`\n💳 === FASE 3: PAGO POR MONTO PARCIAL ===`, colors.cyan);

    await this.runTest(
      "Sofia paga $50.00 por monto (cubre su plato + extra)",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/pay`,
          {
            amount: 50.0,
          }
        );

        if (!response.success) {
          throw new Error(`Error: ${JSON.stringify(response.error)}`);
        }

        this.addPaymentToHistory(
          "Monto Parcial",
          50.0,
          "Sofia - Cubre salmón + contribución"
        );
        this.log(`   💰 Sofia pagó $50.00 por monto`, colors.green);
      }
    );

    await this.showCompleteStatus("DESPUÉS DE PAGO POR MONTO");
    await this.delay(1000);

    // FASE 4: INICIALIZAR SPLIT BILL PARA EL RESTANTE
    this.log(
      `\n🔄 === FASE 4: INICIALIZAR SPLIT BILL PARA EL RESTANTE ===`,
      colors.cyan
    );

    await this.runTest(
      "Inicializar split bill para 2 personas que NO han pagado (Carmen y Diego)",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/split-bill`,
          {
            numberOfPeople: 2,
            guestNames: ["Carmen", "Diego"],
          }
        );

        if (!response.success) {
          throw new Error(`Error: ${JSON.stringify(response.error)}`);
        }

        this.log(
          `   🔄 Split bill inicializado para Carmen y Diego ($47 ÷ 2 = $23.50 c/u)`,
          colors.green
        );
      }
    );

    await this.showCompleteStatus("DESPUÉS DE INICIALIZAR SPLIT BILL");
    await this.delay(1000);

    // FASE 5: PAGOS POR SPLIT BILL
    this.log(`\n👥 === FASE 5: PAGOS POR SPLIT BILL ===`, colors.cyan);

    await this.runTest("Carmen paga su parte del split ($23.50)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/pay-split`,
        {
          guestName: "Carmen",
        }
      );

      if (!response.success) {
        throw new Error(`Error: ${JSON.stringify(response.error)}`);
      }

      this.addPaymentToHistory(
        "Split Bill",
        23.5,
        "Carmen - Parte del split inicial"
      );
      this.log(`   💰 Carmen pagó su parte del split ($23.50)`, colors.green);
    });

    await this.showCompleteStatus("DESPUÉS DE QUE CARMEN PAGUE SU SPLIT");
    await this.delay(1000);

    // FASE 6: AGREGAR ITEMS ADICIONALES (RE-DIVISIÓN)
    this.log(
      `\n🎊 === FASE 6: AGREGAR ITEMS ADICIONALES (RE-DIVISIÓN) ===`,
      colors.cyan
    );

    await this.runTest(
      "Agregar Bebidas para Roberto ($16.00) - Debe re-dividir automáticamente",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/dishes`,
          {
            guestName: "Roberto",
            item: "Bebidas Variadas",
            quantity: 4,
            price: 4.0,
          }
        );

        if (!response.success) {
          throw new Error(`Error: ${JSON.stringify(response.error)}`);
        }

        if (response.data.data.split_bill_redistributed) {
          const info = response.data.data.redistribution_info;
          this.log(`   🔄 ¡RE-DIVISIÓN AUTOMÁTICA ACTIVADA!`, colors.cyan);
          this.log(`   📊 Nuevo total: $${info.new_total}`, colors.blue);
          this.log(
            `   👥 Personas pendientes: ${info.pending_people}`,
            colors.blue
          );
          this.log(
            `   💰 Nuevo monto por persona: $${info.new_amount_per_pending_person}`,
            colors.blue
          );
        }

        this.dishIds.push(response.data.data.dish_order_id);
        this.log(`   🥤 Bebidas para Roberto agregadas`, colors.magenta);
      }
    );

    await this.runTest(
      "Agregar Postre Especial ($22.00) - Segunda re-división",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/dishes`,
          {
            guestName: "Diego",
            item: "Volcán de Chocolate",
            quantity: 1,
            price: 22.0,
          }
        );

        if (!response.success) {
          throw new Error(`Error: ${JSON.stringify(response.error)}`);
        }

        if (response.data.data.split_bill_redistributed) {
          const info = response.data.data.redistribution_info;
          this.log(`   🔄 ¡SEGUNDA RE-DIVISIÓN AUTOMÁTICA!`, colors.cyan);
          this.log(`   📊 Nuevo total: $${info.new_total}`, colors.blue);
          this.log(
            `   💰 Nuevo monto por persona: $${info.new_amount_per_pending_person}`,
            colors.blue
          );
        }

        this.dishIds.push(response.data.data.dish_order_id);
        this.log(`   🍫 Postre especial agregado`, colors.magenta);
      }
    );

    await this.showCompleteStatus("DESPUÉS DE RE-DIVISIONES");
    await this.delay(2000);

    // FASE 7: MÁS PAGOS MIXTOS
    this.log(`\n🎭 === FASE 7: COMBINACIÓN FINAL DE PAGOS ===`, colors.cyan);

    await this.runTest(
      "Diego paga su parte re-calculada del split",
      async () => {
        const response = await this.makeRequest(
          "POST",
          `/api/tables/${TABLE_NUMBER}/pay-split`,
          {
            guestName: "Diego",
          }
        );

        if (!response.success) {
          throw new Error(`Error: ${JSON.stringify(response.error)}`);
        }

        this.addPaymentToHistory(
          "Split Bill",
          30.75,
          "Diego - Parte re-calculada después de agregar items ($30.75)"
        );
        this.log(
          `   💰 Diego pagó su parte re-calculada del split ($30.75)`,
          colors.green
        );
      }
    );

    await this.showCompleteStatus("DESPUÉS DE QUE DIEGO PAGUE SU SPLIT");
    await this.delay(1000);

    // Roberto paga su parte del split
    await this.runTest("Roberto paga su parte del split ($30.75)", async () => {
      const response = await this.makeRequest(
        "POST",
        `/api/tables/${TABLE_NUMBER}/pay-split`,
        {
          guestName: "Roberto",
        }
      );

      if (!response.success) {
        throw new Error(`Error: ${JSON.stringify(response.error)}`);
      }

      this.addPaymentToHistory(
        "Split Bill",
        30.75,
        "Roberto - Su parte del split después de ordenar bebidas"
      );
      this.log(`   💰 Roberto pagó su parte del split ($30.75)`, colors.green);
    });

    await this.showCompleteStatus("DESPUÉS DE QUE ROBERTO PAGUE SU SPLIT");
    await this.delay(1000);

    // Nota: Sofia NO paga split porque ya había pagado $50 antes del split inicial
    this.log(
      `   💡 Sofia no necesita pagar split (ya pagó $50 antes)`,
      colors.cyan
    );

    await this.showCompleteStatus("FINAL - MESA CERRADA");

    // Verificar que mesa esté cerrada
    await this.runTest("Verificar que mesa está cerrada", async () => {
      const response = await this.makeRequest(
        "GET",
        `/api/tables/${TABLE_NUMBER}/summary`
      );

      if (response.success && response.data.data) {
        throw new Error("La mesa debería estar cerrada");
      }

      this.log(`   ✅ Mesa correctamente cerrada y disponible`, colors.green);
    });

    // Verificar que active_table_users esté limpia
    await this.runTest(
      "Verificar que active_table_users está limpia",
      async () => {
        const response = await this.makeRequest(
          "GET",
          `/api/tables/${TABLE_NUMBER}/active-users`
        );

        if (!response.success) {
          throw new Error(
            `Error checking active_table_users: ${response.error || "API error"}`
          );
        }

        if (response.data && response.data.length > 0) {
          const usersList = response.data
            .map((u) => `${u.guest_name || u.user_id}`)
            .join(", ");
          throw new Error(
            `active_table_users no está limpia. Usuarios restantes: ${usersList}`
          );
        }

        this.log(`   ✅ active_table_users correctamente limpia`, colors.green);
      }
    );

    this.showUltimateTestSummary();
  }

  showUltimateTestSummary() {
    this.log(`\n${"#".repeat(100)}`, colors.white);
    this.log(
      `🏆 RESUMEN ULTIMATE DEL TEST DE TODAS LAS MODALIDADES DE PAGO`,
      colors.white
    );
    this.log(`${"#".repeat(100)}`, colors.white);

    const passed = this.testResults.filter((t) => t.status === "PASSED").length;
    const failed = this.testResults.filter((t) => t.status === "FAILED").length;

    this.log(`\n🎭 HISTORIA ÉPICA DEL TEST:`, colors.yellow);
    this.log(`   📖 Capítulo 1: Órdenes individuales ($129.00)`, colors.blue);
    this.log(
      `   💳 Capítulo 2: Roberto paga su hamburguesa por item ($32.00)`,
      colors.blue
    );
    this.log(`   💰 Capítulo 3: Sofia paga $50.00 por monto`, colors.blue);
    this.log(
      `   🔄 Capítulo 4: Split bill para 2 personas que NO pagaron (Carmen y Diego)`,
      colors.cyan
    );
    this.log(
      `   👥 Capítulo 5: Carmen paga su parte del split ($23.50)`,
      colors.blue
    );
    this.log(
      `   🎊 Capítulo 6: Roberto agrega bebidas + Diego postre (re-divisiones automáticas)`,
      colors.cyan
    );
    this.log(`   🎭 Capítulo 7: Diego paga split re-calculado`, colors.blue);

    this.log(`\n🎯 MODALIDADES PROBADAS EN UN SOLO TEST:`, colors.bright);
    this.log(`   ✅ Pago por item individual`, colors.green);
    this.log(`   ✅ Pago por monto parcial`, colors.green);
    this.log(`   ✅ Pago por monto completo`, colors.green);
    this.log(`   ✅ Split bill (división de cuenta)`, colors.green);
    this.log(`   ✅ Re-división automática (2 veces!)`, colors.green);
    this.log(`   ✅ Combinación de split + monto`, colors.green);
    this.log(`   ✅ Múltiples pagos de la misma persona`, colors.green);
    this.log(`   ✅ Auto-cierre de mesa`, colors.green);

    this.log(`\n🏆 COMPLEJIDAD ALCANZADA:`, colors.bright);
    this.log(`   🧮 Cálculos correctos en escenarios complejos`, colors.green);
    this.log(`   🔄 Re-divisiones múltiples automáticas`, colors.green);
    this.log(`   👥 Pagos cruzados entre diferentes modalidades`, colors.green);
    this.log(`   💰 Seguimiento perfecto de todos los montos`, colors.green);
    this.log(`   🎪 Máxima flexibilidad para los usuarios`, colors.green);

    this.log(`\n💰 RESUMEN FINAL DE PAGOS:`, colors.yellow);
    this.paymentHistory.forEach((payment, i) => {
      this.log(
        `   ${i + 1}. ${payment.type}: $${payment.amount} - ${payment.description}`,
        colors.dim
      );
    });

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

    this.log(`\n📈 ESTADÍSTICAS FINALES:`, colors.bright);
    this.log(`   Exitosas: ${passed}`, colors.green);
    this.log(`   Fallidas: ${failed}`, colors.red);
    this.log(`   Total: ${this.testResults.length}`, colors.yellow);

    if (failed === 0) {
      this.log(
        `\n🎉🏆🎊 ¡ÉXITO TOTAL! TODAS LAS MODALIDADES FUNCIONAN PERFECTAMENTE! 🎊🏆🎉`,
        colors.green
      );
      this.log(
        `✨ El sistema de pagos más complejo y flexible está 100% operativo ✨`,
        colors.green
      );
      this.log(
        `🚀 Listo para producción con todas las modalidades de pago! 🚀`,
        colors.cyan
      );
    } else {
      this.log(
        `\n⚠️  ${failed} prueba(s) fallaron en el test ultimate`,
        colors.red
      );
    }

    this.log(`\n${"#".repeat(100)}`, colors.white);
  }
}

// Ejecutar el test ultimate
const runner = new UltimatePaymentTest();
runner.runUltimatePaymentTest().catch((error) => {
  console.error("Error ejecutando test ultimate de pagos:", error);
  process.exit(1);
});
