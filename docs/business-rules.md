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

## Qué NO cubre esta fase

Explícitamente fuera de alcance en Fase 2 (ver README y CLAUDE.md):

- Pedidos, precios y promociones (Fase 3).
- UI de vendedor (solicitud de cliente/dirección nueva, toma de
  pedido) — la Fase 2 solo deja lista la estructura de datos y RLS;
  la interfaz llega en Fase 4 junto con la app de pedidos.
- Pantalla dedicada de asignación de zonas — se gestiona vía
  SQL/dashboard de Supabase por ahora.
- Gestión de stock.
- Integración con NubeFact (documentación electrónica).
- Cálculo real de retenciones.
- Integración con Odoo.
