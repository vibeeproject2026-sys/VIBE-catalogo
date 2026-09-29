# VIBE — Colores del logo

Extraídos directamente de los píxeles de los 5 archivos oficiales
proporcionados (no aproximados, no elegidos de memoria). Ver
`logo-assets.md` para qué variante usa cada color.

| Nombre | HEX | RGB | Uso | Variante |
|---|---|---|---|---|
| Blanco del wordmark | `#F5F5F5` | `245, 245, 245` | Relleno de las letras VIB en las variantes claras | `vibe-logo-light`, `vibe-logo-white-mono`, `vibe-mark-light` |
| Rosa VIBE (núcleo) | `#FF007A` | `255, 0, 122` | Color pleno de las barras de la E, y del wordmark completo en la variante monocromática rosa | `vibe-logo-dark` (barras), `vibe-logo-pink` (wordmark completo) |
| Negro del wordmark | `#000000` | `0, 0, 0` | Relleno de las letras VIB en la variante para fondos claros | `vibe-logo-dark` |

## Efecto de resplandor (glow) en las barras — no es un color plano

Las barras de la "E" no son un rosa sólido de extremo a extremo: se
desvanecen desde el rosa núcleo (`#FF007A`) hacia un magenta/púrpura
oscuro en los bordes y en la punta, confirmado por muestreo directo:

- Núcleo: `#FF007A` (255, 0, 122)
- Cola del resplandor (muestra real, ~97% de opacidad): `#551380` (85, 19, 128)
- Entre ambos, el color recorre un degradado continuo — no dos tonos
  planos, un verdadero gradiente.

Esto es un detalle de diseño intencional del logo oficial, confirmado
por medición de píxeles reales, no una suposición.

## Fondos de referencia (no son colores de marca — son el lienzo de aplanado)

Los 5 PNG originales llegaron aplanados sobre un fondo sólido (nunca
con transparencia real, ver `logo-assets.md` para la auditoría
completa):

- Negro puro `#000000` — lienzo de `vibe-logo-light`, `vibe-logo-pink`,
  `vibe-logo-white-mono`, `vibe-mark-light`.
- Gris muy claro `#F5F5F5` — lienzo de `vibe-logo-dark`.

## Coincidencia con el sistema de diseño existente

El rosa núcleo del logo (`#FF007A`) coincide EXACTAMENTE con la
variable `--pink` ya definida en `css/styles.css` (`:root{--pink:#FF007A}`)
— confirma que el acento rosa que ya usa todo el sitio (botones, CTAs,
badges) es fiel al color real del logo oficial, no una aproximación.
