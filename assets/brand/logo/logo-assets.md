# VIBE — Master Logo Asset Pack

Preparado a partir de 5 archivos PNG oficiales de referencia
proporcionados por la marca. Ningún archivo fue redibujado,
vectorizado, reinterpretado ni tuvo sus formas/colores originales
alterados — ver "Cómo se preparó cada archivo" para el proceso técnico
exacto aplicado (recorte + transparencia), y "Limitación real
encontrada" para la única salvedad honesta que aplica.

## Inventario: qué representa cada archivo original

Auditado por inspección directa de píxeles (nunca por nombre de
archivo):

| Original | Contenido real confirmado | Fondo original | Transparencia real |
|---|---|---|---|
| Referencia 1 (la primera enviada, luego reenviada 2 veces idéntica) | Wordmark completo "VIBE" — letras blancas `#F5F5F5` + barras con resplandor rosa→púrpura | Negro sólido aplanado | No (alpha=255 uniforme) |
| Archivo 4 | Solo el símbolo B/E (sin "VI") — mismo blanco y mismo resplandor rosa que el wordmark completo | Negro sólido aplanado | No |
| Archivo 5 | Wordmark completo, monocromático — TODO en rosa `#FF007A` (letras y barras) | Negro sólido aplanado | No |
| Archivo 6 | Wordmark completo, monocromático — TODO en blanco `#F5F5F5` (letras y barras, sin rosa) | Negro sólido aplanado | No |
| Archivo 7 | Wordmark completo — letras negras `#000000` + barras en rosa (el rosa se mantiene como constante de marca) | Gris muy claro `#F5F5F5` sólido aplanado | No |

Ningún archivo contiene el tagline "VIBRANT ICONIC BEAUTY ESSENTIALS"
(confirmado escaneando todo el lienzo fuera del área del wordmark —
cero píxeles de contenido ahí). No se fabricó ninguna variante con
tagline.

No existe ningún archivo que sirva de base para `vibe-mark-dark.png`
ni `vibe-mark-pink.png` (un mark aislado en negro-sobre-claro o en
rosa monocromático) — **no se crearon** porque no hay fuente real que
los respalde.

## Paquete final

| Archivo | Variante | Dimensiones | Fondo recomendado | Wordmark o mark | Tagline |
|---|---|---|---|---|---|
| `vibe-logo-light.png` | Logo claro (letras blancas + barras rosa con resplandor) | 504×207px | Oscuro / negro (Header y Footer actuales del catálogo) | Wordmark | No |
| `vibe-logo-dark.png` | Logo oscuro (letras negras + barras rosa) | 498×206px | Claro / blanco | Wordmark | No |
| `vibe-logo-pink.png` | Monocromático rosa | 504×206px | Oscuro (mejor contraste) | Wordmark | No |
| `vibe-logo-white-mono.png` | Monocromático blanco (sin acento rosa) | 498×206px | Oscuro | Wordmark | No |
| `vibe-mark-light.png` | Símbolo B/E aislado, claro | 371×326px | Oscuro | Mark | No |
| `vibe-logo-email.png` | Igual a `vibe-logo-light`, empaquetado para email | 504×207px | Oscuro | Wordmark | No |
| `vibe-logo-social.png` | Igual a `vibe-logo-light`, empaquetado para redes/presentaciones | 504×207px | Oscuro | Wordmark | No |

Todos: PNG de 8 bits, RGBA con transparencia real, sin comprimir en
exceso (~19–28 KB cada uno).

**Nota honesta sobre resolución**: el lienzo fuente original es de
1000×1000px, y el wordmark dentro de ese lienzo ocupa de forma nativa
solo ~500×200px reales — no hay más detalle disponible en la fuente
para producir una variante "@2x" genuina sin inventar píxeles
(upscaling). Buena noticia práctica: 500px de ancho nativo ya cubre
holgadamente el uso actual (el logo se muestra a ~154px de ancho en el
Header), así que estos archivos ya rinden nítidos a densidad de
pantalla retina sin necesidad de un archivo separado. Si en el futuro
se necesita una pieza mucho más grande (ej. una lona/banner físico),
va a hacer falta pedir el archivo vectorial real a quien diseñó el
logo — no se puede fabricar esa resolución a partir de estos PNG.

**Nota sobre email**: `vibe-logo-email.png` usa transparencia PNG
estándar (no SVG). Outlook clásico (motor Word) no soporta bien PNG
con transparencia sobre fondos de color — si el email tiene fondo
negro (que es el caso del email transaccional VIBE actual, ver
`api/orders/_lib/email.js`), esto no es un problema real.

## Cómo se preparó cada archivo (proceso técnico exacto)

Ningún píxel del wordmark fue redibujado ni recoloreado. El proceso
fue estrictamente:

1. **Detección del fondo real**: promedio de las 4 esquinas del
   lienzo (negro puro o gris `#F5F5F5`, según el archivo).
2. **Transparencia derivada por distancia de color** (nunca
   "color-to-alpha" ingenuo): para cada píxel se calculó qué tan lejos
   está su color del fondo detectado.
   - Distancia ≤ 60 → completamente transparente (fondo / ruido de
     compresión).
   - Distancia ≥ 130 → completamente opaco, color RGB sin tocar.
   - Entre 60 y 130 → opacidad graduada proporcional a la distancia,
     **RGB nunca modificado** — esto es lo que preserva el efecto de
     resplandor real de las barras (ver `logo-colors.md`) en vez de
     cortarlo de golpe.
3. **Recorte** al bounding box real del contenido visible, con un
   margen transparente consistente de 24px en los 4 lados (mismo
   margen absoluto en todos los archivos del mismo lienzo fuente).
4. **Nunca se tocó** un valor de color de ningún píxel que terminara
   visible — se verificó explícitamente comparando cada RGB de salida
   contra el RGB de entrada.

### Bug real encontrado y corregido durante la propia preparación

La primera pasada usó un umbral más permisivo (distancia ≤10 =
transparente). Al probar el resultado sobre fondo blanco (parte
obligatoria del QA pedido), aparecía un halo gris sutil: píxeles que
eran ruido de compresión cercano a negro (ej. RGB 19,19,18, a
distancia 19 del negro) quedaban con ~20% de opacidad — invisible
sobre negro, pero un gris visible (≈208,208,208) sobre blanco. Se
subió el umbral a 60 y se re-verificó con los mismos píxeles
problemáticos convertidos en transparencia real (alpha=0) — confirmado
por pixel, no solo visualmente.

## Limitación real encontrada (no oculta, sí importante)

Ninguno de los 5 archivos originales tiene un canal alfa real — los 5
llegaron "aplanados" (alpha=255 uniforme en el 100% del lienzo,
confirmado por lectura directa de cada archivo). Esto significa que la
transparencia de este paquete es **reconstruida**, no recuperada — es
matemáticamente imposible distinguir con 100% de certeza, a partir de
un píxel ya aplanado, si era "fondo con algo de ruido" o "borde
suavizado real" sin el canal alfa original.

Consecuencia real, medida con precisión: en los tramos **curvos** del
wordmark (la panza de la "B"), queda un resto de 1–2 píxeles (a
resolución nativa ~326px de alto) con opacidad parcial que, compuesto
sobre un fondo MUY distinto al original (ej. `vibe-logo-light`, pensado
para fondo oscuro, visto sobre blanco puro), se nota como un filo gris
tenue si se hace zoom fuerte. En los bordes rectos (los trazos
verticales de "V"/"I"/"B") no hay ningún resto — la transición es de
un solo píxel, perfectamente limpia.

En el tamaño real de uso (Header a ~154px de ancho) y sobre el fondo
para el que cada variante fue pensada (`vibe-logo-light`/`-pink`/
`-white-mono`/mark sobre oscuro, `vibe-logo-dark` sobre claro), este
resto es indetectable a simple vista — se confirma con QA visual (ver
abajo) — pero se documenta con honestidad porque es una limitación
real de origen (falta de alfa en la fuente), no algo que se pueda
seguir "arreglando" sin alterar colores del wordmark, que es
justamente lo que no se debía hacer.

**Solución definitiva, si se necesita en el futuro**: pedir a quien
diseñó el logo un archivo vectorial real (SVG/AI/EPS con paths reales)
o un PNG ya exportado con canal alfa nativo — ninguno de los dos
existe hoy en este repositorio ni fue proporcionado.

## QA realizado

- Verificado por lectura de píxeles (no solo visual) que las 4
  esquinas de cada archivo de salida son completamente transparentes
  (alpha=0) — sin caja negra ni caja blanca.
- Verificado que ningún RGB de píxel visible fue modificado respecto
  al archivo original.
- Render real (Playwright) de los 7 archivos sobre 4 fondos: negro,
  blanco, gris medio, rosa VIBE (`#FF007A`) — sin recorte, sin
  deformación, proporciones intactas.
- Confirmado el hallazgo de halo, corregido, y re-verificado por
  píxel (no solo visualmente) tras la corrección.
- Verificado que ningún archivo contiene tagline (no se necesitó
  preservar ni se inventó ninguno).

## Compatibilidad con otros proyectos

Este paquete vive en `/assets/brand/logo/` dentro de VIBE Catalog. No
se modificó VibeBeauty POS ni ningún otro repositorio — el pack queda
listo para copiarse a donde se decida cuando llegue el momento de
usarlo ahí. Ningún archivo del catálogo (`index.html`, `css/styles.css`,
`js/app.js`, emails) fue modificado en esta fase — el Header/Footer
del catálogo siguen usando `assets/vibe-logo.svg` exactamente igual
que antes; conectar este pack nuevo a la UI del catálogo es trabajo de
una fase aparte, según lo pedido.
