# Estándar de imágenes — VIBE Catálogo (Fase 35)

Referencia de las proporciones recomendadas. El frontend nunca exige
exactamente estas dimensiones (los validadores en
`api/admin/_lib/imageValidation.js` solo exigen un **mínimo**, no un
tamaño exacto) — siempre preserva la proporción real de la imagen
subida mediante `object-fit: contain`, nunca `cover`, para que la
fotografía nunca se vea recortada ni deformada.

## Producto (imagen principal y galería)

- **1200 × 1500 px** (proporción 4:5)
- WebP recomendado (JPEG/PNG también aceptados)
- Mínimo actual validado: 800 × 1000 px (imagen principal), 400 × 400 px (adicionales)

## Hero — desktop

- **1920 × 1080 px** (proporción 16:9)
- Mínimo actual validado: 1200 × 900 px

## Hero — mobile

- **1080 × 1350 px** (proporción 4:5)
- Mínimo actual validado: 800 × 1000 px

No se modificó la arquitectura ni los mínimos de validación del Hero en esta
fase (Fase 35, sección 9) — este documento solo fija el estándar recomendado
hacia adelante.
