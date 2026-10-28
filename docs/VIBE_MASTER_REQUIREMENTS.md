# VIBE — Registro maestro de requisitos (acumulativo)

**Qué es:** el registro permanente de lo que pidió la propietaria, en qué estado está **comprobado** y con qué evidencia. Cada solicitud nueva se agrega aquí. Una decisión anterior solo se reemplaza si la propietaria lo ordena expresamente; si ocurre, la entrada vieja queda tachada con la fecha.

**Última actualización:** 2026-10-28 (Fase 58, cierre). Base: rama `main`, commit `c60bef6`, con cambios locales **sin commit ni despliegue**.

> **Importante para leer los estados:** «VERIFICADO» significa comprobado **en este repositorio local**, con pruebas automáticas y capturas de un navegador real sobre APIs simuladas. **Nada de las Fases 55–58 está en producción**: el sitio público sigue en `c60bef6`, que coincide con `origin/main` y con el último despliegue de Production de `vercel[bot]`. Hasta que se despliegue, la propietaria verá en www.vibebeautycol.com el comportamiento anterior. La clasificación final de Fase 58, con las cinco categorías pedidas, está en la §12.

**Estados:**
- PENDIENTE
- EN IMPLEMENTACIÓN
- IMPLEMENTADO, NO VERIFICADO
- VERIFICADO
- BLOQUEADO POR DEPENDENCIA O DECISIÓN

Un informe anterior o la existencia de código **no** bastan para marcar algo VERIFICADO.

**Fuentes recuperadas:**
- los documentos `docs/fase*.md`;
- el historial de commits (Fases 41–54);
- las instrucciones de las sesiones Fase 53–57;
- la memoria del proyecto (la curaduría editorial es deliberada);
- el documento de marca «ADN de marca VIBE v1.1», entregado por la propietaria. Ese documento no está en el repo.

Si algo no se pudo recuperar, figura como **información faltante**; no se completó por criterio propio.

---

## 0. Restricciones permanentes

| ID | Instrucción | Estado | Evidencia |
|---|---|---|---|
| PROD-01 | Sin commit, push, despliegue ni migraciones sin autorización expresa de la fase. La instrucción explícita de cada fase prevalece sobre la autonomía general de «enviar tras validar». | VERIFICADO (Fase 57) | `git log -1` = `c60bef6`; ninguna migración ejecutada |
| PROD-02 | Nada de escrituras en la base de datos ni en el Storage de producción, y ningún correo o WhatsApp real en pruebas. | VERIFICADO (Fase 57) | Todas las pruebas usan `fetch` y `page.route` simulados; los correos se interceptan en los mocks |
| PROD-03 | No usar `git reset --hard`, `git clean` ni restauraciones masivas; no borrar archivos sin seguimiento. | VERIFICADO | Los archivos sin seguimiento previos siguen presentes (`git status`) |
| PROD-04 | No mostrar secretos, tokens ni datos personales en informes o registros; no pedirlos por chat. | VERIFICADO | El log de WhatsApp solo guarda `e.name`; las pruebas usan claves ficticias |
| PROD-05 | No eliminar ni debilitar pruebas para que la suite pase. | VERIFICADO | Se adaptaron pruebas por cambios de contrato deliberados (tonos y presentaciones, aviso de opciones) sin quitar casos |
| PROD-06 | Una prueba simulada no es evidencia de funcionamiento real; un test unitario de CSS no reemplaza la verificación visual. | Regla de trabajo | Las verificaciones visuales se hacen con capturas de Chromium |
| PROD-07 | Límite de funciones de Vercel Hobby (12): no agregar archivos de función. | VERIFICADO (Fase 58) | Siguen 11 (lo nuevo va en `api/_lib`) |
| PROD-08 | Fase 58: el despliegue del código está autorizado, pero **no** el commit ni el push. Si el mecanismo de despliegue los exige, hay que detenerse y pedir autorización. | VERIFICADO (Fase 58) | Ver «Detalle de PROD-08» debajo de esta tabla |
| PROD-09 | Fase 58: lectura de los originales de producción permitida **solo** para optimizarlos en local. Sin subidas, sin sobrescribir, sin cambiar referencias. | VERIFICADO (Fase 58) | 22 GET públicos; sha256 de los originales sin cambios; ninguna escritura (ver `fase57-optimizacion-imagenes.md` §5) |

**Detalle de PROD-08:**
- **Mecanismo de despliegue:** los despliegues de Production los crea `vercel[bot]` a partir de los commits en `main` (API de GitHub Deployments: `c60bef6`, `639e027` y `ff9ba38`, todos Production).
- **No hay ruta alternativa autorizada:** no hay CLI de Vercel instalado.
- **Por qué no se usó un despliegue por CLI desde el árbol local:**
  - dejaría producción fuera de `main`, y el siguiente push lo revertiría sin aviso;
  - requeriría instalar y autenticar una herramienta nueva.
- **Conclusión:** el despliegue queda **detenido antes del commit**.

## 1. Integridad comercial (POS) y contenido editorial

| ID | Instrucción | Estado | Evidencia / prueba |
|---|---|---|---|
| POS-01 | El POS es la fuente de verdad de precio, stock, disponibilidad y promociones; no se modifica ni su repo ni sus datos. | VERIFICADO | `test-variants-fase57.mjs`: crear pedidos nunca escribe en `products` ni en `catalog_metadata` |
| POS-02 | No inventar precios, existencias, variantes, imágenes ni información. | VERIFICADO | Opciones solo desde la ficha; sin precio ni stock por opción |
| ED-01 | No crear ni publicar fichas automáticamente. Lo no publicado o sin ficha es una decisión editorial, no una tarea pendiente. | Regla vigente | Memoria del proyecto; ningún cambio de datos en Fase 57 |
| ED-02 | Clasificaciones protegidas: #99 Tratamiento›Cremas faciales; #109 y #110 Labios›Kits de labios; #102 Herramientas de aplicación›Rizadores de pestañas; #106 Labios›Kits de labios (decisión de la propietaria); #122 Rostro›Rubor. | VERIFICADO (sin escrituras) | Fase 57 no escribe datos |
| ED-03 | #56 (posible discrepancia entre imagen y texto), #59 y #103 (estado de ficha), #119 (clasificación). | BLOQUEADO POR DECISIÓN | Pendiente de la propietaria (§11) |

## 2. Identidad visual y marca

| ID | Instrucción | Estado | Evidencia |
|---|---|---|---|
| BR-01 | Estética VIBE: negro y rosa (`--pink #FF007A`), «elegante y sensual sin ser vulgar», premium por la experiencia. | Referencia vigente | ADN de marca v1.1; `css/styles.css :root` |
| BR-02 | Logo oficial en todas las piezas; sin logos ni imágenes inventadas. | VERIFICADO | El logo del sitio pasa a WebP sin pérdida, con píxeles idénticos (Fase 57) |
| BR-03 | Guía completa de construcción del logo y colores. | **Información faltante en el repo** | El documento de marca no está versionado en el repo |

## 3. Catálogo: encabezado, tarjetas y promociones

| ID | Instrucción | Estado | Evidencia / prueba |
|---|---|---|---|
| CAT-01 | En **móvil** ocultar solo «Explora por categoría y encuentra tu próximo esencial.»; conservar «Catálogo.», «BEAUTY FOR YOUR VIBE.» y «Esenciales de belleza seleccionados para elevar tu ritual.»; escritorio sin cambios. | VERIFICADO (local, Fase 58) | Ver «Detalle de CAT-01» debajo de esta tabla |
| CAT-01b | **Decisión de la propietaria (Fase 58):** la frase se **conserva** en «Descubre tu VIBE», también en móvil, y se oculta **solo** en «Catálogo» y solo en móvil. Nada de selectores globales. | VERIFICADO (local) | Regla `@media(max-width:640px){.catalog-lead-intro{display:none}}`; `test-storefront-fase56.mjs` exige que ninguna regla oculte `.discover-lead`; `catalog58.js` a 360/390/820/1440 (ver detalle) |
| CAT-02 | Tarjetas de una misma fila uniformes: imagen, marca, nombre, opciones, precio y «+ AGREGAR» a la misma altura, sin recortes ni alturas fijas. | VERIFICADO (local) | Ver «Detalle de CAT-02» debajo de esta tabla |
| CAT-03 | Sin promociones duplicadas: una sola sección `#ofertas`. | VERIFICADO (local) | `test-fase47-markup.js`; medición del navegador: `ofertasGrid` es la única grilla de promos |
| CAT-04 | Si la API falla, no mostrar productos, precios ni stock ficticios: estado «no disponible» con botón Reintentar. | VERIFICADO (local) | `store56b.js` 25/25; `test-data-source.mjs` |
| CAT-05 | Sin la categoría «Otra». | VERIFICADO | `test-taxonomy-admin.js` (nombres prohibidos) |
| CAT-06 | Hero móvil sin franja, flechas que no tapan texto y jerarquía (Fases 50–54). | VERIFICADO en su fase; Fase 57 no cambia el diseño | `test-hero-mobile-frame.js`; captura del Hero con original y con WebP |

**Detalle de CAT-01:**
- **Causa raíz (Fase 57):** la frase también existe en el encabezado de «Descubre tu VIBE», justo encima del Catálogo, y Fase 56 solo había cubierto `#catalogSubtitle`. Además, nada de Fase 56 está desplegado.
- ~~**Cambios:** `.discover-lead` y `.catalog-lead-intro` ocultas en `≤640px`.~~ *(Reemplazado el 2026-10-28 en Fase 58 por decisión expresa de la propietaria, CAT-01b: `.discover-lead` vuelve a verse en móvil.)*
- **Cambio vigente (Fase 58):** solo `.catalog-lead-intro` se oculta en `≤640px`.
- **Pruebas de Fase 57:** `catalog57.js`, `test-storefront-fase56.mjs` y las capturas `after-head-*.png`.
- **Pruebas de Fase 58:** `catalog58.js` en Chromium, con API simulada.

  | Ancho | «Descubre tu VIBE» | «Catálogo» | Textos conservados | Desborde horizontal | Errores de consola |
  |---|---|---|---|---|---|
  | 360 | visible | **oculta** | sí | no | 0 |
  | 390 | visible | **oculta** | sí | no | 0 |
  | 820 | visible | visible | sí | no | 0 |
  | 1440 | visible | visible | sí | no | 0 |

  «Textos conservados» = «Catálogo», «Beauty for your VIBE.» y «Esenciales…». Las capturas son `after58-head-{360,390,820,1440}.png`.

**Detalle de CAT-02:**
- **Causa raíz:** la columna flex de Fase 56 solo alineaba el botón. La marca (presente o ausente), los nombres de 1 a 5 líneas y el precio que salta de línea («Agotado» o un descuento a 360 px) seguían corriéndose.
- **Cambio estructural:** cada tarjeta ocupa 6 filas compartidas (CSS `subgrid`), con ranuras fijas que miden 0 si están vacías. La columna flex queda como respaldo para navegadores sin `subgrid`.
- **Prueba:** `catalog57.js` mide la dispersión de imagen, nombre, precio, botón y altura de cada fila real: **0 px** a 360, 390, 820 y 1440 (antes llegaba a 21 px en nombres y 14 px en precios). Hay capturas antes y después.
- **Fase 58, nueva medición:** `catalog58.js` con 12 productos de prueba.
  - **Casos incluidos:**
    - nombres de 1 a 5 líneas;
    - promociones y agotados;
    - una promoción agotada;
    - productos sin marca y con marca larga;
    - tonos, presentaciones o ambos, y una sola opción;
    - un producto sin imagen.
  - **Resultado:** dispersión **0 px** en todas las filas de `#productGrid` y `#ofertasGrid`, a 360, 390, 820 y 1440, sin recortes ni desborde horizontal.

## 4. Variantes: tonos y presentaciones (independientes)

| ID | Instrucción | Estado | Evidencia / prueba |
|---|---|---|---|
| VAR-01 | Dos dimensiones independientes, tonos (nombre, color, activo, orden) y presentaciones (etiqueta real, activa, orden). Cada producto puede no tener ninguna, tener una de las dos o tener ambas. | VERIFICADO (local) | `js/variants.js`, `api/_lib/variants.js`, `editorialDetails.presentations`; `test-variants-fase57.mjs` (30/30) |
| VAR-02 | La propietaria configura cada dimensión desde el Admin (crear, editar, ordenar, activar, desactivar, quitar con confirmación) sin que una obligue a la otra. | VERIFICADO (local) | `admin57.js` (11/11), también a 390 px |
| VAR-03 | Con varias opciones activas, la clienta elige; con una sola, se muestra sin selector y se aplica sola; sin la dimensión, no hay selector. Nada se preselecciona cuando hay que elegir. | VERIFICADO (local) | `store57.js` (21/21) |
| VAR-04 | Conservar las presentaciones reales (no «Único»); sin presentaciones configuradas, el pedido toma el campo «Presentación» de la ficha. | VERIFICADO (local) | Corrige Fase 56; `test-orders-create-guards.js` y `test-variants-fase57.mjs` |
| VAR-05 | Las opciones inactivas no se pueden elegir; los estados son accesibles (radiogroup, `aria-checked`, `aria-disabled`, flechas solo entre activas, foco visible). | VERIFICADO (local) | `store57.js` |
| VAR-06 | Carrito: combinaciones distintas en líneas separadas; la misma combinación se agrupa; la selección se conserva al cambiar cantidades, en el carrito y en el checkout. | VERIFICADO (local) | `store57.js`; `test-variants-fase57.mjs` |
| VAR-07 | El servidor valida cada opción (existe, pertenece a ese producto, está activa, es obligatoria si la dimensión existe) y toma nombres e ids de la ficha, nunca del navegador. | VERIFICADO (local) | `test-variants-fase57.mjs` (ids manipulados, de otro producto, inactivos) |
| VAR-08 | Si una opción cambia después de agregarla, se avisa y se exige corregir antes de enviar. | VERIFICADO (local) | `store57.js` |
| VAR-09 | Precio y stock vienen del producto base del POS; activar una opción no crea inventario. | VERIFICADO (local) | `test-variants-fase57.mjs` (promo, agotado, cambio de precio) |
| VAR-10 | Pedidos históricos sin variantes se siguen mostrando igual; ningún pedido existente se altera. | VERIFICADO (local) | `test-variants-fase57.mjs`; `email.js` sin cambios de regla |
| VAR-11 | Qué productos tienen tonos o presentaciones, con sus nombres y colores reales. | BLOQUEADO POR DECISIÓN | La propietaria lo carga desde el Admin, producto por producto (confirmado en Fase 58). No se cargó ni inventó ninguna variante |
| VAR-12 | Fase 58: comprobar que el modelo está integrado de verdad y que convive con los datos reales. | VERIFICADO (local + lectura real) | Ver «Detalle de VAR-12» debajo de esta tabla |

**Detalle de VAR-12:**
- **En navegador** (API simulada):
  - `store57.js`: 21/21 en dos corridas seguidas. Una corrida anterior agotó el tiempo de espera del propio script al reabrir la ficha mientras se animaba el carrito; es intermitente y del arnés, no del sitio.
  - `admin57.js`: 16/16.
- **En Node:** `test-variants-fase57.mjs`, 30/30.
- **Contra la base real** (solo lectura, con el código nuevo): 7 productos publicados, 0 con tonos o presentaciones. Los productos y los pedidos históricos siguen sin variantes.
- **Dónde se guardan las variantes:** en el JSON de `catalog_metadata.additional_info`, una columna que ya existe. **No requieren migración.**

## 5. Imágenes

| ID | Instrucción | Estado | Evidencia / prueba |
|---|---|---|---|
| IMG-01 | Quitar una imagen de una ficha sin borrar el archivo; borrar físicamente solo si se pide de forma expresa, el archivo es exclusivo y nada más lo usa. | VERIFICADO (local) | `test-admin-images-handlers.js`, `admin56.js` |
| IMG-02 | No sobrescribir originales: nombres únicos versionados y `upsert:false`. | VERIFICADO (local) | `test-admin-images-lib.js` |
| IMG-03 | Optimizar todas las imágenes pertinentes sin pérdida perceptible y conservar los originales. | **Parcial** | Ver «Detalle de IMG-03» debajo de esta tabla |
| IMG-04 | No apuntar a versiones optimizadas que no existen; respaldo al original. | VERIFICADO (local) | Ver «Detalle de IMG-04» debajo de esta tabla |
| IMG-05 | Medición real del peso por visita (≈14,7 MB estimados antes). | VERIFICADO (Fase 58, medido en local) | Imágenes de la portada: **15,57 MB hoy** → ≈3,67 MB en mobile y ≈4,00 MB en escritorio con WebP. Se hará efectivo cuando se suban las versiones (pendiente de autorización) |
| IMG-07 | Fase 58: leer los originales de producción y optimizarlos en local, sin subir nada, con inventario y revisión de calidad. | VERIFICADO (local) | Ver «Detalle de IMG-07» debajo de esta tabla |
| IMG-08 | Fase 58: comparar las copias del Hero de informes anteriores con los originales reales de Storage. | VERIFICADO | Las 3 son idénticas por sha256 (`fase57-optimizacion-imagenes.md` §5.1) |
| IMG-09 | Subir las versiones optimizadas y el manifiesto a producción. | BLOQUEADO POR AUTORIZACIÓN | Explícitamente no autorizado en Fase 58 |

**Detalle de IMG-07:**
- **Leídas:** 22 de 22, sin bloqueos.
- **Aprobadas:** 20, todas con SSIM ≥ 0,985, PSNR ≥ 36 dB y ΔE medio ≤ 2,0.
- **Excepciones:** 2, con alternativa sin pérdida idéntica píxel a píxel.
- **Peso:** 29,26 MB → 4,86 MB (−83,4 %), o 3,92 MB (−86,6 %) si se usa la alternativa sin pérdida.
- **Inventario por imagen:** `fase57-optimizacion-imagenes.md` §5.2.
| IMG-06 | Galería de la ficha con versiones optimizadas. | PENDIENTE | Hoy usa el original; requiere adaptar el cambio de foto |

**Detalle de IMG-03:**
- **Logos:** WebP sin pérdida, verificado.
- **Hero:** copias locales procesadas, con −54,1 % (2,88 MB) y 1 excepción. En Fase 58 se confirmó que son idénticas a los originales de Storage.
- ~~**Fotos de producto:** pendientes; están en Storage de producción.~~ *(Fase 58: 19 fotos procesadas en local, 18 aprobadas y 1 excepción, −89,9 %.)*
- **Estado de IMG-03 en Fase 58:** generación local completa. Falta la subida a producción (IMG-09) y la galería de la ficha (IMG-06).
- **Detalle completo:** [fase57-optimizacion-imagenes.md](fase57-optimizacion-imagenes.md).

**Detalle de IMG-04:**
- Manifiesto `config/image-variants.json`, **inexistente hoy**: sin él, el sitio responde igual que antes.
- `test-image-variants-fase57.js` (14 pruebas).
- `img57.js` en el navegador (7 de 7).

## 6. Categorías y subcategorías

| ID | Instrucción | Estado | Evidencia / prueba |
|---|---|---|---|
| TAX-01 | Crear, renombrar, mover y eliminar categorías y subcategorías desde el Admin, con vista de impacto y destino explícito si están en uso; nunca reasignar por similitud. | VERIFICADO (local) | `test-taxonomy-admin.js`, `tax54.js`, `admin56.js` |
| TAX-02 | Duplicados detectados sin distinguir mayúsculas, acentos ni espacios; «Otra» prohibida. | VERIFICADO (local) | `test-taxonomy-admin.js` |
| TAX-03 | Protección ante ediciones simultáneas (revisión: 409 o 503) y recuperación de errores. | VERIFICADO (local, simulado) | `test-taxonomy-admin.js`; la consistencia real de Storage no está verificada |
| TAX-04 | **Ordenar** categorías (dentro de su grupo) y subcategorías (dentro de su categoría); faltaba según la auditoría de Fase 57 §5.2. | VERIFICADO (local) | Acciones `reorderCategory` y `reorderSubcategory` (sin tocar productos); `test-taxonomy-admin.js` (+3) y `admin57.js` (↑/↓ por categoría; «Cambiar su posición» por subcategoría; 390 px) |
| TAX-05 | Conservar publicación y contenido editorial al renombrar o mover (solo cambia la categoría o subcategoría). | VERIFICADO (local) | `test-taxonomy-admin.js` |

## 7. Carrito, precios, checkout y pedidos

| ID | Instrucción | Estado | Evidencia / prueba |
|---|---|---|---|
| ORD-01 | Precios del carrito actualizados desde el catálogo vigente, con aviso del cambio a la clienta. | VERIFICADO (local) | `store56b.js`, `test-variants-fase57.mjs` |
| ORD-02 | El servidor valida precios, cantidades, opciones, publicación y total esperado (409 `PRICE_CHANGED` sin borrar el formulario). | VERIFICADO (local) | `test-orders-create-guards.js`, `store56b.js` |
| ORD-03 | Idempotencia: el mismo intento no duplica el pedido ni las notificaciones, incluso con solicitudes simultáneas. Funciona antes y después de 0005. | VERIFICADO (local, con 0005 simulada) | Ver «Detalle de ORD-03» debajo de esta tabla |

**Detalle de ORD-03:**
- **Prueba:** `test-orders-create-guards.js`.
- **Precisión de Fase 58:** «funciona antes de 0005» significa que **no falla**, no que proteja. Sin 0005, la idempotencia de servidor está inactiva (ver DEP-01). Producción no tiene 0005.
| ORD-04 | Antispam: campo trampa, límite por IP (por instancia) y por teléfono (3 en 10 min). | VERIFICADO (local) | `test-orders-create-guards.js`; límite por instancia documentado |

## 8. Notificaciones internas

| ID | Instrucción | Estado | Evidencia / prueba |
|---|---|---|---|
| NOT-01 | Estado persistido del aviso interno, reintento manual, sin reenvíos concurrentes (reclamo atómico) y errores sin datos personales. | VERIFICADO (local, con 0004 simulada) | Ver «Detalle de NOT-01» debajo de esta tabla |

**Detalle de NOT-01:**
- **Pruebas:** `test-orders-internal-notification.js` y `notif55.js` (13/13 en Fase 58).
- **Precisión de Fase 58:** depende de la migración 0004. Sin ella:
  - el aviso se envía igual con cada pedido nuevo;
  - el estado no se guarda;
  - el reintento manual responde «migración pendiente» sin enviar nada.
| NOT-02 | Separar «aceptado por Resend» de «entregado». | VERIFICADO (local) | Textos y estados del Admin |
| NOT-03 | Entrega real y respeto de `Idempotency-Key` por Resend. | IMPLEMENTADO, NO VERIFICADO | Requiere una cuenta real; no se enviaron correos |
| NOT-04 | `ORDERS_NOTIFICATION_EMAIL` y dominio verificado en Resend. | BLOQUEADO POR VERIFICACIÓN EXTERNA | Paneles de Vercel y Resend |

## 9. SEO, seguridad y accesibilidad

| ID | Instrucción | Estado | Evidencia / prueba |
|---|---|---|---|
| SEO-01 | Canonical (portada y ficha), Open Graph y Twitter, `robots.txt` y `/sitemap.xml` (solo publicados, dominio oficial). | VERIFICADO (local) | `test-storefront-fase56.mjs`, `test-image-variants-fase57.js` (sitemap) |
| SEO-02 | `noindex` en `*.vercel.app` y `/admin`; cabeceras de seguridad (`vercel.json`). | IMPLEMENTADO, NO VERIFICADO | Comprobable con `curl -I` tras desplegar |
| SEO-03 | Imagen para compartir de 1200×630 (hoy el logo de 504×207). | BLOQUEADO POR DECISIÓN (propuesta entregada en Fase 58) | Ver «Detalle de SEO-03» debajo de esta tabla |

**Detalle de SEO-03:**
- **Propuestas:**
  - **A, tipográfica:** logo oficial sin ampliar, «Tu ritual. Tu VIBE.», «Beauty for your VIBE» y el dominio.
  - **B, fotográfica:** lo mismo, más un recorte de la foto del Hero ya publicada.
- **Archivos:** `Catalogo VIBE/entregables-fase58/imagen-compartir/`, fuera del repo, en PNG y JPG, con `vista-previa.html`.
- **Pendiente:** no está publicada y `og:image` no se cambió.
| SEC-01 | API con validación de entrada y Admin con token; errores sin secretos. | VERIFICADO (local) | Suites del Admin y de pedidos |
| SEC-02 | CSP. | PENDIENTE | No agregada |
| A11Y-01 | Teclado, foco visible y nombres accesibles (−/+, opciones, diálogos). | VERIFICADO (local) | `store57.js`, `store56b.js` |

## 10. Pruebas y criterios de aceptación

- **Suite del repo:** `node scripts/test-*.js|mjs` (todo simulado, sin red).
- **Verificación visual:** Chromium (playwright-core) contra un servidor estático local, sin `PROXY_ORIGIN`, a 360, 390, 820 y 1440, con capturas.
- **Una corrección visual** solo se acepta con medición en el navegador **y** revisión de capturas.
- **Resultados de Fase 58** (2026-10-28, árbol local final):
  - **Suite del repo:** 45 scripts, **951 aprobadas, 0 fallidas**, 0 salidas con error, y `node --check` limpio en todos los archivos cambiados. Una corrida intermedia tuvo 1 fallo, en la prueba nueva de Fase 58, porque su expresión regular coincidía con un comentario del CSS; se ajustó y se comprobó que sigue detectando la regla anterior.
  - **Navegador, API simulada:**
    - `catalog58.js`: 4/4 anchos;
    - `store57.js`: 21/21 (ver VAR-12 por el arnés intermitente);
    - `store56b.js`: 25/25;
    - `admin57.js`: 16/16;
    - `img57.js`: 7/7;
    - `notif55.js`: 13/13;
    - `tax54.js`: 12/12.
  - **Contra la base real, solo lectura y con el código nuevo:**
    - `products`: 200, con 7 productos;
    - `sitemap`: 200, con 8 URL del dominio oficial;
    - `categories` y `taxonomy`: 200;
    - `hero/slides`: 200, con 3 slides.

## 10b. Preparación del despliegue (Fase 58)

| ID | Instrucción | Estado | Evidencia |
|---|---|---|---|
| DEP-01 | Compatibilidad del código con el esquema actual de producción **sin** ejecutar las migraciones 0004 y 0005. | VERIFICADO (lectura real + pruebas) | Ver «Detalle de DEP-01» debajo de esta tabla |
| DEP-02 | Variables de entorno necesarias, sin revelar secretos. | VERIFICADO en código; los valores de Vercel no se pueden ver desde aquí | Ver «Detalle de DEP-02» debajo de esta tabla |
| DEP-03 | Desplegar el código. | **NO DESPLEGADO**: detenido antes del commit | PROD-08 |
| DEP-04 | Verificación posterior al despliegue (portada, frase, tarjetas, imágenes, ficha, carrito, checkout sin pedidos, metadatos, `noindex`, consola). | PENDIENTE (depende de DEP-03) | Nada que verificar en el sitio publicado mientras siga en `c60bef6` |

**Detalle de DEP-01:**
- **Columnas de producción:** se consultó la descripción OpenAPI de PostgREST (solo nombres de columna, sin filas). `orders` no tiene `idempotency_key` ni `internal_notification_*`, porque 0004 y 0005 no están aplicadas. `catalog_metadata` sí tiene `category` y `additional_info` (0002).
- **Respuesta real ante columnas inexistentes:** las consultas `limit=0` sobre esas columnas devuelven **HTTP 400 `42703`**, justo el código que manejan las rutas de respaldo:
  - `findOrderByIdempotencyKey` → `migrationPending`, y el pedido se crea sin clave;
  - el listado del Admin se muestra sin las columnas de aviso;
  - el reclamo y el reintento → `migrationPending`.
- **Escrituras:** `PGRST204` está cubierto por `insertOrder` (reintento sin la clave) y por `markOrderNotifications` (reintento sin las columnas de aviso), con pruebas simuladas en `test-orders-create-guards.js` y `test-orders-internal-notification.js`. Ese código en escritura **no se pudo comprobar contra la base real**, porque haría falta escribir.
- **Columnas seleccionadas:** todas las demás que usa el código existen en producción.

**Detalle de DEP-02:**
- **Sin variables nuevas:** el código nuevo usa exactamente las mismas variables que `c60bef6`, que ya está en producción.
- **Las de notificación son opcionales:** `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `ORDERS_NOTIFICATION_EMAIL` y `WHATSAPP_*`. Si faltan, el resultado es `*_NOT_CONFIGURED` y el pedido no falla.

**Qué hace cada función mientras 0004 y 0005 no estén aplicadas:**

| Función | Comportamiento sin migración |
|---|---|
| Crear pedidos | Funciona |
| Antispam (campo trampa, IP, teléfono) | Funciona: usa columnas existentes |
| Validar precio y total | Funciona |
| Idempotencia | **Inactiva en el servidor** hasta aplicar 0005. Sin la columna, la clave no se guarda ni se consulta: un reintento del mismo intento (por ejemplo, tras un corte de conexión) puede crear un segundo pedido. |

**Protección contra pedidos duplicados mientras 0005 siga pendiente:**
- el botón de envío se bloquea mientras se envía (`submitBtn.disabled`);
- el límite de 3 pedidos por teléfono en 10 minutos;
- el campo trampa.

Es la misma situación que hoy en `c60bef6`, que tampoco tiene idempotencia de servidor. **No es una regresión.** ORD-03 queda en «implementado; activo al aplicar 0005».
| Estado del aviso interno y reintento manual | No disponible hasta 0004. El Admin lo indica y no falla. |

## 11. Decisiones e información pendientes de la propietaria

1. ~~Autorizar el despliegue de las Fases 55–57 y las migraciones 0004 y 0005.~~ *(Fase 58: el despliegue del código está autorizado, pero se detuvo porque exige un **commit y un push a `main`**, que no se autorizaron. Las migraciones 0004 y 0005 siguen **sin autorizar**.)*
   - **Pendiente:** autorizar de forma expresa el commit y el push del árbol local actual. Ver la lista de archivos en la §12.
   - **Pendiente:** autorizar las migraciones 0004 y 0005, por separado.
2. ~~Autorizar la lectura de los originales de producción~~ *(autorizada y hecha en Fase 58)*. Sigue pendiente autorizar la subida de las versiones WebP y del manifiesto (IMG-09), y decidir si las 2 excepciones usan su WebP sin pérdida.
3. Productos con tonos o presentaciones, con nombres, colores y etiquetas reales (VAR-11).
4. #56, #59, #103 y #119 (ED-03).
5. Imagen para compartir de 1200×630 (SEO-03). Elegir A, B o ninguna. Para B, confirmar que la foto del Hero también puede usarse al compartir enlaces.
6. **Información legal y comercial.** No se inventa nada; requiere revisión jurídica:
   - razón social o nombre, NIT o cédula, dirección y canal de atención;
   - política de tratamiento de datos (Ley 1581 de 2012);
   - zonas, tarifas y tiempos de envío;
   - medios de pago;
   - cambios, devoluciones, retracto y garantía (Ley 1480 de 2011).
7. ~~Confirmar si la frase de «Descubre tu VIBE» también debe ocultarse en móvil.~~ *(Resuelto el 2026-10-28: la propietaria decidió conservarla. Ver CAT-01b.)*

## 12. Clasificación final (Fase 58)

Las cinco categorías que pidió la propietaria. «Verificado» significa verificado **en local** o con **lectura real**; nada de esto está desplegado (DEP-03).

### COMPLETADO Y VERIFICADO

**Restricciones de producción**
- PROD-01 a PROD-09.

**POS y contenido editorial**
- POS-01 y POS-02.
- ED-02: sin escrituras.

**Catálogo**
- CAT-01 y CAT-01b: frase en «Catálogo» oculta solo en móvil y conservada en «Descubre tu VIBE».
- CAT-02: alineación de las tarjetas.
- CAT-03, CAT-04 y CAT-05.

**Variantes**
- VAR-01 a VAR-10 y VAR-12.

**Imágenes**
- IMG-01 y IMG-02.
- IMG-04: respaldo, sin manifiesto.
- IMG-05: medición.
- IMG-07: optimización local.
- IMG-08: copias del Hero.

**Categorías y subcategorías**
- TAX-01, TAX-02, TAX-04 y TAX-05.

**Pedidos y avisos**
- ORD-01, ORD-02 y ORD-04.
- NOT-02.

**SEO, seguridad y accesibilidad**
- SEO-01.
- SEC-01.
- A11Y-01.

**Despliegue**
- DEP-01: compatibilidad con el esquema actual.
- DEP-02: variables, en el código.

### IMPLEMENTADO, PENDIENTE DE VALIDACIÓN EXTERNA

- **CAT-06 en producción:** se ve tras el despliegue.
- **TAX-03:** consistencia real de Storage ante ediciones simultáneas.
- **NOT-03 y NOT-04:** entrega real de correos, `Idempotency-Key` de Resend, `ORDERS_NOTIFICATION_EMAIL` y dominio verificado.
- **SEO-02 y SEC-03:** se comprueban con `curl -I` y por URL en el dominio publicado.
  - `noindex` en `*.vercel.app` y en `/admin`;
  - cabeceras de seguridad;
  - `robots.txt` y `sitemap.xml`, que hoy dan 404 en producción porque no están desplegados;
  - vista previa al compartir;
  - `.vercelignore`.
- **DEP-04:** toda la verificación posterior al despliegue.

### PENDIENTE DE DECISIÓN DE LA PROPIETARIA

- **VAR-11:** tonos y presentaciones reales, por producto, desde el Admin.
- **ED-03:** #56, #59, #103 y #119.
- **SEO-03:** imagen 1200×630, A o B.
- **Excepciones de IMG-07:** usar o no su WebP sin pérdida.
- **BR-03:** guía de marca en el repo, que es información faltante.
- **Información legal y comercial:** §11, punto 6.

### PENDIENTE DE AUTORIZACIÓN

- **DEP-03:** commit y push a `main`, que es el mecanismo de despliegue.
- **Migración 0004:** activa NOT-01 en producción.
- **Migración 0005:** activa ORD-03 en producción.
- **IMG-09:** subir los WebP y el manifiesto.
- **Envío real de correos o WhatsApp de prueba.**

### PENDIENTE DE IMPLEMENTACIÓN

- **IMG-06:** galería de la ficha con versiones optimizadas.
- **SEC-02:** CSP.

**Por lo tanto, el proyecto NO está completo:** faltan el despliegue, dos migraciones, la subida de imágenes y varias decisiones de la propietaria.

### Alcance exacto del commit pendiente de autorización

Son **66 rutas**: los 38 archivos modificados más los 28 sin seguimiento (27 que lista `git status` y `.vercelignore`, nuevo en Fase 58).
- **Excluido:** `.env.local`, que es secreto y está ignorado por `.gitignore`.
- **Con `.vercelignore`, no se publican como archivos estáticos:** `docs/`, `scripts/`, `supabase/` y `README.md`.

| ID | Instrucción | Estado | Evidencia |
|---|---|---|---|
| SEC-03 | Fase 58: no publicar como archivos estáticos la documentación interna, las pruebas ni las migraciones. Hoy `/docs/fase17-admin.md`, `/supabase/migrations/0003_orders.sql` y `/scripts/test-cart.mjs` responden **200** en www.vibebeautycol.com. | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN EXTERNA | `.vercelignore` (ningún código de ejecución usa esas carpetas, verificado con `grep`). Tras desplegar, esas URL deben dar 404 |

## 13. Control final de seguridad antes del commit y push (2026-10-28)

**Autorización vigente:** desplegar el código. **No** están autorizados el commit ni el push (requieren confirmación expresa de cada uno), las migraciones, las escrituras en producción ni la subida de imágenes. En este control no se hizo commit ni push, ni se ejecutó o escribió nada en producción. Solo hubo lecturas (`GET`).

| ID | Comprobación | Estado | Evidencia |
|---|---|---|---|
| SEC-04 | Secretos y datos privados fuera del commit. | VERIFICADO | Ver «Detalle de SEC-04» debajo de esta tabla |
| SEC-03 | Archivos internos no descargables (actualiza la entrada de la §12). | IMPLEMENTADO, PENDIENTE DE VALIDACIÓN EXTERNA | Ver «Detalle de SEC-03 (Fase 58, control final)» debajo de esta tabla |
| SEC-05 | Endurecer `pathFromUrl` (hallazgo de este control). | CORREGIDO Y VERIFICADO (local) | Ver «Detalle de SEC-05» debajo de esta tabla |
| SEC-06 | Revisión del diff: autenticación del Admin, inyección de HTML y colores de tono. | VERIFICADO, sin hallazgos | Ver «Detalle de SEC-06» debajo de esta tabla |
| DEP-05 | Que las migraciones 0004 y 0005 **no** se ejecuten. | VERIFICADO en el repo; NO VERIFICABLE fuera de él → mitigado | Ver «Detalle de DEP-05» debajo de esta tabla |
| DEP-06 | Ninguna referencia a imágenes optimizadas que no existen. | VERIFICADO | Ver «Detalle de DEP-06» debajo de esta tabla |
| DEP-07 | La imagen para compartir no se publica ni se usa en metadatos. | VERIFICADO | Ver «Detalle de DEP-07» debajo de esta tabla |
| DEP-08 | Pruebas. | VERIFICADO | Ver «Detalle de DEP-08» debajo de esta tabla |

**Detalle de SEC-04:**
- **Valores secretos:** se compararon los valores reales de `.env.local`, sin imprimirlos, con los 66 archivos y con todo el historial `git log -p --all`. Cero coincidencias.
- **Patrones de credenciales:** cero coincidencias de JWT, `re_…`, `sk_…`, `sb?_…`, tokens de Meta, claves privadas y URL del proyecto.
- **Ignorados por git:** solo `.env.local` y `.vercel/`.
- **Datos de contacto:** los únicos correos y teléfonos reales son los de contacto público de la tienda, ya publicados en `c60bef6`. Los de las pruebas son ficticios.
- **Binarios:** el único binario nuevo es `vibe-logo-light.webp`, el logo sin pérdida ya aprobado. Las capturas, las imágenes optimizadas y los entregables están **fuera del repo**.

**Detalle de SEC-03 (Fase 58, control final):**
- **Hallazgo en producción, hoy:** `/docs/*.md`, `/supabase/migrations/*.sql` y `/scripts/*` responden **200**.
- **Lo que no se publica:** `/.env*`, `/.git/*`, `/.vercel/*`, `/vercel.json` y los fuentes `api/**/_lib` responden 404, y `/api/*.js` ejecuta la función, sin mostrar el código.
- **Dos capas:**
  - **`.vercelignore`:** no sube `docs/`, `scripts/`, `supabase/` ni `README.md`. Solo **excluye archivos de la subida**, no protege rutas.
  - **`vercel.json` › `redirects`:** `/docs/*`, `/scripts/*` y `/supabase/*` → `/` (307). Las redirecciones se evalúan **antes** que los archivos, así que bloquean la ruta aunque un archivo llegara a subirse. No se puede responder 404 porque `routes` no se combina con `headers` ni con `rewrites`.
- **Ruta legítima afectada:** ninguna (prueba nueva en `test-storefront-fase56.mjs`).
- **Validación tras desplegar:** esas URL deben dar 307 hacia `/` o 404.

**Detalle de SEC-05:**
- **Antes:** una URL registrada por un admin, como `…/products/5/../../hero/…/main.png`, pasaba el control de prefijo de `deleteFileIfExclusive` y el de «en uso», que compara cadenas exactas. Así podía borrar físicamente un original protegido. Exigía el token del Admin, no era explotable desde fuera.
- **Ahora:** se rechazan los segmentos `.` y `..` (también codificados), `\`, los segmentos vacíos y los caracteres de control. Todos los llamadores ya tomaban `null` como «no tocar».
- **Pruebas:**
  - `test-admin-images-lib.js`: +1, con 8 variantes de ataque;
  - las **22 URL reales** de producción siguen aceptadas;
  - `admin57.js`: 16/16.

**Detalle de SEC-06:**
- **Admin:** todos los endpoints, incluidas las acciones nuevas de taxonomía, pasan por `requireAdmin`, con comparación en tiempo constante. `auth.js` no cambió.
- **Inyección de HTML:** los nombres de tonos y presentaciones se escapan (`esc` y `escapeHtml`) en la tienda, el carrito y los correos HTML.
- **Colores de tono:** el `hex` se valida en el servidor con una expresión regular.

**Detalle de DEP-05:**
- **En el repo:** no hay workflows de CI, `package.json` ni paso de build en Vercel, ni `supabase/config.toml`. Ningún componente del repo ejecuta SQL.
- **Fuera del repo:** no se puede comprobar si la integración de GitHub de Supabase está conectada (podría aplicar `supabase/migrations/*` al hacer push). La API de gestión responde 401 con el token local, y no se buscaron otras vías.
- **Mitigación:** **dejar fuera del commit** `0002_…`, `0004_…` y `0005_…`. Así no llegan a `main` y nada puede aplicarlas. 0002 ya está aplicada a mano en producción.
- **Efecto en un clon limpio:** `test-orders-notification-migration.mjs` y `test-orders-create-guards.js` fallan porque leen esos archivos. En el árbol local siguen pasando.

**Detalle de DEP-06:**
- **Código:** nada en el código apunta a `optimized/`, `vibe-share` ni `entregables`.
- **Producción** (lectura): el manifiesto `config/image-variants.json` y la ruta `optimized/…` no existen en Storage, así que la API entrega los originales sin `srcset`.

**Detalle de DEP-07:**
- La propuesta 1200×630 está solo en `Catalogo VIBE/entregables-fase58/`.
- Las etiquetas `og:image` y `twitter:image` nuevas apuntan a `vibe-logo-social.png`, que ya existe (200 en producción), con `twitter:card=summary`.

**Detalle de DEP-08:**
- **Árbol local:** 45 scripts, **953 aprobadas, 0 fallidas**. Son las 951 previas más 2 nuevas (rutas internas y `pathFromUrl`).
- **Copia exacta del commit propuesto** (sin las 3 migraciones ni `.env.local`): 922 aprobadas y 0 fallidas, con 2 scripts que abortan por la mitigación de DEP-05, como se esperaba.
- **Navegador, API simulada:**
  - `catalog58.js`: 4/4 anchos;
  - `store57.js`: 21/21;
  - `store56b.js`: 25/25;
  - `admin57.js`: 16/16;
  - `img57.js`: 7/7.

### 13.1 Commit propuesto (pendiente de confirmación expresa del commit y del push)

**63 archivos** = los 66 cambios locales **menos** las 3 migraciones.
- **Modificados (38):**
  - Admin y API: `admin/admin.css`, `admin/admin.js`, `admin/index.html`, `api/_lib/editorialDetails.js`, `api/_lib/subcategories.js`, `api/admin/_lib/storage.js`, `api/admin/catalog-metadata.js`, `api/admin/orders.js`, `api/admin/product-images.js`, `api/admin/products.js`, `api/catalog/categories.js`, `api/catalog/products.js`, `api/hero/slides.js`, `api/orders/_lib/email.js`, `api/orders/_lib/store.js`, `api/orders/_lib/whatsappNotify.js`, `api/orders/create.js`.
  - Sitio: `css/styles.css`, `index.html`, `js/app.js`, `js/cart.js`, `js/data-source.js`, `js/hero-carousel.js`, `js/taxonomy.js`.
  - 14 pruebas en `scripts/test-*`.
- **Nuevos (25):**
  - Configuración: `.vercelignore`, `vercel.json`, `robots.txt`.
  - API: `api/_lib/imageVariants.js`, `api/_lib/taxonomyStore.js`, `api/_lib/variants.js`, `api/admin/_lib/taxonomyAdmin.js`, `api/orders/_lib/guard.js`.
  - Sitio: `js/variants.js`, `assets/brand/logo/vibe-logo-light.webp`.
  - 7 documentos en `docs/`.
  - Herramientas y pruebas: `scripts/images/optimize-images.cjs` y 7 pruebas nuevas en `scripts/test-*`.
- ~~**Excluidos:** `supabase/migrations/0002_…`, `0004_…` y `0005_…` (DEP-05), y `.env.local` (ignorado).~~ *(Reemplazado el 2026-10-28 en la publicación, ver 13.3.)*

### 13.3 Publicación (2026-10-28)

**Autorización:** la propietaria autorizó el commit y el push a `main`, sin migraciones ni escrituras en producción.

**Alcance resuelto sin dejar el repo inconsistente:**
- Las migraciones pendientes `0002`, `0004` y `0005` se **trasladaron a `supabase/manual/`**, la carpeta que el proyecto ya usa para SQL que se ejecuta a mano (Fase 10).
- **Así no se pueden ejecutar al hacer push:** una integración de GitHub de Supabase solo aplica `supabase/migrations/`, que queda con `0001` y `0003`, ya aplicadas y ya presentes en `c60bef6`.
- **Así las pruebas siguen funcionando:** leen los archivos en su nueva ruta.
- **Resultado:** 953 aprobadas y 0 fallidas en el árbol final.
- **Excluido:** `.env.local` (ignorado).

| ID | Estado |
|---|---|
| DEP-03 | Commit y push realizados; ver el historial |
| DEP-05 | Mitigado con el traslado; ninguna migración ejecutada |
| Migraciones 0004 y 0005 | **Siguen PENDIENTES DE AUTORIZACIÓN.** Cuando se autoricen, se ejecutan a mano desde `supabase/manual/` |

### 13.2 Bloqueos para publicar con seguridad

1. **Confirmación expresa del commit y del push a `main`.** Es el único bloqueo técnico.
2. **Decisión sobre las migraciones en el commit:**
   - Recomendado: excluirlas (13.1).
   - Alternativa: incluirlas, solo si la propietaria confirma en el panel de Supabase que la integración de GitHub **no** está conectada.
3. **No bloquean, pero hay que conocerlos:**
   - Sin 0005 no hay idempotencia de servidor. Es igual que hoy.
   - Sin 0004 no se guarda el estado de los avisos internos.
   - SEC-03 y SEO-02 solo se pueden validar después de desplegar.

## Historial

- **2026-10-28 (Fase 57):**
  - registro creado;
  - CAT-01 y CAT-02 corregidos y verificados;
  - VAR-01 a VAR-10 implementados y verificados en local;
  - IMG-03 parcial e IMG-04 verificado en local;
  - TAX-04 detectado en la auditoría e implementado.
- **2026-10-28 (Fase 58, cierre):**
  - **CAT-01b:** por decisión de la propietaria, la frase se conserva en «Descubre tu VIBE» en móvil (se revierte esa parte de Fase 57); verificado a 360, 390, 820 y 1440.
  - **Esquema de producción:** compatibilidad verificada por lectura real; 0004 y 0005 no están aplicadas. Se precisaron ORD-03 y NOT-01.
  - **Imágenes:** 22 originales de producción optimizados en local (IMG-05, IMG-07 e IMG-08).
  - **Imagen para compartir:** dos propuestas de 1200×630 (SEO-03).
  - **SEC-03:** `.vercelignore`.
  - **Despliegue:** detenido antes del commit (PROD-08).
  - **Suite:** 951 aprobadas y 0 fallidas.
- **2026-10-28 (control final antes del commit):**
  - **Secretos y datos privados:** cero hallazgos.
  - **SEC-03:** se suma el bloqueo por ruta (`redirects`) a `.vercelignore`.
  - **SEC-05:** se corrige el recorrido de ruta en `pathFromUrl`.
  - **DEP-05:** las migraciones quedan fuera del commit propuesto.
  - **Pruebas:** 953 aprobadas y 0 fallidas.
  - **Commit y push:** pendientes de confirmación expresa.
