# Soporte de Sucursales (Branches) para Pick & Go Orders

**Fecha**: 22 de diciembre 2024
**Versión**: 1.0

## 📋 Resumen

Este documento describe los cambios realizados en el backend de xquisito para agregar soporte de sucursales (branches) en el sistema de órdenes Pick & Go. Ahora los clientes pueden seleccionar en qué sucursal desean recoger su pedido.

---

## 🗄️ Cambios en Base de Datos

### Migración SQL

**Archivo**: [`sql/migrations/add_branch_number_to_pick_and_go_orders.sql`](sql/migrations/add_branch_number_to_pick_and_go_orders.sql)

#### Cambios realizados:

1. **Nueva columna `branch_number`** en tabla `pick_and_go_orders`
   ```sql
   ALTER TABLE pick_and_go_orders
   ADD COLUMN branch_number INTEGER;
   ```

2. **Foreign Key Constraint** para validar que la combinación restaurant_id + branch_number exista
   ```sql
   ALTER TABLE pick_and_go_orders
   ADD CONSTRAINT fk_pick_and_go_branch
   FOREIGN KEY (restaurant_id, branch_number)
   REFERENCES branches(restaurant_id, branch_number)
   ON DELETE RESTRICT;
   ```

3. **Migración de datos existentes**: Asigna la primera sucursal activa del restaurante a órdenes existentes

4. **Índices para performance**:
   - `idx_pick_and_go_restaurant_branch` (compuesto)
   - `idx_pick_and_go_branch_number`

#### Cómo aplicar la migración:

```bash
# Opción 1: Usando psql
psql -U postgres -d xquisito_db -f sql/migrations/add_branch_number_to_pick_and_go_orders.sql

# Opción 2: Usando Supabase Dashboard
# Copiar y pegar el contenido del archivo en el SQL Editor
```

#### Verificación post-migración:

```sql
-- Verificar que no hay órdenes sin sucursal
SELECT COUNT(*) as orders_without_branch
FROM pick_and_go_orders
WHERE branch_number IS NULL;

-- Si retorna 0, puedes hacer la columna NOT NULL (paso opcional en la migración)
```

---

## 🔧 Cambios en Servicios

### PickAndGoService

**Archivo**: [`src/services/pickAndGoService.js`](src/services/pickAndGoService.js)

#### Método `createOrder()` - ACTUALIZADO

**Nuevos parámetros requeridos**:
- `restaurant_id` (INTEGER): ID del restaurante
- `branch_number` (INTEGER): Número de sucursal donde recoger el pedido

**Ejemplo de uso**:
```javascript
const orderData = {
  clerk_user_id: 'user_abc123',
  customer_name: 'Juan Pérez',
  customer_phone: '5551234567',
  customer_email: 'juan@example.com',
  restaurant_id: 3,          // NUEVO
  branch_number: 1,          // NUEVO
  total_amount: 250.50,
  session_data: {},
  prep_metadata: {}
};

const result = await pickAndGoService.createOrder(orderData);
```

#### Método `getRestaurantOrders()` - ACTUALIZADO

**Nuevo filtro opcional**:
- `branch_number`: Filtra órdenes por sucursal específica

**Ejemplo**:
```javascript
const filters = {
  order_status: 'preparing',
  branch_number: 1,         // NUEVO filtro
  date_from: '2025-12-01'
};

const result = await pickAndGoService.getRestaurantOrders(3, filters);
```

#### Método `getBranchOrders()` - NUEVO

Obtiene órdenes de una sucursal específica.

**Parámetros**:
- `restaurantId` (INTEGER): ID del restaurante
- `branchNumber` (INTEGER): Número de sucursal
- `filters` (Object): Filtros opcionales (order_status, date_from, date_to)

**Ejemplo**:
```javascript
const result = await pickAndGoService.getBranchOrders(3, 1, {
  order_status: 'active'
});
```

---

## 🌐 Cambios en Endpoints

### PickAndGoController

**Archivo**: [`src/controllers/pickAndGoController.js`](src/controllers/pickAndGoController.js)

#### `POST /api/pick-and-go/orders` - ACTUALIZADO

**Request Body** (nuevos campos requeridos):
```json
{
  "clerk_user_id": "user_abc123",
  "customer_name": "Juan Pérez",
  "customer_phone": "5551234567",
  "customer_email": "juan@example.com",
  "restaurant_id": 3,        // ← NUEVO (requerido)
  "branch_number": 1,        // ← NUEVO (requerido)
  "session_data": {
    "total_amount": 250.50
  },
  "prep_metadata": {}
}
```

**Response** (sin cambios):
```json
{
  "success": true,
  "data": {
    "id": "uuid-order-id",
    "clerk_user_id": "user_abc123",
    "customer_name": "Juan Pérez",
    "restaurant_id": 3,
    "branch_number": 1,
    "total_amount": 250.50,
    "payment_status": "pending",
    "order_status": "active",
    "created_at": "2025-12-22T10:00:00Z"
  }
}
```

**Validaciones agregadas**:
- ❌ Error 400 si falta `restaurant_id`
- ❌ Error 400 si falta `branch_number`
- ❌ Error 500 si la combinación restaurant_id + branch_number no existe (FK violation)

---

#### `GET /api/pick-and-go/restaurant/:restaurantId/orders` - ACTUALIZADO

**Nuevo query parameter**:
- `branch_number` (opcional): Filtrar por sucursal específica

**Ejemplos**:
```bash
# Todas las órdenes del restaurante 3
GET /api/pick-and-go/restaurant/3/orders

# Solo órdenes de la sucursal 1
GET /api/pick-and-go/restaurant/3/orders?branch_number=1

# Combinando filtros
GET /api/pick-and-go/restaurant/3/orders?branch_number=1&order_status=preparing&date_from=2025-12-01
```

---

#### `GET /api/pick-and-go/restaurant/:restaurantId/branch/:branchNumber/orders` - NUEVO

Obtiene órdenes de una sucursal específica.

**Endpoint**: `/api/pick-and-go/restaurant/:restaurantId/branch/:branchNumber/orders`

**Parámetros de ruta**:
- `restaurantId` (INTEGER): ID del restaurante
- `branchNumber` (INTEGER): Número de sucursal

**Query parameters opcionales**:
- `order_status`: active | confirmed | preparing | completed | abandoned
- `date_from`: fecha de inicio (ISO string)
- `date_to`: fecha de fin (ISO string)

**Ejemplo**:
```bash
GET /api/pick-and-go/restaurant/3/branch/1/orders?order_status=preparing
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "restaurant_id": 3,
      "branch_number": 1,
      "customer_name": "Juan Pérez",
      "order_status": "preparing",
      "total_amount": 250.50,
      "dish_order": [
        {
          "id": "dish-uuid-1",
          "item": "Hamburguesa Clásica",
          "quantity": 2,
          "price": 125.25,
          "status": "cooking"
        }
      ]
    }
  ]
}
```

---

## 📝 Rutas Actualizadas

**Archivo**: [`src/routes/pickAndGoRoutes.js`](src/routes/pickAndGoRoutes.js)

### Resumen de cambios:

| Endpoint | Método | Cambio | Descripción |
|----------|--------|--------|-------------|
| `/orders` | POST | ✏️ Actualizado | Ahora requiere `restaurant_id` y `branch_number` |
| `/restaurant/:restaurantId/orders` | GET | ✏️ Actualizado | Soporta filtro `?branch_number=X` |
| `/restaurant/:restaurantId/branch/:branchNumber/orders` | GET | ✨ **NUEVO** | Obtiene órdenes de una sucursal específica |

---

## 🔄 Retrocompatibilidad

### ⚠️ BREAKING CHANGES

1. **POST `/api/pick-and-go/orders`** ahora requiere:
   - `restaurant_id` (antes opcional/ausente)
   - `branch_number` (antes no existía)

2. **Órdenes existentes sin `branch_number`**:
   - La migración SQL asigna automáticamente la primera sucursal activa
   - Se recomienda revisar y actualizar manualmente si es necesario

### ✅ Cambios compatibles

- Los endpoints de consulta (`GET`) no rompen funcionalidad existente
- El nuevo filtro `branch_number` es opcional
- El nuevo endpoint de sucursal es adicional

---

## 🧪 Testing

### Casos de prueba recomendados:

1. **Crear orden con sucursal válida**
   ```bash
   curl -X POST http://localhost:3001/api/pick-and-go/orders \
     -H "Content-Type: application/json" \
     -d '{
       "clerk_user_id": "user_123",
       "customer_name": "Test User",
       "customer_email": "test@example.com",
       "restaurant_id": 3,
       "branch_number": 1
     }'
   ```

2. **Crear orden con sucursal inválida** (debe fallar)
   ```bash
   curl -X POST http://localhost:3001/api/pick-and-go/orders \
     -H "Content-Type: application/json" \
     -d '{
       "clerk_user_id": "user_123",
       "customer_name": "Test User",
       "restaurant_id": 3,
       "branch_number": 999
     }'

   # Esperado: Error 500 (FK constraint violation)
   ```

3. **Filtrar órdenes por sucursal**
   ```bash
   GET http://localhost:3001/api/pick-and-go/restaurant/3/orders?branch_number=1
   ```

4. **Obtener órdenes de sucursal específica**
   ```bash
   GET http://localhost:3001/api/pick-and-go/restaurant/3/branch/1/orders
   ```

---

## 📊 Modelo de Datos Actualizado

### Tabla `pick_and_go_orders`

```
┌─────────────────────────────────────────────────┐
│ pick_and_go_orders                              │
├─────────────────────────────────────────────────┤
│ id                  UUID PRIMARY KEY            │
│ clerk_user_id       VARCHAR                     │
│ customer_name       VARCHAR                     │
│ customer_phone      VARCHAR                     │
│ customer_email      VARCHAR                     │
│ total_amount        NUMERIC                     │
│ restaurant_id       INTEGER  ───────┐           │
│ branch_number       INTEGER  ───────┼─────┐     │
│ payment_status      VARCHAR         │     │     │
│ order_status        VARCHAR         │     │     │
│ session_data        JSONB           │     │     │
│ prep_metadata       JSONB           │     │     │
│ created_at          TIMESTAMP       │     │     │
│ updated_at          TIMESTAMP       │     │     │
└─────────────────────────────────────┼─────┼─────┘
                                      │     │
                    FK Compuesta ─────┘     │
                    (restaurant_id,          │
                     branch_number)          │
                            │                │
                            ▼                │
┌──────────────────────────────────────────┐ │
│ branches                                 │ │
├──────────────────────────────────────────┤ │
│ id                UUID PRIMARY KEY       │ │
│ client_id         UUID                   │ │
│ restaurant_id     INTEGER ◄──────────────┼─┘
│ branch_number     INTEGER ◄──────────────┘
│ name              VARCHAR                 │
│ address           TEXT                    │
│ tables            INTEGER                 │
│ active            BOOLEAN                 │
│ UNIQUE (restaurant_id, branch_number)    │
└──────────────────────────────────────────┘
```

---

## 🚀 Próximos Pasos

### Para el Frontend (xquisito-pick-and-go):

1. Crear `BranchContext` para manejar sucursales
2. Componente `BranchSelector` para elegir sucursal
3. Mostrar sucursal seleccionada en MenuView, CartView, CardSelection
4. Incluir `branch_number` al crear órdenes
5. Persistir sucursal seleccionada en localStorage

### Mejoras Futuras (Opcional):

1. **Inventario por sucursal**: Tabla `branch_menu_items` para controlar disponibilidad específica
2. **Horarios por sucursal**: Ya existe campo `opening_hours` en tabla `branches`
3. **Tiempo de preparación por sucursal**: Personalizar tiempos según carga de cada sucursal
4. **Geolocalización**: Ordenar sucursales por distancia al usuario

---

## 📞 Contacto

Para preguntas sobre esta implementación, contactar al equipo de desarrollo.

---

## 📜 Changelog

### [1.0.0] - 2025-12-22

#### Added
- Columna `branch_number` en tabla `pick_and_go_orders`
- Foreign key constraint compuesta hacia tabla `branches`
- Índices de performance para consultas por sucursal
- Método `getBranchOrders()` en PickAndGoService
- Endpoint `GET /restaurant/:id/branch/:num/orders`
- Filtro `branch_number` en endpoint de órdenes del restaurante

#### Changed
- Método `createOrder()` ahora requiere `restaurant_id` y `branch_number`
- Método `getRestaurantOrders()` soporta filtro por sucursal
- Documentación de endpoints actualizada

#### Migration
- Script SQL: `add_branch_number_to_pick_and_go_orders.sql`
- Migración automática de datos existentes a primera sucursal activa
