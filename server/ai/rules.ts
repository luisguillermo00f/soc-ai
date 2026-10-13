// Motor de reglas SOC AI: produce "¿Qué está pasando?", planes, comparaciones y la lectura ejecutiva
// sin modelo generativo, a partir de la estadística y la biblioteca SST. Se etiqueta siempre como
// "motor de reglas" en la interfaz. Sus cifras salen del mismo paquete de evidencia que recibe Claude.

import type { Comparison, CompanyProfile, ExecutiveReading, PlanAction, PlanProblem, ShockPlan, WhatsHappening } from '../../shared/types.ts';
import type { Analysis } from '../analytics/engine.ts';
import type { FactPack } from '../analytics/evidence.ts';
import { CROSS_CUTTING, knowledgeFor, type KAction, type Knowledge } from '../analytics/knowledge.ts';
import { fmtNum, fmtPct } from '../lib/text.ts';
import { informativeMech, isWeekend } from '../analytics/base.ts';
import { monthLabel } from '../pipeline/dates.ts';

function finder(pack: FactPack) {
  return (prefix: string): string[] => {
    const f = pack.facts.find((x) => x.label.startsWith(prefix));
    return f ? [f.id] : [];
  };
}

type Issue = { kind: 'mecanismo' | 'aumento' | 'reincidencia' | 'severidad' | 'gestion' | 'mecanismo2'; weight: number; mech?: string; mechLabel?: string };

function issues(prof: CompanyProfile, a: Analysis): Issue[] {
  const s = prof.summary;
  const out: Issue[] = [];
  const mechs = prof.mechanisms.filter((m) => informativeMech(m.key));
  const top = mechs[0];
  if (top && top.count >= 3) out.push({ kind: 'mecanismo', weight: top.count * (0.5 + top.share), mech: top.key, mechLabel: top.label });
  if ((s.trend.direction === 'up' && (s.trend.significant || s.trend.recent - s.trend.previous >= 3)) || (s.trend.direction === 'new' && s.trend.recent >= 3)) {
    out.push({ kind: 'aumento', weight: (s.trend.recent - s.trend.previous) * 1.6 + 3 });
  }
  if (s.repeatWorkers >= 2) out.push({ kind: 'reincidencia', weight: s.repeatWorkers * 2.2 });
  const dpe = s.eventsAT ? s.daysLost / s.eventsAT : 0;
  if (s.severe >= 2 || (s.severe >= 1 && dpe > 2 * a.globalDaysPerEvent)) out.push({ kind: 'severidad', weight: s.severe * 2.5 + dpe / Math.max(1, a.globalDaysPerEvent) });
  if (s.contactGap && s.score.level !== 'controlado') out.push({ kind: 'gestion', weight: 4 });
  const second = mechs[1];
  if (second && second.count >= 4) out.push({ kind: 'mecanismo2', weight: second.count * 0.7, mech: second.key, mechLabel: second.label });
  return out.sort((x, y) => y.weight - x.weight);
}

export function rulesWhatsHappening(a: Analysis, key: string, pack: FactPack): WhatsHappening {
  const prof = a.profile(key)!;
  const s = prof.summary;
  const f = finder(pack);
  const iss = issues(prof, a);
  const main = iss[0];
  const mechs = prof.mechanisms.filter((m) => informativeMech(m.key));
  const top = mechs[0];
  const t = s.trend;
  const dpe = s.eventsAT ? s.daysLost / s.eventsAT : 0;
  const weekend = a.byCompany.get(key)!.filter(isWeekend).length;

  let headline: string;
  switch (main?.kind) {
    case 'aumento':
      headline = `La accidentalidad de ${s.name} pasó de ${t.previous} a ${t.recent} accidentes entre semestres: el problema principal es un aumento reciente.`;
      break;
    case 'mecanismo':
      headline = `${top!.label} concentra ${top!.count} de los ${s.eventsAT} accidentes de ${s.name} (${fmtPct(top!.share, 1)}).`;
      break;
    case 'reincidencia':
      headline = `${s.repeatWorkers} trabajadores de ${s.name} se han accidentado más de una vez: la reincidencia es el rasgo principal.`;
      break;
    case 'severidad':
      headline = `${s.name} registra ${s.severe} accidentes graves y ${fmtNum(dpe, 1)} días de incapacidad por accidente.`;
      break;
    case 'gestion':
      headline = `${s.name} está en nivel ${s.score.level} y la mayoría de sus eventos no tiene cita ejecutada con SOC.`;
      break;
    default:
      headline = s.eventsAT
        ? `${s.name} registra ${s.eventsAT} accidente${s.eventsAT === 1 ? '' : 's'} sin un patrón dominante.`
        : `${s.name} no registra accidentes de trabajo en el período.`;
  }

  const summaryParts = [
    `${s.name} registra ${fmtNum(s.eventsAT)} accidentes de trabajo (${fmtPct(s.share, 1)} del portafolio, posición ${s.rank}).`,
    top ? `El mecanismo principal es ${top.label.toLowerCase()} con ${top.count} eventos.` : 'La mayoría de los eventos no tiene mecanismo informado.',
    t.direction === 'up' || t.direction === 'new'
      ? `En el último semestre hubo ${t.recent} accidentes frente a ${t.previous} en el anterior${t.significant ? ', un aumento significativo' : ''}.`
      : t.direction === 'down' ? `La tendencia es a la baja: ${t.recent} accidentes en el último semestre frente a ${t.previous}.` : `El último semestre (${t.recent}) es similar al anterior (${t.previous}).`,
    s.severe ? `Hubo ${s.severe} eventos graves y ${fmtNum(dpe, 1)} días de incapacidad por accidente frente a ${fmtNum(a.globalDaysPerEvent, 1)} del portafolio.` : 'No hay eventos graves.',
    `Puntaje SOC AI: ${s.score.score}/100 (${s.score.level}).`,
  ];

  const findings: WhatsHappening['findings'] = [];
  findings.push({ nature: 'dato', title: 'Volumen y posición', body: summaryParts[0]!, confidence: 'alta', evidence: [...f('Accidentes de trabajo de la empresa'), ...f('Participación en el total')] });
  if (top) {
    findings.push({
      nature: 'patron', title: `Concentración en ${top.label.toLowerCase()}`,
      body: `${top.count} de ${s.eventsAT} accidentes (${fmtPct(top.share, 1)}) son ${top.label.toLowerCase()}${mechs[1] ? `; le sigue ${mechs[1].label.toLowerCase()} con ${mechs[1].count}` : ''}.`,
      confidence: top.count >= 8 ? 'alta' : top.count >= 4 ? 'media' : 'baja', evidence: f(`Mecanismo: ${top.label}`),
    });
  }
  findings.push({
    nature: 'patron', title: 'Evolución entre semestres',
    body: `${t.recent} accidentes en el último semestre frente a ${t.previous} en el anterior${t.significant ? ' (cambio significativo)' : ' (cambio no significativo)'}.`,
    confidence: t.significant ? 'alta' : 'media', evidence: f('Accidentes últimos 6 meses'),
  });
  if (prof.clusters.length) {
    const c = prof.clusters[0]!;
    findings.push({ nature: 'patron', title: 'Racha de eventos', body: `${c.count} eventos del mismo mecanismo en ${c.days} días (${c.start} a ${c.end}).`, confidence: 'media', evidence: f('Racha de') });
  }
  if (s.repeatWorkers) {
    findings.push({ nature: 'patron', title: 'Trabajadores reincidentes', body: `${s.repeatWorkers} trabajadores tienen dos o más accidentes en la empresa.`, confidence: 'alta', evidence: f('Trabajadores con 2 o más') });
  }
  const conclusion = main?.kind === 'mecanismo'
    ? `El problema no parece repartido entre muchos riesgos: se concentra en ${top!.label.toLowerCase()}, lo que permite una intervención focalizada.`
    : main?.kind === 'aumento' ? 'El aumento reciente sugiere un cambio en la operación o en los controles durante el último semestre.'
      : main?.kind === 'reincidencia' ? 'Que las mismas personas vuelvan a accidentarse indica que las condiciones de su puesto no cambiaron tras el primer evento.'
        : main?.kind === 'severidad' ? 'Aunque el volumen no sea el mayor, el daño por evento es alto: los controles críticos son la prioridad.'
          : 'Los eventos están dispersos; la prioridad es mejorar el reporte y la investigación para encontrar causas comunes.';
  findings.push({ nature: 'hallazgo', title: 'Conclusión', body: conclusion, confidence: s.eventsAT >= 8 ? 'media' : 'baja', evidence: [...f('Puntaje y nivel')] });

  const k = knowledgeFor(top?.key ?? null);
  const crossK = main && main.kind !== 'mecanismo' && main.kind !== 'mecanismo2' ? CROSS_CUTTING[main.kind] : undefined;
  const hyps = [...(crossK?.hypotheses.slice(0, 1) ?? []), ...k.hypotheses.slice(0, 2)];
  if (hyps[0]) findings.push({ nature: 'hipotesis', title: 'Posible explicación', body: `Podría deberse a: ${hyps[0].text.charAt(0).toLowerCase()}${hyps[0].text.slice(1)} Debe validarse en campo.`, confidence: 'baja', evidence: top ? f(`Mecanismo: ${top.label}`) : [] });
  const firstAction = (crossK ?? k).immediate[0];
  if (firstAction) findings.push({ nature: 'recomendacion', title: 'Acción inmediata', body: firstAction.action, confidence: 'media', evidence: [] });

  const centers = prof.workCenters.slice(0, 3);
  const where = [
    centers.length ? `Centros de trabajo con más eventos: ${centers.map((c) => `${c.label} (${c.count})`).join(', ')}.` : 'El archivo no trae centro de trabajo para esta empresa.',
    prof.municipalities[0] ? `Municipio principal: ${prof.municipalities[0].label} (${prof.municipalities[0].count}).` : '',
  ].filter(Boolean).join(' ');
  const peakMonths = [...prof.monthly].sort((x, y) => y.count - x.count).filter((m) => m.count > 0).slice(0, 2);
  const when = [
    peakMonths.length ? `Meses con más eventos: ${peakMonths.map((m) => `${monthLabel(m.month, true)} (${m.count})`).join(', ')}.` : '',
    prof.anomalies.length ? `Mes anómalo: ${prof.anomalies[0]!.label}.` : 'No hay meses estadísticamente anómalos.',
    `${weekend} de ${s.eventsAT} accidentes ocurrieron en fin de semana.`,
  ].filter(Boolean).join(' ');
  const whatRepeats = mechs.length
    ? mechs.slice(0, 3).map((m) => `${m.label} (${m.count})`).join(', ') + (prof.mechanismDetail[0] ? `. Detalle más frecuente según la ARL: ${prof.mechanismDetail[0].label.toLowerCase()}.` : '.')
    : 'No hay mecanismo informado suficiente para identificar repetición.';
  const howSevere = `${s.severe} eventos graves; ${fmtNum(s.daysLost)} días de incapacidad en total y ${fmtNum(dpe, 1)} por accidente (portafolio: ${fmtNum(a.globalDaysPerEvent, 1)}). ${prof.careLevels.slice(0, 3).map((c) => `${c.label}: ${c.count}`).join('; ')}.`;

  return {
    headline,
    summary: summaryParts.join(' '),
    findings,
    where,
    when,
    whatRepeats,
    howSevere,
    hypotheses: hyps.map((h) => ({ text: h.text, basis: top ? `${top.count} eventos de ${top.label.toLowerCase()} en la empresa.` : 'Distribución de eventos de la empresa.', validate: h.validate, confidence: 'baja' as const })),
    fieldChecks: [...(crossK?.fieldChecks ?? []), ...k.fieldChecks].slice(0, 6),
    actions: [...(crossK?.immediate ?? []), ...k.immediate, ...k.shortTerm.slice(0, 1)].slice(0, 4).map((x, i) => ({ action: x.action, why: x.indicator ? `Se mide con: ${x.indicator.toLowerCase()}.` : '', priority: i < 2 ? 'alta' as const : 'media' as const })),
    limits: `Sin datos de ${pack.unavailable.slice(0, 3).join(', ')}, las causas solo pueden formularse como hipótesis. ${s.eventsAT < 5 ? 'Con menos de 5 accidentes, cualquier patrón es preliminar.' : ''}`.trim(),
  };
}

const DUE = { immediate: 'Próximos 7 días', shortTerm: 'Semanas 2 a 6', structural: 'Meses 2 a 6' };

function toPlanActions(list: KAction[], due: string): PlanAction[] {
  return list.map((x) => ({ action: x.action, owner: x.owner, due, indicator: x.indicator }));
}

export function rulesShockPlan(a: Analysis, key: string, pack: FactPack): ShockPlan {
  const prof = a.profile(key)!;
  const s = prof.summary;
  const f = finder(pack);
  const iss = issues(prof, a).slice(0, 4);
  const t = s.trend;
  const problems: PlanProblem[] = iss.map((it, i) => {
    let k: Knowledge;
    let problem: string;
    let evidence: string[];
    let evidenceText: string;
    let objective: string;
    let target: string;
    let rationale: string;
    if (it.kind === 'mecanismo' || it.kind === 'mecanismo2') {
      const m = prof.mechanisms.find((x) => x.key === it.mech)!;
      const recentM = a.byCompany.get(key)!.filter((e) => e.mechGroup === it.mech).length;
      k = knowledgeFor(it.mech!);
      problem = `Repetición de ${m.label.toLowerCase()}`;
      evidence = f(`Mecanismo: ${m.label}`);
      evidenceText = `${m.count} accidentes (${fmtPct(m.share, 1)} de la empresa), ${m.severe ?? 0} graves y ${fmtNum(m.days ?? 0)} días de incapacidad.`;
      objective = `Cortar la repetición de ${m.label.toLowerCase()} atacando las condiciones del puesto, no solo la conducta.`;
      target = `Reducir al menos a la mitad los accidentes por ${m.label.toLowerCase()} en los próximos 6 meses frente al registro actual (${recentM} en el período).`;
      rationale = `Es el mecanismo con más eventos en la empresa; controlarlo es la intervención con mayor efecto sobre su accidentalidad.`;
    } else {
      k = CROSS_CUTTING[it.kind]!;
      evidence = it.kind === 'aumento' ? f('Accidentes últimos 6 meses') : it.kind === 'reincidencia' ? f('Trabajadores con 2 o más') : it.kind === 'severidad' ? f('Eventos graves') : f('Estado de gestión');
      if (it.kind === 'aumento') {
        problem = 'Aumento reciente de la accidentalidad';
        evidenceText = `${t.recent} accidentes en el último semestre frente a ${t.previous} en el anterior.`;
        objective = 'Encontrar y corregir el cambio que explica el aumento.';
        target = `Volver en los próximos 6 meses al nivel del semestre anterior (${t.previous} accidentes) o menos.`;
        rationale = 'Cuando la accidentalidad sube de golpe, los controles genéricos no bastan: hay que identificar qué cambió.';
      } else if (it.kind === 'reincidencia') {
        problem = 'Trabajadores que se accidentan más de una vez';
        evidenceText = `${s.repeatWorkers} trabajadores con dos o más accidentes.`;
        objective = 'Que ningún trabajador reincidente vuelva a accidentarse.';
        target = 'Cero nuevos accidentes en los trabajadores reincidentes en los próximos 6 meses.';
        rationale = 'La reincidencia indica acciones de investigación sin cerrar o exposición que no cambió.';
      } else if (it.kind === 'severidad') {
        problem = 'Severidad alta de los eventos';
        evidenceText = `${s.severe} eventos graves y ${fmtNum(s.eventsAT ? s.daysLost / s.eventsAT : 0, 1)} días de incapacidad por accidente (portafolio: ${fmtNum(a.globalDaysPerEvent, 1)}).`;
        objective = 'Controlar las tareas de alto potencial de daño.';
        target = 'Cero eventos graves en los próximos 6 meses y todos los graves investigados con causa raíz.';
        rationale = 'Pocos eventos graves concentran la mayor parte del daño y del costo.';
      } else {
        problem = 'Intervención de SOC pendiente';
        evidenceText = `Estado de gestión predominante: ${s.contactStatus ?? 'sin dato'}.`;
        objective = 'Concretar la asesoría de SOC con la empresa.';
        target = 'Cita ejecutada en las próximas 2 semanas.';
        rationale = 'El riesgo está identificado pero la empresa no ha recibido la intervención.';
      }
    }
    return {
      problem, evidence, evidenceText, objective,
      priority: i === 0 ? 'alta' : i === 1 ? 'alta' : 'media',
      immediate: toPlanActions(k.immediate, DUE.immediate),
      shortTerm: toPlanActions(k.shortTerm, DUE.shortTerm),
      structural: toPlanActions(k.structural, DUE.structural),
      indicator: k.indicator,
      target, rationale,
    };
  });

  const main = iss[0];
  const focus = !main ? 'La empresa no tiene un problema dominante; el plan prioriza reporte e investigación.'
    : main.kind === 'aumento' ? 'Prioriza investigar la causa del aumento reciente antes de aplicar controles generales.'
      : main.kind === 'reincidencia' ? 'Se centra en los trabajadores que repiten accidentes y en cerrar las acciones pendientes.'
        : main.kind === 'severidad' ? 'Se enfoca en los controles críticos de las tareas que producen eventos graves.'
          : main.kind === 'gestion' ? 'Empieza por concretar la intervención de SOC, que aún no ocurre.'
            : `Se enfoca en ${main.mechLabel!.toLowerCase()}, el mecanismo que más se repite en la empresa.`;

  return {
    title: `Plan de choque: ${s.name}`,
    focus,
    context: `${s.name}: ${s.eventsAT} accidentes, puntaje ${s.score.score}/100 (${s.score.level}). Último semestre ${t.recent} frente a ${t.previous} en el anterior.`,
    problems: problems.length ? problems : [{
      problem: 'Sin problema dominante',
      evidence: f('Accidentes de trabajo de la empresa'),
      evidenceText: `${s.eventsAT} accidentes en el período.`,
      objective: 'Mantener el control y mejorar la calidad del reporte.',
      priority: 'baja',
      immediate: toPlanActions(knowledgeFor(null).immediate, DUE.immediate),
      shortTerm: toPlanActions(knowledgeFor(null).shortTerm, DUE.shortTerm),
      structural: toPlanActions(knowledgeFor(null).structural, DUE.structural),
      indicator: 'Accidentes por mes',
      target: 'Sin aumento frente al período actual.',
      rationale: 'Con pocos eventos y sin patrón, la prioridad es la vigilancia.',
    }],
    followUp: 'Revisión del avance a las 2 semanas con el responsable SG-SST y cierre del ciclo a los 6 meses comparando contra la línea base de este análisis.',
    assumptions: [`El análisis no dispone de ${pack.unavailable.slice(0, 3).join(', ')}; las acciones deben ajustarse tras la visita de campo.`],
  };
}

export function rulesCompare(a: Analysis, keys: string[], packs: FactPack[]): Comparison {
  const ss = keys.map((k) => a.summaries.get(k)!);
  const finders = packs.map(finder);
  const byFreq = [...ss].sort((x, y) => y.eventsAT - x.eventsAT);
  const dpe = (s: (typeof ss)[number]) => (s.eventsAT ? s.daysLost / s.eventsAT : 0);
  const bySev = [...ss].sort((x, y) => dpe(y) - dpe(x));
  const differences: Comparison['differences'] = [
    { aspect: 'Frecuencia', detail: ss.map((s) => `${s.name}: ${s.eventsAT}`).join('; ') + '.', evidence: finders.flatMap((fd) => fd('Accidentes de trabajo de la empresa')) },
    { aspect: 'Tendencia', detail: ss.map((s) => `${s.name}: ${s.trend.previous} → ${s.trend.recent}`).join('; ') + '.', evidence: finders.flatMap((fd) => fd('Accidentes últimos 6 meses')) },
    { aspect: 'Mecanismo principal', detail: ss.map((s) => `${s.name}: ${s.topMechanism ?? 'sin dato'} (${fmtPct(s.topMechanismShare, 0)})`).join('; ') + '.', evidence: finders.flatMap((fd, i) => fd(`Mecanismo: ${ss[i]!.topMechanism}`)) },
    { aspect: 'Severidad', detail: ss.map((s) => `${s.name}: ${s.severe} graves, ${fmtNum(dpe(s), 1)} días por accidente`).join('; ') + '.', evidence: finders.flatMap((fd) => fd('Eventos graves')) },
    { aspect: 'Reincidencia', detail: ss.map((s) => `${s.name}: ${s.repeatWorkers} trabajadores reincidentes`).join('; ') + '.', evidence: finders.flatMap((fd) => fd('Trabajadores con 2 o más')) },
    { aspect: 'Gestión SOC', detail: ss.map((s) => `${s.name}: ${s.contactStatus ?? 'sin dato'}`).join('; ') + '.', evidence: [] },
  ];
  const sameMech = new Set(ss.map((s) => s.topMechanism)).size === 1 && ss[0]!.topMechanism;
  const conclusion = byFreq[0]!.key !== bySev[0]!.key
    ? `${byFreq[0]!.name} tiene la mayor frecuencia (${byFreq[0]!.eventsAT} accidentes), mientras ${bySev[0]!.name} tiene menos eventos pero mayor severidad (${fmtNum(dpe(bySev[0]!), 1)} días por accidente). El riesgo está distribuido de manera distinta: volumen en una, gravedad en la otra.`
    : `${byFreq[0]!.name} lidera tanto en frecuencia (${byFreq[0]!.eventsAT} accidentes) como en severidad (${fmtNum(dpe(byFreq[0]!), 1)} días por accidente).`;
  return {
    conclusion,
    differences,
    sharedRisks: sameMech ? `Comparten ${String(sameMech).toLowerCase()} como mecanismo principal: una misma estrategia de control puede servir a ambas.` : 'No comparten el mismo mecanismo principal; cada una requiere un enfoque propio.',
    recommendation: ss.map((s) => `${s.name}: ${s.score.level} (${s.score.score}/100), priorizar ${s.topMechanism?.toLowerCase() ?? 'investigación de eventos'}.`).join(' '),
  };
}

export function rulesExecutive(a: Analysis, pack: FactPack): ExecutiveReading {
  const o = a.overview();
  const k = o.kpis;
  const f = finder(pack);
  const dir = k.recentChange === null ? 'estable' : k.recentChange > 0.05 ? 'al alza' : k.recentChange < -0.05 ? 'a la baja' : 'estable';
  return {
    headline: `${fmtNum(k.eventsAT)} accidentes de trabajo en ${fmtNum(k.companies)} empresas; ${o.levels.critico} en nivel crítico y ${o.levels.prioritario} prioritarias.`,
    state: `La accidentalidad del último semestre está ${dir}: ${fmtNum(k.recentEvents)} accidentes frente a ${fmtNum(k.previousEvents)} en el anterior. ${k.ytd ? `En los mismos meses del año anterior hubo ${fmtNum(k.ytd.previous)} frente a ${fmtNum(k.ytd.current)} este año.` : ''} Las 10 empresas con más eventos concentran el ${fmtPct(k.top10Share, 1)}. ${k.topMechanism ? `${k.topMechanism.label} es el mecanismo más frecuente (${k.topMechanism.count}).` : ''}`.replace(/\s+/g, ' ').trim(),
    priorities: o.attention.slice(0, 5).map((s) => ({
      company: s.name,
      why: `${s.score.score}/100: ${s.score.factors.filter((x) => x.points > 0).slice(0, 2).map((x) => x.reason.toLowerCase()).join('; ')}.`,
      evidence: f(`Empresa: ${s.name}`),
    })),
    nonObvious: a.patterns.filter((p) => p.kind === 'global' || p.kind === 'cross-company').slice(0, 4).map((p) => ({
      title: p.title, body: p.explanation, nature: 'patron' as const, evidence: f(`Patrón (${p.kind}): ${p.title}`),
    })),
    actions: [
      { action: 'Visitar primero las empresas en nivel crítico con su plan de choque.', why: 'Concentran el riesgo más alto y explicable del portafolio.', priority: 'alta' },
      { action: 'Escalar el contacto con las empresas prioritarias sin cita ejecutada.', why: 'El riesgo ya está identificado y falta la intervención.', priority: 'alta' },
      { action: `Campaña transversal sobre ${k.topMechanism?.label.toLowerCase() ?? 'el mecanismo principal'}.`, why: 'Es el mecanismo más frecuente y alcanza a muchas empresas.', priority: 'media' },
    ],
    limits: `Sin ${pack.unavailable.slice(0, 3).join(', ')} no se pueden atribuir causas; las explicaciones son hipótesis para validar en campo.`,
  };
}
