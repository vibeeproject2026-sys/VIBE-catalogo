PUBLICADO; ver §24.5 e Historial |PUBLICADO; ver §24.5 e Historial |PUBLICADO; ver §24.5 e Historial |# VIBE — Registro maestro de requisitos (acumulativo)

**Qué es:** el registro permanente de lo que pidió la propietaria, en qué estado está **comprobado** y con qué evidencia. Cada solicitud nueva se agrega aquí. Una decisión anterior solo se reemplaza si la propietaria lo ordena expresamente; si ocurre, la entrada vieja queda tachada con la fecha.

**Última actualización:** 2026-10-28 (último bloque de cierre). Base: rama `main`, commit `c610ef6`, **publicado** en www.vibebeautycol.com (Vercel Production: «Deployment has completed»).

> **Estado del proyecto:** el catálogo está publicado y estable. Todo lo de las Fases 55–58, la fase final integral (§14) y la estabilización (§15) está en producción y verificado en el sitio publicado (§13.4, §14.8 y §16.1).
>
> **Lo que sigue pendiente depende de la propietaria:** acciones editoriales en el Admin (#56 y las clasificaciones de #59, #103 y #119), configuración de notificaciones, información legal y comercial, y variantes reales. Lista vigente en la §17, actualizada en la §18. Las migraciones 0004 y 0005 **ya están aplicadas** en producción (§18).
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
| POS-01 | El POS es la fuente de verdad de precio, stock, disponibilidad y promociones; no se modifica ni su repo ni sus datos. *(2026-11-20, decisión de la propietaria: una opción con **precio propio** en la ficha VIBE vende a ese precio en el catálogo, ver §22. El POS sigue siendo la fuente del precio general, el stock y las promociones, y no se modifica.)* | VERIFICADO | `test-variants-fase57.mjs`: crear pedidos nunca escribe en `products` ni en `catalog_metadata` |
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
| VAR-09 | ~~Precio~~ y stock vienen del producto base del POS; activar una opción no crea inventario. *(2026-11-20: el **precio** puede ser propio de la opción, ver §22 VPR; el stock sigue siendo del POS.)* | VERIFICADO (local) | `test-variants-fase57.mjs` (promo, agotado, cambio de precio) |
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
| Migraciones 0004 y 0005 | **Siguen PENDIENTES DE AUTORIZACIÓN.** Cuando se autoricen, se ejecutan a mano desde `supabase/manual/`. *(Aplicadas el 2026-10-28; ver §18.)* |

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
| 7 | **Migraciones 0004 y 0005** | Autorizar y aplicar (15.3). *(Aplicadas el 2026-10-28; ver §18.)* |
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

### 15.3 Migraciones 0004 y 0005: instrucciones (aplicadas el 2026-10-28; ver §18)

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

Ninguno se ha realizado. Todos esperan a la propietaria. *(El 2026-10-28 la propietaria decidió todos los puntos; el estado actual de cada uno está en la §17.)*

| # | Pendiente | Tipo | Detalle |
|---|---|---|---|
| 1 | #56: quitar la foto incorrecta (es la de #110) desde Admin › «Quitar imagen», sin borrar el archivo | Acción | §15.2 |
| 2 | #59 Suprliner: Ojos › Delineado o Labios | Decisión | §15.2 |
| 3 | #103 VIBE Love-Blend Kit: grupo y categoría | Decisión | §15.2 |
| 4 | #119 Polvo Ácido Hialurónico: ¿Rostro › Polvo y fijador? | Decisión | §15.2 |
| 5 | #106: ¿despublicación intencional? | Decisión | §15.2 |
| 6 | Imagen para compartir (propuesta A): aprobar o rechazar | Decisión | §15.2 |
| 7 | Migraciones 0004 y 0005 | Autorización | §15.3. *(Aplicadas el 2026-10-28; ver §18.)* |
| 8 | Variables de correo interno y WhatsApp | Configuración | §16.3 |
| 9 | Información legal y comercial | Datos | §16.2 |
| 10 | Tonos y presentaciones reales | Configuración en el Admin | §14.2 y §16.4 |

### 16.1 Estado publicado tras `c610ef6`

- **Publicación:** `c610ef6` (corrección PDP-RACE y §15) está desplegado en Production («Deployment has completed»). El `app.js` servido contiene la corrección.
- **Pruebas en el sitio publicado:** `scripts/browser/pdp-reopen-race.cjs` dio todo OK, con la API de catálogo simulada en el navegador y los pedidos abortados.
- **Rutas internas:** `/scripts/…` redirige (307) a la portada.
- **Catálogo público:** 6 productos publicados (#106 despublicado; ver §15.2, punto 5).
- **Migraciones:** 0004 y 0005 siguen **sin aplicar**, con los archivos intactos en `supabase/manual/`. *(Aplicadas el 2026-10-28; ver §18.)*
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

## 17. Decisiones de la propietaria y su ejecución (2026-10-28)

Reemplaza a la §16.0 como lista vigente; esa tabla se conserva como historia.

| # | Decisión de la propietaria | Estado real | Evidencia / qué falta |
|---|---|---|---|
| 1 | #56: retirar la foto incorrecta (es la de #110) | **PENDIENTE: acción de la propietaria** | Desde Admin › ficha #56 › «Quitar imagen», sin borrar el archivo. No se tocó |
| 2 | #59 Suprliner → Ojos › Delineado | **DECIDIDO; NO APLICADO (bloqueo)** | Ver «Detalle de los puntos 2 a 4» debajo de esta tabla |
| 3 | #103 VIBE Love-Blend Kit → Accesorios › Esponjas | **DECIDIDO; NO APLICADO (bloqueo)** | En la taxonomía vigente, «Esponjas» existe solo en Accesorios › **Herramientas de aplicación** › Esponjas (sin ambigüedad) |
| 4 | #119 Polvo Ácido Hialurónico → Rostro › Polvo y fijador | **DECIDIDO; NO APLICADO (bloqueo)** | Igual que el 2 |
| 5 | #106 Set Perfect Lips: despublicado intencionalmente | **CERRADO** | Sigue `published=false` (comprobado el 2026-10-28). No se restauró nada |
| 6 | Imagen para compartir, propuesta A: aprobada | **PUBLICADA EN EL CÓDIGO** | Ver «Detalle del punto 6» debajo de esta tabla |
| 7 | Migraciones 0004 y 0005: aplicación manual autorizada | ~~**AUTORIZADAS; NO APLICADAS (bloqueo)**~~ → **APLICADAS** (2026-10-28) | §18 |
| 8 | Verificar `ORDERS_NOTIFICATION_EMAIL` en Vercel Production | **NO VERIFICABLE desde esta sesión** | Ver «Detalle del punto 8» debajo de esta tabla |
| 9 | WhatsApp | **APLAZADO** por la propietaria (sin acceso a Meta Business) | Variables `WHATSAPP_*` sin cambios; pasos en §16.3. No se considera operativo |
| 10 | Tonos y presentaciones | **APLAZADO**: la propietaria los cargará desde el Admin | Guía en §14.2 y §16.4 |
| 11 | Información legal y comercial | **PENDIENTE: datos de la propietaria** | Lista en §16.2. La columna «Legal» sigue oculta |

**Detalle de los puntos 2 a 4 (clasificaciones de #59, #103 y #119):**
- **Mecanismo:** el del Admin, `PATCH /api/admin/catalog-metadata`, que valida contra la taxonomía y solo escribe `category`/`subcategory`. Si falta la fila, la crea con `published=false`.
- **Bloqueo:** el sitio publicado respondió **401** con el `ADMIN_API_TOKEN` local, que no es el de producción. No se escribió por otra vía.
- **Comprobaciones previas:**
  - identidad en el POS: 59 = Suprliner, 103 = VIBE Love-Blend Kit, 119 = Polvo Ácido Hialuronico;
  - los tres sin ficha;
  - los destinos existen en la taxonomía vigente.
- **Qué falta:** la propietaria lo hace desde Admin › Productos › ficha › Clasificación.

**Detalle del punto 6 (imagen para compartir):**
- **Archivo:** `assets/brand/social/vibe-og-1200x630.png`, igual sha256 que el aprobado (`9387cd69…`), PNG de 1200×630.
- **Etiquetas:** `og:image`, `og:image:type`, `og:image:width` y `og:image:height` (1200×630), `og:image:alt`, `twitter:card=summary_large_image`, `twitter:image` y `twitter:image:alt`.
- **Prueba:** nueva prueba en `test-storefront-fase56.mjs` (22/22), que comprueba que las dimensiones declaradas coinciden con el archivo.
- **Verificación en producción:** se informa tras el despliegue.

**Detalle del punto 7 (migraciones 0004 y 0005):**
- **Estado confirmado:** sin aplicar en el proyecto de producción (el mismo que usa el sitio publicado). Las columnas responden `42703`.
- **Bloqueo:** no hay un mecanismo SQL autorizado disponible en esta sesión.
  - el token de gestión de Supabase responde 401;
  - no hay cadena de conexión a la base;
  - no hay `psql` ni CLI de Supabase.
- **Qué falta:** aplicarlas a mano en el SQL Editor siguiendo la §15.3, en orden 0004 → 0005, con la consulta de verificación. Los riesgos de §15.3 siguen vigentes mientras no se apliquen. *(Aplicadas el 2026-10-28; ver §18.)*

**Detalle del punto 8 (`ORDERS_NOTIFICATION_EMAIL`):**
- **Por qué no se pudo verificar:** no hay CLI de Vercel ni token de su API para listar variables, y `.env.local` no la contiene.
- **Qué falta:** la propietaria confirma en Vercel › `vibe-catalog` › Settings › Environment Variables › Production que exista.
- No se cambió ningún destinatario.

## 18. Migraciones 0004 y 0005 aplicadas (2026-10-28)

| ID | Estado | Evidencia |
|---|---|---|
| MIG-0004 (`supabase/manual/0004_orders_internal_notification.sql`) | **APLICADA en producción** | Ver «Evidencia» debajo de esta tabla |
| MIG-0005 (`supabase/manual/0005_orders_idempotency_key.sql`) | **APLICADA en producción** | Igual |

**Evidencia:**
- **Quién las aplicó:** la propietaria, a mano, en el proyecto Supabase de producción, el 2026-10-28.
- **Consulta de verificación (§15.3)** sobre `information_schema.columns`: devolvió las 4 columnas esperadas en `public.orders`.

  | Columna | Tipo |
  |---|---|
  | `idempotency_key` | `text` |
  | `internal_notification_at` | `timestamp with time zone` |
  | `internal_notification_error` | `text` |
  | `internal_notification_status` | `text` |

- **Comprobación de esta sesión (solo lectura):** `GET` con `limit=0` sobre esas 4 columnas en el mismo proyecto que usa el sitio publicado. Respondió **200** (antes, `42703`). No se leyeron filas.
- **Archivos:** `supabase/manual/` sin cambios.

**Qué cambia:**
- **No hay que desplegar nada:** el código ya publicado detecta las columnas y las usa desde el siguiente pedido.
- **Idempotencia de servidor (ORD-03):** la clave del intento se guarda y se consulta, y la base impide duplicados.
- **Aviso interno (NOT-01):** se guarda el estado del aviso interno a VIBE (aceptado, fallido o no configurado). El Admin muestra el seguimiento y permite el reintento manual.
- **Riesgos de §15.3:** ya no aplican.

**Qué NO está verificado:**
- **Sin pedidos de prueba:** no se ha creado ningún pedido real ni de prueba tras aplicar las migraciones.
- **Flujos sin comprobar en producción:** la idempotencia y el estado del aviso interno no se han comprobado de extremo a extremo en producción. Solo están verificados en local (§7 y §8) y por el esquema.
- **Entrega del aviso interno:** sigue dependiendo de `ORDERS_NOTIFICATION_EMAIL` (§17, punto 8, no verificada) y de Resend.
- **Primer pedido real:** conviene revisar en Admin › Pedidos que muestre el estado del aviso interno.

**Pendientes vigentes** (§17, sin el punto 7):
1. #56: quitar la foto desde el Admin.
2. Clasificar #59, #103 y #119 desde el Admin.
3. Confirmar `ORDERS_NOTIFICATION_EMAIL` en Vercel.
4. Información legal y comercial. *(Implementada en parte el 2026-10-28; lo que falta está en §19.3.)*
5. Aplazados: WhatsApp y tonos/presentaciones.

## 19. Textos comerciales y legales (2026-10-28)

**Fuente:** datos confirmados por la propietaria.
- **Identidad:** VIBE · Vibrant Iconic Beauty Essentials.
- **Ubicación comercial:** Chía, Cundinamarca, Colombia.
- **Contacto:** WhatsApp 314 349 0825, `vibeeproject2026@gmail.com` e Instagram `@beautyvibe.col`.
- **Horario:** lunes a domingo, de 8:00 a. m. a 10:00 p. m.
- **Envíos:** a Colombia; costo y condiciones según destino, confirmados antes de cerrar el pedido.
- **Pagos:** transferencia bancaria, Nequi, PSE, Bre-B y tarjeta de crédito.
- **Garantía, retracto y reversión:** solo los derechos legales, sin política voluntaria de cambios.

**Reservado por la propietaria:** su nombre legal, número de identificación y dirección particular. **No se publican** en la web, el SEO, los metadatos ni las páginas.

### 19.1 Implementación

| ID | Qué | Estado |
|---|---|---|
| LEG-01 | Fuente única de los textos: `js/legal.js` (identidad, contacto y 4 políticas) | IMPLEMENTADO Y VERIFICADO (local) |
| LEG-02 | Página `legal.html` | IMPLEMENTADO Y VERIFICADO (local); ver «Detalle de LEG-02» |
| LEG-03 | Pie de la portada: columna «Legal» con un enlace por política; Contacto con horario y ubicación | IMPLEMENTADO Y VERIFICADO (local) |
| LEG-04 | FAQ «¿Hacen envíos y cómo puedo pagar?» con cobertura, costo según destino y medios confirmados. Antes: «¿Cuánto cuesta el envío, cuánto tarda y cómo pago?»; se quitó «cuánto tarda» porque no hay plazos confirmados | IMPLEMENTADO Y VERIFICADO (local) |
| LEG-05 | Checkout: la casilla autoriza el **tratamiento de datos** y el contacto por WhatsApp, y enlaza la política (pestaña nueva) | IMPLEMENTADO Y VERIFICADO (local); ver «Detalle de LEG-05» |
| LEG-06 | Publicación | Ver §19.2 |

**Detalle de LEG-02 (`legal.html`):**
- **Secciones:** envíos, medios de pago, garantía/retracto/reversión del pago, tratamiento de datos personales y contacto, con la fecha «Vigente desde el 28 de octubre de 2026».
- **Contenido estático:** se genera con `scripts/build-legal.mjs`, así que se lee sin JavaScript.
- **Diseño:** el mismo encabezado y la misma sección clara de la FAQ.
- **Metadatos:** canonical `https://www.vibebeautycol.com/legal.html`.

**Detalle de LEG-05 (casilla del checkout):**
- **Mensaje de error:** «Autoriza el tratamiento de tus datos y el contacto para poder enviar tu pedido.»
- **Pedidos anteriores al 2026-10-28:** se registraron con la casilla anterior, que solo autorizaba el contacto por WhatsApp.

**Contenido de las políticas (sin políticas voluntarias ni plazos inventados):**
- **Envíos y pagos:** solo los datos confirmados. No hay tarifas ni tiempos de entrega, porque no están confirmados.
- **Garantía, retracto y reversión del pago:**
  - garantía legal con sus excepciones del art. 16;
  - retracto del art. 47 (5 días hábiles, devolución a cargo del consumidor, reintegro en 30 días). Menciona que **la ley prevé excepciones, entre ellas los bienes de uso personal**, sin afirmar que los cosméticos quedan excluidos;
  - reversión del pago del art. 51;
  - acudir a la SIC.
  - Afirma expresamente que abrir un cosmético no elimina por sí solo la garantía legal frente a defectos.
- **Datos personales:**
  - responsable descrito como marca comercial;
  - canal de contacto por correo y teléfono/WhatsApp;
  - datos y finalidades del flujo real del sitio;
  - autorización con la casilla;
  - proveedores tecnológicos sin nombrarlos;
  - derechos del art. 8 de la Ley 1581;
  - plazos de **ley** para consultas (10 días hábiles) y reclamos (15).
  - No se afirma cumplimiento integral.

**Pruebas:**
- `test-legal-structure.mjs` (13/13). Exige los datos confirmados, que no aparezcan nombre legal, NIT, C.C., razón social, tipo societario ni dirección física, que no se afirme cumplimiento integral ni plazos de conservación, y que `legal.html` esté sincronizada con `js/legal.js`.
- `test-footer-faq-markup.js` (18/18). Ahora acepta solo los medios de pago confirmados y sigue bloqueando costos, tiempos, contraentrega, Daviplata y efectivo.
- `test-checkout.mjs` (26/26) y `test-storefront-fase56.mjs` (22/22).
- **Navegador local** (`legalcheck.js`, a 390 y 1440):
  - página sin desborde y anclas correctas;
  - columna «Legal» y horario/ubicación en el pie;
  - enlace de la casilla y casilla funcional.
- **Navegador local, checkout:** `store56b.js`, 25/25.

### 19.2 Publicación

Ver el historial y el informe de esta fase: commit, despliegue en Vercel y verificación en producción.

### 19.3 Requisitos legales que dependen de datos reservados (PENDIENTE, sin ocultar)

| Requisito | Qué exige | Qué falta | Alternativa que protege la privacidad |
|---|---|---|---|
| Ley 1480 de 2011, art. 50 (comercio electrónico): identificación del proveedor | Informar nombre o razón social, identificación (NIT), dirección de notificación judicial, teléfono y correo | Nombre o razón social, NIT y dirección de notificación (la propietaria no autoriza publicar los suyos) | Ver «Alternativas para el art. 50» debajo de esta tabla |
| Ley 1581 de 2012 y su decreto reglamentario (Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015): contenido de la política de tratamiento | Nombre o razón social, domicilio, dirección, correo y teléfono del responsable; fecha de vigencia de la política **y período de vigencia de la base de datos** | Nombre o razón social y dirección del responsable; período de vigencia de la base y plazos de conservación (no confirmados, no se inventaron) | La misma figura del art. 50 resuelve la identificación. La propietaria debe definir cuánto tiempo se conservan los datos de pedidos |

**Alternativas para el art. 50:**
1. **Constituir una sociedad (por ejemplo una S.A.S.):** tiene nombre y NIT propios y una dirección comercial distinta de la particular, así que separa por completo los datos personales.
2. **Registrarse como persona natural comerciante con una dirección comercial de notificación** (oficina virtual o coworking) en lugar de la particular. En este caso el NIT de una persona natural es su cédula: no protege el número de identificación.

**Recomendación:**
- validar con un abogado o contador la figura y la redacción final antes de considerar completa esta sección;
- mientras tanto, el sitio publica solo lo confirmado y no presenta VIBE como sociedad ni afirma cumplimiento integral.

## 20. Label superior: pieza gráfica aprobada (2026-11-20)

**Decisión de la propietaria:** la imagen panorámica que entregó es el diseño final del label entre el Hero y «Descubre tu VIBE». Se usa completa, tal cual, sin reconstruirla con HTML ni CSS. **Reemplaza** a la franja de texto de las Fases 47/48 (CAT y franja editorial).

| ID | Qué | Estado |
|---|---|---|
| LBL-01 | Recorte solo de los márgenes blancos superior e inferior (filas 244–598 del original de 2172×724) a ancho completo. Se conservan los bordes laterales, los bloques, el conejito, las hojas, las burbujas (incluida la que sobresale por debajo), todas las palabras y el brillo inferior hasta fundirse con el fondo | IMPLEMENTADO Y VERIFICADO |
| LBL-02 | Recursos en `assets/brand/label/` | IMPLEMENTADO Y VERIFICADO; ver «Detalle de LBL-02» |
| LBL-03 | Comportamiento por tamaño | IMPLEMENTADO Y VERIFICADO; ver «Detalle de LBL-03» |
| LBL-04 | Sin texto ni elementos encima de la imagen | IMPLEMENTADO Y VERIFICADO; ver «Detalle de LBL-04» |
| LBL-05 | Afirmaciones «Cruelty free» y «Vegan beauty» | **CONFIRMADAS POR LA PROPIETARIA**; ver «Detalle de LBL-05» |

**Detalle de LBL-02 (recursos):**
- **Imagen principal:** `vibe-label.avif` (AVIF 4:4:4 q80, 80 KB; SSIM 0,9946 y ΔE medio 1,0 frente al recorte).
- **Respaldo:** `vibe-label.webp` (q94, 143 KB; SSIM 0,9916).
- **Original intacto:** `original/vibe-label-aprobado-original.png` (sha256 `eb9608b6…`).

**Detalle de LBL-03 (comportamiento por tamaño):**
- ~~**Escritorio y tablet (≥ 641 px):** a todo el ancho, con la proporción original (6,136) y estática.~~
- ~~**Mobile:** la composición completa a 150 px de alto (a todo el ancho sería ilegible), desplazándose como una sola pieza (40 s por vuelta, sin separar paneles). Se pausa al pasar el cursor o tocar.~~
- ~~**`prefers-reduced-motion`:** quieta y recorrible a mano.~~

*(Reemplazado el 2026-11-20 por LBL-06, a pedido de la propietaria: franja más compacta y en movimiento también en escritorio y tablet.)*

| ID | Qué | Estado |
|---|---|---|
| LBL-06 | Franja compacta con desplazamiento continuo de derecha a izquierda en **todos** los tamaños; imagen, recorte y diseño sin cambios | ~~IMPLEMENTADO Y VERIFICADO (local; sin commit ni despliegue, a pedido de la propietaria)~~ → **PUBLICADO Y VERIFICADO EN PRODUCCIÓN** (`fce3af7`, 2026-11-20): alto 112/96/128 px y 26,5/24,6/21,8 px/s medidos en www.vibebeautycol.com; continuidad, pausa y movimiento reducido comprobados |

**Detalle de LBL-06:**
- **Técnica:**
  - el carril lleva la pieza 7 veces (la principal más 6 copias `aria-hidden`, con el mismo archivo y una sola descarga), lo que cubre pantallas de hasta ~4100 px;
  - avanza exactamente el ancho de **una** pieza por ciclo, en bucle infinito;
  - el ancho de la pieza es un número **entero** de píxeles y el alto sale de la proporción 2172×354, así que no se deforma y no hay medio píxel que salte al reiniciar.
- **Medidas:**

  | Tamaño | Ancho de pieza | Alto (antes) | Duración por pieza | Velocidad |
  |---|---|---|---|---|
  | Escritorio (> 900 px) | 687 px | ≈112 px, franja visible ≈77 px (antes 235 px, estática a 1440) | 26 s | ≈26 px/s |
  | Tablet (641–900 px) | 589 px | ≈96 px (antes 125 px a 768, estática) | 24 s | ≈25 px/s |
  | Mobile (≤ 640 px) | 785 px | ≈128 px (antes 150 px) | 36 s | ≈22 px/s (antes ≈23) |

- **Pausa:** al pasar el cursor o tocar.
- **`prefers-reduced-motion`:**
  - quieta;
  - en tablet y escritorio, la fila de repeticiones llena el ancho;
  - en mobile se ve una sola pieza y se recorre a mano.
- **Verificación en navegador local** (`labelshots2.js`) a 390, 768 y 1440, y también 390 y 1440 con movimiento reducido:
  - alto esperado y proporción 6,136;
  - repeticiones pegadas (0 px de hueco) y cobertura del ancho incluso al final del ciclo;
  - avance por ciclo = ancho de una pieza (785, 589 y 687 px);
  - inicio y final del ciclo iguales (diferencia media ≤ 0,69/255);
  - una sola descarga de la imagen, sin desplazamiento horizontal de la página y sin errores.
- **Capturas:** `Catalogo VIBE/entregables-label/ajuste-compacto/`.

**Diagnóstico del 2026-11-20 («el label sigue igual»):**
- **Causa:** LBL-06 está **solo en el repositorio local, sin commit ni despliegue** (por instrucción de la propietaria). www.vibebeautycol.com sigue en `2b7a4c6`.
- **Medición en Chromium, sin manipular la animación, con la misma prueba contra el sitio publicado:**
  - 1440: 234,7 px, sin animación, 0 px de desplazamiento;
  - 768: 125,2 px, sin animación, 0 px;
  - 390: 150 px, con movimiento.

  Es exactamente lo que observó la propietaria.
- **Misma medición en local:** el HTML y el CSS cargados son los nuevos (7 piezas y ninguna regla antigua activa), y la animación está `running`, sin movimiento reducido ni cursor encima.

  | Tamaño | Alto real | Ancho de la imagen | Desplazamiento real en 4,1 s |
  |---|---|---|---|
  | 1440 | 111,97 px | 687 px | 108 px (26,5 px/s) |
  | 768 | 95,98 px | 589 px | 100,6 px (24,6 px/s) |
  | 390 | 127,94 px | 785 px | 88,7 px (21,8 px/s) |

- **Equipo de trabajo:** los efectos de animación de Windows están activados, así que `prefers-reduced-motion` no detiene el label aquí. En un equipo con esos efectos desactivados, el label queda quieto por accesibilidad.
- **Evidencia:** `Catalogo VIBE/entregables-label/diagnostico-local/` (dos instantes por tamaño, GIF con 12 capturas reales y `mediciones.json`) y `diagnostico-produccion/`.
- **Código:** sin cambios en este diagnóstico.

**Detalle de LBL-04 (accesibilidad):** el texto alternativo reproduce los mensajes de la imagen, y la copia del bucle es `aria-hidden`.

**Detalle de LBL-05 (afirmaciones del label):**
- **Antecedente:** la franja de las Fases 47/48 evitaba certificaciones a nivel de marca por falta de evidencia verificable; había una prueba que lo exigía.
- **Confirmación:** el 2026-11-20 la propietaria confirmó expresamente que **los fabricantes de los productos específicos incluidos en el catálogo VIBE declaran que esos productos son Cruelty Free y Vegan**, y autorizó conservar ambas afirmaciones.
- **Consecuencias:**
  - la prueba se reemplazó por una que exige usar la pieza aprobada sin agregar nada;
  - la vigencia de las afirmaciones depende de que **cada producto que se incorpore al catálogo** cuente con esa misma declaración de su fabricante;
  - **se recomienda conservar los soportes** (fichas o declaraciones de los fabricantes) por si la SIC o un consumidor los solicitan.

**Pruebas:** `test-fase47-markup.js`, con 5 pruebas nuevas del label, y la suite completa, con 976 aprobadas y 0 fallidas, en local.

**Corrección asociada:** `test-hero-mobile-frame.js` fallaba desde `8f10f79`. Tomaba el primer bloque `@media(min-width:901px)`, que pasó a ser una regla de una línea del pie. Ahora busca el bloque del Hero; la comprobación no se debilita.

## 21. Redes sociales: Instagram y TikTok (2026-11-20)

**Decisión de la propietaria:** dos botones gráficos independientes, Instagram y TikTok, en el lugar del botón anterior «Seguir en Instagram →». Diseño revisado y aprobado en local. Se agrega también TikTok en el pie, junto a Instagram.

**Perfiles oficiales confirmados por la propietaria** (no se inventaron ni se modificaron):
- Instagram: `https://www.instagram.com/beautyvibe.col/`
- TikTok: `https://www.tiktok.com/@beautyvibe.col?is_from_webapp=1&sender_device=pc`

| ID | Qué | Estado |
|---|---|---|
| RED-01 | Bloque «VIBE EN REDES» (`#instagram`): se conservan el título y `@beautyvibe.col`, con dos tarjetas | IMPLEMENTADO Y VERIFICADO; ver «Detalle de RED-01» |
| RED-02 | Comportamiento: elevación y brillo al pasar el cursor, foco visible y responsive | IMPLEMENTADO Y VERIFICADO; ver «Detalle de RED-02» |
| RED-03 | Pie, columna «Explora»: se conserva Instagram y se agrega TikTok a continuación | IMPLEMENTADO Y VERIFICADO; ver «Detalle de RED-03» |
| RED-04 | Publicación | Ver historial e informe: commit, despliegue y verificación en producción |

**Detalle de RED-01 (las dos tarjetas):**
- **Instagram:** logo SVG sobre el degradado oficial, «SÍGUENOS» en fucsia VIBE y «Instagram».
- **TikTok:** logo SVG en negro con acentos turquesa y rosa, «SÍGUENOS» en turquesa y «TikTok».
- **Enlaces:** cada uno abre una pestaña nueva con `rel="noopener noreferrer"` y tiene una etiqueta accesible («Seguir a VIBE en … (se abre en una pestaña nueva)»).
- **Logos:** `aria-hidden`, sin emojis ni imágenes externas.

**Detalle de RED-02 (comportamiento):**
- **Hover:** elevación de 3 px y brillo en el color de cada red. Sin transición ni elevación con `prefers-reduced-motion`.
- **Foco:** contorno fucsia de 2 px.
- **Escritorio y tablet:** 236×74 px cada tarjeta.
- **Mobile:** lado a lado, 176×64 px, sin flecha.

**Detalle de RED-03 (pie de página):**
- Los dos enlaces llevan un icono monocromo de 16 px, del color del enlace. El de TikTok reutiliza el trazo `#tiktokGlyph`.
- El texto y el destino de Instagram no cambian, y tampoco el resto del pie.

**Pruebas:**
- `scripts/test-social-buttons.js` (7). Cubre destinos exactos, pestaña nueva, protección, etiquetas, SVG, estilos, el mobile, movimiento reducido y el pie.
- **Navegador local** (`socialcheck.js`) a 1440, 768 y 390:
  - visibilidad sin desbordes ni scroll horizontal;
  - logos 1:1;
  - clic o toque real que abre la pestaña nueva en el destino exacto, sin `window.opener`;
  - hover y foco de teclado, también en el pie.
- **Perfiles reales:** ambos responden 200.

## 22. Precio independiente por variante (2026-11-20)

**Decisión de la propietaria:** cada variante (tono o presentación) de un mismo producto puede tener un precio propio, sin crear productos separados. El precio general del producto sigue existiendo y es el predeterminado.

Se extiende el sistema de variantes existente (Fase 57, §4). No hay un segundo sistema.

| ID | Qué | Estado |
|---|---|---|
| VPR-01 | Precio propio **opcional** por opción. Vacío = usa el precio general. Cero, negativo, decimal o texto nunca valen como precio, en particular nunca «gratis» | IMPLEMENTADO Y VERIFICADO (local) |
| VPR-02 | Regla de precio de una combinación | IMPLEMENTADO Y VERIFICADO (local); ver «Detalle de VPR-02» |
| VPR-03 | Admin | IMPLEMENTADO Y VERIFICADO (local); ver «Detalle de VPR-03» |
| VPR-04 | Catálogo | IMPLEMENTADO Y VERIFICADO (local); ver «Detalle de VPR-04» |
| VPR-05 | Carrito y checkout | IMPLEMENTADO Y VERIFICADO (local); ver «Detalle de VPR-05» |
| VPR-06 | Pedido | IMPLEMENTADO Y VERIFICADO (local); ver «Detalle de VPR-06» |
| VPR-07 | Seguridad | IMPLEMENTADO Y VERIFICADO (local); ver «Detalle de VPR-07» |
| VPR-08 | Compatibilidad | VERIFICADO (local); ver «Detalle de VPR-08» |
| VPR-09 | Promoción del POS sobre el precio de la variante (ajuste final, 2026-11-20) | PUBLICADO Y VERIFICADO EN PRODUCCIÓN (`3ee2f47`); ver §22.1 y §22.3 |
| VPR-10 | Datos de auditoría y conciliación por línea de pedido (ajuste final, 2026-11-20) | PUBLICADO (`3ee2f47`); escritura real verificada solo con base simulada, ver §22.3 |

**Detalle de VPR-02 (regla de precio):**
- **Orden:** el precio propio de la **presentación** elegida; si no tiene, el del **tono**; si ninguno, el **precio general** del POS. Ese es el **precio base** de la línea. Es la misma regla en `js/variants.js` (`optionPriceInfo`) y en `api/_lib/variants.js` (`optionPrice` y `linePrice`).
- **Promociones:** ~~un precio propio no recibe la promoción del POS.~~ *(Reemplazado el 2026-11-20 por decisión de la propietaria: la promoción vigente del POS se aplica también sobre el precio propio. Ver §22.1.)*

**Detalle de VPR-03 (Admin):**
- **Campo:** «Precio propio» en cada tono y presentación.
- **Estado visible:** «Precio propio: $X» o «Usa el precio general ($X)», actualizado al escribir.
- **Edición:** cada opción se edita sin tocar las demás.
- **Validación antes de guardar:** si un precio no es válido, el formulario no se envía y nombra la opción. El servidor también responde 400 (`invalidOptionPrices`).
- **Pedidos:** detalle de líneas en la tabla de Pedidos («Ver productos») con variante, cantidad × precio unitario, subtotal y la marca «precio de la variante». *(Ampliado el 2026-11-20: ver §22.2.)*

**Detalle de VPR-04 (catálogo):**
- **Ficha:** muestra «Desde $mín» mientras falte elegir y los precios varíen. Al elegir una opción, el precio cambia **al instante**, sin recargar.
- **Opciones:** las que tienen precio propio lo muestran en la etiqueta, el nombre accesible y el chip de presentación.
- **Tarjeta:** «Desde $mín» si alguna opción activa tiene precio propio.
- **Sin precios propios:** los productos se ven exactamente como antes.

**Detalle de VPR-05 (carrito y checkout):**
- **Carrito:** cada combinación es una línea con su precio unitario. Cambiar la cantidad no altera el unitario.
- **Sincronización:** el carrito se actualiza al precio vigente de **esa** variante (`syncCartWithCatalog`).
- **Checkout:** el resumen muestra el precio de cada variante, y el total esperado viaja al servidor.

**Detalle de VPR-06 (pedido):** cada línea guarda una copia de:
- `productId`, `name`, `variantName`, `shadeId` y `presentationId`;
- `price` (el unitario aplicado) y `priceSource` (~~`variant` o `product`~~ desde el 2026-11-20: `presentation`, `shade` o `product`; ver §22.2);
- `quantity` y `lineSubtotal`.

Cambiar después un precio no altera los pedidos registrados.

**Detalle de VPR-07 (seguridad):**
- **El navegador no envía precios:** solo ids y cantidad.
- **El servidor calcula el precio:** lo toma de la ficha publicada y del POS, e ignora cualquier precio, subtotal o nombre del request.
- **Total desactualizado o manipulado:** si el total esperado no coincide, responde 409 `PRICE_CHANGED` con el precio real de cada variante, sin registrar nada.

**Detalle de VPR-08 (compatibilidad):**
- **Fichas sin precios:** se leen y se guardan igual, sin clave `price`.
- **Pedidos y carritos anteriores:** siguen funcionando. Los pedidos históricos, sin `priceSource`, se muestran normalmente.

**Base de datos:**
- **Sin migración.** El precio propio se guarda como campo opcional `price` de cada opción, dentro del JSON de `catalog_metadata.additional_info`: la misma columna donde ya viven tonos y presentaciones.
- **Pedidos:** `orders.items` ya guarda una copia por línea. Solo se agrega `priceSource` dentro de ese JSON.
- **Producción:** no se modificó ningún dato. No se asignaron precios a variantes existentes.

**Implicación para el POS (a conocer):**
- **Qué guarda cada sistema:** el POS no tiene precio por variante. Una variante con precio propio se vende en el catálogo a ese precio, pero el POS solo conoce el precio general del producto.
- **Qué cuidar:** una venta registrada directamente en el POS, o una conciliación contra el POS, debe tener en cuenta el precio de la variante.

**Pruebas:**
- `scripts/test-variant-prices.mjs` (25) cubre los 12 escenarios pedidos más la precedencia, la promoción, la validación del Admin (ejecutando su función real) y la compatibilidad.
- `test-variants-fase57.mjs` se actualizó porque la validación del servidor ahora devuelve `optionPrice`.
- **Suite completa:** 48 scripts, **1008 aprobadas, 0 fallidas**.
- **Navegador real, en local con API simulada y pedido interceptado:**
  - tienda a 1440 y 390 (tarjetas, ficha, cambio de tono y presentación, carrito, cantidades, checkout y pedido enviado);
  - Admin (formulario, edición, precio no válido, guardado y detalle de pedidos).
  - Capturas en `Catalogo VIBE/entregables-precio-variante/`.

**Error encontrado y corregido durante la verificación:** la validación del formulario del Admin rechazaba todos los precios (expresión regular sin `\d`). La detectó la prueba en navegador, se corrigió y ahora la cubre una prueba que ejecuta la función real.

**Estado:** implementado y verificado en local. **Sin commit, push ni despliegue** (a pedido de la propietaria).

### 22.1 Promoción del POS sobre el precio de la variante (VPR-09, 2026-11-20)

**Decisión de la propietaria:** si una variante tiene precio propio, la promoción vigente del producto se aplica sobre ese precio.

**Cómo es la promoción en el POS (sin cambios):** un **precio promocional fijo por producto** (`promo_price`), activado con `promo_active` y limitado por `promo_start` y `promo_end`. La vigencia y la elegibilidad se siguen resolviendo con la función existente (`resolvePromoActive` en `api/catalog/_lib/merge.js`), sin cambios. No se creó un sistema de promociones paralelo y el POS no se tocó.

**Regla, idéntica en navegador y servidor:**
- **Base:** precio de la presentación → si no, precio del tono → si no, precio general (VPR-02).
- **Sin precio propio:** se cobra el precio promocional del POS, exactamente como antes.
- **Con precio propio:** se aplica la **misma proporción de descuento** del POS: `final = redondear(base × promo_price ÷ price)`.
- **Redondeo:** al peso entero más cercano (0,5 sube). El POS no define un redondeo para precios derivados, porque no tiene precios por variante; esta es la regla adoptada y documentada.
- **Una sola vez:** siempre se calcula desde la base, nunca sobre un precio ya rebajado. Sincronizar el carrito o reenviar el precio rebajado no vuelve a descontar.
- **No aplica:** promoción inactiva, vencida, aún no iniciada o sin precio promocional. Un precio promocional igual o mayor al general tampoco rebaja un precio propio.
- **Dónde:** `ownPriceWithPromo` y `optionPriceInfo` en `js/variants.js`; `linePrice` en `api/_lib/variants.js`. La tarjeta («Desde»), la ficha (precio final, base tachada, −%, texto de la promoción), la etiqueta de cada opción, el carrito y el checkout muestran el precio que se cobra.

**Ejemplos (cifras de prueba, no de productos reales):**

| Caso | Precio general | Promoción POS | Base | Origen | Final | Descuento c/u |
|---|---|---|---|---|---|---|
| Rubor · Coral | 35.000 | 31.500 (−10 %) | 38.000 | tono | **34.200** | 3.800 |
| Rubor · Terracota | 35.000 | 31.500 | 37.000 | tono | **33.300** | 3.700 |
| Rubor · Rosa (sin precio propio) | 35.000 | 31.500 | 35.000 | general | **31.500** | 3.500 |
| Coral + Grande | 35.000 | 31.500 | 45.000 | presentación | **40.500** | 4.500 |
| Coral + Mini (sin precio) | 35.000 | 31.500 | 38.000 | tono | **34.200** | 3.800 |
| Precio fijo del POS | 30.000 | 25.000 | 36.000 | tono | **30.000** | 6.000 |
| Redondeo hacia abajo | 30.000 | 25.000 | 37.000 | tono | **30.833** (30.833,33) | 6.167 |
| Redondeo hacia arriba | 30.000 | 25.000 | 38.000 | tono | **31.667** (31.666,67) | 6.333 |
| Promoción vencida | 35.000 | 31.500, vencida | 38.000 | tono | **38.000** | 0 |

Total de ejemplo: 2 × Coral (34.200) + 1 × Polvo Grande (40.500) = **108.900**.

**Limitación del POS (a conocer):**
- **Tipos de promoción:** el POS solo maneja un precio promocional fijo por producto. No tiene promociones porcentuales ni de «monto de descuento» como tipos propios. El «−10 %» es la proporción entre el precio promocional y el general.
- **Promoción de valor fijo:** se interpreta como lo que el POS ofrece, un precio promocional fijo del producto. Sobre un precio propio se traduce a su misma proporción. Si en el futuro el POS agrega un tipo «restar $X», habrá que decidir si se resta igual a cada variante.
- **Precios por variante:** el POS no los conoce. Una venta hecha directamente en el POS cobra el precio general o el promocional del producto, no el de la variante.

### 22.2 Auditoría y conciliación por línea de pedido (VPR-10, 2026-11-20)

Cada línea de `orders.items` guarda, calculado por el servidor:

| Campo | Contenido |
|---|---|
| `productId`, `name` | Producto del POS |
| `variantId`, `variantName`, `shadeId`, `shadeName`, `presentationId`, `presentationName` | Variante, desde la ficha publicada |
| `basePrice` | Precio base de la variante, antes de la promoción |
| `priceSource` | Origen del precio base: `presentation`, `shade` o `product` (precio general) |
| `promoApplied` | `true` si se aplicó la promoción del POS |
| `promoText` | Texto de la promoción del POS, o `null` |
| `promoProductPrice`, `promoProductPromoPrice` | Precio general y promocional del POS con los que se calculó. Es la referencia para conciliar; `null` sin promoción |
| `discount` | Descuento por unidad (`basePrice − price`) |
| `price` | Precio unitario final cobrado |
| `quantity`, `lineSubtotal` | Cantidad y subtotal (`price × quantity`) |

**Garantías:**
- **Seguridad:** el navegador solo envía ids, opciones y cantidad. Base, elegibilidad, descuento, precio final, subtotal y total los calcula el servidor. Cualquier precio, descuento u origen enviado en la línea se ignora. Si el total esperado no coincide, responde 409 `PRICE_CHANGED` y no registra nada.
- **Pedidos históricos:** no se recalculan nunca. Después de registrar un pedido solo se actualizan las marcas de aviso, nunca `items` ni `total`. Los pedidos anteriores a este ajuste, sin `basePrice`, se muestran en el Admin como siempre.
- **Cambios posteriores:** cambiar después el precio del producto, de la variante o la promoción no altera pedidos ya registrados.
- **Admin, detalle del pedido:** por línea muestra variante, base y origen, promoción y descuento por unidad, unitario final, cantidad y subtotal.

**Para conciliar con el POS:**
- **Qué comparar:** cada línea trae el unitario realmente cobrado (`price`) y la variante. Las cuentas cuadran por construcción: `basePrice − discount = price` y `price × quantity = lineSubtotal`.
- **Promoción vigente:** `promoProductPrice` y `promoProductPromoPrice` muestran qué promoción del POS estaba vigente al registrar el pedido.
- **Diferencias esperadas:** una línea con `priceSource` `shade` o `presentation` tendrá un precio distinto al que el POS tiene para el producto. Es esperado: el POS no maneja precios por variante.
- **Sin integración nueva:** no se creó ninguna integración con el POS ni se alteró su proceso de registro.

**Base de datos:** **sin migración.** Los campos nuevos viven dentro del JSON de `orders.items`, una columna que ya existe. No se ejecutó nada en producción.

**Pruebas:**
- **`scripts/test-variant-prices.mjs`:** 42 pruebas, entre ellas P1–P17:
  - promoción porcentual sobre precio propio;
  - precio fijo del POS;
  - precio general heredado con promoción;
  - precedencia de la presentación y caída al tono;
  - producto sin precio propio;
  - promoción vencida, aún no iniciada y no elegible;
  - sin doble descuento;
  - redondeo y totales;
  - carrito y checkout;
  - campos guardados;
  - cambios posteriores de precio y de promoción;
  - conciliación;
  - manipulación;
  - pedidos históricos.
- **Pruebas anteriores reemplazadas:** la que afirmaba que un precio propio no recibe la promoción y la de VPR-06 (`priceSource: "variant"`) se reemplazaron por la regla vigente.
- **Mutaciones de control:** cuatro errores introducidos a propósito, todos detectados:
  - el servidor no aplica la promoción;
  - el cliente aplica el descuento dos veces;
  - el servidor redondea hacia abajo;
  - el servidor no guarda la base.
- **Suite completa:** 48 scripts, **1025 aprobadas, 0 fallidas**.
- **Navegador real, en local con API simulada y pedido interceptado:**
  - tienda con promoción a 1440 y 390;
  - el cuerpo que envió el navegador, procesado por el handler real del servidor con base de datos simulada: mismas cifras;
  - tienda sin promoción (regresión);
  - Admin.
  - Capturas `*-promo-*` y `admin-detalle-pedido.png` en `Catalogo VIBE/entregables-precio-variante/`.

**Estado:** ~~implementado y verificado en local. Sin commit, push ni despliegue (pendiente de aprobación expresa).~~ **Publicado** el 2026-11-20 con aprobación expresa de la propietaria. Ver §22.3.

### 22.3 Publicación y verificación en producción (2026-11-20)

- **Commit:** `3ee2f47` en `main` (12 archivos, todos de esta función). Despliegue de Production en Vercel completado y asociado a ese commit; `www.vibebeautycol.com` sirve exactamente los archivos del commit.
- **Antes de publicar:** suite completa con 48 scripts, **1025 aprobadas y 0 fallidas**. Diff revisado sin cambios ajenos, sin secretos y sin archivos del POS.
- **Datos reales del catálogo, solo lectura, a 1440 y 390:**
  - hoy ningún producto tiene precio propio ni promoción vigente, y no se agregó ninguno: los productos con tonos (p. ej. Princess Blush) mantienen el precio general en tarjeta, ficha, carrito y checkout;
  - el envío del pedido se interceptó en el navegador, sin pedido real.
- **Código de producción con datos de prueba controlados** (catálogo simulado solo en el navegador; envío interceptado), a 1440 y 390:
  - «Desde» en tarjetas;
  - precio por tono con promoción (34.200 / 33.300 / 31.500, base tachada, −10 %);
  - precio por presentación sin promoción (32.000 / 45.000);
  - carrito y checkout con el precio de cada variante;
  - el navegador no envía precios por línea.
- **Servidor de producción:** una solicitud con total y precio manipulados (`expectedTotal: 1`, `price: 1`) para un producto real respondió **409 `PRICE_CHANGED`**, con el precio calculado por el servidor (18.200 × 2 = 36.400). El 409 ocurre antes de guardar: no se registró ningún pedido ni se envió aviso.
- **Admin de producción** (API simulada en el navegador): detalle de líneas con base, origen, promoción, descuento, unitario final, cantidad y subtotal; el pedido histórico se ve como antes.
- **No verificado en producción, por diseño:** la escritura real de los campos de auditoría en `orders.items`. Exigiría registrar un pedido real. Está verificada con el handler real y la base simulada (P12, P15 y la prueba en navegador de §22.2).
- **Sin cambios:** POS, precios, variantes, inventario, pedidos existentes, integraciones de pago, label y redes.
- **Observación previa, ~~no corregida (fuera de alcance)~~ corregida en local el 2026-11-20 (ver §23):** al abrir el checkout, el formulario se vuelve a dibujar cuando termina la consulta de disponibilidad (`openCheckout`, desde `b6ce13d`). Lo escrito en ese intervalo, normalmente menos de un segundo, se pierde.
- **Capturas:** `Catalogo VIBE/entregables-precio-variante/produccion/`.

## 23. Checkout: los datos escritos no se pierden (CHK-KEEP, 2026-11-20)

| ID | Qué | Estado |
|---|---|---|
| CHK-KEEP-01 | Lo que la clienta escribe en el checkout se conserva aunque terminen consultas de disponibilidad, se actualice el resumen, se quite una línea o el servidor responda 409 | CORREGIDO Y PUBLICADO; ver Estado e Historial |

**Problema:** presente desde `b6ce13d`. Si la clienta empezaba a escribir antes de que terminara la consulta de disponibilidad del checkout, perdía todo lo escrito: campos, autorización y foco.

**Causa raíz:**
- **Dónde viven los datos:** solo en los campos del formulario. No hay otra copia; se leen con `FormData` al enviar.
- **Qué los borraba:** `openCheckout` dibujaba el formulario, esperaba `refreshAvailability()` (consulta real al catálogo) y luego llamaba otra vez a `renderCheckoutForm()`, que reemplaza todo `#checkoutBody` (resumen y formulario) con HTML nuevo y vacío.
- **Mismo efecto, por acción de la clienta:** quitar una línea desde el checkout.
- **Problema relacionado, a nivel de datos:** si la clienta cerraba y reabría el checkout, la respuesta tardía de una consulta anterior podía pisar la disponibilidad más reciente. En la prueba, un producto disponible quedaba marcado como agotado sin que se viera.

**Solución (`js/app.js`, solo el checkout):**
- **El formulario no se reemplaza:** al terminar la consulta, y al quitar una línea, se actualizan solo el resumen y el estado del botón (`rerenderCheckoutSummary`), sin tocar el formulario. Valores, autorización, errores de validación y foco quedan intactos. El render completo se mantiene solo al abrir el checkout, con el carrito vacío o después de la confirmación, como antes.
- **Solo vale la consulta más reciente:** `refreshAvailability` y cada apertura del checkout llevan un número de secuencia. Una respuesta más vieja se descarta y no pisa ni el estado ni la pantalla.
- **Durante el envío del pedido** no se modifica el botón, para evitar un doble envío.
- **Sin cambios en:**
  - la consulta de disponibilidad: sigue igual, una por apertura, sin duplicados;
  - la validación;
  - el 409 `PRICE_CHANGED`;
  - pagos, precios y promociones.
- **No se guardan datos personales** en el navegador.

**Pruebas:**
- **Navegador real con API simulada** (consulta pendiente a voluntad, pedido interceptado), a **1440 y 390**: escenarios 1 a 5 y respuesta tardía. Resultado: **ALL OK**.
  - escribir con la consulta pendiente, incluso cuando la respuesta llega a mitad de una palabra: el texto y el foco se conservan;
  - todos los campos llenos antes de la respuesta;
  - producto agotado tras la consulta: aparece el mensaje y el envío se bloquea, con los datos intactos; al quitar la línea se puede enviar;
  - respuesta tardía de una apertura anterior;
  - validación con correo vacío y luego corregido;
  - 409 `PRICE_CHANGED`;
  - envío completo (interceptado), con exactamente los datos escritos y el total mostrado.
- **Mismo script con el código anterior:** falla. Reproduce la pérdida de datos y la respuesta tardía.
- **Regresión:**
  - suite completa: 48 scripts, **1025 aprobadas y 0 fallidas**;
  - pruebas de navegador de tienda y checkout con y sin promoción (precios por variante): ALL OK.
- **Capturas:** `Catalogo VIBE/entregables-checkout/`.

**Estado:** ~~corregido y verificado en local. Sin commit, push ni despliegue (pendiente de aprobación).~~ Publicado el 2026-11-20 con aprobación expresa de la propietaria, en un commit independiente («fix: preserve checkout form state during availability updates»). Antes de publicar se agregó una prueba de doble envío: la consulta de disponibilidad termina mientras se envía el pedido, el botón sigue en «Enviando...» y, pese a 3 clics, sale un solo pedido (interceptado). Resultado: ALL OK a 1440 y 390. Verificación en producción: ver Historial.

## 24. Navegación, paginación, iconos sociales y duración del carrusel (2026-11-21)

| ID | Qué | Estado |
|---|---|---|
| NAV-PAG-01 | Paginación del catálogo: 10 productos por página | PUBLICADO; ver §24.5 e Historial |
| NAV-SOC-01 | Iconos propios de VIBE para Instagram y TikTok | PUBLICADO; ver §24.5 e Historial |
| NAV-SCR-01 | El sitio siempre empieza arriba al abrirse o recargarse | CORREGIDO Y PUBLICADO; ver §24.5 e Historial |
| HERO-DUR-01 | Duración individual de cada imagen del carrusel principal | PUBLICADO; ver §24.5 e Historial |

### 24.1 Paginación del catálogo (NAV-PAG-01)

**Reglas:**
- **Orden:** se filtra (categoría, subcategoría, búsqueda y filtros), se ordena y recién entonces se divide en páginas de 10. Nunca se pagina antes de filtrar.
- **Volver a la página 1:** pasa con cualquier cambio de filtro, categoría, búsqueda u orden, porque todos pasan por el mismo punto (`applyFiltersAndRender`).
- **Cambiar de página:** conserva filtros y búsqueda, lleva al inicio de la sección de productos (no al inicio del sitio) y mueve el foco al contador, para que el lector de pantalla anuncie la página nueva.
- **Contador:** «Mostrando 11–20 de 23 productos». Con una sola página no hay controles y el contador sigue como antes («N productos»).
- **Controles:** «Anterior» y «Siguiente» se deshabilitan en los extremos; la página activa se marca con `aria-current`. Con más de 7 páginas se muestran la primera, la última y las vecinas de la actual, con «…».
- **Móvil (≤ 640 px):** en lugar de los números se ve «2 / 3» entre «Anterior» y «Siguiente».
- **Dónde se guarda la página:** en memoria, no en la URL. Al volver de una ficha se conserva; al recargar se vuelve a la página 1, coherente con §24.3.
- **Sin cambios en:** tarjetas, la sección «Ofertas» (se muestra completa como antes), datos de productos, variantes, precios y promociones.

**Archivos:** `js/app.js` (`renderProducts`, `renderPagination`, `pageWindow`), `index.html` (`#catalogPagination`) y `css/styles.css`.

### 24.2 Iconos de Instagram y TikTok (NAV-SOC-01)

**Diseño:**
- **Instagram:** marco crema de trazo fino, lente rosa VIBE (`#FF007A`) y punto rosa claro.
- **TikTok:** nota musical geométrica de trazo crema, con desplazamientos discretos en turquesa y rosa.
- **Baldosa:** negra con un brillo de marca (rosa en Instagram, turquesa en TikTok) en lugar del degradado genérico de Instagram. El brillo al pasar el cursor de Instagram pasa a rosa VIBE.

**Implementación:**
- **SVG propio:** un único sprite (`<symbol id="vibeIgGlyph">` y `<symbol id="vibeTtGlyph">`), oculto para lectores de pantalla.
- **Mismos glifos en los dos lugares:** bloque «VIBE EN REDES» a 26 px (23 px en móvil) y pie («Explora») a 16 px.
- **Sin cambios en:** textos, enlaces oficiales, apertura en pestaña nueva con `noopener noreferrer`, etiquetas accesibles, foco de teclado y distribución.
- Sin emojis ni imágenes externas.

**Archivos:** `index.html`, `css/styles.css` y `scripts/test-social-buttons.js` (actualizado al nuevo diseño).

### 24.3 Inicio de página al abrir o recargar (NAV-SCR-01)

**Causa raíz:**
1. Toda URL que escribe el catálogo termina en `#catalogo` o `#discover` (`buildUrl`, desde la Fase 8, para compartir enlaces filtrados). Al abrir un enlace así, o al recargar después de usar filtros o abrir una ficha, el navegador saltaba a esa ancla, a mitad de página.
2. La restauración automática de scroll del navegador devolvía la posición anterior al recargar.

**Reproducido con el código anterior:** un enlace `?q=Rubor#catalogo` abría en scrollY 2029 (1440) y 1119 (390). Recargar estando en el pie volvía a mitad de página.

**Solución (`js/app.js`, una sola vez al cargar, no en cada render):**
- `history.scrollRestoration = "manual"`;
- se quita solo el fragmento de la URL, conservando búsqueda y filtros;
- `scrollTo(0, 0)`.

**Navegación interna sin cambios:** filtros, búsqueda (sin saltos), ficha, carrito y cambio de página. Ningún otro sitio enlaza a secciones de `index.html`, así que no se pierde ningún destino.

**Limitación:** la ancla de los enlaces compartidos ya no desplaza hasta el catálogo; los filtros sí se aplican. Es lo pedido: siempre empezar arriba.

### 24.4 Duración individual del carrusel (HERO-DUR-01)

**Persistencia (sin migración):**
- Campo opcional `duration`, en segundos enteros, dentro del manifiesto JSON existente del carrusel (`hero/slides.json` en Storage). Es el mismo mecanismo de siempre; no hay tabla SQL.
- Rango válido: **2 a 30 s**.
- Vacío (`null`) usa la predeterminada de **5 s**, la que ya tenía el carrusel.
- Las imágenes existentes no tienen `duration`: siguen con 5 s. No se asignó ninguna duración.

**Validación:**
- **Servidor:** 400 en POST y PATCH, sin escribir.
- **Admin:** mensaje propio, sin enviar.
- **Público:** un valor corrupto se ignora y se usa la predeterminada.

**Carrusel:**
- Un único `setTimeout` a la vez, programado con la duración de la pieza visible; siempre se limpia antes de programar otro.
- Al vencer avanza; después de la última vuelve a la primera.
- La interacción manual (flechas, puntos, deslizar) reinicia el temporizador con la duración de la pieza visible.
- Con `prefers-reduced-motion`, sin avance automático, como antes.
- La transición visual no cambió.
- El carrusel no tiene pausa manual (no existía antes) y vive mientras la página esté abierta, así que no hay desmontaje que limpiar.

**Admin:**
- Campo «Duración en el carrusel (segundos)» en el formulario de cada imagen.
- La tabla muestra «Duración: 8 s» o «Duración: Predeterminada (5 s)».
- Cambiar una imagen solo afecta a esa imagen.

**Archivos:** `api/_lib/heroSlides.js`, `api/admin/hero-slides.js`, `js/hero-carousel.js`, `admin/admin.js` y `scripts/test-hero-lib.js` (lista de campos públicos).

### 24.5 Pruebas

- **Prueba nueva `scripts/test-hero-duration.mjs` (9):**
  - validación;
  - forma pública y slides existentes;
  - persistencia con el handler real del Admin y Storage simulado (guardar, recargar, volver a vacío, rechazo sin escritura, slide nuevo);
  - regla del carrusel y temporizador único;
  - validación real del formulario del Admin.
- **Suite completa:** 49 scripts, **1034 aprobadas y 0 fallidas**.
- **Navegador real, con API simulada y sin pedidos (ALL OK):**
  - **Paginación**, a 1440, 768 y 390: página 1, siguiente, última, anterior, controles deshabilitados, página activa, indicador móvil, búsqueda que vuelve a la página 1 y se conserva al paginar, una sola página sin controles, ficha con precio propio y promoción en la página 2 y página conservada al cerrar la ficha.
  - **Iconos** en el bloque y el pie, con sus enlaces.
  - **Inicio de página**, a 1440 y 390: enlace con ancla, recarga desde el pie, pestaña nueva y búsqueda sin saltos.
  - **Carrusel:** 2 s, 3 s y 5 s medidos (2007, 3002 y 5011 ms) y vuelta a la primera; 4 clics manuales dejan un solo avance automático; con movimiento reducido no avanza.
  - **Admin**, a 1440 y 390: tabla con la duración de cada imagen, campo vacío con la predeterminada, 45 s rechazado, 12 s guardado solo en esa imagen y lista actualizada.
- **Regresión en navegador:** tienda con y sin promoción (precios por variante) y checkout (§23): ALL OK.
- **Capturas:** `Catalogo VIBE/entregables-navegacion/`.

**Estado:** ~~implementado y verificado en local. Sin commit, push ni despliegue (pendiente de aprobación).~~ Publicado el 2026-11-21 con autorización expresa de la propietaria (commit «feat: add catalog pagination, VIBE social icons, top-of-page start and per-slide carousel durations»). Verificación en producción: ver Historial. Sin migración.

## 25. Fichas de producto completas: caso Acne Patch (2026-11-21)

| ID | Qué | Estado |
|---|---|---|
| FICHA-01 | La ficha muestra siempre la información vigente (descripción, presentaciones, precios) poco después de guardarla en Admin | CORREGIDO; ver Estado |
| FICHA-02 | La búsqueda encuentra productos sin importar tildes ni mayúsculas («acne» → «Acné Patch») | IMPLEMENTADO; ver Estado |

**Reporte:** la propietaria cargó Acne Patch y en el catálogo solo veía las imágenes, sin descripción, presentaciones ni demás datos.

**Diagnóstico, cadena completa (solo lectura, datos reales):**
1. **Datos y API:** la API pública entrega Acne Patch completo (nombre, descripción, imagen principal y 3 adicionales, tipo de producto, 4 presentaciones: «40 colores» a $13.000 y «36 te verde» a $18.000 con precio propio; «72 Cat» y «72 Elephant» con el general de $15.000). No se pierde nada al guardar ni en la API.
2. **Transformación y ficha:** en un navegador real, con los datos frescos, la ficha muestra todo a 1440, 768 y 390, sin errores de consola. Los nombres de campos coinciden entre API y frontend.
3. **Causa raíz: caché de la API pública** (`api/catalog/products.js`): `max-age=60, s-maxage=300, stale-while-revalidate=600`. Tras guardar en Admin, el catálogo podía mostrar la versión anterior hasta unos 16 minutos.
   - **Evidencia 1, tiempos de creación** (codificados en los nombres de archivo e ids): las imágenes se subieron entre las 3:13 y las 3:16 p. m.; las presentaciones se crearon entre las 3:28 y las 3:34 p. m., en un guardado posterior. Cualquier consulta en ese intervalo, o hasta unos 15 minutos después, recibía la versión con solo las imágenes.
   - **Evidencia 2, en vivo:** la respuesta en caché («STALE», 339 s) difería de la fresca justo en Acne Patch, que la propietaria estaba editando.
   - **Precedente:** el carrusel tuvo el mismo problema y se corrigió igual en la Fase 36.
4. **Hallazgo secundario:** buscar «acne» no encontraba «Acné Patch» porque la búsqueda distinguía tildes.

**Solución:**
- **Caché de la API de productos:** `public, max-age=15, s-maxage=30, stale-while-revalidate=60`, el mismo criterio que el carrusel. Lo guardado en Admin se ve en el catálogo en segundos, como mucho en torno a un minuto.
- **Búsqueda sin tildes ni mayúsculas** (`filterProducts`, `js/taxonomy.js`).
- **Sin cambios en:** datos, POS, precios ni la lógica de variantes y promociones.

**Archivos:** `api/catalog/products.js`, `js/taxonomy.js` y `scripts/test-product-sheet.mjs` (nuevo, 6 pruebas).

**Diseño vigente, no es un error:** las secciones de información de la ficha («Qué es», «Descripción», «Características», «Beneficios», «Cómo usar»…) se muestran como acordeón: la primera abierta y las demás plegadas, con su contenido completo.

**Pruebas:**
- **Navegador real con el catálogo real** (65 productos, servido en local, pedidos interceptados), a 1440, 768 y 390:
  - Acne Patch: se encuentra buscando «acne»; nombre, descripción, 4 imágenes y 4 presentaciones con su precio; «Desde $13.000»;
  - «72 Cat» a $15.000 (general) y «40 colores» a $13.000 (propio);
  - el carrito guarda la presentación y $13.000; el checkout envía la presentación sin precio por línea (lo calcula el servidor);
  - al volver al catálogo y reabrir la ficha, la información sigue completa.
- **Barrido de las 65 fichas** (51 con descripción, 25 con tonos, 1 con presentaciones): nombre, descripción, imagen, opciones y precio presentes; sin errores de página.
- **Suite completa:** 50 scripts, **1040 aprobadas y 0 fallidas**.
- **Regresión en navegador:** precios por variante con y sin promoción, checkout (§23) y las cuatro mejoras de §24: ALL OK.
- **Capturas:** `Catalogo VIBE/entregables-fichas/`.

**Pendientes y hallazgos, documentados sin corregir (fuera de alcance):**
- **Búsqueda por palabra clave:** `searchKeywords` llega en la API, pero el normalizador del frontend (`js/data-source.js`) no lo conserva. La búsqueda por palabras clave editoriales que describía la Fase 36 no funciona en la tienda.
- **Imágenes nuevas sin optimizar:** las imágenes subidas después de la optimización de la Fase 57 no tienen versiones WebP. Por ejemplo, la principal de Acne Patch es un PNG de 1,5 MB y la galería queda negra unos segundos en conexiones lentas. Optimizarlas implica escribir en Storage de producción y requiere autorización aparte.

**Estado:** corregido y verificado en local; publicación automática autorizada. Verificación en producción: ver Historial.

## 26. Imágenes optimizadas, palabras clave y cuadrícula completa (2026-11-21)

| ID | Qué | Estado |
|---|---|---|
| IMG-OPT-01 | Optimización automática de toda imagen subida desde Admin (producto y carrusel) | PUBLICADO (`a9720fe`); ver Historial |
| IMG-OPT-02 | Optimización controlada de las imágenes ya publicadas | COMPLETADO EN PRODUCCIÓN; ver Historial |
| SRCH-KW-01 | Las palabras clave de Admin sirven para buscar en la tienda | PUBLICADO (`a9720fe`); ver Historial |
| GRID-01 | Cada página del catálogo muestra sus 10 productos en filas completas | PUBLICADO (`a9720fe`); ver Historial |

### 26.1 Optimización automática al subir (IMG-OPT-01)

**Infraestructura:** las funciones del servidor no tienen dependencias de imagen (sin `package.json`) y Vercel limita el cuerpo de la petición; hasta ahora se rechazaba cualquier archivo de más de 3 MB.

**Solución:** se optimiza en el navegador del Admin antes de subir (`createImageBitmap` + `canvas`), sin dependencias nuevas. El servidor sigue validando tipo, peso y dimensiones como antes.

**Reglas:**
- **Orientación:** se corrige la EXIF.
- **Tamaño:** se reduce, nunca se agranda, manteniendo la proporción y sin recortes, dentro de la caja de cada uso y sin bajar de los mínimos que valida el servidor. Cajas:
  - producto principal: 1200×1500 (mínimo 800×1000);
  - adicional: 1200×1200 (mínimo 400×400);
  - carrusel escritorio: 2400×2400 (mínimo 1200×900);
  - carrusel móvil: 1200×1600 (mínimo 800×1000).
- **Formato:** WebP calidad 0,85; si el navegador no codifica WebP, JPEG 0,9.
- **Metadatos:** se eliminan al recodificar.
- **Sin doble proceso:** un WebP que ya cabe y es más liviano se sube tal cual.
- **Original de cámara:** hasta 40 MB.
- **Si la optimización falla,** no se sube nada y se informa el motivo.
- **Confirmación en Admin:** p. ej. «Optimizada automáticamente: 2.2 MB → 78 KB (4000×5000 → 1200×1500)».

**Verificado** en navegador real con API simulada, capturando lo subido:

| Archivo | Antes | Después | Fidelidad (PSNR) |
|---|---|---|---|
| JPG de cámara, vertical, girado por EXIF | 2,2 MB, 4000×5000 | 78 KB, 1200×1500 | 37,4 dB |
| PNG real de producto | 1,5 MB | 82 KB, mismas dimensiones | 37,7 dB |
| WebP adicional | 27 KB | 23 KB | 44,5 dB |
| Banner panorámico del carrusel | 1,9 MB | 140 KB, proporción conservada | 38,9 dB |

Archivo dañado: no se sube y se informa. Sin metadatos en ningún resultado.

### 26.2 Imágenes ya publicadas (IMG-OPT-02)

**Diagnóstico:** de 179 imágenes de productos publicadas, solo 12 tenían versiones optimizadas. Las demás eran 152 PNG, 12 JPG y 3 WebP, de hasta 1,5 MB.

**Proceso controlado** (mecanismo de la Fase 57, sin tocar originales ni base de datos):
1. Generar versiones WebP (producto 480/800/1200; carrusel 640/1024/1672; nunca más anchas que el original) con fidelidad PSNR ≥ 36 dB. Los anchos que no la alcanzan se descartan.
2. Subirlas a `optimized/…` sin sobrescribir y verificar cada URL pública.
3. Comprobar que los originales siguen idénticos (sha256).
4. Respaldar el manifiesto y verificar el respaldo.
5. Agregar las entradas nuevas al manifiesto, conservando las anteriores, y verificarlo.

La tienda elige el ancho justo con `srcset` y vuelve al original si una versión falla.

**Para revertir:** restaurar el respaldo del manifiesto. Los originales nunca se borraron.

Resultados: ver Historial.

### 26.3 Palabras clave en la búsqueda (SRCH-KW-01)

**Causa raíz:** la cadena Admin («una por línea») → `catalog_metadata.search_keywords` → API (`searchKeywords`) funcionaba, pero el normalizador del navegador (`js/data-source.js`) no copiaba el campo. La búsqueda nunca lo veía.

**Solución:**
- Se conserva el campo: solo textos con contenido, sin espacios sobrantes.
- La búsqueda ignora tildes, mayúsculas y espacios repetidos.
- Cada producto aparece una sola vez.
- Las palabras clave no se muestran en la tienda.

**Datos reales:**
- Acne Patch no tiene palabras clave configuradas en Admin (no se inventaron).
- El único producto con palabras clave es Makeup Brush Set («brochas», «set de brochas», «maquillaje»). Antes, «Set de Brochas» daba 0 resultados en producción; ahora lo encuentra.
- Los ejemplos de la propietaria («acne», «parches», «granitos», «imperfecciones», «cuidado facial») se probaron con datos de prueba, de Admin a la búsqueda, incluido que un cambio de palabras clave cambia los resultados.

### 26.4 Cuadrícula y paginación (GRID-01)

**Causa raíz:** no se perdía ningún producto (10 tarjetas renderizadas, ninguna oculta, sin errores). Dos efectos lo parecían:
1. **Columnas:** con 4 columnas en escritorio, las 10 tarjetas quedaban en 4 + 4 + 2: la última fila con dos huecos justo antes de la paginación, como si la página se cortara.
2. **Tarjetas en blanco:** con imágenes PNG de hasta 1,5 MB sin optimizar, las tarjetas se veían grises varios segundos (0 de 10 imágenes cargadas al abrir).

**Solución:**
- El catálogo paginado usa 5 columnas por encima de 900 px: 10 = 2 filas completas. Hasta 900 px siguen 2 columnas (5 filas completas). Ofertas y relacionados no cambian.
- El `sizes` de las tarjetas se ajusta al nuevo ancho.
- Las imágenes se optimizan (§26.1 y §26.2).
- **Sin cambios:** 10 por página, filtrar y ordenar antes de paginar, volver a la página 1 al cambiar filtros/búsqueda/orden, conservar la página al volver de una ficha.

**Archivos:** `admin/admin.js`, `js/data-source.js`, `js/taxonomy.js`, `js/app.js`, `css/styles.css` y `scripts/test-catalog-search-images.mjs` (nuevo, 9 pruebas).

**Pruebas:**
- **Suite completa:** 51 scripts, **1049 aprobadas y 0 fallidas**.
- **Navegador real con el catálogo real**, a 1440, 1024, 768 y 390:
  - página 1 con 10 productos en filas completas (5+5 o 2×5);
  - 7 páginas que recorren los 65 productos sin repetir ni ocultar;
  - volver de la ficha conserva la página; cambiar el orden vuelve a la página 1;
  - búsquedas «brochas», «Set de Brochas», «acne» y «acné» sin duplicados;
  - sin errores de consola.
- **Producción antes del cambio:** filas 4+4+2 y «Set de Brochas» con 0 resultados (reproducido).
- **Regresión en navegador:** precios por variante y promociones, checkout, las cuatro mejoras de §24, Admin y las 65 fichas: ALL OK.
- **Capturas:** `Catalogo VIBE/entregables-imagenes/`.

**Estado:** corregido y verificado en local; publicación automática autorizada. Verificación en producción: ver Historial.

## 27. Veinte productos por página en escritorio (2026-11-21)

| ID | Qué | Estado |
|---|---|---|
| GRID-02 | Escritorio: 20 productos por página (4 filas completas de 5). Tablet y móvil: 10 (5 filas de 2), sin cambios | PUBLICADO; ver Historial |

**Reglas:**
- **Tamaño de página por ancho:** más de 900 px, 20 (mismo corte que las 5 columnas de `#productGrid`); hasta 900 px, 10. GRID-01 (§26.4) pasa de 10 a 20 por página solo en escritorio.
- **Sin cambios en:** filtrar, buscar y ordenar antes de paginar; volver a la página 1 al cambiarlos; conservar la página al volver de una ficha; empezar en la página 1 al recargar. Ofertas, Novedades, Más elegidos y el diseño de las tarjetas no cambian.
- **Al cruzar el corte** (girar la tablet, cambiar el ancho de la ventana): la página se recalcula para que el primer producto que se estaba viendo siga a la vista, sin omitir ni repetir productos.
- **Imágenes:** siguen con carga diferida y las versiones WebP optimizadas (§26).

**Archivos:** `js/app.js` (`pageSize` y recálculo al cambiar de ancho) y `scripts/test-catalog-search-images.mjs`.

**Pruebas:**
- **Suite completa:** 51 scripts, 1049 aprobadas y 0 fallidas.
- **Navegador real con el catálogo real** (70 productos):
  - 1440 y 1024: 20 por página en 4 filas de 5, 4 páginas;
  - 768 y 390: 10 por página en 5 filas de 2, 7 páginas;
  - sin productos repetidos ni ocultos; la última página muestra los restantes;
  - búsqueda, palabras clave, orden y vuelta desde la ficha;
  - cambio de ancho 1440 ↔ 768.
- **Regresión:** precios por variante y promociones, checkout y navegación: ALL OK.

## 28. Carrito: eliminar, descripciones completas y «Continuar comprando» (2026-11-21)

| ID | Qué | Estado |
|---|---|---|
| CART-01 | Botón «Eliminar» completo y visible en todo artículo, en escritorio y móvil; deslizar como atajo | CORREGIDO; ver Historial |
| CART-02 | Descripciones del artículo completas, en varias líneas, sin desborde | CORREGIDO; ver Historial |
| CART-03 | Botón secundario «Continuar comprando» que cierra el carrito sin perder nada | IMPLEMENTADO; ver Historial |

**Causa raíz (reproducida con productos reales, p. ej. «Bye Bye Oil» y «Cactus Lip Balm»):**
- **Texto de la línea:** muestra tono, presentación o, en productos sin opciones, la presentación general del producto. Cada parte tenía `white-space:nowrap`, así que una presentación larga («Estuche compacto rosado con espejo abatible, hojas absorbentes…») no podía partirse.
- **Columna central:** la cuadrícula del artículo era `64px 1fr auto`, y `1fr` toma como mínimo el ancho de su contenido. La línea larga ensanchaba la columna central y empujaba precio y «Eliminar» fuera del artículo, que los recorta (`overflow:hidden`, necesario para el gesto de deslizar).
- **Por eso fallaba solo en algunos productos y peor en pantallas angostas:** 274 px de desborde a 1440 y 354 px a 320 con «Bye Bye Oil»; «Eliminar» cortado u oculto. A 320 px también fallaba con «Presentación: 36 Árbol de té».
- **En móvil:** el botón se reducía a solo un icono.

**Solución (`css/styles.css`, `index.html`, `js/app.js`; sin tocar la lógica del carrito ni del checkout):**
- **Texto:** las partes de la línea se ajustan en varias líneas (`white-space:normal`, `overflow-wrap:anywhere`), sin recortes ni puntos suspensivos.
- **Columna central:** `minmax(0,1fr)` y `min-width:0`, para que nunca empuje la zona de precio y «Eliminar».
- **Móvil (≤ 640 px):** precio y «Eliminar», con su texto y un área táctil de 40 px, van en una fila propia bajo la información.
- **Deslizar a la izquierda:** sigue como atajo y nunca reemplaza al botón. Con el desborde corregido, la acción revelada se ve y elimina; un gesto vertical no la abre.
- **«Continuar comprando»:** botón secundario con borde, sobre los artículos y solo cuando el carrito tiene productos. Cierra el carrito y conserva productos, tonos, presentaciones, cantidades, precios y contador. «Continuar pedido» sigue siendo la acción principal, en fucsia.

**Pruebas:**
- **Navegador real con el catálogo real**, a 1440, 1024, 768, 390 y 320 px; pedidos interceptados:
  - carrito con tono (Candy Case, Heart Flush), presentación con precio propio (Acne Patch) y descripciones largas (Bye Bye Oil, Cactus Lip Balm);
  - «Eliminar» completo y con texto; descripciones completas, sin desborde;
  - cambiar cantidad recalcula el subtotal;
  - eliminar el primero y el último deja los demás, con subtotal y contador correctos;
  - deslizar (toques reales) muestra la acción y elimina; el gesto vertical no abre nada;
  - «Continuar comprando» cierra, se agrega otro producto y siguen los anteriores;
  - el checkout recibe lo que quedó; sin errores de consola.
- **Producción antes del cambio:** fallos reproducidos en las cinco medidas.
- **Suite completa:** 52 scripts, 1054 aprobadas y 0 fallidas, incluido el nuevo `scripts/test-cart-layout.mjs`.
- **Regresión en navegador:** precios por variante y promociones, checkout y navegación: ALL OK.
- **Capturas:** `Catalogo VIBE/entregables-carrito/` (antes y después).

## 29. Organización comercial y vitrinas inteligentes (2026-11-22)

| ID | Qué | Estado |
|---|---|---|
| ORG-01 | Grupos, categorías y subcategorías administrables (crear, editar, ordenar, activar/desactivar); 6 grupos iniciales; subcategoría opcional | PUBLICADO; ver Historial |
| ORG-02 | Colecciones (con programación opcional) y etiquetas comerciales reutilizables; asignación individual y masiva; pendientes de clasificación | PUBLICADO; ver Historial |
| ORG-03 | Vitrinas: Novedades (sin lanzamiento oficial), Más elegidos (unidades vendidas), Ofertas, Colecciones VIBE y Descubre tu VIBE; orden, visibilidad, títulos, cantidad, fijados y excluidos desde el Admin | PUBLICADO; ver Historial |

### 29.1 Modelo de datos (sin migración SQL)

Se reutiliza el patrón existente de documentos JSON en el bucket de Storage del catálogo (como `config/taxonomy.json` y `hero/slides.json`). No hay tablas nuevas ni cambios en el POS.

- **`config/taxonomy.json` (ampliado):**
  - grupos con orden y `active`; categorías con `active: false` opcional;
  - 6 grupos iniciales: Maquillaje, Skincare, Sets y regalos, Accesorios beauty, Cuidado personal y Fragancias y bienestar;
  - el grupo guardado «Accesorios» se lee como «Accesorios beauty», con las mismas categorías; los enlaces viejos `?group=Accesorios` siguen funcionando;
  - los grupos iniciales que falten se insertan vacíos en su lugar; ningún producto se clasifica solo;
  - ningún producto guarda su grupo (se deriva de la categoría), así que crear, renombrar, ordenar o desactivar grupos no cambia fichas.
- **`config/merchandising.json` (nuevo), con control de revisión como la taxonomía:**
  - colecciones: id, nombre, descripción, activa, desde/hasta opcionales;
  - etiquetas: id, nombre, activa;
  - asignaciones por producto (varias colecciones y varias etiquetas);
  - vitrinas: orden, visibilidad, título, cantidad, fijados, excluidos, lanzamiento de Novedades, período de Más elegidos y selecciones de Descubre.
  - Sin el documento rigen los valores por defecto: nada publicado y Novedades sin lanzamiento.
- **Clasificación principal:** sigue siendo la categoría editorial de `catalog_metadata` (sin cambios). Pendientes = publicados sin categoría de la taxonomía vigente; siguen visibles en la tienda.
- **Protección contra eliminaciones:** un grupo solo se elimina vacío; una categoría en uso exige elegir a qué categoría pasan sus productos (regla existente). Ningún producto queda sin clasificación.

### 29.2 APIs (11 funciones, sin sumar ninguna)

- **`/api/catalog/products`:** sin cambios.
- **`/api/catalog/categories`:** respuesta por defecto sin cambios.
  - `?view=taxonomy`: suma `active`, `inactiveCategories` y `groupAliases`.
  - `?view=merchandising` (nuevo, caché de 30 s): colecciones vigentes, etiquetas activas, asignaciones, vitrinas y Novedades automáticas (solo con lanzamiento).
  - `?view=bestsellers` (nuevo, caché de 24 h): solo el **orden** de productos publicados de Más elegidos; nunca las unidades.
- **`/api/admin/products`** (con token del Admin):
  - `?resource=merchandising`: GET devuelve documento, Novedades automáticas y pendientes; POST guarda el documento completo saneado (409 si otra sesión guardó antes);
  - `?resource=bestsellers`: ranking con unidades, solo para el Admin.
  - La taxonomía suma las acciones `addGroup`, `renameGroup`, `reorderGroup`, `setGroupActive`, `deleteGroup` y `setCategoryActive`.

### 29.3 Más elegidos: fuente de ventas y limitaciones

**Fuente:** tabla `sales` del POS, **solo lectura**. El módulo de lectura del catálogo solo hace GET; se agregó `sales` a su lista permitida.

Auditoría de los datos reales:
- 54 ventas, todas pagadas, ninguna anulada.
- `sale_items` está vacía. El detalle por producto vive en `items`, un JSON guardado como texto.
- `product_id`/`qty` de la venta **no** son por producto: en una venta de dos productos, `qty` es el total. Por eso solo se usan las líneas de `items`.
- `sold_at` está vacío; la fecha efectiva es `date`.

**Reglas:**
- **Se cuentan:** unidades de ventas con `paid = true`, `status = "active"` y sin `voided_at`, dentro del período (30 días por defecto, configurable), una vez por venta.
- **Se excluyen:** ventas anuladas, no pagadas, con otro estado o ilegibles (no se adivinan).
- **Ventas borradas:** se borran del POS hacia `sales_deleted_archive` y no cuentan.
- **Pedidos web y carritos:** los pedidos web (`orders`, «recibido») y los carritos no son ventas confirmadas y no se usan.

**Limitaciones:**
- El POS no registra devoluciones parciales: no hay información confiable para descontarlas (una anulación completa sí excluye la venta).
- Volumen actual: 5 ventas confirmadas en los últimos 30 días, 16 productos con unidades, 11 de ellos publicados.
- **Fijados y excluidos:** los fijados aparecen primero en su posición, los excluidos nunca y no hay duplicados.

### 29.4 Vitrinas en la tienda

**Orden inicial recomendado:**
1. Banner.
2. Novedades.
3. Más elegidos.
4. Explora por categoría (el catálogo con sus pestañas).
5. Colecciones VIBE.
6. Ofertas.
7. Descubre tu VIBE.

Banner y catálogo siempre visibles; las demás se activan u ocultan desde el Admin. Una vitrina sin productos nunca se muestra, y su enlace del menú tampoco (p. ej. «Ofertas» sin promociones vigentes).

- **Novedades:**
  - **Lanzamiento oficial sin configurar:** solo muestra los productos fijados a mano; sin fijados, no aparece.
  - **Con la fecha configurada por la propietaria:** entran solos los productos que lleguen al catálogo desde ese día (`catalog_metadata.created_at`), durante 30 días (configurable), más los fijados y menos los excluidos.
  - La carga inicial no cuenta como novedad.
- **Colecciones VIBE:** tarjetas de colecciones activas, vigentes y con productos; llevan al catálogo filtrado (`?collection=`).
- **Descubre tu VIBE:** sin selecciones, las tarjetas de categoría de siempre. Con selecciones (categoría, colección o etiqueta, con título opcional), esas tarjetas, solo las que tengan productos. El título aprobado se conserva salvo que el Admin defina otro.
- **Ofertas:** promociones vigentes del POS, sin cambios en precios, fechas ni descuentos.
- **Si la configuración no se puede leer,** la Home queda exactamente como antes.
- **Sin cambios en:** búsqueda, paginación, cuadrícula, fichas, variantes, precios, promociones, carrito, checkout e imágenes.

**Admin («Vitrinas»):**
- secciones (orden, visibilidad, título, cantidad);
- Novedades (fecha de lanzamiento, permanencia, fijados, excluidos);
- Más elegidos (período, fijados con posición, excluidos, ranking con unidades);
- colecciones, con programación;
- etiquetas;
- asignación por producto (filtros: pendientes, sin colección ni etiqueta, por colección o etiqueta; agregar o quitar a varios a la vez);
- Descubre tu VIBE.

**«Clasificación»:** grupos y categorías se crean, renombran, ordenan, activan y desactivan.

**Archivos:**
- **Nuevos:** `api/_lib/merchandising.js`, `api/_lib/bestsellers.js`, `api/admin/_lib/merchandisingAdmin.js`, `js/showcases.js` y `scripts/test-merchandising.mjs`.
- **Modificados:** `api/_lib/taxonomyStore.js`, `api/admin/_lib/taxonomyAdmin.js`, `api/admin/products.js`, `api/catalog/categories.js`, `api/catalog/_lib/supabaseRead.js`, `js/app.js`, `js/taxonomy.js`, `js/data-source.js`, `js/url-state.js`, `index.html`, `css/styles.css`, `admin/admin.js`, `admin/index.html` y `admin/admin.css`.
- **Pruebas actualizadas al contrato nuevo:** 6 grupos administrables, «Accesorios beauty» y 6 áreas del Admin.

### 29.5 Validación integral

- **Suite completa:** 53 scripts, **1069 aprobadas y 0 fallidas** (nueva: `test-merchandising.mjs`, 14 pruebas).
- **Navegador real, tienda** (catálogo real servido en local, organización simulada; 1440, 1024, 768 y 390 px):
  - orden configurado; vitrinas vacías y enlace de Ofertas ocultos;
  - Novedades sin lanzamiento, solo con fijados;
  - Más elegidos con fijado en posición 2 y excluido;
  - sin duplicados;
  - colecciones que filtran el catálogo, con su chip y su enlace;
  - Descubre por colección y etiqueta;
  - ficha desde una vitrina;
  - sin configuración, la Home queda igual; sin errores de consola.
- **Navegador real, Admin** (API simulada; 1440 y 390): grupos (crear, desactivar, ordenar; eliminar solo vacíos), ranking con unidades, pendientes, creación de colección y etiqueta, asignación masiva, fijados y excluidos, orden y visibilidad, y guardado con revisión.
- **Regresión en navegador:** precios por variante y promociones, checkout, navegación y paginación, carrito, cuadrícula y búsqueda con datos reales, Admin de variantes y barrido de las 77 fichas: ALL OK.
- **Contra datos reales (solo lectura):** taxonomía vigente con los 6 grupos («Accesorios beauty» con sus 2 categorías); organización por defecto (sin colecciones, sin lanzamiento); ranking de 11 productos publicados por unidades. Solo peticiones GET.

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
- **2026-10-28 (decisiones de la propietaria):**
  - **Imagen para compartir:** publicada en el código.
  - **#106:** cerrado (despublicado intencionalmente).
  - **Bloqueados por credenciales:** clasificaciones de #59, #103 y #119 (Admin de producción: 401), migraciones 0004 y 0005 (sin mecanismo SQL) y verificación de `ORDERS_NOTIFICATION_EMAIL` (sin acceso a Vercel).
  - **Aplazados:** WhatsApp y variantes.
- **2026-10-28 (migraciones):**
  - **Aplicación:** la propietaria aplicó a mano 0004 y 0005 en producción. La consulta de verificación devolvió las 4 columnas y se confirmó por lectura.
  - **§18:** registra lo que cambia y lo que todavía no se verificó de extremo a extremo.
- **2026-10-28 (textos comerciales y legales):**
  - **Publicado:** `legal.html` (envíos, pagos, garantía/retracto/reversión y datos personales), columna «Legal» y horario/ubicación en el pie, FAQ de envíos y pagos actualizada, y casilla del checkout con autorización de tratamiento de datos.
  - **Privacidad:** los datos reservados de la propietaria no se publican.
  - **Pendientes (§19.3):** requisitos de identificación (art. 50 de la Ley 1480 y Decreto 1377) y período de vigencia de la base.
- **2026-11-20 (label aprobado):**
  - **Label:** la pieza gráfica de la propietaria reemplaza a la franja de texto (AVIF, WebP y original conservado).
  - **Afirmaciones:** «Cruelty free» y «Vegan beauty» se conservan por confirmación expresa de la propietaria; las declaran los fabricantes de los productos del catálogo (§20).
- **2026-11-20 (label compacto, LBL-06):** franja más baja y en movimiento continuo en escritorio, tablet y mobile, con la misma imagen; pendiente de publicación.
- **2026-11-20 (diagnóstico del label):** la propietaria veía la versión publicada (`2b7a4c6`, estática en escritorio). LBL-06 funciona en local, verificado con la animación real, y sigue pendiente de publicar.
- **2026-11-20 (redes sociales, §21):** botones gráficos de Instagram y TikTok en «VIBE EN REDES» y TikTok en el pie, con los perfiles oficiales. LBL-06 pasa a publicado y verificado en producción (`fce3af7`).
- **2026-11-20 (precio por variante, §22):** precio propio opcional por tono o presentación, de extremo a extremo (Admin, ficha, carrito, checkout, pedido y detalle en el Admin), con el servidor como autoridad. Sin migración. Implementado y verificado en local, sin publicar.
- **2026-11-20 (ajuste final del precio por variante, §22.1–22.2):** la promoción vigente del POS se aplica también sobre el precio propio, con la misma proporción, una sola vez y redondeada al peso (reemplaza la regla anterior, que queda tachada en VPR-02). Cada línea del pedido guarda base, origen, promoción, descuento, unitario final, cantidad y subtotal, y el Admin los muestra. Sin migración y sin cambios en el POS. Suite: 1025 aprobadas y 0 fallidas. Sin publicar.
- **2026-11-20 (publicación del precio por variante, §22.3):** commit `3ee2f47` en `main`, desplegado en Production y verificado en `www.vibebeautycol.com` a 1440 y 390, sin crear pedidos ni modificar datos.
- **2026-11-20 (checkout, §23):** corregida la pérdida de datos del formulario al terminar la consulta de disponibilidad (desde `b6ce13d`) y la respuesta tardía de consultas anteriores. Verificado en local a 1440 y 390; suite 1025/0. Sin publicar.
- **2026-11-20 (publicación del checkout, §23):** commit `181cbd5` en `main`, desplegado en Production (Vercel, estado success); `js/app.js` de producción idéntico al commit. Verificado en `www.vibebeautycol.com` a 1440 y 390 con navegador real y pedidos interceptados: escenarios 1–5, agotados, respuesta tardía, validación, 409 y doble envío (ALL OK), y con el catálogo real, llenando el formulario sin esperar a que termine la consulta: los datos se conservan. Sin pedidos reales ni cambios de datos.
- **2026-11-21 (navegación, §24):** paginación de 10 productos, iconos propios de Instagram y TikTok, inicio de página al abrir o recargar (causa: ancla #catalogo en la URL y restauración de scroll) y duración individual del carrusel (campo opcional en el manifiesto, sin migración). Verificado en local; suite 1034/0. Sin publicar.
- **2026-11-21 (publicación de §24):** commit `ba91d2c` en `main`, desplegado en Production (Vercel, estado success); `js/app.js`, `js/hero-carousel.js`, `index.html`, `css/styles.css` y `admin/admin.js` de producción idénticos al commit. Verificado en `www.vibebeautycol.com` a 1440, 768 y 390 con datos controlados en el navegador (paginación, búsqueda, iconos y enlaces, inicio arriba, carrusel de 2, 3 y 5 s, temporizador único, movimiento reducido y Admin con API simulada): ALL OK. Con datos reales: 64 productos en 7 páginas, sin repetir ni omitir; inicio arriba; las 3 piezas reales del carrusel (sin duración propia, `duration: null`) siguen en 5 s. Sin pedidos, sin escrituras en producción y sin migraciones.
- **2026-11-21 (fichas de producto, §25):** caso Acne Patch. Causa: la API pública del catálogo tenía caché de 5 min en la CDN, más 10 min de contenido viejo durante la revalidación y 60 s en el navegador; la ficha mostraba una versión intermedia (solo imágenes) mientras la propietaria completaba los datos. Se baja a 30 s y la búsqueda ignora tildes. Ver §25.
- **2026-11-21 (publicación de §25):** commit `5f7c50f` en `main`, desplegado en Production (Vercel, estado success); `js/taxonomy.js` de producción idéntico al commit. La API de productos responde con caché de 30 s como máximo (antes, entre 293 y 339 s). Verificado en `www.vibebeautycol.com` con datos reales a 1440, 768 y 390: Acne Patch completo (búsqueda «acne», descripción, 4 imágenes, 4 presentaciones con su precio, carrito y checkout interceptado) y barrido de las 65 fichas completas, sin errores de consola. Sin pedidos ni escrituras en producción.
- **2026-11-21 (publicación de §26):**
  - **Publicación:** commit `a9720fe` en `main`, desplegado en Production (Vercel, success); `admin/admin.js`, `js/data-source.js`, `js/taxonomy.js`, `js/app.js` y `css/styles.css` de producción idénticos al commit.
  - **Verificación en `www.vibebeautycol.com`, datos reales, a 1440, 1024, 768 y 390:** 10 productos en filas completas; las 7 páginas recorren los 69 productos sin repetir ni ocultar; «Set de Brochas» encuentra Makeup Brush Set (antes, 0 resultados); sin errores de consola.
  - **Imágenes existentes, primera pasada:** 168 imágenes, 432 versiones WebP subidas a `optimized/…` y verificadas (233,1 MB de originales → 14,2 MB en la versión mayor, −94 %; PSNR ≥ 36 dB); originales intactos (sha256 igual antes y después).
  - **Segunda pasada** (productos agregados mientras tanto): 4 imágenes y 10 versiones.
  - **Manifiesto:** 19 → 191 entradas, con las anteriores intactas.
  - **Respaldos verificados:** `config/image-variants.backup-2026-11-21T22-18-49-989Z.json` y `config/image-variants.backup-2026-11-21T22-20-31-120Z.json`.
  - **Resultado:** la API sirve versiones optimizadas para 183 de 188 imágenes. Medido con red 4G simulada, las imágenes visibles del catálogo pasan de 10,5 s y 13,3 MB (originales) a 1,1 s y 0,58 MB en escritorio, y de 10,1 s a 1,7 s en móvil.
  - **Excepciones:** la imagen principal de 113 y las 4 adicionales de 135 tienen textura muy fina y ninguna versión alcanzó PSNR 36 dB; conservan el original.
  - **Duplicados (no se borraron):** las 4 imágenes adicionales de 135 son el mismo archivo subido 4 veces (sha256 idéntico).
  - Sin cambios en POS, base de datos, productos, precios ni pedidos; ningún original se modificó ni borró.
- **2026-11-21 (publicación de §27):** commit `29a3fb3` en `main`, desplegado en Production (Vercel, success); `js/app.js` de producción idéntico al commit. Verificado en `www.vibebeautycol.com` con los 72 productos reales: 1440 y 1024, 20 por página en 4 filas de 5 (4 páginas); 768 y 390, 10 en 5 filas de 2 (8 páginas). Sin productos repetidos ni ocultos; búsqueda, orden, vuelta desde la ficha y cambio de ancho correctos; flujo de tonos hasta el checkout interceptado, sin errores de consola.
- **2026-11-21 (publicación de §28):** commit `aac23e5` en `main`, desplegado en Production (Vercel, success); `js/app.js`, `css/styles.css` e `index.html` de producción idénticos al commit. Verificado en `www.vibebeautycol.com` a 1440, 1024, 768, 390 y 320 px con productos reales (Bye Bye Oil, Cactus Lip Balm, Candy Case, Heart Flush, Acne Patch): «Eliminar» completo y con texto, descripciones completas sin desborde, eliminación por botón y por deslizamiento, «Continuar comprando» conserva el carrito, subtotal y contador correctos, checkout interceptado; sin errores de consola.
- **2026-11-22 (publicación de §29, organización comercial):** commit `b964c19` en `main`, desplegado en Production (Vercel, success); archivos de producción idénticos al commit. Verificado en `www.vibebeautycol.com` con datos reales a 1440, 1024, 768 y 390: banner › Más elegidos (10 productos por unidades vendidas: 89, 67, 56, 68, 73, 77, 79, 96, 110, 120) › catálogo (pestañas Maquillaje, Skincare, Accesorios beauty) › Descubre tu VIBE. Novedades y Colecciones ocultas (sin lanzamiento oficial, sin fijados ni colecciones) y Ofertas oculta (sin promociones vigentes). Búsqueda, paginación, tonos, carrito y checkout interceptado correctos; sin errores de consola. `/api/catalog/products` sin cambios. Sin cambios en el POS ni en datos; ningún documento de organización comercial creado todavía (rigen los valores por defecto).
