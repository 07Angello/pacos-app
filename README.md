# Paco's Staff · App del personal

App interna (Ionic 9 + Angular 22 + Capacitor 8 + Font Awesome) para **administradores, encargados
y cocina**. Una sola app; cada rol ve solo sus módulos.

| Rol | Ve |
|---|---|
| Administrador | Inicio · Pedidos · Cocina · Menú · Ajustes (restaurante + empleados) |
| Encargado | Inicio · Pedidos · Cocina · Ajustes (abrir/cerrar pedidos) |
| Chef | Cocina · Ajustes (perfil y alertas) |

## Correr en local

```bash
npm install
npm start               # http://localhost:8100
```

Requiere la base de datos creada y al menos un empleado (ver `../pacos-web/supabase/README.md`):
los usuarios se crean en Supabase → Authentication y el rol se asigna con
`supabase/scripts/create_employee.sql`. No hay registro público de empleados.

Flujo completo: abre la web (`http://localhost:4200`) y la app a la vez. El pedido llega en vivo a
**Pedidos** con sonido → **Aceptar** → aparece en **Cocina** (FIFO) → **Iniciar** → **Marcar listo**
→ **Entregado**; el cliente ve cada cambio en su página de seguimiento.

## Pantallas

- **Inicio**: interruptor "recibiendo pedidos", alerta de pendientes, KPIs del día, actividad.
- **Pedidos**: Nuevos / En cocina / Listos / Cerrados. Aceptar, rechazar con motivo, entregar.
  En tablet horizontal: lista + detalle lado a lado; en teléfono, detalle en modal.
- **Cocina**: teléfono = pestañas por estado; tablet vertical = En espera + Preparando;
  tablet horizontal = kanban de 3 columnas. Orden FIFO por hora de aceptación, alerta de demora,
  notas resaltadas, pantalla siempre encendida.
- **Menú** (admin): editor completo sin programar, con tres pestañas:
  - **Platos**: crear/editar/eliminar platos, foto (se comprime a WebP en el teléfono), precio,
    categoría, disponible, destacado y qué grupos de opciones lleva (arrastrar para ordenar).
  - **Opciones**: biblioteca de grupos reutilizables ("Extras de hamburguesa", "Bebida del combo"…):
    una o varias opciones, obligatorio, mínimo/máximo, precio adicional, opción preseleccionada ⭐ y
    agotada. Un cambio aquí se aplica a todos los platos que usan el grupo.
  - **Categorías**: crear/editar con ícono, ocultar y reordenar.
  Todo se refleja al instante en la web.
- **Ajustes**: perfil, sonido/vibración, modalidades y tarifas (admin), empleados (admin), cerrar sesión.

Siempre visible: indicador **En línea / Sin conexión** y hora de la última sincronización. Al
reconectar, volver al primer plano o recuperar la red, la app recarga todos los pedidos (no depende
de que llegue cada evento).

## Entornos

- `src/environments/environment.ts` → desarrollo · `environment.prod.ts` → producción.
- `supabase.url` (URL base, sin `/rest/v1`) y `supabase.anonKey` (publishable key).

## Android

```bash
npm i @capacitor/android
npx cap add android       # solo la primera vez
npm run cap:sync          # build + copia a android/
npm run cap:android       # abre Android Studio
```

## Estructura

```
src/app/
  core/
    backend/              puerto StaffBackend + adaptador Supabase (Auth + RPC + Realtime)
    order-status.ts       máquina de estados, permisos por rol y orden FIFO (única definición)
    orders.store.ts       pedidos en tiempo real, reconexión, acciones sin "simular" cambios
    auth.service.ts / guards.ts / settings.store.ts / notify.service.ts …
  pages/                  login, shell (tabs por rol), dashboard, orders, kitchen, menu-admin, settings
  shared/                 tarjetas de cocina y de pedido, detalle, chips, indicador de conexión
src/theme/                variables Ionic + estilos de la app
```

## Pendiente (siguientes fases)

- Push en segundo plano con FCM (`@capacitor/push-notifications`, `google-services.json`, Edge Function).
- Guardar la sesión de Supabase en almacenamiento seguro de Capacitor.
- Cancelaciones (requiere política del restaurante) y reportes.

## Pruebas

```bash
npm test     # FIFO, transiciones/roles, utilidades de tiempo
npm run lint
```
