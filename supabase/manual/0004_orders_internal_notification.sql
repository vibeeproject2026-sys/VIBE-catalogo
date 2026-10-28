-- Fase 55 — trazabilidad del aviso interno a VIBE por pedido.
--
-- Contexto: api/orders/create.js intenta, después de guardar el pedido,
-- tres avisos: email al cliente (email_sent), email interno a
-- ORDERS_NOTIFICATION_EMAIL y WhatsApp Business (whatsapp_notified).
-- Hasta ahora el resultado del email interno se descartaba: no había forma
-- de saber qué pedidos llegaron a VIBE sin aviso. Esta migración agrega
-- tres columnas para guardarlo.
--
-- Estrictamente ADITIVA: solo "add column if not exists" sobre orders.
-- No modifica columnas existentes, no hace backfill ni UPDATE, no toca
-- products/categories/sales/catalog_metadata, no cambia RLS ni permisos
-- (la tabla sigue sin ninguna policy y sin privilegios para
-- anon/authenticated, ver 0003_orders.sql).
--
-- Los pedidos anteriores quedan con las tres columnas en NULL = "sin
-- dato": nunca se presentan como notificados sin evidencia.
--
-- Valores:
--   internal_notification_status
--     'accepted'        el proveedor (Resend) ACEPTÓ el envío. No implica
--                       entrega confirmada en el buzón.
--     'failed'          el proveedor rechazó el envío o hubo error de red.
--     'not_configured'  faltan variables de entorno de correo en el
--                       servidor (el pedido se guardó igual).
--     NULL              sin dato (pedidos anteriores a esta fase).
--   internal_notification_at     momento del último intento (incluye los
--                                reintentos manuales desde el Admin).
--   internal_notification_error  código saneado del último fallo
--                                (p. ej. HTTP_403:validation_error);
--                                nunca texto libre ni datos personales.

alter table orders
  add column if not exists internal_notification_status text
    check (internal_notification_status in ('accepted', 'failed', 'not_configured'));

alter table orders
  add column if not exists internal_notification_at timestamptz;

alter table orders
  add column if not exists internal_notification_error text
    check (internal_notification_error is null or char_length(internal_notification_error) <= 80);

-- Que PostgREST vea las columnas nuevas sin esperar a su recarga periódica.
notify pgrst, 'reload schema';
