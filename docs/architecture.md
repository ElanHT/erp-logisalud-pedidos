# Arquitectura — erp-logisalud-pedidos

## Alcance de este documento

Este repo es el **módulo de toma, validación, despacho y documentación
electrónica de pedidos** de LOGISALUD. Es un proyecto separado e
independiente del ERP de Cuentas por Cobrar (`erp-logisalud`): repos
distintos, despliegues distintos en Vercel, y — como se explica abajo —
un schema propio dentro de un proyecto Supabase que podría compartirse
con otros sistemas a futuro.

Este documento cubre solo la **Fase 1 (base técnica)**. No describe
modelos de producto, pedido, precios, stock ni integración con NubeFact:
esos llegan en fases posteriores.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS 3** con la identidad visual de marca LOGISALUD
- **Supabase**: Postgres + Auth + RLS
- **Vercel**: hosting y despliegue continuo desde `main`

## Estructura de carpetas

```
app/                  rutas (App Router), layouts, páginas
components/           componentes de UI reutilizables, sin lógica de negocio
features/             módulos de negocio (cada feature agrupa su UI + hooks)
lib/                  utilidades transversales (clientes Supabase, helpers)
services/             lógica de servidor: acceso a datos, integraciones, side effects
domain/               tipos y reglas de dominio puras (sin dependencias de framework)
supabase/migrations/  migraciones SQL versionadas del schema "pedidos"
tests/                pruebas
docs/                 este documento y el resto de la documentación
```

`lib` vs `services`: `lib` son utilidades sin efectos de negocio (p.ej.
el cliente de Supabase); `services` es donde vive la lógica que sí tiene
efectos (escribir un pedido, registrar auditoría, llamar a una API
externa). `domain` no debe importar nada de Next.js/Supabase — son
tipos y funciones puras.

## Decisión: schema Postgres dedicado (`pedidos`)

El proyecto Supabase **ya existe** y podría, a futuro, ser compartido
con otro sistema. Para no asumir nada sobre lo que hay o habrá en ese
proyecto:

- Todas las tablas de este módulo viven en el schema `pedidos`
  (`create schema pedidos`), nunca en `public`.
- Las migraciones de este repo solo crean/alteran objetos dentro de
  `pedidos` (o triggers sobre `auth.users`, que es schema gestionado por
  Supabase Auth y compartido por diseño).
- El cliente de Supabase (`lib/supabase/client.ts`, `server.ts`,
  `admin.ts`) fija `db: { schema: 'pedidos' }`, así que las consultas no
  necesitan prefijar el schema en cada llamada.
- Si en el futuro otro sistema usa el mismo proyecto Supabase con su
  propio schema, este módulo no debería verse afectado ni requerir
  cambios.

## Modelo de autenticación y roles

- Supabase Auth (email/password) gestiona `auth.users`.
- `pedidos.profiles` guarda datos de perfil por usuario; se crea
  automáticamente vía trigger `on_auth_user_created` al registrarse.
- `pedidos.roles` es el catálogo de roles; `pedidos.user_roles` asigna
  roles a usuarios (relación muchos-a-muchos, un usuario puede tener
  más de un rol).
- Roles iniciales: `vendedor`, `control_pedidos`, `aprobador_comercial`,
  `operaciones`, `administrador`. Ver docs/business-rules.md.
- `pedidos.is_admin()` es una función `security definer` que resuelve
  si el usuario autenticado tiene rol `administrador`. Se usa dentro de
  las políticas RLS de `roles` y `user_roles` para evitar el problema
  de que una política sobre `user_roles` necesite consultar
  `user_roles` para saber si el caller es admin (recursión).

## RLS: qué está activo desde el día uno

- `profiles`: cada usuario lee/actualiza solo su propio registro
  (`id = auth.uid()`).
- `roles`: lectura abierta a cualquier usuario autenticado (para
  mostrar nombres de rol en UI); escritura solo `administrador`.
- `user_roles`: cada usuario ve sus propias asignaciones;
  `administrador` ve y gestiona todas.
- `audit_logs`: solo `administrador` puede leer desde el cliente; no
  hay políticas de insert/update/delete para `anon`/`authenticated` (ver
  siguiente sección).

## Decisión: mecanismo de escritura de `audit_logs`

Se evaluaron dos mecanismos:

1. **Trigger genérico** sobre cada tabla de negocio, capturando
   automáticamente cualquier insert/update/delete.
2. **Capa de servicio**: cada acción de negocio (Server Action / Route
   Handler) llama explícitamente a `services/audit-log.ts` para dejar
   constancia.

**Se eligió la capa de servicio como mecanismo principal**, por:

- Las acciones de este módulo (validar pedido, aprobar condiciones
  comerciales, confirmar despacho, emitir documento electrónico) son
  eventos de negocio con nombre propio, no solo "un row cambió". Un
  trigger genérico solo ve el diff de columnas, sin el significado de
  la acción (`accion` en `audit_logs` debe poder ser
  `"pedido.aprobado"`, no `"UPDATE"`).
- Varias acciones futuras (integración con NubeFact, ajustes de stock)
  se ejecutarán con la service role key desde el backend, fuera de una
  sesión de usuario autenticado. Un trigger que dependa de `auth.uid()`
  registraría `actor = null` en esos casos; la capa de servicio puede
  recibir el actor explícitamente (p.ej. el usuario que disparó el job).
- Mantener la lógica de auditoría en un único punto (`logAudit()`)
  permite testearla y evolucionar el formato de `accion`/`entidad` sin
  tocar SQL.

**Excepción, defensa en profundidad:** `pedidos.user_roles` sí tiene un
trigger (`user_roles_audit`) además de lo anterior. Las escaladas de
privilegio son lo bastante sensibles como para no depender de que un
desarrollador recuerde llamar a `logAudit()` si en algún momento se
edita esa tabla directamente (SQL editor, script puntual, migración
manual). El trigger es `security definer` para poder insertar en
`audit_logs` pese a que esa tabla no tiene policy de insert para
`authenticated`.

Cuando en fases posteriores existan tablas de pedidos, la expectativa
es seguir el mismo patrón: capa de servicio como regla, trigger puntual
solo donde la sensibilidad de la tabla lo justifique.

## Despliegue

- Repo y proyecto de Vercel **separados** de `erp-logisalud`.
- Deploy automático configurado desde `main`, sin despliegue a
  producción en esta fase (ver README para el estado exacto del link).
