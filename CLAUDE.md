# CLAUDE.md

Guía para trabajar en `erp-logisalud-pedidos` con Claude Code.

## Qué es este repo

Módulo de toma, validación, despacho y documentación electrónica de
pedidos de LOGISALUD. **Repo independiente** de `erp-logisalud` (ERP de
Cuentas por Cobrar) — no asumir código, tablas ni convenciones de ese
repo salvo la identidad visual de marca.

Estado: Fase 1 (base técnica) y Fase 2 (maestros: clientes, zonas,
productos, proveedores, canales, condiciones de pago, configuración
tributaria) completadas. No hay todavía pedidos, motor de
precios/promociones, gestión de stock, integración NubeFact ni cálculo
de retenciones — eso es Fase 3 en adelante. Antes de implementar
cualquiera de esos, leer [docs/business-rules.md](docs/business-rules.md)
y [docs/data-model.md](docs/data-model.md) — hay supuestos de negocio
marcados explícitamente como "pendientes de confirmar con Contabilidad".

## Stack y convenciones

- Next.js 14 (App Router), TypeScript, Tailwind CSS 3.
- Supabase: todas las tablas de este módulo van en el schema `pedidos`
  (nunca `public`) — ver [docs/architecture.md](docs/architecture.md).
  Los clientes de Supabase (`lib/supabase/*`) ya fijan
  `db: { schema: 'pedidos' }`.
- RLS activado en toda tabla nueva desde el `create table`, no como
  paso posterior.
- La service role key solo se usa en `lib/supabase/admin.ts` (importa
  `server-only`) y desde `services/`. Nunca importar ese cliente desde
  un componente `"use client"`.
- Auditoría de acciones de negocio: llamar a `services/audit-log.ts`
  (`logAudit`) explícitamente desde la Server Action / Route Handler
  que hace el cambio. No asumir que existe un trigger genérico — la
  única excepción es `user_roles`, que sí tiene trigger de respaldo.

## Estructura de carpetas

- `app/` — rutas y layouts (App Router).
- `components/` — UI reutilizable, sin lógica de negocio.
- `features/` — módulos de negocio (UI + hooks de una feature).
- `lib/` — utilidades transversales sin efectos de negocio.
- `services/` — lógica de servidor con efectos (datos, integraciones).
- `domain/` — tipos y reglas de dominio puras, sin dependencias de
  Next.js/Supabase.
- `supabase/migrations/` — migraciones SQL numeradas secuencialmente.
- `docs/` — decisiones de arquitectura, seguridad y reglas de negocio.

## Identidad de marca

- Colores: `logisalud.green` (#4BB168), `logisalud.teal` (#4ABCC2) —
  definidos en `tailwind.config.ts`.
- Tipografías: Oswald (`font-heading`) para títulos, Poppins
  (`font-body`, pesos 400-700) para cuerpo — cargadas vía
  `next/font/google` en `app/layout.tsx`.
- Fondo `bg-gray-50`, texto `text-gray-900`.
- Tarjetas: usar las clases utilitarias `.card` (borde gris sutil) y
  `.card-highlight` (borde 2px color de marca) definidas en
  `app/globals.css`. Sin gradientes ni sombras agresivas —
  `hover:shadow-sm` / `hover:shadow-md` como máximo.
- Mobile-first: el usuario principal es el vendedor desde el celular.
  Botones y touch targets grandes (`.btn-primary`/`.btn-secondary`
  usan `min-h-12`).

## Al agregar una migración nueva

Numerar secuencialmente (`0006_...sql`), y si la tabla es sensible
(maneja permisos, dinero, o documentos fiscales), evaluar si necesita
un trigger de auditoría de respaldo además de la llamada a `logAudit()`
desde la capa de servicio — ver la sección de auditoría en
[docs/architecture.md](docs/architecture.md) para el criterio.

## Antes de implementar lógica de negocio de pedidos

No implementar precios, promociones, stock, NubeFact ni retenciones sin
antes revisar [docs/business-rules.md](docs/business-rules.md) — varios
supuestos ahí están marcados explícitamente como no confirmados con
Contabilidad.
