// Fase 28: las comparaciones de id se normalizan a string en cada lookup
// (sameId), pero lo que se guarda en productId/variantId conserva el tipo
// original de p.id/v.id (compatibilidad con lo ya validado en fases
// anteriores). Los ids reales del POS llegan como número; cualquier id
// leído desde un atributo data-* del DOM siempre es string — sin esta
// normalización en la comparación, sumar/quitar cantidad de un producto
// real (id numérico, ej. producto 56) desde el carrito nunca encontraba
// la fila.
// Fase 29: se agregan brand/originalPrice al guardar (sección 2 — el
// carrito debe poder mostrar marca y precio promocional). originalPrice
// es null salvo que quien llama a addToCart lo pase explícitamente (ver
// js/app.js: solo el PDP lo pasa, y solo cuando hay promoción real
// resuelta server-side) — nunca se calcula ni se infiere aquí.
const KEY="vibe-cart-v1";let items=JSON.parse(localStorage.getItem(KEY)||"[]");const save=()=>localStorage.setItem(KEY,JSON.stringify(items));const sameId=(a,b)=>String(a)===String(b);export const getCart=()=>[...items];export const addToCart=(p,v,q=1)=>{const x=items.find(i=>sameId(i.productId,p.id)&&sameId(i.variantId,v.id));if(x)x.quantity+=q;else items.push({productId:p.id,variantId:v.id,name:p.name,brand:p.brand??null,variantName:v.name,price:v.price,originalPrice:v.originalPrice??null,quantity:q,sku:v.sku,image:p.image});save()};export const changeQuantity=(pid,vid,d)=>{const x=items.find(i=>sameId(i.productId,pid)&&sameId(i.variantId,vid));if(!x)return;x.quantity+=d;if(x.quantity<1)items=items.filter(i=>!(sameId(i.productId,pid)&&sameId(i.variantId,vid)));save()};export const removeFromCart=(pid,vid)=>{items=items.filter(i=>!(sameId(i.productId,pid)&&sameId(i.variantId,vid)));save()};export const clearCart=()=>{items=[];save()};export const getCartCount=()=>items.reduce((n,i)=>n+i.quantity,0);export const getCartTotal=()=>items.reduce((n,i)=>n+i.price*i.quantity,0);