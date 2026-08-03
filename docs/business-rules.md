# Reglas de negocio — erp-logisalud-pedidos

Este documento existe para que las decisiones y supuestos de negocio no
vivan solo en la cabeza de quien las tomó. En Fase 1 no hay lógica de
pedidos todavía; lo de abajo son **supuestos documentados pendientes de
validar**, no reglas ya implementadas.

## Roles del módulo

| Rol | Responsabilidad |
|---|---|
| `vendedor` | Toma el pedido, principalmente desde celular en campo. |
| `control_pedidos` | Valida el pedido antes de la aprobación comercial. |
| `aprobador_comercial` | Aprueba condiciones comerciales (precio, crédito, promoción). |
| `operaciones` | Confirma despacho y asigna la fuente de stock. |
| `administrador` | Gestiona usuarios, roles y configuración del módulo. |

## Supuestos pendientes de validar (Fase 6)

Estos tres puntos están anotados aquí para que no se pierdan entre
fases, y para que cualquier implementación de negocio posterior los
trate como "a confirmar", no como reglas cerradas:

1. **Tratamiento tributario de unidades bonificadas.** El supuesto de
   trabajo por defecto (a confirmar con Contabilidad) es que las
   unidades bonificadas siguen el tratamiento tributario estándar del
   comprobante; no se ha validado con Contabilidad ningún caso especial
   (IGV, valor referencial, etc.). **No implementar lógica tributaria
   de bonificaciones sin esa confirmación.**

2. **Umbral de retención evaluado por comprobante, no por pedido
   total.** El supuesto de trabajo es que la retención se calcula por
   cada comprobante emitido, no sobre la suma de un pedido que genere
   varios comprobantes. Esto afecta directamente el diseño de
   NubeFact/retenciones en fases posteriores y debe confirmarse con
   Contabilidad antes de fijar el cálculo.

3. **Asignación de fuente de stock.** La decisión de qué almacén/lote
   surte un pedido la toma **Operaciones al confirmar el despacho**,
   no el vendedor al momento de tomar el pedido. Esto implica que el
   modelo de datos de pedido debe permitir un estado "pendiente de
   asignación de stock" entre la aprobación comercial y el despacho.

## Fase 2 — Maestros

### Flujo de cliente nuevo

Un vendedor puede solicitar un cliente nuevo; el registro se crea en
`estado = PENDIENTE_DE_VALIDACION` y **no es utilizable en pedidos**
(la app de pedidos, Fase 4, deberá verificar `estado = ACTIVO` antes de
permitir usarlo — ver `domain/customers.ts`). Solo `control_pedidos` o
`administrador` pueden aprobar (→ `ACTIVO`) o rechazar
(→ `RECHAZADO`); el vendedor no puede editar ni autoaprobar su propia
solicitud. Ver [data-model.md](data-model.md) para el detalle de RLS.

### Zonas compartidas (caso excepcional)

El caso normal es 1 zona = 1 vendedor. Cuando 2+ vendedores comparten
cuota/comisión de una zona (excepción, no la regla), se registra en
`zone_assignment_participants` con su porcentaje de participación y
quién autorizó el acuerdo — nunca reemplaza la asignación normal en
`zone_assignments`, es información adicional.

### Tratamiento tributario de productos

Vive versionado en `product_tax_profiles`, nunca como campo simple en
`products` ni como algo que el vendedor pueda elegir al tomar un
pedido. Cambiar el tratamiento tributario de un producto no borra el
registro anterior — queda con `vigente_hasta` puesto, para que pedidos
pasados conserven el tratamiento que tenían al momento de crearse (ver
sección de snapshot histórico en data-model.md).

### Supuestos de Fase 2 pendientes de confirmar

- **Tasa de IGV sembrada (18%, vigente desde 2024-01-01)**: fecha de
  referencia razonable, no una fuente oficial confirmada — a validar
  con Contabilidad junto con los supuestos de Fase 6 de arriba.
- **Proveedor y código del producto de ejemplo "Dapha 10"**: el PRD no
  los especificó; se asumió Diphasac y un código placeholder
  (`DAPHA10-EJ`). No usar como dato de producción sin confirmar.

## Importador de listas de precios (sección 8 del PRD)

Ver [data-model.md](data-model.md) para el detalle técnico completo
(tablas, mapeo de columnas, función de publish). Acá solo las
decisiones de negocio:

- **"PVF A DISTRIBUIDORA" no es un precio de venta a ningún canal.**
  Es costo de referencia interno del proveedor hacia LOGISALUD como
  distribuidora. Guardarlo como `price_list_items` habría sido tratarlo
  como un precio de venta a cliente, que no es — por eso vive en
  `product_tax_profiles.costo_referencial_distribuidora`.

- **"FECHA V." se reinterpreta como vigencia del precio en la lista,
  no vencimiento de lote físico.** Es un supuesto explícito, **a
  confirmar con el proveedor/comercial**: el nombre de la columna en el
  Excel es ambiguo, y el vencimiento de lote real es responsabilidad de
  Operaciones con lotes físicos en Fase 5 — no debe confundirse ni
  mezclarse con esta fecha del maestro de productos.

- **PVF MAYORISTA/TOP alimenta dos canales (Mayorista y Tops) con el
  mismo precio.** Confirmado por el negocio, no una suposición — ambos
  canales comparten tarifa en la lista del proveedor.

- **Códigos LOGISALUD duplicados dentro de un archivo excluyen esas
  filas específicas de la publicación** (no se adivina cuál de las dos
  versiones es la correcta), pero **no bloquean el resto del
  archivo** — un catálogo de 95 productos con 3 códigos duplicados
  publica los 92 restantes. Ver supuesto #6 en data-model.md.

- **El producto de ejemplo "Dapha 10" (`DAPHA10-EJ`) sembrado en Fase 2
  queda obsoleto** en cuanto se importa la lista real de Diphasac (que
  trae su propio "Dapha 10" con código real `DHP106`, un producto
  distinto). Se desactiva el placeholder al hacer la importación real
  para no tener dos "Dapha 10" activos a la vez.

- **2 filas basura se colaron al catálogo real por validación
  insuficiente** (código presente pero sin descripción de producto) —
  ambas en el Excel de Biosana: `BSA326` (SKU sin descripción cargada
  en el Excel del proveedor) y una fila de leyenda ("LEYENDA: VVF=
  Valor de Venta Farmacia") cuyo texto cayó en la columna de código.
  Se borraron del catálogo (`products`, `product_tax_profiles` en
  cascada, `price_list_items` si tenían) y el importador ahora exige
  descripción de producto real, no solo código — ver data-model.md.

## Pantalla de detalle de producto

- **"Sin precio en ningún canal" es una advertencia visible en la
  lista general de productos**, no algo que solo se vea al entrar al
  detalle — para poder detectar huecos de precios de un vistazo sin
  tener que abrir cada producto.
- **La corrección puntual de precio es explícitamente para errores
  puntuales, no el flujo normal.** El flujo normal para actualizar
  precios sigue siendo reimportar el Excel del proveedor en Listas de
  precios — la UI lo deja dicho para no generar confusión sobre cuál
  es el camino correcto.

## Fase 4 — Pedidos

Máquina de estados completa, diagrama y tabla de transiciones en
[workflows.md](workflows.md). Acá solo las decisiones de negocio.

- **Acceso de administrador a "Nuevo pedido".** El rol `administrador`
  puede tomar un pedido igual que un vendedor, pero no está atado a una
  sola zona: al crear el pedido, elige explícitamente a nombre de qué
  vendedor/zona se registra (`resolveOrderSellerId` en
  `domain/orders.ts`). Un vendedor normal nunca ve ese selector — el
  suyo queda fijo a su propio `seller_id` vía RLS
  (`pedidos.current_seller_id()`, 0032).
- **`sellers` sigue desacoplado de `zone_assignments`.** El RLS de
  `orders`/`order_items` se particiona por `seller_id` directo (no por
  zona), porque `zone_assignments.vendedor` nunca se pobló a partir de
  `sellers.user_id` (ver "Pendiente" en data-model.md, sección de
  zonas). El RLS de `customers` no cambió — sigue funcionando por zona,
  tal como se diseñó en Fase 2.
- **Seller "sin vendedor de campo".** Para pedidos de administrador que
  no corresponden a ningún vendedor real, se creó un seller nuevo,
  **"OFICINA LOGISSA (SIN VENDEDOR ASIGNADO)"** (código `SINVEND`, sin
  zona) — deliberadamente con un nombre distinto al vendedor real ya
  existente "OFICINA LOGISSA" (código `CODI01`, zona DISTRIBUIDORAS,
  sembrado en 0021_seed_zonas_vendedores.sql), para no confundir
  reportes de ese canal con pedidos administrativos sin vendedor.
  Confirmado con el usuario el 2026-08-02.
- **Sellers de prueba para aromero@logisalud.com / sgonzales@logisalud.com**
  (`TEST001`/`TEST002`, sin zona). Es solo plumbing para un futuro
  "probar el flujo como vendedor puro" — como ambos ya tienen el rol
  `administrador`, el selector de vendedor les sigue apareciendo siempre
  en "Nuevo pedido" (el rol admin manda sobre la presencia de un seller
  vinculado). Para forzar el flujo estrictamente restringido de
  vendedor harían falta cuentas que SOLO tuvieran el rol `vendedor` —
  no se construyó ninguna feature de "suplantar rol" porque no fue
  pedida.
- **"Cliente nuevo" desde el pedido, agregado tras un bug reportado.**
  La primera versión de Fase 4 dejó la máquina de estados
  `NEW_CUSTOMER_VALIDATION` y las policies de RLS listas para un
  cliente en `PENDIENTE_DE_VALIDACION`, pero **no construyó ninguna
  pantalla/acción que realmente creara ese cliente** — el selector de
  "Nuevo pedido" solo permitía elegir clientes ya `ACTIVO`. Se agregó
  `services/customers.ts::requestNewCustomer()` + un mini-formulario
  "+ Cliente nuevo" en `new-order-form.tsx` que fuerza
  `estado = 'PENDIENTE_DE_VALIDACION'` sin importar el rol de quien lo
  crea (un admin podría insertar con cualquier estado según su propia
  policy de RLS, pero es una *solicitud*, no un alta directa). **Límite
  conocido, no nuevo de este fix:** la policy `customer_addresses_
  insert_vendedor` exige que la zona del cliente esté en
  `current_user_zone_ids()` del vendedor — como `zone_assignments`
  sigue sin poblarse (ver más arriba), un usuario con *solo* el rol
  `vendedor` (sin `administrador`) fallaría al crear la dirección del
  cliente nuevo. Hoy no es un problema práctico porque los únicos
  usuarios reales son administradores (que sí pueden vía
  `customer_addresses_write_control_o_admin`), pero queda anotado para
  cuando se registren vendedores reales.
- **Trigger de `ADMINISTRATIVE_EXCEPTION` (confirmado con el usuario,
  no es un supuesto abierto): la condición de pago elegida en el pedido
  es distinta de `customers.condicion_pago_habitual_id`.** No hay PRD
  accesible en el repo con el texto exacto de esta regla; se infirió de
  que ese campo existe justo para esta comparación y de que el cambio
  de condición de pago post-envío requiere una "approval_request de
  excepción" — y se confirmó explícitamente antes de implementar.
- **Auditoría explícita, no trigger genérico.** A diferencia de
  `customers`/`product_tax_profiles` (que tienen un trigger genérico de
  auditoría, 0017), los cambios de estado de pedido, condición de pago y
  decisiones de aprobación se auditan con llamadas explícitas a
  `logAudit()` desde `services/orders.ts`/`services/approvals.ts` —
  `order_status_history`/`approval_decisions` ya son más informativos
  que un diff jsonb genérico (tienen motivo/decisión estructurados), y
  duplicar ambos mecanismos sería redundante.
- **Recalculado de precios, nunca confiar en el navegador.** El precio
  de cada línea se recalcula una única vez, en `pedidos.submit_order()`
  (`SECURITY DEFINER`), que busca el precio vigente por sí misma en
  `price_list_items`/`product_tax_profiles` — nunca acepta un precio
  como parámetro, ni siquiera de un caller que sea código de servidor
  de confianza. Esto es intencional: una función que aceptara el precio
  ya calculado sería vulnerable a alguien que llame el RPC de Supabase
  directamente (sin pasar por la app) con un precio falso.
- **Límite conocido de los tests de dominio (6 y 7 del usuario).** Los
  tests de `resolveOrderSellerFilter` y "manipulación de precio" en
  `tests/domain/orders.test.ts` son un **proxy** de la garantía real,
  que vive en las policies RLS de `0033_orders_core.sql` y en que
  `pedidos.submit_order()` no acepta precios como parámetro — no hay
  infraestructura de Postgres local (pgTAP, Supabase local) en este
  repo para testear las policies en sí. TODO post-Fase-4: evaluar esa
  infraestructura si el equipo la necesita.
- **NO implementado en esta fase** (TODOs explícitos, ver también
  workflows.md): stock (ninguna reserva antes de despacho), promociones/
  bonificaciones/escalas de precio, GRE, factura/boleta real
  (NubeFact), despacho real. `READY_FOR_OPERATIONS` es el punto exacto
  donde cada uno de estos debería engancharse — ver workflows.md.

## Qué NO cubre esta fase

Explícitamente fuera de alcance por ahora (ver README y CLAUDE.md):

- Promociones, bonificaciones y escalas de precio — se implementan en
  un paso posterior, cuando exista esa información de Biosana y
  Prades. `products.codigo_bonificacion` ya se guarda desde ahora para
  no perder el dato mientras tanto.
- Pantalla dedicada de asignación de zonas — se gestiona vía
  SQL/dashboard de Supabase por ahora.
- Gestión de stock.
- Integración con NubeFact (documentación electrónica).
- Cálculo real de retenciones.
- Integración con Odoo.
