// Biblioteca SST: hipótesis típicas, verificaciones de campo y controles por familia de mecanismo,
// ordenados según la jerarquía de controles (eliminación → sustitución → ingeniería → administrativos → EPP).
// Se usa en dos sitios: el motor de reglas (planes sin IA) y como contexto técnico para Claude.

export interface KAction { action: string; owner: string; indicator: string }

export interface Knowledge {
  key: string;
  hypotheses: { text: string; validate: string }[];
  fieldChecks: string[];
  immediate: KAction[];
  shortTerm: KAction[];
  structural: KAction[];
  indicator: string;
}

const RESP_SST = 'Responsable SG-SST de la empresa';
const RESP_SOC = 'Asesor SOC asignado';
const RESP_JEFE = 'Jefe de área o supervisor del proceso';
const RESP_GER = 'Gerencia de la empresa';

export const KNOWLEDGE: Record<string, Knowledge> = {
  'caida-nivel': {
    key: 'caida-nivel',
    hypotheses: [
      { text: 'Superficies húmedas, con residuos o con desniveles no señalizados en las zonas de tránsito.', validate: 'Recorrer las áreas donde ocurrieron los eventos en el mismo turno y condición (limpieza, lluvia, lavado).' },
      { text: 'Orden y aseo insuficiente: cables, cajas o material en pasillos.', validate: 'Inspección de orden y aseo con lista de chequeo y registro fotográfico.' },
      { text: 'Calzado inadecuado para la superficie (suela no antideslizante).', validate: 'Verificar especificación del calzado entregado frente a la tarea y su estado de desgaste.' },
      { text: 'Iluminación deficiente en pasillos, escaleras o patios.', validate: 'Medición de iluminancia en los puntos de ocurrencia.' },
    ],
    fieldChecks: [
      'Mapa de puntos de caída: ubicar cada evento en el plano de la sede.',
      'Estado de pisos, rejillas, desagües y bordes de escalón.',
      'Procedimiento y horario de limpieza húmeda frente a horario de tránsito.',
      'Tipo y estado del calzado de los trabajadores afectados.',
    ],
    immediate: [
      { action: 'Inspeccionar y corregir los puntos exactos donde ocurrieron las caídas (señalizar, secar, retirar obstáculos).', owner: RESP_SST, indicator: 'Puntos críticos intervenidos / puntos identificados' },
      { action: 'Charla de 10 minutos por turno con los casos reales de la empresa (sin nombres).', owner: RESP_JEFE, indicator: '% de trabajadores expuestos con la charla' },
    ],
    shortTerm: [
      { action: 'Programa de orden y aseo con inspecciones semanales y responsable por área.', owner: RESP_SST, indicator: 'Cumplimiento de inspecciones semanales' },
      { action: 'Ajustar horarios de limpieza húmeda y uso obligatorio de señal de piso mojado.', owner: RESP_JEFE, indicator: 'Hallazgos de piso mojado sin señalizar' },
      { action: 'Revisar especificación de calzado antideslizante y reponer el desgastado.', owner: RESP_SST, indicator: '% de trabajadores con calzado conforme' },
    ],
    structural: [
      { action: 'Intervenir superficies: antideslizante, corrección de desniveles, pasamanos e iluminación.', owner: RESP_GER, indicator: 'Obras de adecuación ejecutadas / programadas' },
      { action: 'Incluir el riesgo locativo en la matriz de peligros con controles de ingeniería verificables.', owner: RESP_SST, indicator: 'Matriz actualizada y socializada' },
    ],
    indicator: 'Caídas a nivel por mes',
  },
  'caida-altura': {
    key: 'caida-altura',
    hypotheses: [
      { text: 'Trabajo en alturas o a diferente nivel sin permiso de trabajo ni sistema de protección contra caídas.', validate: 'Revisar permisos de trabajo y certificados de los trabajadores involucrados (Resolución 4272 de 2021).' },
      { text: 'Uso de escaleras, andamios o plataformas en mal estado o mal instaladas.', validate: 'Inspección de equipos de acceso y registros de inspección preoperacional.' },
      { text: 'Bordes abiertos o huecos sin protección.', validate: 'Recorrido por zonas con desnivel y verificación de barandas y cubiertas.' },
    ],
    fieldChecks: [
      'Programa de protección contra caídas y coordinador de alturas designado.',
      'Certificación vigente de los trabajadores que realizan tareas a más de 2 m.',
      'Estado de escaleras, andamios, arneses y líneas de vida.',
      'Permisos de trabajo de los días de los eventos.',
    ],
    immediate: [
      { action: 'Suspender tareas a diferente nivel sin permiso de trabajo y verificar sistemas de protección antes de reanudar.', owner: RESP_SST, indicator: 'Tareas en alturas con permiso / total' },
      { action: 'Inspeccionar y retirar de servicio escaleras, andamios y arneses defectuosos.', owner: RESP_JEFE, indicator: 'Equipos inspeccionados y rotulados' },
    ],
    shortTerm: [
      { action: 'Implementar o actualizar el programa de protección contra caídas (Resolución 4272 de 2021).', owner: RESP_SST, indicator: 'Programa aprobado y divulgado' },
      { action: 'Certificar o reentrenar a los trabajadores que ejecutan tareas en alturas.', owner: RESP_SST, indicator: '% de trabajadores expuestos certificados' },
    ],
    structural: [
      { action: 'Controles de ingeniería: barandas, plataformas fijas, puntos de anclaje certificados.', owner: RESP_GER, indicator: 'Puntos de riesgo con protección colectiva' },
    ],
    indicator: 'Eventos a diferente nivel por trimestre',
  },
  golpes: {
    key: 'golpes',
    hypotheses: [
      { text: 'Espacios de trabajo reducidos o con objetos sobresalientes en la ruta de tránsito.', validate: 'Medir pasillos y zonas de maniobra; identificar aristas y salientes.' },
      { text: 'Manipulación de materiales o herramientas sin técnica ni ayuda mecánica.', validate: 'Observación de la tarea en el puesto donde ocurrieron los eventos.' },
      { text: 'Interacción con equipos o vehículos internos sin segregación.', validate: 'Verificar demarcación de rutas peatonales y de equipos.' },
    ],
    fieldChecks: [
      'Distribución física (layout) del área y rutas de circulación.',
      'Almacenamiento: alturas, estabilidad y objetos sobresalientes.',
      'Procedimiento de manipulación de materiales y herramientas.',
    ],
    immediate: [
      { action: 'Retirar o proteger salientes y objetos en rutas de tránsito de las áreas afectadas.', owner: RESP_JEFE, indicator: 'Puntos corregidos' },
      { action: 'Socializar los eventos ocurridos con el equipo del proceso y la lección aprendida.', owner: RESP_SST, indicator: '% de asistencia' },
    ],
    shortTerm: [
      { action: 'Demarcar rutas peatonales y zonas de maniobra; separar personas de equipos móviles.', owner: RESP_SST, indicator: '% de áreas demarcadas' },
      { action: 'Inspecciones de seguridad quincenales enfocadas en condiciones de golpe.', owner: RESP_SST, indicator: 'Inspecciones realizadas / programadas' },
    ],
    structural: [
      { action: 'Rediseñar el layout del área con mayor ocurrencia para ampliar espacios de trabajo.', owner: RESP_GER, indicator: 'Rediseño ejecutado' },
    ],
    indicator: 'Golpes por mes',
  },
  cortes: {
    key: 'cortes',
    hypotheses: [
      { text: 'Herramientas cortantes en mal estado, sin guarda o inadecuadas para la tarea.', validate: 'Inventario e inspección de herramientas del área.' },
      { text: 'Guantes no adecuados al riesgo de corte o no usados.', validate: 'Verificar nivel de protección de los guantes entregados (resistencia al corte) y su uso real.' },
      { text: 'Procedimiento inseguro (cortar hacia el cuerpo, superficies inestables).', validate: 'Observar la tarea y entrevistar a los trabajadores afectados.' },
    ],
    fieldChecks: [
      'Estado y guardas de cuchillos, sierras y herramientas manuales.',
      'Matriz de EPP: tipo de guante frente a la tarea.',
      'Puestos donde se concentran los cortes (proceso, turno).',
    ],
    immediate: [
      { action: 'Inspeccionar y reemplazar herramientas cortantes defectuosas o sin guarda.', owner: RESP_JEFE, indicator: 'Herramientas inspeccionadas / total' },
      { action: 'Entregar guantes con nivel de resistencia al corte acorde a la tarea y verificar su uso.', owner: RESP_SST, indicator: '% de uso observado' },
    ],
    shortTerm: [
      { action: 'Estandarizar el procedimiento seguro de corte con práctica supervisada.', owner: RESP_SST, indicator: 'Trabajadores entrenados en la tarea' },
      { action: 'Programa de mantenimiento y afilado de herramientas.', owner: RESP_JEFE, indicator: 'Cumplimiento del programa' },
    ],
    structural: [
      { action: 'Sustituir herramientas por versiones con protección integrada (cuchillas retráctiles, guardas fijas).', owner: RESP_GER, indicator: '% de herramientas sustituidas' },
    ],
    indicator: 'Cortes por mes',
  },
  sobreesfuerzo: {
    key: 'sobreesfuerzo',
    hypotheses: [
      { text: 'Levantamiento manual de cargas por encima de la capacidad o con frecuencia alta, sin ayudas mecánicas.', validate: 'Pesar las cargas típicas y medir frecuencia de levantamiento en el puesto.' },
      { text: 'Técnica de manipulación inadecuada o ausencia de entrenamiento práctico.', validate: 'Observación directa de la tarea y entrevista a los afectados.' },
      { text: 'Organización del trabajo: picos de carga, turnos extensos, pocas pausas.', validate: 'Revisar programación de turnos y volumen de despacho en las fechas de los eventos.' },
    ],
    fieldChecks: [
      'Peso, forma y agarre de las cargas manipuladas.',
      'Ayudas mecánicas disponibles (carretillas, estibadores) y su uso real.',
      'Evaluación biomecánica del puesto, si existe.',
      'Pausas activas y rotación en el proceso.',
    ],
    immediate: [
      { action: 'Identificar las cargas que superan la capacidad de manipulación segura y exigir manipulación en pareja o con ayuda mecánica.', owner: RESP_JEFE, indicator: 'Cargas críticas con control' },
      { action: 'Entrenamiento práctico en técnica de levantamiento en el puesto real.', owner: RESP_SST, indicator: '% de trabajadores expuestos entrenados' },
    ],
    shortTerm: [
      { action: 'Evaluación biomecánica de los puestos con eventos y plan de ajustes.', owner: RESP_SOC, indicator: 'Puestos evaluados' },
      { action: 'Programa de pausas activas y rotación en tareas de carga.', owner: RESP_SST, indicator: 'Cumplimiento de pausas' },
      { action: 'Incluir a los trabajadores afectados en el programa de vigilancia epidemiológica osteomuscular.', owner: RESP_SST, indicator: 'Casos en seguimiento' },
    ],
    structural: [
      { action: 'Ayudas mecánicas (estibadores, mesas elevadoras, transportadores) y rediseño de empaques o tamaños de carga.', owner: RESP_GER, indicator: '% de tareas de carga mecanizadas' },
    ],
    indicator: 'Eventos por sobreesfuerzo por mes',
  },
  'caida-objetos': {
    key: 'caida-objetos',
    hypotheses: [
      { text: 'Almacenamiento en altura inestable o sin sujeción.', validate: 'Inspección de estanterías, apilamiento y anclajes.' },
      { text: 'Izaje o manipulación de material en altura sin control de área.', validate: 'Revisar procedimientos de izaje y señalización de zonas.' },
    ],
    fieldChecks: ['Estado y capacidad de estanterías.', 'Altura y estabilidad de arrumes.', 'Uso de casco y demarcación de zonas de carga.'],
    immediate: [
      { action: 'Reorganizar y asegurar el almacenamiento en altura de las áreas afectadas.', owner: RESP_JEFE, indicator: 'Estanterías corregidas' },
    ],
    shortTerm: [
      { action: 'Norma interna de almacenamiento (alturas máximas, peso por nivel, objetos pesados abajo).', owner: RESP_SST, indicator: 'Norma divulgada' },
      { action: 'Demarcar zonas de izaje y exigir casco en ellas.', owner: RESP_SST, indicator: '% de cumplimiento en inspección' },
    ],
    structural: [
      { action: 'Estanterías con capacidad certificada, anclajes y mallas anticaída.', owner: RESP_GER, indicator: 'Estanterías certificadas' },
    ],
    indicator: 'Eventos por caída de objetos por trimestre',
  },
  transito: {
    key: 'transito',
    hypotheses: [
      { text: 'Desplazamientos en moto o vehículo durante la jornada sin gestión del riesgo vial.', validate: 'Identificar quiénes se desplazan, en qué vehículo y con qué frecuencia.' },
      { text: 'Presión de tiempos (domicilios, rutas) que induce conducción insegura.', validate: 'Revisar metas de entrega y programación de rutas.' },
      { text: 'Vehículos sin mantenimiento preventivo o elementos de protección incompletos.', validate: 'Revisar hojas de vida de vehículos y EPP del motociclista.' },
    ],
    fieldChecks: ['Inventario de actores viales y vehículos.', 'Plan Estratégico de Seguridad Vial (PESV) si aplica (Resolución 40595 de 2022).', 'Inspecciones preoperacionales.', 'Horarios y rutas de los eventos.'],
    immediate: [
      { action: 'Reunión con conductores y motociclistas para revisar los eventos y las rutas de mayor riesgo.', owner: RESP_SST, indicator: '% de actores viales sensibilizados' },
      { action: 'Inspección preoperacional diaria obligatoria de vehículos y EPP.', owner: RESP_JEFE, indicator: '% de inspecciones diligenciadas' },
    ],
    shortTerm: [
      { action: 'Implementar o actualizar el PESV según el nivel de la empresa.', owner: RESP_SST, indicator: 'Avance del PESV' },
      { action: 'Revisar metas de tiempo de entrega para eliminar incentivos a la velocidad.', owner: RESP_GER, indicator: 'Metas ajustadas' },
    ],
    structural: [
      { action: 'Política de seguridad vial con control de velocidad, mantenimiento preventivo y selección de conductores.', owner: RESP_GER, indicator: 'Política aprobada y en seguimiento' },
    ],
    indicator: 'Accidentes de tránsito por trimestre',
  },
  biologico: {
    key: 'biologico',
    hypotheses: [
      { text: 'Pinchazos por reencapuchado de agujas o descarte fuera del guardián.', validate: 'Observar la disposición de cortopunzantes y ubicación de guardianes.' },
      { text: 'Ausencia de dispositivos con mecanismo de seguridad.', validate: 'Revisar insumos usados (agujas, lancetas) y su tipo.' },
      { text: 'Esquema de vacunación incompleto o protocolo post-exposición desconocido.', validate: 'Revisar esquema de hepatitis B y conocimiento del protocolo.' },
    ],
    fieldChecks: ['Guardianes al alcance en el punto de uso y su nivel de llenado.', 'Protocolo de accidente biológico y tiempos de atención.', 'Gestión de residuos (Decreto 351 de 2014).'],
    immediate: [
      { action: 'Verificar guardianes en cada punto de uso y prohibir el reencapuchado.', owner: RESP_JEFE, indicator: 'Puntos con guardián conforme' },
      { action: 'Divulgar el protocolo de atención post-exposición con tiempos y responsables.', owner: RESP_SST, indicator: '% de personal que conoce el protocolo' },
    ],
    shortTerm: [
      { action: 'Completar esquemas de vacunación del personal expuesto.', owner: RESP_SST, indicator: '% con esquema completo' },
      { action: 'Capacitación práctica en bioseguridad por servicio.', owner: RESP_SST, indicator: 'Personal entrenado' },
    ],
    structural: [
      { action: 'Sustituir por dispositivos cortopunzantes con mecanismo de seguridad.', owner: RESP_GER, indicator: '% de dispositivos con seguridad' },
    ],
    indicator: 'Accidentes biológicos por trimestre',
  },
  quimico: {
    key: 'quimico',
    hypotheses: [
      { text: 'Trasvase o manipulación de sustancias sin hoja de seguridad ni EPP adecuado.', validate: 'Revisar inventario de sustancias, etiquetado SGA y fichas de seguridad.' },
    ],
    fieldChecks: ['Etiquetado y fichas de seguridad (Decreto 1496 de 2018, SGA).', 'Duchas y lavaojos.', 'EPP químico disponible.'],
    immediate: [{ action: 'Verificar etiquetado, fichas de seguridad y EPP en los puntos de uso de las sustancias involucradas.', owner: RESP_SST, indicator: 'Sustancias con ficha y etiqueta' }],
    shortTerm: [{ action: 'Capacitar en manejo seguro y respuesta a derrames.', owner: RESP_SST, indicator: 'Personal capacitado' }],
    structural: [{ action: 'Sustituir sustancias peligrosas y adecuar almacenamiento con ventilación y contención.', owner: RESP_GER, indicator: 'Sustancias sustituidas' }],
    indicator: 'Eventos químicos por trimestre',
  },
  electrico: {
    key: 'electrico',
    hypotheses: [{ text: 'Intervenciones eléctricas sin bloqueo y etiquetado o instalaciones fuera de norma (RETIE).', validate: 'Revisar procedimiento de bloqueo, competencias del personal y estado de tableros.' }],
    fieldChecks: ['Procedimiento de bloqueo y etiquetado.', 'Competencia del personal que interviene.', 'Estado de tableros y extensiones.'],
    immediate: [{ action: 'Prohibir intervenciones eléctricas sin bloqueo y personal competente.', owner: RESP_SST, indicator: 'Intervenciones con bloqueo / total' }],
    shortTerm: [{ action: 'Inspección de instalaciones y corrección de hallazgos críticos.', owner: RESP_JEFE, indicator: 'Hallazgos corregidos' }],
    structural: [{ action: 'Adecuar instalaciones según RETIE.', owner: RESP_GER, indicator: 'Adecuaciones ejecutadas' }],
    indicator: 'Eventos eléctricos por año',
  },
  atrapamiento: {
    key: 'atrapamiento',
    hypotheses: [{ text: 'Máquinas sin guardas o intervenidas en movimiento.', validate: 'Inspeccionar guardas y procedimiento de bloqueo en mantenimiento.' }],
    fieldChecks: ['Guardas fijas y enclavamientos.', 'Paradas de emergencia.', 'Procedimiento de bloqueo y etiquetado.'],
    immediate: [{ action: 'Verificar guardas y paradas de emergencia de las máquinas involucradas.', owner: RESP_JEFE, indicator: 'Máquinas verificadas' }],
    shortTerm: [{ action: 'Implementar bloqueo y etiquetado en mantenimiento y limpieza.', owner: RESP_SST, indicator: 'Intervenciones con bloqueo' }],
    structural: [{ action: 'Instalar guardas con enclavamiento y sensores de presencia.', owner: RESP_GER, indicator: 'Máquinas con protección' }],
    indicator: 'Atrapamientos por año',
  },
  particulas: {
    key: 'particulas',
    hypotheses: [{ text: 'Esmerilado, corte o soplado sin protección visual adecuada.', validate: 'Revisar tareas con proyección y tipo de gafas o careta usada.' }],
    fieldChecks: ['Tareas con proyección de partículas.', 'Gafas o careta adecuadas y en uso.', 'Pantallas de separación entre puestos.'],
    immediate: [{ action: 'Exigir protección visual adecuada en tareas con proyección.', owner: RESP_JEFE, indicator: '% de uso observado' }],
    shortTerm: [{ action: 'Instalar pantallas entre puestos y señalizar zonas.', owner: RESP_SST, indicator: 'Puestos con pantalla' }],
    structural: [{ action: 'Guardas en herramientas rotativas y extracción localizada.', owner: RESP_GER, indicator: 'Equipos con guarda' }],
    indicator: 'Eventos por proyección por trimestre',
  },
  temperatura: {
    key: 'temperatura',
    hypotheses: [{ text: 'Contacto con superficies o líquidos calientes sin protección, o exposición a calor sin aclimatación.', validate: 'Revisar puntos calientes, EPP térmico e hidratación.' }],
    fieldChecks: ['Superficies y líquidos calientes en el proceso.', 'EPP térmico.', 'Hidratación y pausas en ambientes calurosos.'],
    immediate: [{ action: 'Señalizar y aislar superficies calientes; verificar EPP térmico.', owner: RESP_JEFE, indicator: 'Puntos señalizados' }],
    shortTerm: [{ action: 'Programa de hidratación y pausas en ambientes calurosos.', owner: RESP_SST, indicator: 'Cumplimiento' }],
    structural: [{ action: 'Aislamiento térmico de equipos y ventilación.', owner: RESP_GER, indicator: 'Equipos aislados' }],
    indicator: 'Eventos térmicos por trimestre',
  },
  postura: {
    key: 'postura',
    hypotheses: [{ text: 'Posturas forzadas o movimientos repetitivos por diseño del puesto.', validate: 'Evaluación ergonómica del puesto.' }],
    fieldChecks: ['Altura de planos de trabajo.', 'Repetitividad y ciclos.', 'Pausas activas.'],
    immediate: [{ action: 'Ajustar alturas y alcances en los puestos de los eventos.', owner: RESP_JEFE, indicator: 'Puestos ajustados' }],
    shortTerm: [{ action: 'Evaluación ergonómica y pausas activas.', owner: RESP_SOC, indicator: 'Puestos evaluados' }],
    structural: [{ action: 'Rediseño ergonómico de los puestos críticos.', owner: RESP_GER, indicator: 'Puestos rediseñados' }],
    indicator: 'Eventos osteomusculares por trimestre',
  },
  'seres-vivos': {
    key: 'seres-vivos',
    hypotheses: [{ text: 'Exposición a animales o insectos en trabajo de campo sin controles.', validate: 'Revisar tareas en zonas rurales y protocolos de manejo.' }],
    fieldChecks: ['Tareas en campo o con animales.', 'Botiquín y protocolo de mordeduras o picaduras.'],
    immediate: [{ action: 'Divulgar protocolo de primeros auxilios por mordeduras y picaduras.', owner: RESP_SST, indicator: 'Personal informado' }],
    shortTerm: [{ action: 'Control de plagas y EPP para trabajo de campo (botas altas, polainas).', owner: RESP_SST, indicator: 'Cumplimiento' }],
    structural: [{ action: 'Procedimiento de trabajo seguro en campo.', owner: RESP_GER, indicator: 'Procedimiento implementado' }],
    indicator: 'Eventos por seres vivos por trimestre',
  },
  violencia: {
    key: 'violencia',
    hypotheses: [{ text: 'Exposición a atracos o agresiones en tareas con manejo de dinero o atención al público.', validate: 'Revisar tareas y horarios de los eventos.' }],
    fieldChecks: ['Manejo de efectivo.', 'Horarios y zonas de riesgo.', 'Protocolo ante agresiones.'],
    immediate: [{ action: 'Activar protocolo de atención y acompañamiento psicosocial a los afectados.', owner: RESP_SST, indicator: 'Casos atendidos' }],
    shortTerm: [{ action: 'Revisar rutas, horarios y manejo de efectivo.', owner: RESP_GER, indicator: 'Medidas adoptadas' }],
    structural: [{ action: 'Plan de seguridad física para tareas expuestas.', owner: RESP_GER, indicator: 'Plan implementado' }],
    indicator: 'Eventos por violencia por año',
  },
};

/** Problemas transversales que no dependen del mecanismo. */
export const CROSS_CUTTING: Record<string, Knowledge> = {
  aumento: {
    key: 'aumento',
    hypotheses: [
      { text: 'Cambio operativo reciente: nuevo proceso, mayor volumen, personal nuevo o contratistas.', validate: 'Entrevistar a la gerencia sobre cambios en los últimos 6 meses (producción, contratación, turnos).' },
      { text: 'Controles que se relajaron tras un período sin eventos.', validate: 'Comparar inspecciones y capacitaciones del semestre anterior con el actual.' },
    ],
    fieldChecks: ['Cambios de producción, personal o turnos en el período del aumento.', 'Antigüedad de los trabajadores accidentados.', 'Cumplimiento del plan anual SG-SST en el semestre.'],
    immediate: [{ action: 'Investigar en conjunto los eventos del último semestre para encontrar la causa común del aumento.', owner: RESP_SOC, indicator: 'Investigación conjunta realizada' }],
    shortTerm: [{ action: 'Reforzar inducción y reinducción del personal nuevo o contratista.', owner: RESP_SST, indicator: '% de personal nuevo con inducción' }],
    structural: [{ action: 'Gestión del cambio: evaluar riesgos antes de modificar procesos, turnos o volúmenes (Decreto 1072 de 2015).', owner: RESP_GER, indicator: 'Cambios con evaluación previa' }],
    indicator: 'Accidentes por mes frente a la línea base del semestre anterior',
  },
  reincidencia: {
    key: 'reincidencia',
    hypotheses: [{ text: 'El trabajador volvió al mismo puesto sin que cambiaran las condiciones que causaron el primer evento.', validate: 'Revisar si la investigación del primer evento generó acciones y si se cerraron.' }],
    fieldChecks: ['Investigaciones del primer evento de cada trabajador reincidente y cierre de sus acciones.', 'Reintegro y recomendaciones médicas.'],
    immediate: [{ action: 'Revisar con cada trabajador reincidente su puesto y las condiciones actuales.', owner: RESP_SST, indicator: 'Trabajadores reincidentes entrevistados' }],
    shortTerm: [{ action: 'Verificar el cierre de las acciones de las investigaciones previas (Resolución 1401 de 2007).', owner: RESP_SOC, indicator: 'Acciones cerradas / generadas' }],
    structural: [{ action: 'Seguimiento individual con reubicación o readaptación cuando la exposición no se pueda controlar.', owner: RESP_GER, indicator: 'Casos con seguimiento' }],
    indicator: 'Trabajadores con 2 o más accidentes',
  },
  severidad: {
    key: 'severidad',
    hypotheses: [{ text: 'Exposición a energías altas (alturas, máquinas, vehículos) donde un evento puede ser grave.', validate: 'Revisar las tareas de los eventos graves y sus controles críticos.' }],
    fieldChecks: ['Investigación de cada evento grave con metodología de causa raíz.', 'Controles críticos de las tareas de alto potencial.'],
    immediate: [{ action: 'Investigar los eventos graves con causa raíz dentro de los 15 días siguientes (Resolución 1401 de 2007).', owner: RESP_SST, indicator: 'Eventos graves investigados a tiempo' }],
    shortTerm: [{ action: 'Identificar tareas de alto potencial y verificar sus controles críticos en campo.', owner: RESP_SOC, indicator: 'Tareas críticas verificadas' }],
    structural: [{ action: 'Programa de gestión de riesgos de alto potencial con indicadores de control.', owner: RESP_GER, indicator: 'Programa implementado' }],
    indicator: 'Eventos graves y días de incapacidad por evento',
  },
  gestion: {
    key: 'gestion',
    hypotheses: [{ text: 'La empresa no ha recibido la intervención de SOC tras sus eventos (sin cita ejecutada).', validate: 'Confirmar datos de contacto y responsable SG-SST de la empresa.' }],
    fieldChecks: ['Datos de contacto actualizados.', 'Responsable SG-SST designado.'],
    immediate: [{ action: 'Escalar el contacto: llamada del coordinador SOC y correo formal a la gerencia con los resultados de este análisis.', owner: RESP_SOC, indicator: 'Cita agendada' }],
    shortTerm: [{ action: 'Visita de asesoría con el plan de choque como agenda.', owner: RESP_SOC, indicator: 'Visita ejecutada' }],
    structural: [{ action: 'Acordar un cronograma de acompañamiento trimestral.', owner: RESP_SOC, indicator: 'Cronograma acordado' }],
    indicator: 'Eventos con cita ejecutada / eventos asignados',
  },
};

export const GENERIC: Knowledge = {
  key: 'generico',
  hypotheses: [{ text: 'Condiciones o actos inseguros específicos de la tarea que los datos disponibles no permiten precisar.', validate: 'Investigación de campo de los eventos con metodología de causa raíz.' }],
  fieldChecks: ['Investigaciones de los eventos y cierre de sus acciones.', 'Matriz de peligros del proceso.'],
  immediate: [{ action: 'Revisar las investigaciones de los eventos y sus acciones pendientes.', owner: RESP_SST, indicator: 'Acciones cerradas / generadas' }],
  shortTerm: [{ action: 'Inspecciones planeadas en las áreas de los eventos.', owner: RESP_SST, indicator: 'Inspecciones realizadas' }],
  structural: [{ action: 'Actualizar la matriz de peligros con los riesgos evidenciados.', owner: RESP_SST, indicator: 'Matriz actualizada' }],
  indicator: 'Accidentes por mes',
};

export function knowledgeFor(mechGroup: string | null): Knowledge {
  return (mechGroup && KNOWLEDGE[mechGroup]) || GENERIC;
}
