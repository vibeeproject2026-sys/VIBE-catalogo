-- Fase 39 — tabla de pedidos del checkout real de VIBE.
--
-- Contexto: hasta ahora "checkout" era abrir WhatsApp con un mensaje
-- pre-armado; nada se persistía. Esta tabla es el primer registro real
-- de un pedido dentro de VIBE. No reemplaza ni toca products/categories/
-- sales/catalog_metadata — es completamente aparte.
--
-- Acceso: exclusivamente vía la service-role key desde api/orders/*
-- (serverless, PostgREST). Nunca hay un motivo legítimo para que un
-- navegador lea o escriba esta tabla directamente, así que RLS queda
-- habilitado SIN ninguna policy — deny-by-default total, ni siquiera
-- SELECT para anon/authenticated. La service-role key evita RLS por
-- diseño de Supabase, así que el endpoint sigue funcionando igual.
create table if not exists orders (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  customer_city text not null,
  customer_address text not null,
  customer_notes text,
  -- Snapshot del pedido en el momento de la compra: [{productId,
  -- variantId, name, variantName, brand, sku, quantity, price,
  -- lineSubtotal}, ...]. Precio siempre recalculado server-side contra
  -- el catálogo real, nunca el que mande el cliente (ver api/orders/
  -- create.js) — este snapshot es la prueba de qué se le mostró/cobró
  -- a la clienta, no debe cambiar si el precio del producto cambia después.
  items jsonb not null,
  total numeric not null,
  -- Autorización de contacto EXCLUSIVA para gestionar este pedido —
  -- nunca de marketing/newsletter. El check obliga a que solo se pueda
  -- insertar con consentimiento explícito; no existe un pedido válido
  -- sin él.
  contact_consent boolean not null default false check (contact_consent = true),
  consent_timestamp timestamptz not null default now(),
  -- "recibido" nunca implica "confirmado": ese paso sigue siendo
  -- humano, por WhatsApp. No hay UI de administración de estados en
  -- esta fase — solo la distinción conceptual que pide el brief.
  status text not null default 'received' check (status in ('received', 'confirmed', 'cancelled')),
  -- Reflejan si el intento de envío (email / WhatsApp Business) tuvo
  -- éxito en el momento de creación del pedido. false no es un error:
  -- hoy (sin credenciales de proveedor configuradas) siempre van a ser
  -- false, y el pedido igual queda registrado correctamente.
  email_sent boolean not null default false,
  whatsapp_notified boolean not null default false
);

alter table orders enable row level security;

-- Defensa explícita además de RLS: ningún rol de PostgREST tiene
-- ningún privilegio sobre esta tabla. Nunca se agrega una policy acá.
revoke all on orders from anon, authenticated;
