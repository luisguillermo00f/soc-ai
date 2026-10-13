# SOC AI · Intelligent Occupational Safety

Plataforma de inteligencia de accidentalidad laboral para Salud Ocupacional del Caribe (SOC). Recibe la base de siniestralidad (accidentes de trabajo y enfermedades laborales) tal como sale del sistema de la ARL, la normaliza, calcula estadística auditable, detecta patrones, clasifica empresas con un puntaje explicable y usa Claude para interpretar, formular hipótesis y redactar planes de choque.

**Datos → patrones → hallazgos → hipótesis → acciones.** Código para calcular, IA para pensar.

## Puesta en marcha

Requiere Node.js 24 o superior (usa TypeScript nativo y `node:sqlite`; no hay dependencias nativas que compilar).

```bash
npm install
```

```bash
npm run dev
```

Abre http://localhost:5230. La primera vez se pide crear la cuenta de administrador.

### Activar Claude

Copia `.env.example` como `.env` y define `ANTHROPIC_API_KEY`. Reinicia el servidor. Sin clave, todo funciona con el **motor de reglas** (estadística completa y biblioteca técnica SST) y la interfaz lo indica en cada resultado.

Modelo por defecto: `claude-opus-5-5`, esfuerzo `high` (configurables con `SOC_AI_MODEL` y `SOC_AI_EFFORT`).

### IA gratuita y SOC Companion

Sin clave de Anthropic, SOC AI usa proveedores gratuitos con respaldo automático por solicitud:

1. **Google Gemini** (`GEMINI_API_KEY`, modelo `gemini-3.8-flash` y alternos). Si responde 503 por demanda, se prueba el siguiente modelo dentro de un presupuesto de tiempo; si ninguno responde, Gemini se pausa 3 minutos.
2. **Groq** (`GROQ_API_KEY`, `openai/gpt-oss-120b`). El plan gratuito permite unos 8.000 tokens por minuto, así que usa instrucciones y evidencia compactas, un regulador de cupo y reintenta según `retry-after`.
3. **Motor de reglas** si ninguno responde.

Cada resultado indica qué modelo lo produjo y pasa por el mismo verificador de cifras.

**SOC Companion IA** es el asistente: un robot helicóptero animado que flota en la esquina de todas las páginas, abre un panel de conversación y avisa del hallazgo más importante al entrar. Su estado refleja lo que pasa: pensando (consulta herramientas), hablando, contento al terminar, alerta si algo falla.

```bash
npm run check:providers -- "ruta/al/archivo.xlsx"
```

### Producción

```bash
npm run build
```

```bash
npm start
```

El servidor escucha solo en `127.0.0.1`; publícalo detrás de un proxy con HTTPS (las cookies se marcan `Secure` en producción y se envía CSP estricta).

## Flujo de uso

1. **Escaneo**: arrastra el Excel. SOC AI detecta hojas, encabezados y el rol de cada columna (por nombre y por contenido), omite tablas dinámicas y notas al pie, unifica variantes y muestra la calidad del dataset antes de procesar.
2. **Iniciar escaneo**: etapas reales con su tiempo medido (normalización, cifrado, empresas y puntajes, anomalías, patrones, hallazgos, lectura ejecutiva, planes).
3. **Inicio**: reporte ejecutivo. Desde ahí, cada empresa tiene perfil, "¿Qué está pasando?", plan de choque y reporte imprimible.

## Arquitectura

```
server/
  pipeline/    ingesta del Excel, detección de esquema, fechas, taxonomía SST, normalización y calidad
  analytics/   motor estadístico: períodos, tendencias, anomalías, patrones, puntaje, insights,
               biblioteca SST y paquetes de evidencia
  ai/          cliente de Claude, prompts, esquemas de salida, razonamiento, asistente con herramientas,
               motor de reglas
  routes/      API HTTP
  auth.ts      sesiones, roles, CSRF, límite de intentos
  db.ts        SQLite embebido; eventos cifrados con AES-256-GCM
shared/types.ts  contrato de datos entre servidor e interfaz
web/src/       interfaz React (páginas, componentes, gráficos SVG propios)
```

| Capa | Responsabilidad |
|---|---|
| Ingesta | Lee .xlsx/.xlsm/.csv, celdas enriquecidas, fórmulas y fechas en cualquier formato. |
| Normalización | Empresas por NIT y nombre canónico, categorías unificadas, duplicados, seudónimos de trabajadores. |
| Analítica | Conteos, distribuciones, semestres y año contra año, pruebas exactas (binomial y Poisson). |
| Patrones | Empresa × mecanismo × centro × severidad × cuándo; rachas; reincidencia; patrones globales con control de falsos positivos (Benjamini-Hochberg); picos entre empresas. |
| Razonamiento | Claude recibe solo el paquete de evidencia numerado; responde con salida estructurada. |
| Verificación | Toda cifra escrita por la IA se compara con el paquete; las que no aparecen se marcan en la interfaz. |
| Presentación | Interfaz, reportes imprimibles, panel "Ver evidencia" hasta los registros. |

## Metodología

- **Período**: el mes del corte, si está incompleto, se excluye de las tendencias. "Último semestre" = últimos 6 meses completos frente a los 6 anteriores (prueba binomial exacta).
- **Evento grave**: atención quirúrgica, hospitalaria o UCI, 30 o más días de incapacidad, o PCL mayor que 0.
- **Puntaje de riesgo (0–100)**: frecuencia, tendencia, recurrencia y concentración, severidad, trabajadores reincidentes y actividad reciente. Pesos y umbrales editables en Ajustes; cada empresa muestra los puntos de cada factor y su razón.
- **Rachas**: 3 o más eventos del mismo mecanismo en 60 días que son inusuales frente al ritmo propio de la empresa (Poisson, p < 0,01).
- Los análisis guardados se invalidan solos si cambia el motor o la metodología.

## Privacidad y seguridad

- El archivo original no se guarda. Nombres y documentos de trabajadores se reemplazan por un seudónimo HMAC antes de almacenar nada.
- Los eventos se guardan cifrados (AES-256-GCM) en `data/soc-ai.db`. El secreto vive en `SOC_AI_SECRET` o en `data/.secret` (generado la primera vez).
- La clave de Anthropic solo existe en el servidor. A Claude llegan cifras agregadas, nombres de empresas y seudónimos.
- Contraseñas con scrypt; sesiones opacas en cookie httpOnly; roles admin, analista y lector; CSRF por encabezado; límite de intentos de ingreso; registro de auditoría.

## Verificación

```bash
npm run typecheck
```

```bash
npm run check:ai
```

```bash
npm run check:verifier -- "ruta/al/archivo.xlsx"
```

```bash
npm run engine:summary -- "ruta/al/archivo.xlsx"
```

Usuarios adicionales también se pueden crear desde la terminal:

```bash
npm run user:create -- correo@soc.com "Nombre Apellido" analista
```
