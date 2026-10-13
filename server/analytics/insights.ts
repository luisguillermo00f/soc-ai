// Insights proactivos: hallazgos que el sistema le señala al usuario sin que los pida.
// Todos son calculados; cada uno trae su evidencia (ids o filtro) y una acción sugerida.

import type { Insight } from '../../shared/types.ts';
import type { Analysis } from './engine.ts';
import { daysBetween, monthLabel } from '../pipeline/dates.ts';
import { contactDone } from '../pipeline/taxonomy.ts';
import { fmtNum, fmtPct } from '../lib/text.ts';
import { dist, informativeMech, inPeriod, isWeekend, makeTrend, mechLabel } from './base.ts';

const signed = (x: number) => `${x > 0 ? '+' : ''}${fmtPct(x, 1)}`;

export function buildInsights(a: Analysis): Insight[] {
  const out: Insight[] = [];
  const p = a.period;
  const at = a.at;
  const N = at.length;
  if (!N) return out;
  let seq = 0;
  const id = () => `I${++seq}`;
  const periodFilter = (start: string, end: string) => ({ from: `${start}-01`, to: `${end}-31`, cls: 'AT' as const });

  /* 1. Tendencia general entre semestres */
  const recent = at.filter((e) => inPeriod(e, p.recent));
  const previous = at.filter((e) => inPeriod(e, p.previous));
  const t = makeTrend(recent.length, previous.length);
  if (t.change !== null && Math.abs(t.change) >= 0.05) {
    const up = t.change > 0;
    out.push({
      id: id(), kind: 'tendencia', severity: up && t.significant ? 'alta' : up ? 'media' : 'baja',
      title: up ? `La accidentalidad subió ${fmtPct(t.change, 1)} en el último semestre` : `La accidentalidad bajó ${fmtPct(-t.change, 1)} en el último semestre`,
      finding: `${recent.length} accidentes en ${p.recent.label} frente a ${previous.length} en ${p.previous.label} (${signed(t.change)}).`,
      evidence: [
        { label: p.recent.label, value: `${recent.length} accidentes` },
        { label: p.previous.label, value: `${previous.length} accidentes` },
        { label: 'Prueba binomial exacta', value: `p = ${fmtNum(t.pValue ?? 1, 3)}${t.significant ? ' (significativo)' : ' (no significativo)'}` },
      ],
      importance: t.significant
        ? 'El cambio es estadísticamente significativo: no se explica por variación normal entre meses.'
        : 'El cambio es pequeño frente a la variación normal; conviene vigilarlo antes de sacar conclusiones.',
      action: up ? 'Revisar qué empresas explican el aumento (sección Tendencias, "Empresas que más suben").' : 'Identificar qué empresas bajaron y documentar qué hicieron para replicarlo.',
      confidence: t.significant ? 'alta' : 'media',
      eventIds: [],
      filter: periodFilter(p.recent.start, p.recent.end),
    });
  }

  /* 2. Comparación año contra año */
  if (p.ytd) {
    const cur = at.filter((e) => inPeriod(e, p.ytd!.current)).length;
    const prev = at.filter((e) => inPeriod(e, p.ytd!.previousYear)).length;
    if (prev) {
      const ch = (cur - prev) / prev;
      const tt = makeTrend(cur, prev);
      out.push({
        id: id(), kind: 'interanual', severity: ch > 0.1 ? 'media' : 'baja',
        title: `${p.ytd.current.label}: ${signed(ch)} frente al mismo período del año anterior`,
        finding: `${cur} accidentes en ${p.ytd.current.label} frente a ${prev} en ${p.ytd.previousYear.label}. Compara los mismos meses, así que no la afecta la estacionalidad.`,
        evidence: [
          { label: p.ytd.current.label, value: `${cur}` },
          { label: p.ytd.previousYear.label, value: `${prev}` },
          { label: 'Prueba binomial exacta', value: `p = ${fmtNum(tt.pValue ?? 1, 3)}` },
        ],
        importance: tt.significant ? 'La diferencia es significativa.' : 'La diferencia está dentro de la variación esperada: el nivel de accidentalidad es estable año contra año.',
        action: ch > 0 ? 'Usar esta cifra como línea base de la meta anual de reducción.' : 'Mantener la vigilancia en las empresas críticas.',
        confidence: tt.significant ? 'alta' : 'media',
        eventIds: [],
        filter: periodFilter(p.ytd.current.start, p.ytd.current.end),
      });
    }
  }

  /* 3. Concentración en pocas empresas */
  const list = a.list();
  const byEvents = [...list].sort((x, y) => y.eventsAT - x.eventsAT);
  const top10 = byEvents.slice(0, 10);
  const top10n = top10.reduce((s, c) => s + c.eventsAT, 0);
  let acc = 0;
  let half = 0;
  for (const c of byEvents) { acc += c.eventsAT; half++; if (acc >= N / 2) break; }
  out.push({
    id: id(), kind: 'concentracion', severity: top10n / N > 0.2 ? 'alta' : 'media',
    title: `10 empresas concentran el ${fmtPct(top10n / N, 1)} de los accidentes`,
    finding: `De ${a.byCompany.size} empresas con accidentes, las 10 primeras suman ${top10n} eventos. La mitad de toda la accidentalidad se explica con ${half} empresas (${fmtPct(half / a.byCompany.size, 0)} del portafolio).`,
    evidence: top10.slice(0, 5).map((c) => ({ label: c.name, value: `${c.eventsAT} (${fmtPct(c.share, 1)})` })),
    importance: 'Intervenir pocas empresas bien elegidas mueve el indicador de todo el portafolio.',
    action: `Priorizar visitas a las ${Math.min(10, top10.length)} empresas de mayor volumen que además estén en nivel crítico o prioritario.`,
    confidence: 'alta',
    eventIds: top10.flatMap((c) => (a.byCompany.get(c.key) ?? []).map((e) => e.id)),
  });

  /* 4. Mecanismo dominante y mecanismos que crecen */
  const mechs = dist(at.filter((e) => informativeMech(e.mechGroup)), (e) => e.mechGroup, mechLabel, { total: N });
  const top3 = mechs.slice(0, 3);
  if (top3.length) {
    const share3 = top3.reduce((s, m) => s + m.count, 0) / N;
    out.push({
      id: id(), kind: 'mecanismo', severity: 'media',
      title: `Tres mecanismos explican el ${fmtPct(share3, 0)} de los accidentes`,
      finding: top3.map((m) => `${m.label}: ${m.count} (${fmtPct(m.share, 1)})`).join('; ') + '.',
      evidence: top3.map((m) => ({ label: m.label, value: `${m.count} eventos, ${m.severe ?? 0} graves` })),
      importance: 'Son los riesgos transversales del portafolio: una campaña común sobre ellos alcanza a muchas empresas a la vez.',
      action: `Diseñar una campaña SOC para ${top3[0]!.label.toLowerCase()} con material reutilizable para todas las empresas afectadas.`,
      confidence: 'alta',
      eventIds: [],
      filter: { mechGroup: top3[0]!.key, cls: 'AT' },
    });
  }
  for (const m of mechs.slice(0, 12)) {
    const evts = at.filter((e) => e.mechGroup === m.key);
    const tr = makeTrend(evts.filter((e) => inPeriod(e, p.recent)).length, evts.filter((e) => inPeriod(e, p.previous)).length);
    if (tr.significant && tr.change !== null && tr.change > 0.25) {
      out.push({
        id: id(), kind: 'mecanismo-creciente', severity: 'alta',
        title: `${m.label}: ${signed(tr.change)} en el último semestre`,
        finding: `${tr.recent} eventos en ${p.recent.label} frente a ${tr.previous} en ${p.previous.label}. El aumento es estadísticamente significativo.`,
        evidence: [{ label: 'Últimos 6 meses', value: `${tr.recent}` }, { label: '6 meses anteriores', value: `${tr.previous}` }, { label: 'p', value: fmtNum(tr.pValue ?? 1, 3) }],
        importance: 'Un mecanismo que crece en todo el portafolio suele tener una causa común.',
        action: `Revisar qué empresas aportan el aumento de ${m.label.toLowerCase()} y si comparten actividad o municipio.`,
        confidence: 'alta',
        eventIds: evts.filter((e) => inPeriod(e, p.recent)).map((e) => e.id),
      });
    }
  }

  /* 5. Gravedad desproporcionada por mecanismo */
  for (const pat of a.patterns.filter((x) => x.kind === 'global' && x.path.some((s) => s.dim === 'careBand')).slice(0, 2)) {
    out.push({
      id: id(), kind: 'gravedad', severity: 'alta',
      title: pat.title,
      finding: pat.explanation,
      evidence: [
        { label: 'Eventos graves', value: `${pat.count} de ${pat.base}` },
        { label: 'Proporción en el mecanismo', value: fmtPct(pat.share, 1) },
        { label: 'Proporción en el portafolio', value: fmtPct(pat.expectedShare, 1) },
        { label: 'Días de incapacidad', value: fmtNum(pat.daysLost) },
      ],
      importance: 'No es el mecanismo más frecuente, pero sí el que más daño causa por evento: merece controles críticos aunque tenga menos casos.',
      action: 'Verificar controles críticos (de ingeniería) en las empresas expuestas a este mecanismo.',
      confidence: pat.confidence,
      eventIds: pat.eventIds,
    });
  }

  /* 6. Trabajadores reincidentes */
  const repeatEvents: string[] = [];
  let repeatWorkers = 0;
  const byWorker = new Map<string, string[]>();
  for (const e of at) if (e.worker) byWorker.set(`${e.company}|${e.worker}`, [...(byWorker.get(`${e.company}|${e.worker}`) ?? []), e.id]);
  for (const ids of byWorker.values()) if (ids.length >= 2) { repeatWorkers++; repeatEvents.push(...ids); }
  if (repeatWorkers >= 3) {
    const cos = new Set(repeatEvents.map((x) => a.byId.get(x)!.company)).size;
    out.push({
      id: id(), kind: 'reincidencia', severity: 'alta',
      title: `${repeatWorkers} trabajadores tuvieron más de un accidente`,
      finding: `Suman ${repeatEvents.length} accidentes (${fmtPct(repeatEvents.length / N, 1)} del total) en ${cos} empresas. Los trabajadores están seudonimizados; la coincidencia se hace por documento cifrado.`,
      evidence: [{ label: 'Trabajadores reincidentes', value: `${repeatWorkers}` }, { label: 'Accidentes que acumulan', value: `${repeatEvents.length}` }, { label: 'Empresas', value: `${cos}` }],
      importance: 'Que la misma persona se accidente de nuevo indica que el primer evento no cambió sus condiciones de trabajo.',
      action: 'Verificar el cierre de las acciones de la investigación del primer evento de cada reincidente.',
      confidence: 'alta',
      eventIds: repeatEvents,
    });
  }

  /* 7. Empresas críticas sin intervención efectiva */
  const gap = list.filter((s) => (s.score.level === 'critico' || s.score.level === 'prioritario') && s.contactGap);
  if (gap.length) {
    out.push({
      id: id(), kind: 'gestion', severity: 'alta',
      title: `${gap.length} empresas en nivel crítico o prioritario sin cita ejecutada en la mayoría de sus eventos`,
      finding: `Son empresas donde el riesgo es alto y la asesoría de SOC no se ha concretado: ${gap.slice(0, 5).map((g) => g.name).join(', ')}${gap.length > 5 ? '…' : ''}.`,
      evidence: gap.slice(0, 6).map((g) => ({ label: g.name, value: `${g.score.score}/100 · ${g.contactStatus ?? 'sin estado'}` })),
      importance: 'Es el punto donde la gestión de SOC tiene más impacto inmediato: el riesgo ya está identificado y falta la intervención.',
      action: 'Escalar el contacto con estas empresas desde la coordinación y agendar la visita con su plan de choque.',
      confidence: 'alta',
      eventIds: gap.flatMap((g) => (a.byCompany.get(g.key) ?? []).filter((e) => !contactDone(e.contactStatus)).map((e) => e.id)),
    });
  }

  /* 8. Picos que cruzan empresas */
  for (const pat of a.patterns.filter((x) => x.kind === 'cross-company').slice(0, 2)) {
    out.push({
      id: id(), kind: 'pico-transversal', severity: 'media',
      title: pat.title,
      finding: pat.explanation,
      evidence: pat.path.map((s) => ({ label: s.dimLabel, value: s.value })),
      importance: 'Cuando el mismo evento aparece a la vez en empresas distintas, la causa suele ser externa o estacional y se puede anticipar el próximo año.',
      action: 'Programar una alerta preventiva para ese mes en las empresas expuestas a este mecanismo.',
      confidence: pat.confidence,
      eventIds: pat.eventIds,
    });
  }

  /* 9. Empresas con aumento repentino */
  const risers = list.filter((s) => s.trend.significant && (s.trend.direction === 'up' || s.trend.direction === 'new') && s.trend.recent >= 4)
    .sort((x, y) => (y.trend.recent - y.trend.previous) - (x.trend.recent - x.trend.previous));
  if (risers.length) {
    out.push({
      id: id(), kind: 'aumento-empresa', severity: 'alta',
      title: `${risers.length} empresa${risers.length > 1 ? 's' : ''} con aumento significativo en el último semestre`,
      finding: risers.slice(0, 5).map((r) => `${r.name}: de ${r.trend.previous} a ${r.trend.recent}`).join('; ') + '.',
      evidence: risers.slice(0, 5).map((r) => ({ label: r.name, value: `${r.trend.previous} → ${r.trend.recent}` })),
      importance: 'Un aumento brusco suele responder a un cambio operativo reciente (más producción, personal nuevo, contratistas).',
      action: 'Investigar el cambio que coincide con el aumento antes de proponer controles genéricos.',
      confidence: 'alta',
      eventIds: risers.flatMap((r) => (a.byCompany.get(r.key) ?? []).filter((e) => inPeriod(e, p.recent)).map((e) => e.id)),
    });
  }

  /* 10. Fines de semana */
  const weekend = at.filter(isWeekend);
  if (weekend.length / N > 0.12) {
    const cos = dist(weekend, (e) => e.company, (k) => a.companyName(k)).filter((d) => d.count >= 3);
    out.push({
      id: id(), kind: 'fin-de-semana', severity: 'baja',
      title: `${fmtPct(weekend.length / N, 0)} de los accidentes ocurre en fin de semana`,
      finding: `${weekend.length} accidentes en sábado o domingo${cos.length ? `; ${cos.length} empresas acumulan 3 o más (${cos.slice(0, 3).map((c) => c.label).join(', ')})` : ''}.`,
      evidence: cos.slice(0, 4).map((c) => ({ label: c.label, value: `${c.count} en fin de semana` })),
      importance: 'Los turnos de fin de semana suelen tener menos supervisión y personal de reemplazo.',
      action: 'Verificar supervisión y personal de los turnos de fin de semana en esas empresas.',
      confidence: 'media',
      eventIds: weekend.map((e) => e.id),
    });
  }

  /* 11. Brecha de información */
  const noInfo = at.filter((e) => !informativeMech(e.mechGroup));
  if (noInfo.length / N > 0.05) {
    const cos = dist(noInfo, (e) => e.company, (k) => a.companyName(k)).slice(0, 4);
    out.push({
      id: id(), kind: 'calidad', severity: 'baja',
      title: `${fmtPct(noInfo.length / N, 1)} de los accidentes no tiene mecanismo útil`,
      finding: `${noInfo.length} eventos reportados como "Sin información" u "Otro". No entran en los patrones por mecanismo.`,
      evidence: cos.map((c) => ({ label: c.label, value: `${c.count} sin mecanismo` })),
      importance: 'Sin mecanismo no se puede saber qué controlar; es una brecha de calidad del reporte FURAT.',
      action: 'Pedir a esas empresas completar la descripción del mecanismo en la investigación del evento.',
      confidence: 'alta',
      eventIds: noInfo.map((e) => e.id),
    });
  }

  /* 12. Oportunidad de la calificación */
  const late = at.filter((e) => e.date && e.qualDate && daysBetween(e.date, e.qualDate) > 30);
  if (late.length >= 5) {
    out.push({
      id: id(), kind: 'oportunidad', severity: 'baja',
      title: `${late.length} accidentes se calificaron más de 30 días después de ocurrir`,
      finding: `La mediana entre ocurrencia y calificación es corta, pero ${late.length} eventos superan 30 días.`,
      evidence: dist(late, (e) => e.company, (k) => a.companyName(k)).slice(0, 4).map((c) => ({ label: c.label, value: `${c.count} tardíos` })),
      importance: 'Un reporte tardío retrasa la investigación y la intervención.',
      action: 'Reforzar con esas empresas el reporte oportuno del accidente.',
      confidence: 'alta',
      eventIds: late.map((e) => e.id),
    });
  }

  /* 13. Enfermedad laboral */
  if (a.el.length) {
    const cos = dist(a.el, (e) => e.company, (k) => a.companyName(k));
    out.push({
      id: id(), kind: 'enfermedad-laboral', severity: 'media',
      title: `${a.el.length} enfermedades laborales calificadas en ${cos.length} empresas`,
      finding: cos.slice(0, 4).map((c) => `${c.label}: ${c.count}`).join('; ') + '.',
      evidence: cos.slice(0, 4).map((c) => ({ label: c.label, value: `${c.count}` })),
      importance: 'Cada enfermedad laboral calificada exige seguimiento del caso y revisión del programa de vigilancia epidemiológica de la empresa.',
      action: 'Verificar que estas empresas tengan activo el programa de vigilancia epidemiológica correspondiente.',
      confidence: 'alta',
      eventIds: a.el.map((e) => e.id),
    });
  }

  /* 14. Mes anómalo en todo el portafolio */
  for (const an of a.globalAnomalies.filter((x) => x.kind === 'spike').slice(0, 1)) {
    out.push({
      id: id(), kind: 'mes-anomalo', severity: 'media',
      title: `${monthLabel(an.month!, true)} fue un mes atípico`,
      finding: an.label,
      evidence: [{ label: 'Eventos', value: `${an.count}` }, { label: 'Esperados', value: fmtNum(an.expected, 1) }, { label: 'p (Poisson)', value: fmtNum(an.pValue, 4) }],
      importance: 'Un mes fuera de lo normal suele tener una causa identificable (temporada, evento masivo, cambio operativo).',
      action: 'Revisar qué empresas y mecanismos aportaron el exceso de ese mes.',
      confidence: 'media',
      eventIds: [],
      filter: { from: `${an.month}-01`, to: `${an.month}-31`, cls: 'AT' },
    });
  }

  const rank = { alta: 0, media: 1, baja: 2 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}
