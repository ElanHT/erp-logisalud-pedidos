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

## Qué NO cubre esta fase

Explícitamente fuera de alcance en Fase 1 (ver README y CLAUDE.md):

- Modelos de producto/pedido y su ciclo de estados.
- Motor de precios y promociones.
- Gestión de stock.
- Integración con NubeFact (documentación electrónica).
- Cálculo real de retenciones.
- Integración con Odoo.
