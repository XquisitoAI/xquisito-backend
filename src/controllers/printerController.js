const supabase = require("../config/supabase");
const agentConnectionManager = require("../socket/agentConnectionManager");

class PrinterController {
  // GET /api/pos/branch/:branchId/printers
  async getPrinters(req, res) {
    try {
      const { branchId } = req.params;

      const { data, error } = await supabase
        .from("branch_printers")
        .select("*")
        .eq("branch_id", branchId)
        .order("ip");

      if (error) throw error;

      res.json({ success: true, printers: data });
    } catch (error) {
      console.error("[PRINTERS] Error al obtener impresoras:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /api/pos/branch/:branchId/printers/scan
  // Pide al agente que escanee la red y guarda/actualiza los resultados
  async scanPrinters(req, res) {
    try {
      const { branchId } = req.params;

      if (!agentConnectionManager.isConnected(branchId)) {
        return res.status(503).json({
          success: false,
          error: "El agente no está conectado para esta sucursal",
        });
      }

      const result = await agentConnectionManager.sendAndWait(
        branchId,
        "scan_printers",
        {},
        60000, // 60s — el scan tarda ~5s pero damos margen
      );

      const { printers = [] } = result;

      // Insertar nuevas o actualizar last_seen_at de las existentes
      if (printers.length > 0) {
        const now = new Date().toISOString();
        const { data: existing = [] } = await supabase
          .from("branch_printers")
          .select("id, ip")
          .eq("branch_id", branchId)
          .not("ip", "is", null);
        const existingByIp = new Map(existing.map((p) => [p.ip, p.id]));

        for (const { ip, port } of printers) {
          const existingId = existingByIp.get(ip);
          if (existingId) {
            await supabase
              .from("branch_printers")
              .update({ last_seen_at: now })
              .eq("id", existingId);
          } else {
            await supabase
              .from("branch_printers")
              .insert({ branch_id: branchId, ip, port, connection_type: "wifi", last_seen_at: now });
          }
        }
      }

      // Retornar la lista actualizada
      const { data, error } = await supabase
        .from("branch_printers")
        .select("*")
        .eq("branch_id", branchId)
        .order("ip");

      if (error) throw error;

      console.log(
        `[PRINTERS] Scan completado para branch ${branchId}: ${printers.length} impresora(s)`,
      );

      res.json({ success: true, found: printers.length, printers: data });
    } catch (error) {
      console.error("[PRINTERS] Error en scan:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // PUT /api/pos/branch/:branchId/printers/:printerId
  // Actualiza nombre y/o rol de una impresora
  async updatePrinter(req, res) {
    try {
      const { branchId, printerId } = req.params;
      const { name, role, is_active } = req.body;

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (role !== undefined) updates.role = role;
      if (is_active !== undefined) updates.is_active = is_active;

      if (Object.keys(updates).length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "Nada que actualizar" });
      }

      const { data, error } = await supabase
        .from("branch_printers")
        .update(updates)
        .eq("id", printerId)
        .eq("branch_id", branchId)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        return res
          .status(404)
          .json({ success: false, error: "Impresora no encontrada" });
      }

      res.json({ success: true, printer: data });
    } catch (error) {
      console.error("[PRINTERS] Error al actualizar:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /api/pos/branch/:branchId/printers/:printerId/test
  async testPrinter(req, res) {
    try {
      const { branchId, printerId } = req.params;

      if (!agentConnectionManager.isConnected(branchId)) {
        return res.status(503).json({
          success: false,
          error: "El agente no está conectado para esta sucursal",
        });
      }

      const { data: printer, error } = await supabase
        .from("branch_printers")
        .select("ip, port, connection_type, usb_device_name")
        .eq("id", printerId)
        .eq("branch_id", branchId)
        .single();

      if (error || !printer) {
        return res
          .status(404)
          .json({ success: false, error: "Impresora no encontrada" });
      }

      const isUsb = printer.connection_type === "usb";
      const event = isUsb ? "print_test_usb" : "print_test";
      const payload = isUsb
        ? { printerName: printer.usb_device_name }
        : { ip: printer.ip, port: printer.port };

      const result = await agentConnectionManager.sendAndWait(
        branchId,
        event,
        payload,
        10000,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      console.error("[PRINTERS] Error en test:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /api/pos/branch/:branchId/printers/scan-usb
  async scanUsbPrinters(req, res) {
    try {
      const { branchId } = req.params;

      if (!agentConnectionManager.isConnected(branchId)) {
        return res.status(503).json({
          success: false,
          error: "El agente no está conectado para esta sucursal",
        });
      }

      const result = await agentConnectionManager.sendAndWait(
        branchId,
        "list_usb_printers",
        {},
        15000,
      );

      const { printers: usbDevices = [] } = result;

      if (usbDevices.length > 0) {
        const now = new Date().toISOString();
        const { data: existing = [] } = await supabase
          .from("branch_printers")
          .select("id, usb_device_name")
          .eq("branch_id", branchId)
          .not("usb_device_name", "is", null);
        const existingByUsb = new Map(existing.map((p) => [p.usb_device_name, p.id]));

        for (const { device_name } of usbDevices) {
          const existingId = existingByUsb.get(device_name);
          if (existingId) {
            await supabase
              .from("branch_printers")
              .update({ last_seen_at: now })
              .eq("id", existingId);
          } else {
            await supabase
              .from("branch_printers")
              .insert({ branch_id: branchId, ip: null, port: null, connection_type: "usb", usb_device_name: device_name, last_seen_at: now });
          }
        }
      }

      // Retornar lista completa
      const { data, error } = await supabase
        .from("branch_printers")
        .select("*")
        .eq("branch_id", branchId)
        .order("created_at");

      if (error) throw error;

      console.log(
        `[PRINTERS] USB scan completado para branch ${branchId}: ${usbDevices.length} dispositivo(s)`,
      );

      res.json({ success: true, found: usbDevices.length, printers: data });
    } catch (error) {
      console.error("[PRINTERS] Error en scan USB:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // DELETE /api/pos/branch/:branchId/printers/:printerId
  async deletePrinter(req, res) {
    try {
      const { branchId, printerId } = req.params;

      const { error } = await supabase
        .from("branch_printers")
        .delete()
        .eq("id", printerId)
        .eq("branch_id", branchId);

      if (error) throw error;

      res.json({ success: true });
    } catch (error) {
      console.error("[PRINTERS] Error al eliminar:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new PrinterController();
