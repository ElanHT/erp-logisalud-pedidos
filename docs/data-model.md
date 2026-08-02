# Modelo de datos — Fase 2 (Maestros)

Este documento describe las tablas creadas en Fase 2: los maestros
sobre los que se apoyará el resto del sistema (pedidos, precios,
stock — fases posteriores). Todo vive en el schema `pedidos` (ver
[architecture.md](architecture.md)).

## Catálogos simples

`sales_channels`, `suppliers`, `zones`, `payment_terms`: mismo patrón
— `id`, `nombre` único, `estado` (`activo`/`inactivo`), lectura abierta
a cualquier usuario autenticado, escritura solo `administrador`.

Seed inicial:
- `sales_channels`: Mayorista, Horizontal, Minicadenas, Tops, Clínicas,
  Subdistribuidores.
- `suppliers`: Diphasac, Biosana, Prades, Dare Nutrition.

## Zonas y asignación de vendedores

- `zones`: catálogo de zonas.
- `zone_assignments`: asignación **normal** (1 zona = 1 vendedor
  titular). Un índice único parcial (`where vigencia_hasta is null`)
  garantiza una sola asignación activa por zona; un trigger
  `BEFORE INSERT` cierra automáticamente la asignación previa al
  insertar una nueva (mismo patrón de versionado que
  `product_tax_profiles`, ver abajo).
- `zone_assignment_participants`: caso **excepcional** de 2+ vendedores
  compartiendo cuota/comisión en una misma zona. Tabla separada, no
  reemplaza a `zone_assignments` — se usa solo cuando existe ese acuerdo
  puntual. Guarda `porcentaje_participacion`, vigencia y
  `usuario_autorizo`. Un trigger valida que la suma de porcentajes
  activos por zona no supere 100%.
- `pedidos.current_user_zone_ids()`: función `security definer` que
  resuelve las zonas del vendedor autenticado combinando ambas tablas
  (titular + participante). Es la base de las políticas RLS de
  `customers`/`customer_addresses`/`customer_contacts` para el rol
  `vendedor`.

## Clientes

- `customers`: incluye el flujo de "cliente nuevo" — un vendedor solo
  puede insertar en `estado = 'PENDIENTE_DE_VALIDACION'`
  (`ruc_o_documento`, `razon_social`, etc.); no tiene policy de
  `UPDATE`, así que no puede editar lo creado ni aprobarlo él mismo.
  Solo `control_pedidos` o `administrador` pueden hacer `UPDATE`
  (incluye aprobar → `ACTIVO` o rechazar → `RECHAZADO`).
- `customer_addresses`, `customer_contacts`: múltiples por cliente,
  visibilidad y escritura heredan la regla del cliente padre (zona para
  vendedor, control_pedidos/admin para aprobación).

Columnas agregadas más allá de lo pedido explícitamente en el PRD:
`solicitado_por`, `validado_por`, `fecha_validacion` — necesarias para
que el flujo de aprobación (quién pidió, quién aprobó, cuándo) sea
rastreable. Ver resumen de supuestos.

## Productos y tratamiento tributario

- `products`: datos del producto. **No** incluye ningún campo de
  tratamiento tributario.
- `product_tax_profiles`: el tratamiento tributario vive acá,
  versionado por `vigente_desde`/`vigente_hasta`. Un índice único
  parcial permite un solo perfil activo por producto; un trigger
  `BEFORE INSERT` cierra el perfil anterior el día antes de que empiece
  el nuevo. **Nunca se borra un registro histórico** — insertar un
  nuevo perfil solo le pone fecha de fin al anterior.
- `tax_configurations`: parámetros tributarios **generales** del
  sistema (ej. tasa de IGV vigente), también versionados por fecha,
  pero **no ligados a un producto**. La diferencia con
  `product_tax_profiles`:
  - `product_tax_profiles` responde "¿este producto está gravado o
    inafecto, y a qué tasa?" — es una decisión por producto.
  - `tax_configurations` responde "¿cuál es la tasa de IGV vigente hoy
    en el Perú?" — es un parámetro del sistema tributario en general,
    independiente de cualquier producto puntual. Un producto `GRAVADO`
    normalmente usa la tasa de `tax_configurations` como su
    `tasa_aplicable`, pero el dato queda copiado en el perfil del
    producto al momento de crearlo (no se resuelve en vivo desde
    `tax_configurations` en cada consulta).

Seed: producto de ejemplo `Dapha 10` (`codigo_interno = 'DAPHA10-EJ'`)
como `INAFECTO`, asociado a Diphasac. Ver supuestos.

## Snapshot histórico (preparación para Fase 4)

Cuando existan `orders`/`order_items` (Fase 4), deben **copiar**, no
referenciar en vivo, los datos de cliente/producto/precio vigentes al
momento del pedido (razón social, dirección, tratamiento tributario,
precio, etc.). Esto es intencional: un cambio posterior en estos
maestros (p.ej. el cliente cambia de zona, o un producto pasa de
`INAFECTO` a `GRAVADO`) **no debe alterar pedidos ya creados**. Los
maestros de esta fase son la fuente de verdad para pedidos *nuevos*;
los pedidos existentes llevan su propia copia congelada de esos datos.

## Auditoría

Todo cambio en `customers` y en `product_tax_profiles` queda en
`pedidos.audit_logs` vía trigger (`pedidos.audit_row_change()`,
generalización de `pedidos.audit_user_roles_change` de Fase 1) — no
depende de que el código de aplicación recuerde llamar a `logAudit()`.
El resto de maestros (canales, proveedores, zonas, condiciones de pago,
`products`) se audita desde la capa de servicio
(`services/catalog.ts`, `services/products.ts`) siguiendo el patrón por
defecto descrito en [architecture.md](architecture.md).

## RLS — resumen por rol

| Tabla | vendedor | control_pedidos | operaciones / aprobador_comercial | administrador |
|---|---|---|---|---|
| sales_channels, suppliers, zones, payment_terms, products, product_tax_profiles, tax_configurations | lectura | lectura | lectura | lectura + escritura |
| zone_assignments, zone_assignment_participants | lectura de las propias | lectura de todas | lectura de todas | lectura + escritura |
| customers, customer_addresses, customer_contacts | lectura scoped a zona; insert solo `PENDIENTE_DE_VALIDACION` | lectura + escritura (aprueba/rechaza) | lectura | lectura + escritura |

## Supuestos tomados por falta de dato exacto en el PRD

Ver también [business-rules.md](business-rules.md).

1. **`customers`**: se agregaron `solicitado_por`, `validado_por`,
   `fecha_validacion` — el PRD no listaba estas columnas, pero el flujo
   de aprobación (punto g) no es implementable de forma auditable sin
   ellas.
2. **Producto de ejemplo "Dapha 10"**: el PRD no especificó proveedor ni
   código interno. Se asumió proveedor `Diphasac` (por ser el primero
   listado) y código `DAPHA10-EJ` como placeholder — **a confirmar**
   antes de usarse como dato real.
3. **`tax_configurations` (IGV)**: se sembró un registro `IGV = 18.00`
   vigente desde `2024-01-01` como fecha de referencia razonable, no
   como fuente oficial confirmada — **a confirmar con Contabilidad**
   (ver business-rules.md, Fase 6).
4. **Pantalla de asignación de zonas** (`zone_assignments`/
   `zone_assignment_participants`): el PRD no pidió explícitamente una
   pantalla para esto en el punto 3 (CRUD administrativo); se dejó el
   modelo y RLS completos, pero la asignación se gestiona por ahora vía
   SQL/dashboard de Supabase hasta que se priorice una pantalla
   dedicada.
5. **Vendedor: sin pantalla propia todavía.** Las capacidades de
   `vendedor` (insertar solicitud de cliente/dirección nueva) están
   implementadas a nivel de RLS, pero la UI para vendedor se construye
   en Fase 4 junto con la app de pedidos — por eso la pantalla de
   validación de `control_pedidos` estará vacía hasta entonces.
