# VIBE Catálogo — Decisiones de curaduría editorial (Fase 20.2)

**Estado: decisiones aprobadas conceptualmente. Nada implementado.** Este documento
cierra las 6 preguntas abiertas de
[`fase20-curaduria-editorial-propuesta.md`](fase20-curaduria-editorial-propuesta.md)
(sección 12) y su desglose en
[Fase 20.1](fase20-curaduria-editorial-propuesta.md). No modifica esa propuesta, no
toca código, Supabase, `catalog_metadata`, ni el POS/VibeBeauty. Sin commit, sin
push.

---

## 1–6. Preguntas, decisiones y justificación

### 1. Productos sin grupo (#102, #103, #117)

**Pregunta original:** "Para los 3 productos con grupo incierto (Escrespador, VIBE
Love-Blend Kit, VIBE Power Lash): ¿alguien tiene acceso a la ficha original del POS
o al producto físico para resolverlos antes de la carga, o quedan pendientes
indefinidamente?"

**Decisión:** Mantenerlos pendientes de clasificación hasta disponer de ficha
original o producto físico. No se les inventa grupo, categoría ni subcategoría.

**Justificación:** Ninguno de los tres nombres (`Escrespador`, `VIBE Love-Blend
Kit`, `VIBE Power Lash`) da evidencia suficiente para ubicarlos en MAQUILLAJE,
SKINCARE o ACCESORIOS sin adivinar. Asignarles un grupo ahora violaría el
principio central del documento original ("no inventar").

**Impacto en la taxonomía:** Ninguno — la taxonomía de 3 grupos / 9 categorías no
cambia por esta decisión, simplemente queda sin usar para estos 3 productos hasta
nuevo aviso.

**Productos que quedan pendientes:** #102 Escrespador, #103 VIBE Love-Blend Kit,
#117 VIBE Power Lash.

---

### 2. Suprliner (#59)

**Pregunta original:** "¿'Suprliner' (id 59) es realmente un delineador de ojos, o
el nombre es coincidencia y sí corresponde a labios como dice el POS?"

**Decisión:** Mantenerlo pendiente de validación. No se asigna definitivamente a
Ojos → Delineado ni se conserva editorialmente como Labios hasta confirmar qué
producto es realmente.

**Justificación:** Es el único de los 5 casos [POS≠VIBE] de la propuesta original
donde el propio documento ya marcaba la resolución como insegura ("PENDIENTE DE
VALIDACIÓN"), a diferencia de los otros 4 (Mascarilla Facial, Crema cuello, Polvo
compacto, Paleta chocolate), que sí se dieron por resueltos. Publicarlo con una
categoría adivinada podría mostrarlo en el lugar equivocado del catálogo público.

**Impacto en la taxonomía:** Ninguno estructural — solo deja sin resolver la fila
de un producto en la tabla del documento original.

**Productos que quedan pendientes:** #59 Suprliner.

---

### 3. Featured

**Pregunta original:** "¿Se confirma el criterio de `featured` (sección 7) tal como
se propone, o el equipo VIBE ya tiene en mente productos específicos y otro
criterio?"

**Decisión:** Aprobado el criterio propuesto:
- entre 4 y 8 productos;
- disponibilidad real (stock > 0);
- ficha editorial completa (imagen + descripción como mínimo);
- variedad entre categorías;
- selección curada por VIBE (no automática, no por ventas);
- **no se asigna `featured` a ningún producto todavía.**

**Justificación:** Coincide exactamente con el criterio ya propuesto en la sección
7 de la propuesta original — se aprueba el criterio, no una selección concreta.

**Impacto en la taxonomía:** Ninguno sobre grupos/categorías/subcategorías —
`featured` es un campo independiente de `catalog_metadata`, no forma parte de la
taxonomía de navegación.

**Productos que quedan pendientes:** Todos — la selección real de productos
`featured` sigue sin hacerse; esta decisión solo aprueba el criterio con el que se
hará después.

---

### 4. Badges

**Pregunta original:** "¿Quién decide, y con qué evidencia, cuándo un producto
recibe el badge 'Nuevo' o 'Recomendado' (categoría C de la sección 6) — un rol
específico, o el mismo administrador del panel?"

**Decisión:**
- **"Nuevo"**: asignación editorial; debe existir evidencia de que el producto fue
  incorporado recientemente; no se inventan fechas.
- **"Recomendado"**: decisión editorial VIBE; no requiere datos de ventas; debe
  responder a una razón concreta de recomendación (no arbitraria).
- **Responsable de ambos:** el administrador/editor del catálogo VIBE (el mismo rol
  que ya usa `/admin`, sin crear un rol nuevo).
- **No se asigna ningún badge todavía.**

**Justificación:** Cierra la ambigüedad de "quién" (el mismo rol admin existente,
sin necesidad de Supabase Auth multiusuario, consistente con la arquitectura de
autenticación de Fase 17) y de "con qué evidencia" (una razón concreta y trazable,
nunca inventada), sin tocar la restricción ya establecida en la propuesta original
de no usar "Bestseller"/"Favorito VIBE" sin datos de ventas reales.

**Impacto en la taxonomía:** Ninguno — los badges son ortogonales a
grupo/categoría/subcategoría.

**Productos que quedan pendientes:** Todos — ningún producto recibe badge en esta
fase.

---

### 5. Imágenes

**Pregunta original:** "Imágenes: ¿se define Supabase Storage como mecanismo de
carga antes de empezar la curaduría, o se sigue pegando rutas externas manualmente
como hasta ahora?"

**Decisión:** Antes de realizar una carga masiva de productos, se implementará
Supabase Storage para administrar las imágenes del catálogo. **Esta decisión no
autoriza todavía la implementación** — queda registrada como decisión aprobada,
pendiente de una fase de implementación explícita y separada.

**Justificación:** Responde la pregunta de mecanismo (Storage, no rutas externas
pegadas a mano) sin adelantar trabajo técnico que no fue pedido en esta fase, que
es de decisión, no de implementación.

**Impacto en la taxonomía:** Ninguno — es un mecanismo de carga de contenido, no
afecta la estructura de navegación.

**Productos que quedan pendientes:** Todos los que necesiten imagen — no se carga
ninguna imagen hasta que Supabase Storage esté implementado en una fase posterior.

---

### 6. Taxonomía Skincare — fusión de Kits Skincare y Mascarillas

**Pregunta original:** "¿'Kits Skincare' y 'Mascarillas' se mantienen como
categorías propias con pocos productos, o se prefiere fusionarlas dentro de
'Tratamiento' para no fragmentar la navegación mientras el catálogo es pequeño?"

**Decisión propuesta y aprobada:** Fusionar `Kits Skincare` y `Mascarillas` dentro
de `SKINCARE → Tratamiento`. Los productos pueden seguir identificándose
comercialmente como kits o mascarillas mediante nombre, descripción o badge cuando
corresponda — no se pierde esa distinción, solo deja de ser una categoría de
navegación separada. **No se modifica ningún producto todavía** — este es un
cambio a la taxonomía conceptual, no una reclasificación ejecutada.

**Justificación:** El propio motivo dado (navegación más limpia mientras el
catálogo es pequeño: solo 1 producto en Mascarillas y 3 en Kits Skincare) es
coherente con el principio 4 de la propuesta original ("no crear categorías para
un solo producto salvo justificación editorial fuerte") — aquí, al revés, se
retira una categoría de un solo producto por falta de esa justificación fuerte.

**Impacto en la taxonomía:** Reduce la propuesta original de 9 a **8 categorías**
(dentro de SKINCARE quedan: Limpieza, Tratamiento, Kits Skincare — ver nota) — ver
detalle exacto abajo.

> Nota de precisión: la decisión dice fusionar *ambas* categorías dentro de
> Tratamiento, lo que elimina "Mascarillas" y "Kits Skincare" como categorías
> propias. Taxonomía SKINCARE resultante: **Limpieza** y **Tratamiento**
> únicamente (2 categorías en vez de 4). Total de categorías VIBE: **7** (3 en
> MAQUILLAJE + 2 en SKINCARE + 2 en ACCESORIOS), no 8 — se corrige aquí el cálculo
> para reflejar fielmente la decisión tal como fue redactada.

**Productos afectados** (cambian de categoría de navegación, no de grupo):
- #89 Mascarilla Facial: `Mascarillas` → `Tratamiento`
- #64 Sakura Vibe Kit, #107 Kit viajero arroz, #123 Kit serums: `Kits Skincare` →
  `Tratamiento`

---

## Taxonomía VIBE aprobada conceptualmente (con la fusión del punto 6)

```
GRUPO 1 — MAQUILLAJE
  Categoría: Rostro   → Base y corrector | Polvo y fijador | Iluminador | Rubor
  Categoría: Ojos     → Sombras | Delineado | Pestañas | Cejas | Kits de ojos
  Categoría: Labios   → Labiales | Gloss y oils | Kits de labios

GRUPO 2 — SKINCARE
  Categoría: Limpieza      → Limpiadores | Tónicos
  Categoría: Tratamiento   → Cremas faciales | Contorno de ojos | Cuello y escote
                              | Pestañas (crecimiento) | Papel matificante
                              | Mascarillas | Kits (fusionados en esta fase)

GRUPO 3 — ACCESORIOS
  Categoría: Herramientas de aplicación → Brochas | Esponjas
  Categoría: Complementos de belleza    → Accesorios para el cabello
                                           | Cuidado personal (pendiente de definir)
```

**3 grupos, 7 categorías.** El resto de la propuesta original (principios,
badges categoría A/B, criterio de `featured`, estados de publicación) queda sin
cambios.

## Decisiones que ya pueden considerarse cerradas

- Criterio de `featured` (punto 3) — aprobado, listo para aplicarse cuando se
  seleccionen productos.
- Responsable y criterio de badges "Nuevo"/"Recomendado" (punto 4) — aprobado.
- Mecanismo de imágenes: Supabase Storage (punto 5) — aprobado como decisión, no
  como implementación.
- Fusión de Mascarillas/Kits Skincare en Tratamiento (punto 6) — aprobado
  conceptualmente; taxonomía queda en 7 categorías.

## Decisiones que deliberadamente quedan pendientes

- Grupo/categoría de #102, #103, #117 (punto 1) — indefinidamente, hasta ficha o
  producto físico.
- Categoría final de #59 Suprliner (punto 2) — indefinidamente, hasta confirmación.
- Selección concreta de productos `featured` — el criterio está aprobado, la
  selección no se ha hecho.
- Asignación real de cualquier badge — el proceso está aprobado, no se asignó
  ninguno.
- Implementación de Supabase Storage — decisión registrada, no autorizada para
  ejecutarse en esta fase.

---

## Resumen numérico

- **Taxonomía VIBE aprobada conceptualmente:** 3 grupos, 7 categorías (tras la
  fusión del punto 6), subcategorías sin cambios respecto a la propuesta original
  salvo la eliminación de "Mascarillas" y "Kits Skincare" como categorías propias.
- **Productos que pueden avanzar a curaduría** (los "clasificados con seguridad"
  de la propuesta original, sin contar los que siguen pendientes por esta fase):
  **50** — los 52 originales menos Suprliner (#59), que ya estaba entre esos 52 y
  ahora queda explícitamente pendiente por el punto 2.
- **Productos pendientes:** **18** — los 16 ya identificados en la propuesta
  original (3 sin grupo + 13 sin subcategoría) más Suprliner (#59), que pasa de
  "clasificado con reserva" a pendiente formal por esta decisión.
- **Lista exacta de pendientes (18):**
  - Sin grupo/categoría: #102 Escrespador, #103 VIBE Love-Blend Kit, #117 VIBE
    Power Lash
  - Sin subcategoría confirmada: #59 Suprliner, #60 VIBE Fruity Blends, #64 Sakura
    Vibe Kit, #74 Vibe Glam Drops, #78 VIBE Amour, #81 VIBE Treat Yourself Well,
    #82 VIBE You are Enough, #85 VIBE Fit Skin, #90 Vibe Soft Bloom, #93 VIBE Spicy
    Kiss, #94 VIBE Stay Course, #109 Kit rainbow, #116 Serum perfect Lash

## Próximo paso técnico recomendado

Ninguno se ejecuta en esta fase. El siguiente paso técnico, cuando se autorice,
sería: implementar la carga de imágenes vía Supabase Storage (punto 5) **antes**
de iniciar la carga masiva de los 50 productos listos, ya que el propio documento
de decisiones establece ese orden — cargar imágenes con rutas manuales ahora para
luego migrarlas a Storage implicaría rehacer trabajo ya hecho.

---

Ningún archivo de código, ninguna fila de `catalog_metadata`, ninguna tabla del POS
ni la propuesta original (`fase20-curaduria-editorial-propuesta.md`) fue
modificada para producir este documento.
