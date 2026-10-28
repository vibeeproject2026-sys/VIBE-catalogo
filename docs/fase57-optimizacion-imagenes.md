# Fase 57 — Optimización de imágenes conservando los originales

Estado al 2026-10-28. Todo lo descrito aquí se hizo **en local**. No se subió nada a Storage, no se cambió ninguna referencia en producción y ningún original se modificó: el sha256 de cada original se comprobó antes y después.

## 1. Inventario

| Grupo | Dónde vive | Formato / tamaño | Uso | Estado |
|---|---|---|---|---|
| Categorías de «Descubre tu VIBE» (5) | Repo `assets/discover/` | WebP 1122×1402 (114–184 KB) + 640×800 (47–83 KB) | Tiles con `srcset`, `sizes`, `width/height`, `loading="lazy"` | Ya optimizadas: sin cambios |
| Logo del sitio (`vibe-logo-light.png`) | Repo `assets/brand/logo/` | PNG 504×207, 24 708 B | Cabecera (142–164 px CSS) y pie (150 px) | **WebP sin pérdida agregado** (17 564 B, −28,9 %, píxeles idénticos) con PNG de respaldo |
| Logo social (`vibe-logo-social.png`) | Repo | PNG 504×207 | `og:image` / `twitter:image` | Se mantiene PNG (los rastreadores sociales no siempre aceptan WebP) |
| Logo de correo (`vibe-logo-email.png`, dos copias) | Repo | PNG | Correos | Se mantiene PNG (los clientes de correo no siempre muestran WebP) |
| Otros logos (dark, pink, white-mono, mark) | Repo | PNG 19–28 KB | Ninguna referencia en el sitio | Sin uso: no se tocan |
| Favicons (4) | Repo | PNG 0,4–5 KB | Pestaña / iOS | Ya mínimos: sin cambios |
| SVG demo (`assets/hero/*.svg`, `assets/products/*.svg`) | Repo | SVG < 1,2 KB | Solo modo demo (`?dataSource=demo`) | Sin cambios |
| **Hero (slides)** | **Storage de producción** (`hero/`) | PNG ~1672×941, 1,4–2,2 MB cada uno | Primera imagen de la portada | Ver §2: procesadas copias locales; falta la versión de producción |
| **Fotos de producto** | **Storage de producción** (`products/{id}/`) | Mayormente PNG (hasta ~1,6 MB) | Tarjetas, ficha, carrito, correos | **Pendiente**: no hay copias locales |

El peso por visita estimado en una fase anterior (~14,7 MB) **no se volvió a medir**: medirlo exige descargar el catálogo y las fotos de producción.

## 2. Resultados medidos

Configuración: script [scripts/images/optimize-images.cjs](../scripts/images/optimize-images.cjs).
- **Fotos:** WebP con pérdida de alta calidad, anchos 640/1024/1672 para el Hero y 480/800/1200 para productos, sin agrandar nunca.
- **Logos:** WebP sin pérdida.
- **Criterio de aceptación:** cada versión se compara con el original reducido al mismo tamaño.
  - **Fotos:** SSIM ≥ 0,985 **y** PSNR ≥ 36 dB.
  - **Logos:** idénticos píxel a píxel.

  Si una versión no llega al umbral ni con calidad 95, el original queda como **excepción**.

### Hero (copias locales del 2026-10-26)

| Original | Peso original | Versiones (ancho: peso, calidad, SSIM, PSNR) | Reducción (versión mayor) |
|---|---|---|---|
| slide1.png 1672×941 | 1 451 260 B | 640w: 33 878 B (q94, 0,9885, 39,6 dB) · 1024w: 70 836 B (q94, 0,9878, 42,0 dB) · 1672w: 108 630 B (q90, 0,9850, 43,2 dB) | **−92,5 %** |
| slide2.png 1672×941 | 1 955 165 B | 640w: 46 442 B (q90, 0,9861, 37,4 dB) · 1024w: 132 328 B (q94, 0,9901, 39,3 dB) · 1672w: 280 542 B (q94, 0,9895, 42,2 dB) | **−85,7 %** |
| slide3.png 1672×941 | 2 168 631 B | **Excepción:** a 640w, SSIM 0,9887 pero PSNR 35,1 dB (grano fino de la foto) | 0 % (se conserva el original) |

Totales Hero:
- **Imágenes:** 3 identificadas, 2 procesadas, 1 excepción.
- **Peso:** 5 575 056 B (5,32 MB) originales → 2 557 803 B (2,44 MB), contando la excepción a peso original.
- **Ahorro:** 3 017 253 B (**2,88 MB**), un **−54,1 %**.
- **Solo las 2 procesadas:** 3,25 MB → 0,37 MB (−88,6 %).

### Logos (originales del repo)

7 de 7 procesados sin pérdida: 167 578 B → 102 870 B (−38,6 %). En el sitio solo se usa `vibe-logo-light`, que pasa de 24 708 B a 17 564 B. Los demás logos no se usan en la web, o deben seguir en PNG.

### Revisión visual

- Recortes ampliados 2× (original | WebP) de las zonas más exigentes:
  - textura de piel;
  - brillo rosa saturado;
  - texto fino;
  - línea diagonal de 1 px.

  No se ven diferencias.
- Captura del Hero con el original frente a la WebP:
  - **Diferencia media por canal:** 1,0/255 a 390 px y 0,35/255 a 1440 px.
  - **Diferencia residual:** a 390 px el marco del Hero mide ≈1 px CSS menos, porque la altura de la versión se redondea a un número entero de píxeles (proporción 0,06 % distinta).

## 3. Cómo usa el sitio las versiones optimizadas (implementado, inactivo)

- Un manifiesto `config/image-variants.json` en el bucket existente asocia cada URL original con sus versiones WebP: `{ "version": 1, "images": { "<URL original>": [{ "url": "<URL .webp>", "width": 640 }, …] } }`.
- `/api/catalog/products` y `/api/hero/slides` agregan un `srcset` **solo** para los originales que figuran en el manifiesto. Para aceptarlo exigen:
  - URLs del propio bucket;
  - `.webp`;
  - anchos válidos.
- **Sin manifiesto (el estado actual), la respuesta es la de siempre** y el sitio sigue usando los originales.
- En el navegador, si una versión WebP no carga, la imagen vuelve sola al original (`data-fallback-src`).
- En el Hero, la imagen visible, el fondo desenfocado y la sonda que mide la proporción usan el mismo `srcset`/`sizes`, así que se descarga un solo archivo.
- La ficha de producto (galería) sigue usando el original. Al cambiar de foto, la galería reemplaza `src`, y un `srcset` lo anularía; adaptarla es un paso aparte.

Pruebas:
- `scripts/test-image-variants-fase57.js`, 14 pruebas en Node.
- Prueba de navegador con Storage simulado, 7 de 7:
  - el WebP se elige según el ancho;
  - hay una sola descarga por slide;
  - la vuelta al original funciona;
  - sin manifiesto solo se piden originales.

## 4. Pasos de producción (requieren autorización)

1. **Obtener los originales de producción:** descargar las fotos de producto y del Hero desde las URL públicas que ya usa el catálogo. Es solo lectura. Para el Hero, comparar el sha256 con las copias locales; si difieren, regenerar desde los originales de producción.
2. **Generar en local:** ejecutar `node scripts/images/optimize-images.cjs --in <originales> --out <salida> --kind product|hero --ref-prefix <ruta>` y revisar `inventory.json` y las excepciones.
3. **Subir las versiones:** subir los `.webp` a una carpeta nueva `optimized/…` del bucket con `x-upsert: false` (nunca sobrescribir) **sin tocar ningún original**.
4. **Verificar:** comprobar que cada URL `.webp` responde 200.
5. **Publicar el manifiesto:** subir `config/image-variants.json`, solo con versiones verificadas. Desde ese momento las API empiezan a entregar `srcset`.
6. **Volver atrás si hace falta:** borrar o vaciar el manifiesto. Las versiones pueden quedarse; los originales nunca se tocaron.

---

## 5. Fase 58 — originales reales de producción (2026-10-28)

**Autorización de la propietaria:** leer los originales de producción y optimizarlos **en local**. No incluye subir archivos, modificar ni borrar originales, cambiar referencias ni escribir en Storage. Nada de eso se hizo.

### 5.1 Obtención (solo lectura)

- **Qué se leyó:** las 22 URL públicas que hoy entrega el catálogo publicado. Son 19 fotos de los 7 productos publicados y 3 slides del Hero. Todas respondieron HTTP 200 y todas son PNG.
- **Cómo:** se ejecutaron los handlers nuevos `GET /api/catalog/products` y `GET /api/hero/slides` en local contra la base real, y luego `GET` a cada URL pública. No hubo bloqueos de permisos.
- **Integridad:** el sha256 de cada original se registró antes y después del proceso, y no cambió.
- **Hero:** las 3 copias locales de Fase 57 son **idénticas byte a byte** (sha256) a los originales actuales de Storage, así que sus resultados de §2 quedan confirmados como definitivos:

  | Copia local de Fase 57 | Original en Storage |
  |---|---|
  | `slide1.png` | `hero/marker-1790390353915/main.png` |
  | `slide2.png` | `hero/hero-muitk6vo-gbbxrm/main.png` |
  | `slide3.png` | `hero/hero-muirbum2-nw5onl/main.png` |

### 5.2 Inventario medido

**Configuración y criterios:**
- Se usó el mismo script y los mismos umbrales de §2 (SSIM ≥ 0,985 y PSNR ≥ 36 dB).
- **Control nuevo de color, por los tonos de maquillaje:** ΔE76 (CIELAB) medio por píxel entre el original reducido y el WebP. Un ΔE cercano a 2 es el umbral habitual de diferencia apenas perceptible.
- El percentil 99 llega a 4–16, concentrado en bordes nítidos; está registrado en `color-fidelity.json`.

| # | Referencia en Storage (`product-images/…`) | Original | Optimizado (versión mayor) | Ahorro | Calidad (peor versión) |
|---|---|---|---|---|---|
| 1 | `products/102/01.png` | PNG 1254×1254, 970 KB | WebP 1200w (+480w, 800w): 41 KB | 0,91 MB (−95,8 %) | Aprobada: SSIM ≥ 0,9923, PSNR ≥ 42,7 dB, ΔE medio ≤ 0,61 |
| 2 | `products/102/main.png` | PNG 1254×1254, 1.583 KB | WebP 1200w (+480w, 800w): 100 KB | 1,45 MB (−93,7 %) | Aprobada: SSIM ≥ 0,9902, PSNR ≥ 37,9 dB, ΔE medio ≤ 1,63 |
| 3 | `products/106/01.png` | PNG 1254×1254, 953 KB | WebP 1200w (+480w, 800w): 30 KB | 0,90 MB (−96,8 %) | Aprobada: SSIM ≥ 0,9929, PSNR ≥ 37,7 dB, ΔE medio ≤ 0,84 |
| 4 | `products/106/02.png` | PNG 1254×1254, 844 KB | WebP 1200w (+480w, 800w): 35 KB | 0,79 MB (−95,9 %) | Aprobada: SSIM ≥ 0,9908, PSNR ≥ 36,2 dB, ΔE medio ≤ 1,09 |
| 5 | `products/106/main.png` | PNG 1254×1254, 1.589 KB | WebP 1200w (+480w, 800w): 86 KB | 1,47 MB (−94,6 %) | Aprobada: SSIM ≥ 0,9873, PSNR ≥ 36,1 dB, ΔE medio ≤ 1,95 |
| 6 | `products/109/01.png` | PNG 1254×1254, 1.169 KB | WebP 1200w (+480w, 800w): 46 KB | 1,10 MB (−96,0 %) | Aprobada: SSIM ≥ 0,9880, PSNR ≥ 37,8 dB, ΔE medio ≤ 1,17 |
| 7 | `products/109/main.png` | PNG 1086×1448, 1.600 KB | WebP 1086w (+480w, 800w): 146 KB | 1,42 MB (−90,9 %) | Aprobada: SSIM ≥ 0,9861, PSNR ≥ 36,3 dB, ΔE medio ≤ 1,99 |
| 8 | `products/110/01.png` | PNG 1086×1448, 1.084 KB | WebP 1086w (+480w, 800w): 31 KB | 1,03 MB (−97,1 %) | Aprobada: SSIM ≥ 0,9870, PSNR ≥ 41,1 dB, ΔE medio ≤ 0,87 |
| 9 | `products/110/02.png` | PNG 1024×1536, 1.072 KB | WebP 1024w (+480w, 800w): 26 KB | 1,02 MB (−97,6 %) | Aprobada: SSIM ≥ 0,9925, PSNR ≥ 40,9 dB, ΔE medio ≤ 0,74 |
| 10 | `products/110/main.png` | PNG 1086×1448, 1.631 KB | WebP 1086w (+480w, 800w): 105 KB | 1,49 MB (−93,6 %) | Aprobada: SSIM ≥ 0,9899, PSNR ≥ 37,3 dB, ΔE medio ≤ 1,74 |
| 11 | `products/120/01.png` | PNG 1122×1402, 1.529 KB | WebP 1122w (+480w, 800w): 68 KB | 1,43 MB (−95,6 %) | Aprobada: SSIM ≥ 0,9859, PSNR ≥ 40,8 dB, ΔE medio ≤ 0,97 |
| 12 | `products/120/02.png` | PNG 1122×1402, 1.463 KB | WebP 1122w (+480w, 800w): 68 KB | 1,36 MB (−95,4 %) | Aprobada: SSIM ≥ 0,9865, PSNR ≥ 39,9 dB, ΔE medio ≤ 1,1 |
| 13 | `products/120/main.png` | PNG 1122×1402, 1.263 KB | WebP 1122w (+480w, 800w): 31 KB | 1,20 MB (−97,5 %) | Aprobada: SSIM ≥ 0,9891, PSNR ≥ 40,8 dB, ΔE medio ≤ 0,84 |
| 14 | `products/122/01.png` | PNG 1024×1536, 1.284 KB | WebP 1024w (+480w, 800w): 32 KB | 1,22 MB (−97,5 %) | Aprobada: SSIM ≥ 0,9869, PSNR ≥ 39,9 dB, ΔE medio ≤ 0,85 |
| 15 | `products/122/02.png` | PNG 1086×1448, 1.132 KB | WebP 1086w (+480w, 800w): 44 KB | 1,06 MB (−96,1 %) | Aprobada: SSIM ≥ 0,9883, PSNR ≥ 38,8 dB, ΔE medio ≤ 0,99 |
| 16 | `products/122/03.png` | PNG 1122×1402, 1.488 KB | WebP 1122w (+480w, 800w): 161 KB | 1,30 MB (−89,2 %) | Aprobada: SSIM ≥ 0,9868, PSNR ≥ 36,1 dB, ΔE medio ≤ 1,35 |
| 17 | `products/122/main.png` | PNG 1086×1448, 1.278 KB | **Excepción** (con pérdida no alcanza PSNR 36 dB). Alternativa sin pérdida: WebP 1086w 936 KB, idéntica píxel a píxel | 0 con pérdida; sin pérdida 0,33 MB (−26,8 %) | Con pérdida rechazada; sin pérdida idéntica |
| 18 | `products/99/01.png` | PNG 1254×1254, 1.035 KB | WebP 1200w (+480w, 800w): 27 KB | 0,98 MB (−97,4 %) | Aprobada: SSIM ≥ 0,9925, PSNR ≥ 39,9 dB, ΔE medio ≤ 1,03 |
| 19 | `products/99/main.png` | PNG 1254×1254, 1.553 KB | WebP 1200w (+480w, 800w): 117 KB | 1,40 MB (−92,4 %) | Aprobada: SSIM ≥ 0,9876, PSNR ≥ 39,2 dB, ΔE medio ≤ 1,09 |
| 20 | `hero/hero-muirbum2-nw5onl/main.png` | PNG 1672×941, 2.118 KB | **Excepción** (con pérdida no alcanza PSNR 36 dB). Alternativa sin pérdida: WebP 1672w 1.506 KB, idéntica píxel a píxel | 0 con pérdida; sin pérdida 0,60 MB (−28,9 %) | Con pérdida rechazada; sin pérdida idéntica |
| 21 | `hero/hero-muitk6vo-gbbxrm/main.png` | PNG 1672×941, 1.909 KB | WebP 1672w (+640w, 1024w): 274 KB | 1,60 MB (−85,7 %) | Aprobada: SSIM ≥ 0,9861, PSNR ≥ 37,4 dB, ΔE medio ≤ 1,85 |
| 22 | `hero/marker-1790390353915/main.png` | PNG 1672×941, 1.417 KB | WebP 1672w (+640w, 1024w): 106 KB | 1,28 MB (−92,5 %) | Aprobada: SSIM ≥ 0,9850, PSNR ≥ 39,6 dB, ΔE medio ≤ 0,96 |

Totales (22 originales): 29,26 MB → 4,86 MB con las excepciones en su original (−83,4 %); 3,92 MB si las 2 excepciones usan su WebP sin pérdida (−86,6 %).


**Peso estimado de imágenes en la portada:** 7 tarjetas y 3 slides del Hero. Es una estimación: el navegador elige el ancho según la pantalla.
- **Hoy:** 15,57 MB.
- **Con las versiones WebP:**
  - mobile: ≈ 3,67 MB (tarjetas a 480w y Hero a 1024w);
  - escritorio: ≈ 4,00 MB (800w y 1672w).
- Ambas cifras cuentan las 2 excepciones a su peso original.

### 5.3 Revisión de calidad

- **Las 20 imágenes aprobadas** pasan los tres controles (SSIM, PSNR y ΔE) en **todas** sus versiones.
- **Recortes 2× de la zona con más diferencia** en las fotos más exigentes, archivo `review-crops.png`:
  - 106 (kit de cejas: rosa saturado y texto fino);
  - 109 (gloss con letras iridiscentes);
  - 122/03 (rubor con textura).

  No se aprecian diferencias de color, textura ni texto.
- **Las 2 excepciones** (`hero/hero-muirbum2-nw5onl` y `products/122/main`) fallan por grano fino, con PSNR de 35,0–35,1 dB.
  - Se conservan los originales.
  - Hay una alternativa **sin pérdida**, idéntica píxel a píxel y comprobada, que ahorra un 27–29 %.
  - Usarla es decisión de la propietaria. No se generó ninguna variante con pérdida por debajo del umbral.

### 5.4 Dónde quedaron los archivos

- **Carpeta:** `Catalogo VIBE/entregables-fase58/imagenes-optimizadas/`, **fuera del repositorio**, para que nada se despliegue por accidente.
- **Contenido:**
  - `hero/` y `product/`: WebP, más `inventory.json` con sha256, tamaños y métricas;
  - `color-fidelity.json`;
  - `review-crops.png`;
  - `originales-descargados.json`: referencia, tipo, peso y sha256 de cada original.
- Los originales descargados quedaron en el directorio temporal de la sesión y no se copiaron al repo.

### 5.5 Pendiente

- **Requiere autorización:** los pasos 3 a 5 de §4, es decir, subir las versiones a `optimized/…`, verificarlas y publicar el manifiesto.
- **Mientras tanto**, el sitio sigue usando los originales: sin manifiesto, las API no entregan `srcset`, como se verificó contra la base real en Fase 58.
- **Galería de la ficha (IMG-06):** sigue pendiente de implementación.
- **No incluidas en este inventario:**
  - las imágenes de productos **no publicados**, que el catálogo no expone y no se buscaron;
  - las de «Descubre tu VIBE» y los logos, que ya estaban optimizados (§1).
