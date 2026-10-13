# Design

## Theme

Claro. Escena que lo decide: un profesional SST en un PC de oficina en Barranquilla, con luz diurna y fluorescente, o la dirección de SOC viendo el reporte proyectado en una sala con luz encendida. Un tema oscuro proyectado se lava y no se imprime; el reporte debe verse igual en pantalla, en proyector y en PDF.

## Color strategy

**Restrained, con semántica fuerte.** Neutros fríos casi acromáticos (los mismos de la familia de apps SOC), tinta casi negra para acciones primarias, y el naranja SOC reservado a identidad y a la marca "SOC AI" (lo que produjo la IA). El color de dato se reserva a los gráficos y el color de estado al nivel de riesgo. Ningún color decorativo.

| Rol | Token | Valor |
|---|---|---|
| Campo de página | `--bg` | `#F4F4F5` |
| Superficie | `--surface` | `#FFFFFF` |
| Segunda superficie (barra lateral, encabezados) | `--surface-2` | `#FAFAFA` |
| Hairline | `--line` / `--line-strong` | `#E4E4E7` / `#D4D4D8` |
| Tinta | `--ink` | `#18181B` (17.7:1) |
| Texto secundario | `--muted` | `#52525B` (7.7:1) |
| Texto terciario | `--faint` | `#63636B` (5.9:1) |
| Identidad SOC | `--brand` | `#E0791A` (no porta texto) |
| Texto marca IA | `--brand-ink` | `#8F4108` (7.2:1) |
| Tinte IA | `--brand-tint` | `#FDF4EC` |
| Acción primaria | `--action` | `#18181B`, texto blanco |
| Foco | `--focus` | `#2A78D6` anillo 2 px |

**Riesgo (estado reservado).** Siempre con etiqueta y un indicador de forma (cuatro barras de nivel: 4 crítico, 3 prioritario, 2 atención, 1 controlado), nunca solo color.

| Nivel | Marca | Texto sobre tinte | Tinte |
|---|---|---|---|
| Crítico | `#C0362C` | `#9A2A22` | `#FDF0EE` |
| Prioritario | `#D9730D` | `#8C4A07` | `#FDF3E8` |
| Atención | `#C99400` | `#755600` | `#FBF6E3` |
| Controlado | `#2E8A57` | `#1E6640` | `#EDF7F1` |

**Dato.** Serie única: azul `#2A78D6` (área al 10 %). Destacado/seleccionado: tinta. Comparación (hasta 4): azul `#2A78D6`, aqua `#1BAF7A`, violeta `#4A3AA7`, magenta `#E87BA4` (validado CVD; contraste bajo compensado con leyenda + etiquetas directas + tabla). Secuencial (heatmaps): rampa azul 100→650. Tendencia: sube = texto crítico, baja = texto controlado, siempre con flecha y signo.

## Typography

Una familia: **Inter variable** (autohospedada, `@fontsource-variable/inter`), cifras tabulares en tablas y KPIs (`font-variant-numeric: tabular-nums`). Monoespaciada del sistema (`ui-monospace`) solo para números de siniestro y seudónimos.

Escala fija (registro producto, razón ~1.2):

```
--t-xs 11px · --t-sm 12px · --t-md 13px · --t-base 14px · --t-lg 16px · --t-xl 20px · --t-2xl 24px · --t-3xl 30px
```

Títulos de página 24 px/600, secciones 16 px/600, cuerpo 14 px, tablas 13 px. Sin mayúsculas sostenidas: los textos en mayúsculas del Excel se presentan en caja de oración, conservando siglas (SAS, ARL, UCI, ESE).

## Layout

- Shell: barra lateral fija de 232 px (`--surface-2`) + área de contenido con barra superior de 56 px (selector de dataset, búsqueda global ⌘K, usuario). Contenido `max-width: 1440px`, padding 32 px (24 en laptop, 16 en tablet).
- Tablet (< 1024 px): barra lateral colapsa a riel de íconos de 64 px; < 768 px a menú superior.
- Secciones separadas por espacio y hairlines, no por tarjetas. Las tarjetas solo existen cuando agrupan un objeto seleccionable (empresa, insight). Nunca anidadas.
- Radios: 6 px controles, 10 px paneles. Sin sombras salvo menús y paneles flotantes (`0 8px 24px -8px rgb(0 0 0 / .18)` + borde 1 px).
- Escala z: `--z-sticky 10 · --z-dropdown 20 · --z-drawer-backdrop 40 · --z-drawer 50 · --z-toast 60 · --z-tooltip 70`.

## Components

- **Botón primario**: tinta, texto blanco, 32 px alto, radio 6 px. Secundario: superficie + borde `--line-strong`. Fantasma: sin borde. Todos con hover, active (`translateY(1px)`), focus, disabled, loading.
- **Insignia de riesgo**: indicador de 4 barras + etiqueta; tinte de fondo del nivel.
- **Etiqueta de naturaleza**: DATO / PATRÓN / HALLAZGO / HIPÓTESIS / RECOMENDACIÓN como chips de 11 px con forma distinta (el de hipótesis con borde punteado). Es el único uso de versalitas, porque es un sistema de clasificación, no un eyebrow.
- **Bloque IA**: tinte `--brand-tint` y una marca SOC AI de 12 px; cifras no verificadas con subrayado punteado y tooltip "No se encontró en el dataset".
- **Ver evidencia**: abre un panel lateral (drawer) de 560 px con las cifras y la tabla de registros que producen la conclusión.
- **Tablas**: filas de 40 px, encabezado adherido, hairlines horizontales, numéricos a la derecha.
- **Estados**: skeleton por fila/bloque; vacíos que dicen qué hacer; errores con causa y reintento.

## Motion

150–220 ms, `cubic-bezier(.2,.7,.2,1)`. Solo comunica estado: hover, apertura de drawer (transform + opacidad), avance de etapas del escaneo, aparición de resultados de IA (opacidad). Sin secuencias de entrada al cargar. `prefers-reduced-motion` anula duraciones.

## Iconography

SVG en línea, trazo 1.5 px, `currentColor`, 16 px. Conjunto pequeño y consistente. Ningún emoji.
