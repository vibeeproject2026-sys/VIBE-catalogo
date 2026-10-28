# VIBE Catálogo — Propuesta de arquitectura de curaduría editorial (Fase 20)

**Estado: propuesta, sin implementar.** Este documento no modifica código, Supabase,
`catalog_metadata` ni ningún dato del POS. Es la base para decidir cómo se cargará
la metadata editorial de los 68 productos en una fase posterior.

Fuente de datos: lectura en vivo, de solo lectura, de la tabla `products` en Supabase
(68 filas: `id`, `name`, `price`, `stock`, `category`), realizada exclusivamente para
este análisis. No se escribió nada.

---

## 1. Objetivo

Definir, antes de cargar una sola fila de `catalog_metadata`, una taxonomía y un
conjunto de criterios editoriales VIBE que:

- resuelvan las inconsistencias ya detectadas en la categorización del POS, sin
  tocar el POS;
- sean coherentes con el ADN de marca (Vibrant Iconic Beauty Essentials: calidad,
  accesibilidad, experiencia, empowerment, glamour, autenticidad, descubrimiento,
  confianza);
- funcionen con los 68 productos reales, no con una taxonomía teórica;
- dejen explícitamente marcado qué no se puede decidir todavía sin inventar datos.

## 2. Principios editoriales

1. El POS sigue siendo la única fuente de verdad para `id`, `name`, `price`,
   `stock`/disponibilidad. La taxonomía editorial vive enteramente en
   `catalog_metadata` (`subcategory` y, en el futuro si hiciera falta, un
   `category_group` editorial) — nunca se reescribe `products.category`.
2. La categoría POS (`products.category`) puede ser incorrecta o demasiado amplia
   (confirmado con casos reales: "Mascarilla Facial", "Crema cuello", "Polvo
   compacto" y "Paleta chocolate" están las cuatro en `category = "Labios"`). La capa
   editorial puede — y en estos casos debe — diferir de la categoría POS.
3. No se inventa nada que no esté respaldado por el nombre del producto o por un
   dato ya disponible. Cuando el nombre no alcanza para clasificar con seguridad,
   el producto queda **PENDIENTE DE VALIDACIÓN**, no se le asigna una subcategoría
   adivinada.
4. Pocas categorías, bien pensadas, priman sobre una taxonomía exhaustiva. No se
   crea una categoría para un solo producto salvo justificación editorial fuerte
   (por ejemplo, "Mascarillas" se mantiene aunque hoy solo tenga 1 producto real
   porque es un tipo de producto claramente distinto dentro de Skincare, y es
   previsible que la línea crezca).
5. La estructura debe navegarse bien en móvil: máximo 3 niveles (Grupo → Categoría
   → Subcategoría), sin subniveles adicionales.

## 3. Taxonomía VIBE propuesta

Se evaluaron `MAQUILLAJE`, `SKINCARE`, `ACCESORIOS` contra los 68 productos reales
y los tres grupos cubren el catálogo completo sin necesidad de un cuarto grupo.

```
GRUPO 1 — MAQUILLAJE
  Categoría: Rostro       → Base y corrector | Polvo y fijador | Iluminador | Rubor
  Categoría: Ojos         → Sombras | Delineado | Pestañas | Cejas | Kits de ojos
  Categoría: Labios       → Labiales | Gloss y oils | Kits de labios

GRUPO 2 — SKINCARE
  Categoría: Limpieza         → Limpiadores | Tónicos
  Categoría: Tratamiento      → Cremas faciales | Contorno de ojos | Cuello y escote
                                 | Pestañas (crecimiento) | Papel matificante
  Categoría: Mascarillas      (sin subcategoría — volumen bajo todavía)
  Categoría: Kits Skincare    (sin subcategoría)

GRUPO 3 — ACCESORIOS
  Categoría: Herramientas de aplicación → Brochas | Esponjas
  Categoría: Complementos de belleza    → Accesorios para el cabello
                                           | Cuidado personal (pendiente de definir)
```

3 grupos, 9 categorías, 23 subcategorías. Ninguna subcategoría tiene un único
producto real hoy salvo donde el propio nombre lo justifica claramente (p. ej.
"Mascarillas" con 1 producto, porque no hay forma honesta de fusionarla con otra
categoría sin perder claridad).

## 4. Tabla completa de los 68 productos

Convención: **Justificación** cita la evidencia del nombre. Donde la categoría VIBE
difiere de la del POS, se marca **[POS≠VIBE]**. Donde no hay evidencia suficiente en
el nombre, Categoría/Subcategoría VIBE dice **PENDIENTE DE VALIDACIÓN**.

| ID | Producto | Cat. POS | Grupo VIBE | Categoría VIBE | Subcategoría VIBE | Justificación |
|----|----------|----------|------------|-----------------|--------------------|----------------|
| 56 | Makeup Brush Set | Otro | ACCESORIOS | Herramientas de aplicación | Brochas | "Brush Set" = set de brochas |
| 57 | Eyeliner Fine | Ojos | MAQUILLAJE | Ojos | Delineado | Nombre explícito |
| 59 | Suprliner | Labios | MAQUILLAJE | Ojos | Delineado | **[POS≠VIBE] PENDIENTE DE VALIDACIÓN** — "liner" sugiere delineador de ojos, pero el nombre por sí solo no confirma si es de ojos o labios; confirmar antes de publicar |
| 60 | VIBE Fruity Blends | Rostro | MAQUILLAJE | Rostro | PENDIENTE DE VALIDACIÓN | Nombre no indica tipo de producto de rostro (¿rubor? ¿iluminador?) |
| 61 | Shimmer Highlight | Rostro | MAQUILLAJE | Rostro | Iluminador | "Highlight" explícito |
| 62 | Iluminador Jelly | Rostro | MAQUILLAJE | Rostro | Iluminador | Nombre explícito |
| 63 | VIBE Glow Drops | Rostro | MAQUILLAJE | Rostro | Iluminador | "Glow Drops" = gotas iluminadoras |
| 64 | Sakura Vibe Kit | Skincare | SKINCARE | Kits Skincare | PENDIENTE DE VALIDACIÓN | Kit temático, contenido exacto no determinable por el nombre |
| 65 | VIBE Lover Lips | Labios | MAQUILLAJE | Labios | Labiales | "Lips" explícito |
| 66 | Cheeks Love Kit | Rostro | MAQUILLAJE | Rostro | Rubor | "Cheeks" = mejillas |
| 67 | Shinny Gloss | Labios | MAQUILLAJE | Labios | Gloss y oils | "Gloss" explícito |
| 68 | Labial MOC | Labios | MAQUILLAJE | Labios | Labiales | "Labial" explícito |
| 69 | VIBE Trio Kiss Collection | Labios | MAQUILLAJE | Labios | Kits de labios | "Trio" + "Kiss" sugiere set de labiales |
| 70 | Lip Oil Hello Fruit | Labios | MAQUILLAJE | Labios | Gloss y oils | "Lip Oil" explícito |
| 72 | VIBE Twinkle Lips | Labios | MAQUILLAJE | Labios | Labiales | "Lips" explícito |
| 73 | Magic Gloss | Labios | MAQUILLAJE | Labios | Gloss y oils | "Gloss" explícito |
| 74 | Vibe Glam Drops | Labios | MAQUILLAJE | Labios | PENDIENTE DE VALIDACIÓN | "Glam Drops" no especifica si es gloss o labial líquido |
| 75 | Paleta Cherry | Ojos | MAQUILLAJE | Ojos | Sombras | "Paleta" en categoría Ojos = paleta de sombras |
| 76 | Pestañina 3D | Ojos | MAQUILLAJE | Ojos | Pestañas | "Pestañina" = máscara de pestañas |
| 77 | Polvos 2 en 1 MOC | Rostro | MAQUILLAJE | Rostro | Polvo y fijador | "Polvos" explícito |
| 78 | VIBE Amour | Rostro | MAQUILLAJE | Rostro | PENDIENTE DE VALIDACIÓN | Nombre no técnico |
| 79 | VIBE Sweet Flush | Rostro | MAQUILLAJE | Rostro | Rubor | "Flush" = rubor |
| 80 | VIBE Iconic Brows | Ojos | MAQUILLAJE | Ojos | Cejas | "Brows" explícito |
| 81 | VIBE Treat Yourself Well | Ojos | MAQUILLAJE | Ojos | PENDIENTE DE VALIDACIÓN | Nombre no técnico |
| 82 | VIBE You are Enough | Ojos | MAQUILLAJE | Ojos | PENDIENTE DE VALIDACIÓN | Nombre no técnico |
| 83 | VIBE Candy Case | Labios | MAQUILLAJE | Labios | Kits de labios | "Case" sugiere estuche/set |
| 84 | Eye Serum | Skincare | SKINCARE | Tratamiento | Contorno de ojos | Nombre explícito |
| 85 | VIBE Fit Skin | Rostro | MAQUILLAJE | Rostro | PENDIENTE DE VALIDACIÓN | "Fit Skin" ambiguo entre base de maquillaje y producto skincare |
| 86 | VIBE Cover Up | Rostro | MAQUILLAJE | Rostro | Base y corrector | "Cover Up" = cobertura |
| 87 | Fijador Super Stay | Rostro | MAQUILLAJE | Rostro | Polvo y fijador | "Fijador" explícito |
| 88 | Iluminador Magic Glow | Rostro | MAQUILLAJE | Rostro | Iluminador | Nombre explícito |
| 89 | Mascarilla Facial | Labios | SKINCARE | Mascarillas | — | **[POS≠VIBE]** "Mascarilla Facial" no es un producto de labios; caso ya señalado |
| 90 | Vibe Soft Bloom | Rostro | MAQUILLAJE | Rostro | PENDIENTE DE VALIDACIÓN | Nombre no técnico |
| 91 | VIBE Oil Papers | Skincare | SKINCARE | Tratamiento | Papel matificante | "Oil Papers" explícito |
| 92 | Kit eyebrow | Ojos | MAQUILLAJE | Ojos | Cejas | "Eyebrow" explícito |
| 93 | VIBE Spicy Kiss | Labios | MAQUILLAJE | Labios | PENDIENTE DE VALIDACIÓN | No se distingue si es labial o gloss |
| 94 | VIBE Stay Course | Ojos | MAQUILLAJE | Ojos | PENDIENTE DE VALIDACIÓN | Nombre no técnico |
| 95 | Tónico Aloe | Skincare | SKINCARE | Limpieza | Tónicos | "Tónico" explícito |
| 96 | Balaca VIBE Spa | Otro | ACCESORIOS | Complementos de belleza | Accesorios para el cabello | "Balaca" = diadema |
| 97 | Crema cuello | Labios | SKINCARE | Tratamiento | Cuello y escote | **[POS≠VIBE]** crema para cuello, no producto de labios; caso ya señalado |
| 98 | Crema Rice Ojos | Skincare | SKINCARE | Tratamiento | Contorno de ojos | Nombre explícito |
| 99 | Crema Retinol Antiarrugas | Skincare | SKINCARE | Tratamiento | Cremas faciales | Nombre explícito |
| 100 | Crema Mango | Skincare | SKINCARE | Tratamiento | Cremas faciales | Nombre indica crema facial genérica |
| 101 | Crema nicotinamida | Skincare | SKINCARE | Tratamiento | Cremas faciales | Ingrediente activo explícito |
| 102 | Escrespador | Otro | PENDIENTE DE VALIDACIÓN | PENDIENTE DE VALIDACIÓN | PENDIENTE DE VALIDACIÓN | Nombre no permite determinar con seguridad el tipo de producto (posible producto capilar) |
| 103 | VIBE Love-Blend Kit | Otro | PENDIENTE DE VALIDACIÓN | PENDIENTE DE VALIDACIÓN | PENDIENTE DE VALIDACIÓN | Nombre del kit no indica contenido (¿maquillaje? ¿skincare?) |
| 104 | Esponja Kiss Lovely | Otro | ACCESORIOS | Herramientas de aplicación | Esponjas | "Esponja" explícito |
| 105 | VIBE Aura Highlighter | Rostro | MAQUILLAJE | Rostro | Iluminador | "Highlighter" explícito |
| 106 | VIBE Perfect Lips Set | Labios | MAQUILLAJE | Labios | Kits de labios | "Set" + "Lips" |
| 107 | Kit viajero arroz | Skincare | SKINCARE | Kits Skincare | — | "Kit viajero" con ingrediente arroz, coincide con Skincare |
| 108 | Labial Sparkling | Labios | MAQUILLAJE | Labios | Labiales | "Labial" explícito |
| 109 | Kit rainbow | Labios | MAQUILLAJE | Labios | PENDIENTE DE VALIDACIÓN | No se determina si el kit es de labiales u otro producto de color |
| 110 | VIBE Lip Duo | Labios | MAQUILLAJE | Labios | Kits de labios | "Lip Duo" explícito |
| 111 | Limpiador Facial Ceramide | Skincare | SKINCARE | Limpieza | Limpiadores | Nombre explícito |
| 112 | Limpiador Facial Perilla | Skincare | SKINCARE | Limpieza | Limpiadores | Nombre explícito |
| 113 | Limpiador baba de caracol | Skincare | SKINCARE | Limpieza | Limpiadores | Nombre explícito |
| 114 | Limpiador acné | Skincare | SKINCARE | Limpieza | Limpiadores | Nombre explícito |
| 115 | Limpiador Honey Face | Skincare | SKINCARE | Limpieza | Limpiadores | Nombre explícito |
| 116 | Serum perfect Lash | Ojos | SKINCARE | Tratamiento | Pestañas (crecimiento) | **[POS≠VIBE] PENDIENTE DE VALIDACIÓN** — "Serum" sugiere tratamiento de crecimiento (Skincare) más que color (Maquillaje), pero no se puede confirmar sin más datos |
| 117 | VIBE Power Lash | Ojos | PENDIENTE DE VALIDACIÓN | PENDIENTE DE VALIDACIÓN | PENDIENTE DE VALIDACIÓN | "Power Lash" podría ser máscara de pestañas o sérum fortalecedor; el nombre no lo distingue |
| 118 | Perfect Eyes Set | Ojos | MAQUILLAJE | Ojos | Kits de ojos | "Set" + "Eyes" |
| 119 | Polvo compacto | Labios | MAQUILLAJE | Rostro | Polvo y fijador | **[POS≠VIBE]** polvo compacto es de rostro, no de labios; caso ya señalado |
| 120 | VIBE Sweet Powder | Rostro | MAQUILLAJE | Rostro | Polvo y fijador | "Powder" explícito |
| 121 | Princess Blush | Rostro | MAQUILLAJE | Rostro | Rubor | "Blush" explícito |
| 122 | Rubor líquido | Rostro | MAQUILLAJE | Rostro | Rubor | Nombre explícito |
| 123 | Kit serums | Skincare | SKINCARE | Kits Skincare | — | Nombre explícito |
| 124 | Sombras pan | Ojos | MAQUILLAJE | Ojos | Sombras | "Sombras" explícito |
| 125 | Paleta chocolate | Labios | MAQUILLAJE | Ojos | Sombras | **[POS≠VIBE]** "paleta chocolate" es lenguaje típico de paleta de sombras en tonos marrones, no de labios; caso ya señalado |

## 5. Casos que requieren validación humana

**Inconsistencias POS→VIBE con resolución razonablemente segura por nombre (5):**
89 (Mascarilla Facial), 97 (Crema cuello), 119 (Polvo compacto), 125 (Paleta
chocolate) — los cuatro casos que la usuaria ya había detectado, confirmados en los
datos reales — y 59 (Suprliner), que además de tener categoría POS distinta, no
tiene evidencia de nombre suficientemente fuerte como para asegurar "Ojos" sin
confirmación humana.

**PENDIENTE DE VALIDACIÓN a nivel de grupo/categoría (no se puede decir ni siquiera
si es maquillaje, skincare o accesorio) — 3 productos:**
- 102 Escrespador
- 103 VIBE Love-Blend Kit
- 117 VIBE Power Lash

**PENDIENTE DE VALIDACIÓN a nivel de subcategoría (el grupo/categoría es razonable,
pero no la subcategoría exacta) — 13 productos:**
59, 60, 64, 74, 78, 81, 82, 85, 90, 93, 94, 109, 116.

**Total pendiente de alguna forma: 16 de 68. Clasificados con seguridad completa: 52
de 68.**

Ningún producto de este segundo o tercer grupo debe recibir una subcategoría
inventada — quedan así hasta que alguien con el producto físico o su ficha completa
los confirme.

## 6. Sistema de badges propuesto (sin asignar todavía)

**A. Badges que se pueden determinar editorialmente (sin datos de ventas), en el
momento de cargar cada producto:**
- **Kit** — cuando el nombre indica explícitamente un set/kit (ej. "VIBE Trio Kiss
  Collection", "Perfect Eyes Set", "Kit serums").
- **Edición especial** — solo si hay evidencia real de que es limitado (no inferible
  del nombre por sí solo en ningún producto actual; requeriría confirmación
  humana caso por caso).

**B. Badges que requieren datos reales de ventas (no inferibles del nombre, no se
deben asignar sin una fuente de datos de ventas del POS):**
- **Bestseller** — no hay acceso a `sales`/`transactions` desde el catálogo (y no
  debería haberlo); asignar esto sin datos sería inventar.
- **Favorito VIBE** — si se define como "lo más vendido", cae en la misma
  restricción que Bestseller. Si se redefine como "elegido editorialmente por el
  equipo" (categoría C), sí es viable.

**C. Badges que requieren decisión manual/editorial explícita del equipo VIBE (no
automatizable ni inferible):**
- **Nuevo** — depende de cuándo se decide que un producto "es nuevo" para la marca,
  no de una fecha en el POS.
- **Recomendado** — criterio subjetivo de curaduría.
- **Favorito VIBE** (en su acepción editorial, no de ventas).

**Nunca automatizado por disponibilidad:** "Agotado" no debería ser un badge en
`catalog_metadata` — ya se deriva de `stock` (dato POS) en tiempo real, tal como ya
hace `admin/admin.js` (`available = stock > 0`). Duplicarlo como badge editorial
violaría el principio de "no duplicar datos operativos".

## 7. Destacados (`featured`) y orden (`editorial_order`)

Propuesta de criterio (sin seleccionar productos todavía):

- `featured` debería reservarse para una selección **pequeña y deliberada**
  (orientativamente 4–8 productos a la vez, pensando en un carrusel o sección
  "Elegidos por VIBE" en el home) — no un checkbox que se active sin límite.
- El criterio de selección debe ser editorial y explicable: variedad entre
  categorías (no todos de Labios), productos con stock real disponible (destacar
  algo agotado rompe la confianza), y preferentemente productos con la ficha
  editorial más completa (imagen + descripción + beneficios), porque un destacado
  sin descripción no cumple el principio central ("como si alguien con buen gusto
  te estuviera mostrando algo").
- `editorial_order` solo tiene sentido **dentro** del subconjunto de `featured` (o
  dentro de una categoría al navegar) — no como un ranking global de los 68
  productos. Se propone dejarlo `null` por defecto y solo asignarlo cuando un
  producto entra a `featured`.

## 8. Estrategia de publicación

Estados propuestos, todos representables con los campos que ya existen en
`catalog_metadata` (no se necesita ninguna columna nueva):

| Estado editorial | Cómo se representa | Cuándo aplica |
|---|---|---|
| Pendiente de curaduría | Fila de `catalog_metadata` inexistente, o existente con `published = false` y campos editoriales vacíos | Producto recién detectado, sin trabajo editorial aún |
| Listo para publicar | `published = false`, con `short_description`, `image` e idealmente `subcategory` ya completos | Contenido cargado, en revisión antes de salir al público |
| Publicado | `published = true` | Visible en el catálogo público (ya es el único campo que controla esto hoy) |
| Agotado / no disponible | No es un estado editorial — se deriva de `products.stock` en tiempo real, con `published` pudiendo seguir en `true` (el producto sigue existiendo en el catálogo, solo se muestra sin stock) | Automático, dato POS |

No se propone ningún campo nuevo de "estado" — reutiliza `published` (ya existente)
más la completitud de los campos editoriales como señal informal de progreso. Esto
respeta que `published` ya pertenece a `catalog_metadata` y no se toca su
significado actual.

## 9. Requisitos de imágenes (sin crear rutas todavía)

Por producto, idealmente:
- **Imagen principal** (obligatoria para publicar) — usada en grilla/listado.
- **Imágenes secundarias** (opcionales, `images[]` ya existe en el esquema) — útiles
  para kits (mostrar contenido del set) y para productos donde el empaque y el
  producto abierto se ven distinto (labiales, sombras).

No se define ninguna ruta ni convención de nombre de archivo todavía porque el
mecanismo de carga (Supabase Storage u otro) no se decidió en Fase 17 y sigue
pendiente — asignar rutas ahora sería inventar ubicaciones de archivos que no
existen.

## 10. Requisitos de contenido editorial

Definición de "completo" para un producto (criterio para pasar de "pendiente" a
"listo para publicar" en la sección 8):

- `short_description` — obligatorio para publicar (es lo que se ve en la grilla).
- `image` — obligatorio para publicar.
- `subcategory` — obligatorio si el producto ya salió de "PENDIENTE DE VALIDACIÓN"
  en este documento; si sigue pendiente, no se publica todavía.
- `description`, `benefits`, `usage`, `ingredients` — deseables pero no bloqueantes
  para publicar; enriquecen la ficha de detalle.
- `brand`, `presentation` — solo si el dato es real y conocido; no inventar marca
  ni presentación (varios nombres del POS no indican marca, y no se debe asumir
  "VIBE" solo porque el nombre del producto empieza con "VIBE" sin confirmarlo).
- `search_keywords` — deseable, ayuda a la búsqueda interna del catálogo.
- `badge` — opcional, según sección 6.

## 11. Recomendaciones para la carga posterior

1. Cargar primero los 52 productos "clasificados con seguridad" — no bloquear todo
   el catálogo por los 16 pendientes.
2. Resolver los 5 casos de inconsistencia POS→VIBE (sección 5, primer grupo) como
   parte de esa primera carga — ya tienen evidencia suficiente en el nombre.
3. Dejar los 16 productos pendientes explícitamente sin `subcategory` (o sin fila
   de `catalog_metadata` en los 3 casos de grupo incierto) hasta que alguien del
   equipo VIBE los revise con el producto físico o la ficha original — no
   improvisar una clasificación solo para completar la tabla.
4. No activar `featured` para ningún producto hasta tener al menos imagen +
   descripción corta cargadas (sección 7).
5. Cargar la metadata producto por producto reutilizando el panel admin ya
   funcional (`/admin`), no por script masivo — dado el volumen (68, no miles) y
   que cada decisión de subcategoría/badge es editorial, no mecánica.

## 12. Preguntas abiertas antes de comenzar la carga

1. Para los 3 productos con grupo incierto (Escrespador, VIBE Love-Blend Kit, VIBE
   Power Lash): ¿alguien tiene acceso a la ficha original del POS o al producto
   físico para resolverlos antes de la carga, o quedan pendientes indefinidamente?
2. ¿"Suprliner" (id 59) es realmente un delineador de ojos, o el nombre es
   coincidencia y sí corresponde a labios como dice el POS?
3. ¿Se confirma el criterio de `featured` (sección 7) tal como se propone, o el
   equipo VIBE ya tiene en mente productos específicos y otro criterio?
4. ¿Quién decide, y con qué evidencia, cuándo un producto recibe el badge "Nuevo" o
   "Recomendado" (categoría C de la sección 6) — un rol específico, o el mismo
   administrador del panel?
5. Imágenes: ¿se define Supabase Storage como mecanismo de carga antes de empezar
   la curaduría, o se sigue pegando rutas externas manualmente como hasta ahora?
6. ¿"Kits Skincare" y "Mascarillas" se mantienen como categorías propias con pocos
   productos, o se prefiere fusionarlas dentro de "Tratamiento" para no fragmentar
   la navegación mientras el catálogo es pequeño?

---

## Resumen numérico

- **Productos analizados:** 68
- **Clasificados con seguridad (grupo + categoría + subcategoría):** 52
- **Pendientes de validación (grupo/categoría o solo subcategoría):** 16
  - Pendientes a nivel de grupo/categoría: 3 (Escrespador, VIBE Love-Blend Kit, VIBE Power Lash)
  - Pendientes solo a nivel de subcategoría: 13
- **Categorías POS detectadas:** 5 — `Otro`, `Ojos`, `Labios`, `Rostro`, `Skincare`
- **Inconsistencias POS→VIBE identificadas:** 5 (ids 59, 89, 97, 119, 125)
- **Taxonomía VIBE propuesta:** 3 grupos (MAQUILLAJE, SKINCARE, ACCESORIOS), 9
  categorías, 23 subcategorías

Ningún archivo de código, ninguna fila de `catalog_metadata` ni ninguna tabla del
POS fue modificada para producir este documento.
