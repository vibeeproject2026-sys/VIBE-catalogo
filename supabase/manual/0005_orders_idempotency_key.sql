-- Fase 56 — idempotencia de la creación de pedidos.
--
-- Problema: si la conexión se corta DESPUÉS de que el servidor guardó el
-- pedido, el cliente ve un error y puede reintentar, creando un pedido
-- duplicado (y avisos duplicados).
--
-- Solución: el navegador genera una clave única por intento lógico de
-- compra (se conserva en los reintentos de ese mismo intento) y
-- api/orders/create.js la guarda en idempotency_key. Un índice único
-- garantiza que, aun con dos solicitudes simultáneas, solo una fila se
-- registre; la otra recibe el pedido ya existente, sin notificar de nuevo.
--
-- Estrictamente ADITIVA: una columna nullable y un índice único PARCIAL
-- (solo filas con clave). Los pedidos existentes quedan con NULL y no se
-- ven afectados. Sin backfill, sin cambios de RLS ni permisos (la tabla
-- sigue sin policies y sin privilegios para anon/authenticated).
-- El código funciona antes de aplicarla (crea pedidos sin clave) y después.

alter table orders
  add column if not exists idempotency_key text
    check (idempotency_key is null or char_length(idempotency_key) between 16 and 64);

create unique index if not exists orders_idempotency_key_uidx
  on orders (idempotency_key)
  where idempotency_key is not null;

notify pgrst, 'reload schema';
