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
- `sellers`: catálogo real de vendedores del negocio (código de
  representante, nombre, zona), **deliberadamente desacoplado de
  `auth.users`** — `user_id` es nullable porque un vendedor puede
  existir en el catálogo antes de tener cuenta en la app. Se completa
  en Fase 4 cuando el vendedor se registre.
  - **Pendiente:** `zone_assignments.vendedor` es `uuid not null
    references auth.users(id)`, así que no se puede poblar desde
    `sellers` mientras `user_id` sea `NULL` (que es el caso de todo el
    seed inicial). Cuando en Fase 4 se complete `sellers.user_id`, un
    `INSERT ... SELECT zone_id, user_id FROM pedidos.sellers WHERE
    user_id IS NOT NULL` puebla `zone_assignments` trivialmente. Hasta
    entonces, la fuente de verdad de "qué zona tiene cada vendedor" es
    `sellers.zone_id`, no `zone_assignments`.
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
como `INAFECTO`, asociado a Diphasac. Ver supuestos. **Superado por
datos reales**: al importar la lista real de Diphasac, el "Dapha 10"
real llega con su propio código (`DHP106`) como un producto distinto —
el placeholder `DAPHA10-EJ` queda huérfano y se desactiva (ver
importador de listas de precios, abajo).

## Importador de listas de precios (Excel de proveedor)

Sección 8 del PRD. Flujo de 3 pasos: **preview** (parsea el Excel,
valida, no toca la base) → **validación** (se muestra al admin) →
**publicar** (solo tras confirmación explícita, escribe todo en una
transacción). El parser en sí es dominio puro
(`domain/price-list-import.ts`, sin dependencia de Excel ni de
Supabase) — lee el archivo `services/price-lists.ts` con `exceljs`.

### Tablas nuevas

- `price_lists`: una fila por **importación/publicación** de un
  proveedor (no una por canal — el Excel trae los 6 canales en un solo
  archivo). Versionado igual que `product_tax_profiles`: un índice
  único parcial permite solo una lista activa (`fecha_fin is null`) por
  proveedor, y un trigger `BEFORE INSERT` cierra la anterior al
  publicar una nueva. Reimportar el mismo proveedor **nunca sobrescribe**
  — crea una versión nueva. Guarda `archivo_nombre` y
  `archivo_storage_path` (bucket privado `price-lists` en Supabase
  Storage, accedido solo desde el cliente admin server-side — sin
  policies de `storage.objects` porque no hay acceso directo desde el
  navegador) e `importado_por`.
- `price_list_items`: precio por `(product_id, sales_channel_id)`,
  versionado **por sí mismo** (`vigente_desde`/`vigente_hasta`, mismo
  patrón que `product_tax_profiles`) y no solo por pertenecer a una
  `price_lists`. `price_list_id` es **nullable**: una corrección puntual
  de precio (pantalla de detalle de producto, ver más abajo) inserta
  una fila con `price_list_id = null` — no viene de una reimportación,
  pero igual queda versionada como cualquier otra: el trigger cierra
  automáticamente la fila vigente anterior para ese producto+canal.
  Esto se agregó al construir la pantalla de detalle de producto: con
  el diseño original (versionado solo a nivel de `price_lists`), una
  corrección de un solo canal de un solo producto habría forzado a
  cerrar la lista completa del proveedor, afectando a todos los demás
  productos de esa lista sin necesidad.
- `pedidos.publish_price_list(...)`: función `SECURITY INVOKER` (no
  definer) que hace todo el publish —upsert de products, insert
  versionado de product_tax_profiles, insert de price_list_items— en
  una sola transacción de Postgres. Al ser invoker, las políticas RLS
  de administrador de cada tabla se siguen aplicando normalmente; no
  duplica ese chequeo.

### Columnas nuevas en `products` / `product_tax_profiles`

- `products.codigo_bonificacion`: viene del Excel ("CÓDIGO
  BONIFICACIÓN"); se guarda desde ya aunque no se usa todavía
  (promociones/bonificaciones son un paso posterior).
- `products.principio_activo`: "PRINCIPIO ACTIVO" (Diphasac/Biosana) o
  "COMPOSICIÓN" (Prades) — mismo campo conceptual, misma columna.
- `product_tax_profiles.vvf_sin_igv` / `.vvd_sin_igv`: costo de
  referencia del proveedor, no precio de venta.
- `product_tax_profiles.costo_referencial_distribuidora`: columna "PVF
  A DISTRIBUIDORA" del Excel. **Nunca es un price_list_item** — es
  costo de referencia interno, no un precio de venta a ningún canal.
  Vive versionada junto al resto del perfil tributario porque cambia
  con cada reimportación, igual que la tasa.
- `product_tax_profiles.fecha_vigencia_proveedor`: columna "FECHA V."
  del Excel, guardada tal cual la entrega el proveedor. Ver el supuesto
  explícito en [business-rules.md](business-rules.md) — no se asume
  que sea vencimiento de lote físico.

### Mapeo de columnas de canal → `sales_channels`

| Columna Excel | Canal(es) |
|---|---|
| PVF INSTITUCIONES | Clínicas |
| PVF SUBDISTRIB. | Subdistribuidores |
| PVF MINICADENAS | Minicadenas |
| PVF MAYORISTA/TOP | Mayorista **y** Tops (mismo valor, dos `price_list_items`) |
| PVF FARMA | Horizontal |

### Tratamiento tributario al importar

Si VVF e IGV vienen vacíos/"-" → `INAFECTO`, tasa 0. Si tienen valor →
`GRAVADO`, tasa = la vigente en `pedidos.tax_configurations` (no un
número fijo por fila) — reutiliza el parámetro sembrado en Fase 2, el
vendedor nunca elige esto.

### Validación: qué se omite al publicar y qué no

- **Error → se omite esa fila, el resto del archivo se publica
  igual**: fila sin CÓDIGO LOGISALUD; CÓDIGO LOGISALUD duplicado
  dentro del mismo archivo (se excluyen ambas filas del duplicado — no
  se adivina cuál es la correcta); fila con código pero **sin
  descripción de producto** (`MISSING_DESCRIPTION`); código o
  descripción que viene envuelto entre paréntesis, típico de una
  nota/aclaración (`SUSPICIOUS_NOTE`). El admin ve estas filas marcadas
  en el preview antes de confirmar publicar; no hace falta arreglar el
  Excel para poder cargar el resto de un catálogo válido. Se puede
  reimportar más adelante (nueva versión) una vez corregidas.
  - Encontrado con datos reales: el Excel de Biosana traía una fila con
    código `BSA326` pero sin descripción (un SKU sin datos completos) y
    una fila de leyenda ("LEYENDA: VVF= Valor de Venta Farmacia") cuyo
    texto cayó justo en la columna de código — ambas se colaban como
    "productos" con nombre vacío antes de este refuerzo. Ver
    business-rules.md.
- **No se omite** (advertencia, se muestra igual): precio vacío, en
  cero o "-" en una columna de canal → se guarda como "sin precio para
  ese canal", no como error.
- Filas de encabezado de sección (solo texto en la primera columna, el
  resto vacío) se omiten silenciosamente — no son producto ni error.

## Pantalla de detalle de producto y corrección puntual de precio

`/admin/maestros/productos/[id]` muestra, por producto: precios
vigentes por canal, costo de referencia (VVF/VVD/costo referencial
distribuidora), afectación tributaria, y el historial completo de
versiones de precio (agrupado en "vigentes" vs. "histórico", con el
origen de cada fila — "Importación" si tiene `price_list_id`,
"Corrección puntual" si no). También permite editar descripción,
presentación y flags de lote/vencimiento, y hacer una corrección
puntual de precio de un canal específico.

La corrección puntual **no** es el flujo normal (que sigue siendo
reimportar el Excel del proveedor) — la UI lo deja explícito. Técnica
y semánticamente usa el mismo mecanismo de versionado que el
importador: inserta una fila nueva en `price_list_items`, el trigger
cierra la anterior, nunca se sobrescribe ni se borra historial.

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
| price_lists, price_list_items | lectura | lectura | lectura | lectura + escritura (única forma de publicar) |

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
6. **Códigos LOGISALUD duplicados dentro de un mismo archivo se tratan
   como error** (no advertencia) y **se excluyen esas filas de la
   publicación** — no se adivina cuál de las dos vale, y el resto del
   archivo se publica igual. Descubierto con datos reales: el Excel de
   Diphasac traía 3 códigos duplicados (6 filas); bloquear el archivo
   completo por eso habría dejado afuera ~90 productos válidos sin
   necesidad. El admin ve las filas marcadas en el preview y decide si
   corrige el Excel y reimporta después.
7. **"OBS." y "MASTER PACK"** del Excel de proveedor no se guardan —
   no fueron pedidos explícitamente. Si se necesitan más adelante, es
   una columna nueva en `products`, no un rediseño.
8. **`price_lists.fecha_inicio`** siempre es la fecha de publicación
   (hoy), no algo que el admin pueda elegir todavía — mantiene la
   pantalla simple; adelantar/atrasar vigencia manualmente queda para
   cuando se necesite.
