# VIBE — Registro maestro de requisitos (acumulativo)

**Qué es:** el registro permanente de lo que pidió la propietaria, en qué estado está **comprobado** y con qué evidencia. Cada solicitud nueva se agrega aquí. Una decisión anterior solo se reemplaza si la propietaria lo ordena expresamente; si ocurre, la entrada vieja queda tachada con la fecha.

**Última actualización:** 2026-10-28 (último bloque de cierre). Base: rama `main`, commit `c610ef6`, **publicado** en www.vibebeautycol.com (Vercel Production: «Deployment has completed»).

> **Estado del proyecto:** el catálogo está publicado y estable. Todo lo de las Fases 55–58, la fase final integral (§14) y la estabilización (§15) está en producción y verificado en el sitio publicado (§13.4, §14.8 y §16.1).
>
> **Lo que sigue pendiente depende de la propietaria:** decisiones editoriales, aprobación de la imagen para compartir, autorización de las migraciones 0004 y 0005, configuración de notificaciones, información legal y comercial, y variantes reales. Lista única en la §16.0.
>
> **Cómo leer los estados:** cada entrada indica dónde se comprobó.
> - **«VERIFICADO (local)»:** pruebas automáticas o navegador real sobre APIs simuladas.
> - **«EN PRODUCCIÓN»:** comprobado en www.vibebeautycol.com.
>
> Las secciones §11 a §15 se conservan como historia; cuando una entrada fue superada, lo indica.

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
| ED-03 | #56 (posible discrepancia entre imagen y texto), #59 y #103 (estado de ficha), #119 (clasificación). | BLOQUEADO POR DECISIÓN (hallazgos concretos en §14.3; #56 = foto de #110) | Pendiente de la propietaria (§11) |

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
| IMG-09 | Subir las versiones optimizadas y el manifiesto a producción. | AUTORIZADO Y EJECUTADO en la fase final (§14.1) | Explícitamente no autorizado en Fase 58 |

**Detalle de IMG-07:**
- **Leídas:** 22 de 22, sin bloqueos.
- **Aprobadas:** 20, todas con SSIM ≥ 0,985, PSNR ≥ 36 dB y ΔE medio ≤ 2,0.
- **Excepciones:** 2, con alternativa sin pérdida idéntica píxel a píxel.
- **Peso:** 29,26 MB → 4,86 MB (−83,4 %), o 3,92 MB (−86,6 %) si se usa la alternativa sin pérdida.
- **Inventario por imagen:** `fase57-optimizacion-imagenes.md` §5.2.
| IMG-06 | Galería de la ficha con versiones optimizadas. | IMPLEMENTADO Y VERIFICADO (§14.1) | Hoy usa el original; requiere adaptar el cambio de foto |

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

### 13.4 Resultado de la publicación (verificado en el sitio publicado)

**Datos del despliegue:**
- **Commit:** `b6ce13d`, con 66 archivos (38 modificados y 28 nuevos).
- **Push:** `c60bef6..b6ce13d` → `main`.
- **Vercel:** la API de GitHub Deployments registra el despliegue `7380114234` de **Production**, creado para `b6ce13d`. El estado del commit es «Vercel = success: Deployment has completed».
- **Versión publicada:** la hoja de estilos servida contiene la regla de Fase 58 (`.catalog-lead-intro{display:none}`).

| ID | Verificación en www.vibebeautycol.com | Estado |
|---|---|---|
| DEP-03 | Desplegado | **COMPLETADO Y VERIFICADO** |
| DEP-04 | Portada, frase, tarjetas, imágenes, ficha, carrito y checkout, con Chromium real sin simulaciones | **COMPLETADO Y VERIFICADO** (ver detalle) |
| CAT-01 y CAT-01b | La frase de «Descubre tu VIBE» se ve en todos los anchos; la de «Catálogo» se ve solo a 820 y 1440, y en todos se conservan «Catálogo», «Beauty for your VIBE.» y «Esenciales…» | **COMPLETADO Y VERIFICADO EN PRODUCCIÓN** |
| CAT-02 | 7 tarjetas, dispersión de **0 px** en todas las filas a 360, 390, 820 y 1440, sin desborde horizontal | **COMPLETADO Y VERIFICADO EN PRODUCCIÓN** |
| SEC-03 | `/docs/…`, `/scripts/…`, `/supabase/migrations/…` y `/supabase/manual/…` → **307 a `/`**; `/README.md` → 404 | **COMPLETADO Y VERIFICADO EN PRODUCCIÓN** |
| SEO-02 | Ver «Detalle de SEO-02» debajo de esta tabla | **COMPLETADO Y VERIFICADO EN PRODUCCIÓN** |
| SEO-01 | `canonical`, `og:image` (logo existente) y `/sitemap.xml` presentes | **COMPLETADO Y VERIFICADO EN PRODUCCIÓN**; la vista previa en redes queda sujeta a SEO-03 |
| IMG-04 | La API pública entrega los originales (sin manifiesto) y todas las imágenes cargan | **COMPLETADO Y VERIFICADO EN PRODUCCIÓN** |

**Detalle de DEP-04:**
- **Portada:** 200, sin errores de consola ni respuestas 4xx/5xx.
- **Imágenes:** 13 imágenes de tarjetas y Hero por ancho, 0 rotas.
- **Ficha:**
  - el agotado (#99) muestra «Agotado» deshabilitado;
  - el disponible (#102) permite «Agregar al carrito».
- **Carrito:** 1 línea, subtotal $15.000.
- **Checkout:** el formulario aparece con 8 campos y **no se envió**.
- **Pedidos:** las llamadas a `/api/orders/**` se abortaban en el navegador, y hubo 0 intentos.

**Detalle de SEO-02:**
- `robots.txt` y `sitemap.xml` → 200.
- `X-Robots-Tag: noindex, nofollow` en `/admin/` y en los dominios `*.vercel.app`.
- Cabeceras activas: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` y `Permissions-Policy`.

**Observación medida, sin bloqueo:**
- **Qué se ve:** en mobile, la foto de la ficha tarda unos 3 s en empezar y unos 8 s en completarse, porque los originales PNG pesan alrededor de 1,5 MB.
- **Qué lo resuelve:** IMG-09, subir las versiones WebP, que sigue **PENDIENTE DE AUTORIZACIÓN**.

**Confirmaciones:**
- No se ejecutó ninguna migración.
- No hubo escrituras en Supabase, Storage ni el POS.
- No se creó ningún pedido ni se envió ninguna notificación.
- La imagen para compartir y las imágenes optimizadas no se publicaron.

**Pendientes que siguen abiertos**, todos los de la §12 menos DEP-03 y DEP-04:
- migraciones 0004 y 0005;
- IMG-09;
- SEO-03;
- VAR-11;
- ED-03;
- información legal y comercial;
- NOT-03 y NOT-04;
- IMG-06;
- SEC-02.

### 13.2 Bloqueos para publicar con seguridad

1. **Confirmación expresa del commit y del push a `main`.** Es el único bloqueo técnico.
2. **Decisión sobre las migraciones en el commit:**
   - Recomendado: excluirlas (13.1).
   - Alternativa: incluirlas, solo si la propietaria confirma en el panel de Supabase que la integración de GitHub **no** está conectada.
3. **No bloquean, pero hay que conocerlos:**
   - Sin 0005 no hay idempotencia de servidor. Es igual que hoy.
   - Sin 0004 no se guarda el estado de los avisos internos.
   - SEC-03 y SEO-02 solo se pueden validar después de desplegar.

## 14. Fase final integral de cierre (2026-10-28)

**Autorización de esta fase:**
- **Autorizado:** publicar en el Storage existente las imágenes optimizadas aprobadas y actualizar las referencias; publicar el código (commit y push a `main`); corregir errores editoriales objetivos.
- **No autorizado:** migraciones, envíos reales, cambios en el POS ni contenido editorial sin aprobación.

### 14.1 Imágenes (IMG-03, IMG-06, IMG-09)

| ID | Estado | Evidencia |
|---|---|---|
| IMG-09 | **COMPLETADO Y VERIFICADO EN PRODUCCIÓN:** 66 WebP (22 originales × 3 anchos) en `optimized/{products,hero}/…` y manifiesto publicado tras desplegar el código (§14.8) | Ver «Detalle de IMG-09» debajo de esta tabla |
| Excepciones (`products/122/main`, `hero/hero-muirbum2-nw5onl`) | Se publicaron sus versiones **sin pérdida**, idénticas píxel a píxel al original reducido: superan el criterio de calidad sin margen de error | La propietaria pidió conservar el original solo si no se supera el criterio; el WebP con pérdida queda descartado |
| IMG-06 | **IMPLEMENTADO Y VERIFICADO (local, con los WebP reales)** | Ver «Detalle de IMG-06» debajo de esta tabla |
| Corrección encontrada | El hover de la tarjeta cambiaba solo `src`; con `srcset` (al publicar el manifiesto) habría dejado de cambiar de foto | `swapImage` cambia `srcset` y `src` |
| Peso medido (navegador real, portada completa con scroll) | **Originales: 15,59 MB → WebP: 2,71 MB en mobile (−83 %) y 2,22 MB en escritorio (−86 %)** | `imgfinal.js` |

**Detalle de IMG-09:**
- **Antes de subir:**
  - se volvió a descargar cada original y su sha256 coincidió con el procesado en Fase 58, así que la correspondencia es exacta;
  - cada WebP se validó (formato, ancho y proporción).
- **Subida:** con `x-upsert:false`, sin sobrescribir.
- **Después de subir:** cada URL pública se verificó byte a byte.
- **Originales:** intactos (mismo tamaño servido).

**Detalle de IMG-06:**
- **Ámbito:** la API entrega `srcsetByUrl`, el `srcset` de cada foto del producto, y la ficha, las miniaturas, el carrito y el checkout lo usan.
- **Cambio de foto:** al cambiar de foto (miniatura, flecha o hover de la tarjeta) se reemplazan `srcset` **y** `src` (`swapImage`), porque con `srcset` cambiar solo `src` no tiene efecto.
- **Vuelta al original:** si un WebP falla, la imagen vuelve al original (comprobado con 404 simulados).
- **Verificación en navegador real:** `imgfinal.js`, 17/17, a 390 y 1440.

### 14.2 Variantes (VAR-11)

- **Implementación:** la gestión de tonos y presentaciones existente se conserva **sin cambios**. Re-verificada en esta fase con el código nuevo:
  - Admin: `admin57.js`, 16/16 (crear, renombrar, ordenar, activar, desactivar y quitar con confirmación);
  - tienda: `store57.js`, 21/21 en 3 de 3 corridas con pausa humana;
  - tienda: `store56b.js`, 25/25.
- **Datos:** no se asignó ninguna variante. VAR-11 sigue en manos de la propietaria.
- **Carrera de la prueba `store57.js` (preexistente, Fase 28):**
  - **Qué pasa:** al cerrar la ficha tras agregar, el sitio llama a `history.back()`, que es asíncrono. Si en los milisegundos siguientes se abre otra ficha, el `popstate` tardío la cierra.
  - **Por qué no afecta a una persona:** tras agregar, el carrito cubre la pantalla y hay que cerrarlo primero.
  - **Qué falla:** solo la prueba automática, que hace clic al instante. Con una pausa de 300 ms pasa 3 de 3.
  - **Cambios:** no se modificó el sitio.

**Cómo configurar las variantes reales (Admin › Productos › ficha del producto):**
1. **Tonos:** «Agregar tono», con nombre y color (selector o código `#RRGGBB`). Un tono sin color no se muestra en la tienda.
2. **Presentaciones:** «Agregar presentación», con la etiqueta real (por ejemplo «15 ml»).
3. **Orden y activación:** con ↑/↓ y el interruptor «Activo». Una opción inactiva se ve tachada y no se puede elegir. Quitar una opción pide confirmación.
4. **Cómo lo ve la clienta:**
   - una sola opción activa en una dimensión se aplica sola, sin selector;
   - con varias, la clienta debe elegir;
   - sin opciones, no aparece selector.
5. **Precio y stock:** siempre los del producto en el POS. Activar una opción no crea inventario.

### 14.3 Productos #56, #59, #103 y #119 (ED-03)

| # | POS (nombre, categoría) | Ficha VIBE | Hallazgo |
|---|---|---|---|
| 56 | Makeup Brush Set · «Otro» | Existe, **no publicada**; textos de set de brochas | **Error objetivo:** su foto `products/56/main.png` es **idéntica byte a byte** (sha256) a la de #110 «VIBE Lip Duo» (delineador y labial Kevin&Coco), no a un set de brochas. Corrección preparada: quitar esa foto de la ficha sin borrar el archivo. **No se aplicó:** el sistema de permisos bloqueó la escritura en producción |
| 59 | Suprliner · «Labios» | **Sin ficha** | Sin foto ni texto. Pendiente desde Fase 20: ¿delineador de ojos (Ojos › Delineado) o labios? |
| 103 | VIBE Love-Blend Kit · «Otro» | **Sin ficha** | Sin foto ni texto. Pendiente desde Fase 20: grupo y categoría desconocidos |
| 119 | Polvo Ácido Hialurónico · «Labios» | **Sin ficha** | Sin foto ni texto. La propuesta de Fase 20 lo ubica en Rostro › Polvo y fijador (es un polvo, no un producto de labios), pero falta confirmarlo |

No se creó ni publicó ninguna ficha (ED-01).

### 14.4 Información legal y comercial

- **Estructura implementada:** `js/legal.js` concentra la identificación del negocio y cinco políticas: datos personales, envíos, pagos, cambios/devoluciones/retracto y garantía.
- **Comportamiento:**
  - todos los campos están en `null`, así que la columna «Legal» del pie **no se muestra**;
  - al completar un campo con texto real, aparece solo ese dato, escapado y en un `<details>` accesible;
  - en escritorio, el pie pasa a 4 columnas.
- **Pruebas:** `test-legal-structure.mjs` (4/4) exige que la configuración publicada esté vacía.
- **Datos reales que ya están publicados y se conservan:**
  - WhatsApp/teléfono 314 349 0825;
  - el correo `vibeeproject2026@gmail.com`;
  - Instagram `@beautyvibe.col`;
  - «envío y pago se acuerdan por WhatsApp» (FAQ);
  - el consentimiento de contacto por WhatsApp en el checkout.

### 14.5 Correos transaccionales (NOT-03 y NOT-04)

**Revisión del código, coherente:**
- sin `RESEND_API_KEY` o `EMAIL_FROM_ADDRESS` → `EMAIL_PROVIDER_NOT_CONFIGURED`, y el pedido no falla;
- el aviso interno va solo a `ORDERS_NOTIFICATION_EMAIL`; si falta → `ORDERS_NOTIFICATION_EMAIL_NOT_CONFIGURED`;
- `Idempotency-Key` va por pedido y por destinatario;
- los errores se registran como códigos, sin datos personales.

**Evidencia de producción, sin enviar nada** (lectura agregada de `email_sent` y `whatsapp_notified`, sin datos personales):
- hay 1 pedido registrado el 2026-10-28, que no creó esta fase;
- `email_sent = true` → `RESEND_API_KEY` y `EMAIL_FROM_ADDRESS` **están configuradas** y Resend **aceptó** el correo a la clienta. «Aceptado» no garantiza entrega.
- `whatsapp_notified = false`.
- El aviso interno no se puede comprobar hasta aplicar 0004, porque no hay columna de estado.

### 14.6 Imagen para compartir (SEO-03)

- **Recomendación: A (tipográfica).** Centrada, se lee completa en la vista horizontal **y** en el recorte cuadrado de WhatsApp. Pesa 28 KB en JPG y usa solo el logo oficial, el lema y el dominio.
- **B (fotográfica):** más atractiva, pero en el recorte cuadrado corta el logo y el lema, y depende de autorizar el uso de la foto del Hero.
- **Estado:** no publicada y `og:image` sin cambios. Los archivos están en `Catalogo VIBE/entregables-fase58/imagen-compartir/`.

### 14.7 Migraciones 0004 y 0005

**Qué depende de cada una:**
- **0005 (`idempotency_key`):** la idempotencia de servidor.
  - **Riesgo hoy:** un reintento del mismo pedido (por ejemplo, tras un corte de red justo después de guardarlo) crea un **pedido duplicado** y **duplica los avisos**.
  - **Mitigación parcial:** el botón bloqueado mientras se envía y el límite de 3 pedidos por teléfono en 10 minutos.
- **0004 (`internal_notification_*`):** guarda si el aviso interno a VIBE se aceptó o falló, el contador del Admin y el reintento manual.
  - **Riesgo hoy:** si el aviso falla, nadie lo ve en el Admin y no se puede reintentar.

**Recomendación:** autorizar **ambas**.
- **Qué hacen:** solo agregan columnas que admiten vacío, y 0005 crea además un índice único parcial sobre valores no nulos (hoy todos nulos).
- **Lo que no hacen:** no reescriben datos ni cambian columnas existentes, y no afectan los pedidos actuales.
- **Cómo se aplican:** son idempotentes (`if not exists`). Están en `supabase/manual/`, para ejecutar en el SQL Editor de Supabase.
- **Después de aplicarlas:** el código las usa automáticamente, sin desplegar nada.

### 14.8 Publicación y verificación en www.vibebeautycol.com

**Despliegue:**
- **Commit:** `8f10f79`, con 10 archivos.
- **Push:** a `main`.
- **Vercel:** «Deployment has completed».

**Manifiesto `config/image-variants.json`:**
- **Publicación:** se subió **después** de que el código nuevo estuviera en línea (`x-upsert:false`), con **19 originales**.
- **Por qué 19 y no 22:** durante esta fase alguien (no esta sesión) despublicó #106 desde el Admin y quitó sus fotos de la ficha (`published=false`, `image=null`). Sus 3 originales y sus WebP siguen en Storage, sin cambios.
- **#56 no cambió:** su escritura fue bloqueada por permisos y no se ejecutó.

**Verificación en producción** (Chromium real, sin simulaciones; `/api/orders/**` abortado):
- **Imágenes** (`imgprod.js`, 17/17):
  - 6 tarjetas, Hero, ficha, miniaturas, flechas, hover y carrito en WebP;
  - si un WebP falla, se vuelve al original;
  - sin errores de JS.
- **Peso de la portada completa:** 2,66 MB en mobile y 2,18 MB en escritorio. Con los originales eran 15,59 MB (medido con 7 productos).
- **Regresión** (`prod60.js`):
  - a 360, 390, 820 y 1440: frase correcta, dispersión de tarjetas 0 px, 0 imágenes rotas y sin desborde;
  - ficha → carrito → formulario de checkout, **sin enviar**;
  - **0 llamadas** a la API de pedidos;
  - columna «Legal» presente y **oculta** (sin datos).
- **Caché:** tras publicar el manifiesto, la API de productos puede tardar hasta 5 minutos en reflejarlo (`s-maxage=300` del CDN). El Hero lo reflejó al instante.

## 15. Estabilización (2026-10-28)

### 15.1 Ficha que se cerraba sola (PDP-RACE)

| ID | Instrucción | Estado |
|---|---|---|
| PDP-RACE | Cerrar una ficha y abrir otra al instante no debe cerrar ni reemplazar la nueva, sin depender de pausas | **CORREGIDO Y VERIFICADO** (ver detalle) |

**Detalle de PDP-RACE:**
- **Causa real:** dos eventos asíncronos de la ficha anterior llegaban después de abrir la nueva.
  1. **El evento `close` del `<dialog>`:** se dispara en una tarea posterior. Si la ficha B ya estaba abierta, ese `close` tardío limpiaba `state.product` y lanzaba `history.back()`.
  2. **El `history.back()` del cierre:** también es asíncrono. Si B empujaba su entrada antes de que terminara, el back() aterrizaba en la entrada de A y su `popstate` reabría A.
- **Reproducción determinista:** se cerraba A y se abría B en el mismo tick, y se veía «Producto 1» con `?product=1` en vez de B.
- **Corrección** (`js/app.js`, sin retrasos):
  - un `close` que llega con la ficha ya reabierta se ignora;
  - si al abrir B la entrada de A sigue arriba, se **reemplaza** (`replaceState`), así que «Atrás» no vuelve a A;
  - con el back() propio en curso, la entrada de B se empuja cuando ese back() termina;
  - si B se cierra antes, no se lanza un segundo back() que sacaría a la clienta del sitio.
  - Carrito, variantes, galería y checkout sin cambios.
- **Pruebas:**
  - **en el repo, prueba de navegador:** `scripts/browser/pdp-reopen-race.cjs`. Cubre cerrar y abrir al instante con el botón × y con `dialog.close`, abrir con el back() en curso, cerrar-abrir-cerrar sin salir del sitio, el flujo normal y «Atrás». Fallaba antes de la corrección (2 casos) y después pasa en 4 de 4 corridas;
  - **en el repo, comprobaciones de código:** `test-pdp-gallery-nav.js`, +5, total 17/17;
  - **en navegador, sin pausa:** `store57.js` original, 5 de 5 (antes fallaba de forma intermitente); `store56b.js`, 25/25;
  - **en Node:** galería e imágenes (`imgfinal.js`) siguen bien. El único cambio es que hay 6 productos publicados y no 7 (ver #106).

### 15.2 Decisiones pendientes de la propietaria (lista única)

Reemplaza como lista de trabajo a las de §11, §12 y §14. Esas secciones se conservan como historia.

| # | Decisión o acción | Opciones / detalle |
|---|---|---|
| 1 | **#56 Makeup Brush Set:** su foto es la de #110 (sha256 idéntico) | La propietaria la retirará desde el Admin › ficha #56 › «Quitar imagen», **sin** marcar el borrado del archivo. La ficha no está publicada |
| 2 | **#59 Suprliner** | Ojos › Delineado **o** Labios. Sin cambios hasta confirmar |
| 3 | **#103 VIBE Love-Blend Kit** | Definir grupo y categoría. Sin ficha; nada asignado |
| 4 | **#119 Polvo Ácido Hialurónico** | ¿Rostro › Polvo y fijador? Sin ficha; se conserva la clasificación actual del POS («Labios») |
| 5 | **#106 Set Perfect Lips** | Ver «Detalle del punto 5» debajo de esta tabla |
| 6 | **Imagen para compartir** | Aprobar la propuesta A. Ver «Detalle del punto 6» debajo de esta tabla |
| 7 | **Migraciones 0004 y 0005** | Autorizar y aplicar (15.3) |
| 8 | **Variables de notificación** | 15.4 |
| 9 | **Información legal y comercial** | Lista de §14.4 y §11, punto 6: identificación del negocio, datos personales, envíos, pagos, cambios, devoluciones, retracto y garantía |
| 10 | **Tonos y presentaciones reales** | Desde el Admin (guía en §14.2) |

**Detalle del punto 5 (#106 Set Perfect Lips):**
- **Qué cambió:** se despublicó y se quitaron sus 3 fotos de la ficha (`published=false`, `image=null`, `images=[]`). Los archivos siguen en Storage.
- **Cuándo:** entre el 2026-10-28 a las 13:00:03 UTC (08:00 hora de Colombia), cuando las pruebas de esta sesión aún lo veían publicado con sus fotos, y las 13:09:57 UTC (08:09), cuando ya no aparecía.
- **Cómo:** no se puede determinar con la información disponible.
  - `updated_at` no cambió (2026-09-30), porque ni el Admin ni la base lo actualizan (no hay trigger). Eso no distingue el Admin del editor SQL.
  - La tabla no lleva historial de cambios.
  - Los registros de Supabase requieren un token de gestión, y el local no es válido.
- **Esta sesión no lo hizo:** en esa ventana solo publicó código que no escribe productos, y su única escritura en la base, la de #56, fue bloqueada y no se ejecutó.
- **Pendiente:** confirmar si fue intencional. No se restauró nada.

**Detalle del punto 6 (imagen para compartir):**
- **Archivo listo, sin publicar:** `C:\Users\jdvm1\Desktop\Catalogo VIBE\entregables-fase58\imagen-compartir\vibe-og-1200x630-final.png`.
- **Características:** PNG de 1200×630 y 33 KB, copia exacta de la propuesta A (mismo sha256).
- **Legibilidad comprobada:** el logo, el lema y el dominio se leen en la vista horizontal de 400 px y en el recorte cuadrado de 160 px; el dominio queda pequeño, pero la vista previa ya lo muestra como texto.
- **Qué pasa al aprobarla:**
  - el archivo se copia al sitio, en `assets/brand/`;
  - `og:image` y `twitter:image` pasan a apuntar a él, con `og:image:width=1200` y `og:image:height=630`;
  - `twitter:card` pasa a `summary_large_image`.

### 15.3 Migraciones 0004 y 0005: instrucciones (NO aplicadas)

**Estado:** siguen **pendientes de autorización**. Ni esta sesión ni el código las aplicaron. Están en `supabase/manual/`, fuera de `supabase/migrations/`, así que ningún push las ejecuta.

**Qué hace cada una:**

| Archivo | Qué hace |
|---|---|
| `0004_orders_internal_notification.sql` | Agrega a `orders` las columnas `internal_notification_status` (`accepted`/`failed`/`not_configured`), `internal_notification_at` e `internal_notification_error` (máx. 80 caracteres) |
| `0005_orders_idempotency_key.sql` | Agrega `idempotency_key` (16–64 caracteres) y un índice único parcial (solo valores no nulos) |

Las dos admiten vacío, usan `if not exists` (se pueden repetir sin error) y terminan con `notify pgrst, 'reload schema'`. No cambian ni borran datos y no dependen una de otra.

**Procedimiento** (Supabase › proyecto VIBE › SQL Editor):
1. «New query», pegar el contenido completo de `supabase/manual/0004_orders_internal_notification.sql` y ejecutar con «Run». Debe responder «Success. No rows returned».
2. Repetir con `supabase/manual/0005_orders_idempotency_key.sql`.
3. Comprobar en una consulta nueva:
   ```sql
   select column_name from information_schema.columns
   where table_name = 'orders'
     and column_name in ('internal_notification_status','internal_notification_at','internal_notification_error','idempotency_key');
   ```
   Deben salir 4 filas.
4. No hace falta desplegar. El código detecta las columnas y empieza a usarlas en el siguiente pedido.

**Riesgo de mantenerlas pendientes:**
- **Sin 0005:**
  - **Cuándo se duplica un pedido:** solo si el pedido se guarda pero la respuesta no llega a la clienta (corte de red) y ella vuelve a enviarlo. En ese caso se crea un segundo pedido y se repiten los avisos.
  - **Qué protege hoy:** el botón se bloquea mientras se envía, y hay un límite de 3 pedidos por teléfono en 10 minutos.
  - **Probabilidad:** baja con el volumen actual (1 pedido registrado), pero real.
- **Sin 0004:**
  - **Qué se pierde:** si el aviso interno a VIBE falla, el Admin no lo muestra y no se puede reintentar.
  - **Qué no se afecta:** el pedido y el correo a la clienta.

### 15.4 Variables de entorno para notificaciones

**Dónde se configuran:** Vercel › proyecto `vibe-catalog` › Settings › Environment Variables › entorno **Production**. Después hay que volver a desplegar el último despliegue para que tomen efecto. Aquí no se registra ningún valor secreto.

| Variable | Uso | Estado conocido |
|---|---|---|
| `RESEND_API_KEY` | Envío de correos (Resend) | **Configurada** (indicio: el único pedido tiene `email_sent=true`) |
| `EMAIL_FROM_ADDRESS` | Remitente de los correos (dominio verificado en Resend) | **Configurada** (mismo indicio) |
| `ORDERS_NOTIFICATION_EMAIL` | Correo interno de VIBE que recibe cada pedido | **Desconocido** (no verificable sin 0004 ni acceso a Vercel) |
| `WHATSAPP_BUSINESS_TOKEN` | Token de la API de WhatsApp Cloud (Meta) | **Falta o falla** (`whatsapp_notified=false`) |
| `WHATSAPP_PHONE_NUMBER_ID` | Id del número emisor en Meta | Igual |
| `VIBE_WHATSAPP_NOTIFICATION_NUMBER` | Número de VIBE que recibe el aviso (formato internacional, sin «+») | Igual |
| `WHATSAPP_MESSAGE_MODE` | `text` (por defecto) o `template` | Ver «Detalle del modo de WhatsApp» debajo de esta tabla |

**Detalle del modo de WhatsApp:**
- **Con `text`:** Meta solo entrega si el número receptor escribió al número emisor en las últimas 24 h.
- **Para avisos fiables:** usar `template`, con una plantilla aprobada llamada exactamente **`nuevo_pedido_vibe`** (idioma `es_CO`, sin parámetros; el aviso no incluye el detalle del pedido).
- **Estado:** no se afirma que WhatsApp funcione. Requiere configuración y una verificación real autorizada.

## 16. Último bloque de cierre: lista final para la propietaria (2026-10-28)

En este bloque no se cambiaron productos, datos de producción, Storage, el POS ni la configuración de Vercel, y no se ejecutó SQL.

### 16.0 Pendientes (lista final)

Ninguno se ha realizado. Todos esperan a la propietaria.

| # | Pendiente | Tipo | Detalle |
|---|---|---|---|
| 1 | #56: quitar la foto incorrecta (es la de #110) desde Admin › «Quitar imagen», sin borrar el archivo | Acción | §15.2 |
| 2 | #59 Suprliner: Ojos › Delineado o Labios | Decisión | §15.2 |
| 3 | #103 VIBE Love-Blend Kit: grupo y categoría | Decisión | §15.2 |
| 4 | #119 Polvo Ácido Hialurónico: ¿Rostro › Polvo y fijador? | Decisión | §15.2 |
| 5 | #106: ¿despublicación intencional? | Decisión | §15.2 |
| 6 | Imagen para compartir (propuesta A): aprobar o rechazar | Decisión | §15.2 |
| 7 | Migraciones 0004 y 0005 | Autorización | §15.3 |
| 8 | Variables de correo interno y WhatsApp | Configuración | §16.3 |
| 9 | Información legal y comercial | Datos | §16.2 |
| 10 | Tonos y presentaciones reales | Configuración en el Admin | §14.2 y §16.4 |

### 16.1 Estado publicado tras `c610ef6`

- **Publicación:** `c610ef6` (corrección PDP-RACE y §15) está desplegado en Production («Deployment has completed»). El `app.js` servido contiene la corrección.
- **Pruebas en el sitio publicado:** `scripts/browser/pdp-reopen-race.cjs` dio todo OK, con la API de catálogo simulada en el navegador y los pedidos abortados.
- **Rutas internas:** `/scripts/…` redirige (307) a la portada.
- **Catálogo público:** 6 productos publicados (#106 despublicado; ver §15.2, punto 5).
- **Migraciones:** 0004 y 0005 siguen **sin aplicar**, con los archivos intactos en `supabase/manual/`.
- **Imagen para compartir:** **no publicada**.
- **Columna «Legal»:** oculta, porque todos los campos de `js/legal.js` están en `null`.

### 16.2 Datos legales y comerciales que faltan (para completar `js/legal.js`)

1. **Titular:** razón social o nombre completo, tipo y número de identificación (NIT o C.C.), ciudad y dirección.
2. **Tratamiento de datos personales (Ley 1581 de 2012):** el texto de la política. Debe indicar:
   - el responsable;
   - las finalidades (gestionar el pedido y contactar por WhatsApp o correo);
   - los derechos del titular;
   - el canal para ejercerlos.
3. **Envíos:** zonas o ciudades cubiertas, tarifas o cómo se calculan, y plazos.
4. **Medios de pago aceptados.**
5. **Cambios, devoluciones, retracto y garantía (Ley 1480 de 2011):** condiciones, plazos y procedimiento.
6. **Contacto y canales oficiales.**
   - **Ya publicados y confirmados:** WhatsApp/teléfono 314 349 0825, correo `vibeeproject2026@gmail.com` e Instagram `@beautyvibe.col`.
   - **Por confirmar:** si son los definitivos, y si se agregan horario de atención o un correo específico para datos personales.

Mientras falte un dato, no se muestra nada de él. Al recibir los textos, se completan los campos de `js/legal.js` y se despliega.

### 16.3 Notificaciones: pasos pendientes (en Vercel › `vibe-catalog` › Settings › Environment Variables › Production)

1. **Correo interno:** comprobar que exista `ORDERS_NOTIFICATION_EMAIL` con el correo de VIBE que debe recibir cada pedido. `RESEND_API_KEY` y `EMAIL_FROM_ADDRESS` ya están configuradas: el único pedido registrado tiene `email_sent=true`.
2. **WhatsApp:** revisar o crear `WHATSAPP_BUSINESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `VIBE_WHATSAPP_NOTIFICATION_NUMBER` (formato internacional, sin «+»; por ejemplo `57…`).
3. **Modo plantilla:** si se usa la integración de WhatsApp Cloud, aprobar en Meta (WhatsApp Manager › Plantillas) una plantilla llamada exactamente `nuevo_pedido_vibe`, idioma `es_CO`, sin parámetros. Luego definir `WHATSAPP_MESSAGE_MODE=template`.
4. **Activación:** después de guardar las variables, volver a desplegar el último despliegue de Production desde Vercel (Deployments › … › Redeploy).
5. **Verificación real autorizada:** un pedido real o de prueba que la propietaria decida. Después se comprueba en Admin › Pedidos (con la migración 0004 aplicada, se ve el estado del aviso interno). Hasta entonces, **no se considera que WhatsApp funcione**.

Ningún valor secreto se escribe en este registro ni en el repositorio.

### 16.4 Variantes: comprobar que se ven bien (complementa la guía de §14.2)

1. **En el Admin,** con la sesión iniciada:
   - abrir la ficha del producto;
   - cargar sus tonos (nombre y color) o sus presentaciones (etiqueta real);
   - guardar.
2. **En la tienda,** en una ventana privada o tras unos minutos (la API de catálogo puede tardar hasta 5 minutos por la caché):
   - **tarjeta:** muestra los puntos de color de los tonos;
   - **ficha, con varias opciones activas:** el botón dice «Elige un tono» o «Elige una presentación» y no deja agregar hasta elegir;
   - **ficha, con una sola opción:** se muestra sin selector y se aplica sola;
   - **opción inactiva:** se ve tachada y no se puede elegir.
3. **En el carrito:**
   - agregar dos combinaciones distintas produce dos líneas, cada una con su «Tono:» o «Presentación:»;
   - repetir la misma combinación suma la cantidad en la misma línea.
4. **En el checkout,** abrir el formulario sin enviarlo: el resumen muestra cada línea con su opción.

Precio y stock siguen siendo los del POS.

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
- **2026-10-28 (publicación):**
  - **Commit y despliegue:** `b6ce13d`, con push a `main` y despliegue de Production en Vercel completado.
  - **Migraciones:** 0002, 0004 y 0005 trasladadas a `supabase/manual/`, sin ejecutar.
  - **Verificación en producción:** catálogo, seguridad y SEO (§13.4).
- **2026-10-28 (fase final integral):**
  - **Imágenes:** imágenes optimizadas publicadas (66 WebP + manifiesto); galería, miniaturas, carrito y checkout optimizados; −83 % (mobile) y −86 % (escritorio) de peso.
  - **Legal:** estructura legal vacía y oculta hasta tener datos reales.
  - **Hallazgos:** #56 tiene la foto de #110; #106 fue despublicado por otra persona durante la fase.
  - **Pendientes de la propietaria:** recomendación de la imagen para compartir y de las migraciones.
  - **Commit:** `8f10f79`.
- **2026-10-28 (estabilización):**
  - **PDP-RACE:** corregido (`close` tardío y `history.back()` asíncrono), con prueba de navegador en el repo.
  - **Pendientes:** lista única de decisiones (§15.2) e investigación de #106 (ventana horaria; sin atribuir autoría).
  - **Imagen para compartir:** propuesta A preparada como archivo final, sin publicar.
  - **Migraciones:** procedimiento de 0004 y 0005 documentado, sin aplicarlas.
  - **Notificaciones:** variables de correo y WhatsApp documentadas.
- **2026-10-28 (último bloque de cierre):**
  - **Encabezado:** el registro decía que nada estaba en producción; se corrigió, dejando el texto anterior tachado.
  - **§16:** estado publicado tras `c610ef6`, datos legales y comerciales faltantes, pasos de notificaciones y comprobación de variantes en la tienda y el carrito.
  - **Sin cambios:** productos, datos, Storage, configuración y migraciones.
