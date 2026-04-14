const supabase = require("../config/supabase");

// Cache simple en memoria: branchId → Map<menuItemId, clasificacion>
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Enriquece los items de una orden con clasificacion.
async function enrichItemsWithClasificacion(branchId, items) {
  if (!items || items.length === 0) return items;

  // Obtener IDs de menu_items relevantes
  // Los items del payload tienen productId (pos_item_id) que mapea a menu_items.id
  // o directamente menu_item_id si viene de Xquisito nativo
  const menuItemIds = items
    .map((i) => i.menuItemId || i.menu_item_id)
    .filter(Boolean)
    .map(Number);

  if (menuItemIds.length === 0) {
    // No hay IDs de Supabase — no podemos enriquecer
    return items.map((i) => ({ ...i, clasificacion: null }));
  }

  try {
    const clasificacionMap = await getClasificacionMap(branchId, menuItemIds);

    return items.map((item) => {
      const mid = item.menuItemId || item.menu_item_id;
      return {
        ...item,
        clasificacion: mid ? (clasificacionMap.get(Number(mid)) ?? null) : null,
      };
    });
  } catch (err) {
    console.error("[ENRICH] Error enriqueciendo items:", err.message);
    return items.map((i) => ({ ...i, clasificacion: null }));
  }
}

// Obtiene un mapa menuItemId → clasificacion para los IDs dados.
async function getClasificacionMap(branchId, menuItemIds) {
  const cacheKey = branchId;
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.map;
  }

  // Cargar desde Supabase: menu_items con su section clasificacion
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, menu_sections(clasificacion)")
    .in("id", menuItemIds);

  if (error) throw error;

  const map = new Map();
  for (const item of data || []) {
    const clasificacion = item.menu_sections?.clasificacion ?? null;
    map.set(item.id, clasificacion);
  }

  cache.set(cacheKey, { map, ts: now });
  return map;
}

module.exports = { enrichItemsWithClasificacion };
