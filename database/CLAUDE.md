# Database — Even

Un solo proyecto Supabase (PostgreSQL) para todos los servicios y portales.

## Estructura de carpetas

```
database/
├── _core/          ENUMs y extensiones activas
├── auth/           Tabla profiles (Supabase Auth)
├── shared/
│   ├── tables/     Tablas base compartidas por todos los servicios
│   ├── menu/       Secciones, ítems, disponibilidad, reseñas
│   ├── payments/   Transacciones, proveedores, métodos de pago
│   ├── orders/     dish_order, carts, cart_items (compartidos por TODOS los servicios)
│   ├── pos-integration/  Tablas de integración con POS (Soft Restaurant, Symphony)
│   └── functions/  Funciones utilitarias, folio, dashboard
├── services/
│   ├── flex-bill/          Pago de cuenta en mesa (split bill)
│   ├── pick-and-go/        Pedidos para llevar
│   ├── tap-order-and-pay/  Ordena y paga desde el celular en mesa
│   ├── room-service/       Pedidos a habitación de hotel
│   └── tap-and-pay/        Paga la cuenta del POS desde el celular
└── portals/
    ├── admin-portal/   Por restaurante (Clerk auth)
    └── main-portal/    Even superadmin global
```

## Servicios (5) — orientados al cliente final

| Servicio        | Tabla principal              | Orden de ítems                    |
| --------------- | ---------------------------- | --------------------------------- |
| Flex Bill       | `table_order` → `user_order` | `dish_order.user_order_id`        |
| Tap Order & Pay | `tap_orders_and_pay`         | `dish_order.tap_order_id`         |
| Pick & Go       | `pick_and_go_orders`         | `dish_order.pick_and_go_order_id` |
| Room Service    | `room_orders`                | `dish_order.room_order_id`        |
| Tap & Pay       | `tap_pay_orders`             | `dish_order.tap_pay_order_id`     |

`dish_order`, `carts` y `cart_items` son compartidos por todos los servicios → `shared/orders/`.

## Portales (2)

**admin-portal** — Acceso por restaurante, autenticación via **Clerk**.

- Tablas: `clients`, `user_admin_portal`, `pending_invitations`
- También contiene: suscripciones, campañas, templates (todo tiene `restaurant_id`)

**main-portal** — Superadmin Even, datos globales sin `restaurant_id`.

- Solo: `plan_configurations`, `waitlist`, `pci_audit_logs`

## Autenticación

| Contexto               | Mecanismo          | Columna RLS                                  |
| ---------------------- | ------------------ | -------------------------------------------- |
| Servicios al cliente   | Supabase Auth      | `auth.uid()`                                 |
| Admin portal           | Clerk (JWT)        | `current_setting('rls.clerk_user_id', true)` |
| Backend (service role) | `service_role` key | bypass RLS                                   |

## Convenciones clave

- **Soft delete**: `clients`, `restaurants`, `branches`, `user_admin_portal` tienen columna `deleted boolean DEFAULT false`. Nunca DELETE directo.
- **Folios**: Numeración diaria por sucursal via `order_daily_sequences`. Función base `generate_daily_folio(branch_id)` con lógica de horario nocturno.
- **Tablas de mesas**: `tables.status` = `available | occupied | maintenance`. Los triggers de tap_orders_and_pay y tap_pay_orders la cambian automáticamente.
- **Comisiones**: `payment_transactions` tiene un trigger `validate_payment_transaction_amounts` que verifica la consistencia matemática de todos los campos antes de insertar.
- **POS**: `pos_integrations` + `pos_order_sync` están en `shared/pos-integration/` porque aplican a todos los servicios, no solo a Tap & Pay.

## Orden de creación (dependencias FK)

1. `_core/` → `auth/` → `portals/admin-portal/tables` (clients)
2. `shared/tables/` — restaurants → branches → tables/rooms/qr_codes
3. `shared/menu/` → `shared/payments/` → `shared/orders/`
4. `shared/pos-integration/`
5. `services/` (cualquier orden, dependen de shared)
6. `portals/admin-portal/` (subscriptions, campaigns, templates)
7. `portals/main-portal/` (plan_configurations, waitlist, pci_audit_logs)
