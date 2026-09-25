import type {
  Cita,
  Consentimiento,
  DocumentoPaciente,
  Factura,
  HistorialClinico,
  NotaDental,
  PagoAnticipadoPaciente,
  Presupuesto,
} from '../../../api/types';
import { getVisualStatus } from '../../scheduling/agenda/appointmentStatus';
import { isClinicalNote } from '../../clinical/history/clinicalNotes';
import { clinicDateKey, clinicTime } from '../../../shared/time/clinicTime';
import type { AccountMovement, PatientAccount } from '../../../api/accounts';
import { money } from '../../../shared/format';

export type HistoryFilter = 'todo' | 'clinico' | 'visitas' | 'facturacion' | 'cobros';
export type HistoryTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';
export interface HistoryData {
  historial: HistorialClinico[];
  citas: Cita[];
  presupuestos: Presupuesto[];
  facturas: Factura[];
  anticipos: PagoAnticipadoPaciente[];
  documentos: DocumentoPaciente[];
  consentimientos: Consentimiento[];
  notasDentales: NotaDental[];
  account?: PatientAccount;
}
export interface HistoryRow {
  id: string;
  recordId: string;
  date: string;
  day: string;
  group: HistoryFilter;
  type: string;
  concept: string;
  pieces: number[];
  professional?: string;
  professionalId?: string | null;
  status?: string;
  tone: HistoryTone;
  observation?: string | null;
  invoice?: Factura;
  relatedInvoices?: Factura[];
  payment?: AccountMovement;
  amount?: string | number | null;
  paid?: string | number | null;
  balance?: string | number | null;
  fields: { label: string; value: string }[];
  visit?: Cita;
  treatment?: HistorialClinico;
  budget?: Presupuesto;
  search: string;
}
export const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'clinico', label: 'Tratamientos' },
  { id: 'visitas', label: 'Visitas clínicas' },
  { id: 'facturacion', label: 'Facturación' },
  { id: 'cobros', label: 'Cobros' },
];
export function normalizeHistoryText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}
export function historyStatus(value?: string | null): { status?: string; tone: HistoryTone } {
  if (!value) return { tone: 'neutral' };
  const label = value.replace(/_/g, ' ');
  const tone = ['anulado', 'anulada', 'cancelada', 'revocado', 'rechazada', 'no_presentado'].includes(value)
    ? 'danger'
    : [
          'realizado',
          'cobrada',
          'cobrado',
          'pagada',
          'firmado',
          'finalizada',
          'recibido',
          'entregado',
          'aceptado',
        ].includes(value)
      ? 'success'
      : [
            'pendiente',
            'pendiente_firma',
            'pendiente_validacion',
            'presentado',
            'parcial',
            'cobrado_parcial',
            'enviado',
          ].includes(value)
        ? 'warning'
        : ['confirmada', 'programada', 'en_sala', 'en_atencion', 'emitida', 'emitida_local'].includes(value)
          ? 'info'
          : 'neutral';
  return { status: label.charAt(0).toUpperCase() + label.slice(1), tone };
}
function details(values: Record<string, string | number | null | undefined>) {
  return Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => ({ label, value: String(value) }));
}
const piecesOf = (values: (number | null | undefined)[]) =>
  [...new Set(values.filter((v): v is number => Boolean(v)))].sort((a, b) => a - b);
const invoiceLabel = (invoice?: Factura) => (invoice ? `${invoice.serie}/${invoice.numero}` : '');

/** The clinical history table stores actual procedures, not odontogram revisions. */
export function isPerformedTreatment(treatment: HistorialClinico) {
  // Legacy economic states still represent the same performed clinical act.
  return ['realizado', 'facturado', 'cobrado_parcial', 'cobrado_completo'].includes(treatment.estado)
    && Boolean(treatment.tratamiento_id);
}
/** Appointment status/administrative observations alone do not establish a clinical act. */
export function isClinicalVisit(
  visit: Cita,
  data: Pick<HistoryData, 'historial' | 'notasDentales'>,
  now = Date.now(),
) {
  if (Date.parse(visit.fecha_hora) > now || ['cancelada', 'no_presentado'].includes(getVisualStatus(visit)))
    return false;
  return (
    data.historial.some((t) => t.cita_id === visit.id && isPerformedTreatment(t)) ||
    data.notasDentales.some((n) => n.cita_id === visit.id && isClinicalNote(n))
  );
}

/** One row per real record. Amounts are never allocated or inferred across invoice lines. */
export function buildHistoryRows(
  data: HistoryData,
  billing: boolean,
  professionals: { id: string; nombre: string }[] = [],
): HistoryRow[] {
  const rows: HistoryRow[] = [];
  const doctors = new Map(professionals.map((p) => [p.id, p.nombre]));
  [...data.historial, ...data.citas, ...data.notasDentales].forEach((item) => {
    if (item.doctor?.nombre && item.doctor_id) doctors.set(item.doctor_id, item.doctor.nombre);
  });
  const invoices = new Map((billing ? data.facturas : []).map((f) => [f.id, f]));
  const charges = new Map((billing ? data.account?.cargos ?? [] : []).map((c) => [c.historial_id, c]));
  type Input = Omit<HistoryRow, 'day' | 'search' | 'pieces' | 'tone' | 'fields'> &
    Partial<Pick<HistoryRow, 'pieces' | 'tone' | 'fields'>>;
  function add(row: Input) {
    const result: HistoryRow = {
      tone: 'neutral',
      pieces: [],
      fields: [],
      ...row,
      professional: row.professional || (row.professionalId ? doctors.get(row.professionalId) : undefined),
      day: clinicDateKey(row.date),
      search: '',
    };
    if (!billing) {
      delete result.amount;
      delete result.paid;
      delete result.balance;
      delete result.invoice;
    }
    result.search = normalizeHistoryText(
      [
        result.concept,
        result.type,
        result.pieces.map((piece) => `pieza ${piece}`).join(' '),
        result.professional,
        result.status,
        result.observation,
        invoiceLabel(result.invoice),
        ...result.fields.map((f) => f.value),
      ]
        .filter(Boolean)
        .join(' '),
    );
    rows.push(result);
  }
  data.historial.filter(isPerformedTreatment).forEach((t) => {
    const charge = charges.get(t.id);
    const budget = data.presupuestos.find((b) => b.lineas.some((l) => l.id === t.presupuesto_linea_id));
    add({
      id: `hist-${t.id}`,
      recordId: t.id,
      date: t.fecha,
      group: 'clinico',
      type: 'Tratamiento',
      concept: t.procedimiento || t.tratamiento?.nombre || 'Tratamiento dental',
      pieces: piecesOf([t.pieza_dental]),
      professionalId: t.doctor_id,
      ...historyStatus('realizado'),
      observation:
        [
          t.observaciones,
          ...data.notasDentales
            .filter((n) => n.historial_id === t.id && isClinicalNote(n))
            .map((n) => n.texto),
        ]
          .filter(Boolean)
          .join('\n') || null,
      amount: charge ? charge.importe : t.importe,
      paid: charge?.cobrado,
      balance: charge?.importe != null ? charge.pendiente : undefined,
      invoice: invoices.get(charge?.factura_id || t.factura_id || ''),
      treatment: t,
      budget,
      fields: details({
        Tratamiento: t.tratamiento?.nombre,
        Superficies: t.caras,
        'Diagnóstico registrado': t.diagnostico,
        Procedimiento: t.procedimiento,
        Presupuesto: budget ? `#${budget.numero}` : undefined,
      }),
    });
  });
  data.citas
    .filter((c) => isClinicalVisit(c, data))
    .forEach((c) => {
      const treatments = data.historial.filter((t) => t.cita_id === c.id && isPerformedTreatment(t));
      const notes = data.notasDentales.filter((n) => n.cita_id === c.id && isClinicalNote(n));
      add({
        id: `cita-${c.id}`,
        recordId: c.id,
        date: c.fecha_hora,
        group: 'visitas',
        type: 'Visita clínica',
        concept: c.motivo || 'Actuación clínica',
        professionalId: c.doctor_id,
        ...historyStatus(getVisualStatus(c)),
        status: treatments.length ? `${treatments.length} tratamientos` : 'Nota clínica',
        observation: notes.map((n) => n.texto).join('\n') || null,
        visit: c,
        pieces: piecesOf([...treatments, ...notes].map((t) => t.pieza_dental)),
        fields: details({
          Hora: clinicTime(c.fecha_hora),
          Duración: `${c.duracion_min} min`,
          Gabinete: c.gabinete_nombre,
          'Tratamientos realizados': treatments
            .map((t) => t.procedimiento || t.tratamiento?.nombre)
            .filter(Boolean)
            .join(' · '),
        }),
      });
    });
  if (billing) {
    const seenPayments = new Set<string>();
    data.facturas
      .filter((f) => f.estado !== 'borrador')
      .forEach((f) => {
        add({
          id: `fac-${f.id}`,
          recordId: f.id,
          date: f.fecha,
          group: 'facturacion',
          type: f.es_rectificativa ? 'Rectificativa' : 'Factura',
          concept: f.lineas.map((l) => l.concepto).join(' · ') || `Factura ${invoiceLabel(f)}`,
          ...historyStatus(f.estado),
          invoice: f,
          amount: f.total,
          paid: f.total_cobrado,
          balance: f.estado === 'anulada' ? '0' : f.pendiente,
          observation: f.observaciones,
          fields: details({
            Conceptos: f.lineas.map((l) => `${l.cantidad} × ${l.concepto}`).join('\n'),
            'Rectifica a': invoiceLabel(invoices.get(f.factura_rectificada_id || '')),
          }),
        });
        if (!data.account) f.cobros.forEach((c) => {
          if (seenPayments.has(c.id) || data.anticipos.some((a) => a.id === c.id)) return;
          seenPayments.add(c.id);
          add({
            id: `cobro-${c.id}`,
            recordId: c.id,
            date: c.fecha,
            group: 'cobros',
            type: Number(c.importe) < 0 ? 'Devolución' : 'Cobro',
            concept: c.forma_pago?.nombre || 'Pago registrado',
            ...historyStatus(c.anulado_at ? 'anulado' : 'cobrado'),
            invoice: f,
            amount: c.importe,
            paid: c.anulado_at ? '0' : c.importe,
            observation: c.motivo_anulacion || c.notas,
            fields: details({
              Anulación: c.anulado_at ? clinicDateKey(c.anulado_at) : null,
              Notas: c.motivo_anulacion ? c.notas : null,
            }),
          });
        });
      });
    if (data.account) data.account.movimientos.forEach((m) => {
      const related = data.facturas.filter((f) => f.id === m.factura_id || f.cobros.some((c) => c.id === m.id));
      add({
        id: `${m.tipo}-${m.id}`,
        recordId: m.id,
        date: m.fecha,
        group: 'cobros',
        type: m.tipo === 'anticipo' ? 'Anticipo' : 'Cobro',
        concept: m.concepto || m.forma_pago || 'Pago registrado',
        ...historyStatus(m.anulado ? 'anulado' : 'cobrado'),
        invoice: related.length === 1 ? related[0] : undefined,
        relatedInvoices: related,
        payment: m,
        amount: m.importe,
        paid: m.anulado ? '0' : m.importe,
        observation: m.motivo_anulacion || m.notas,
        fields: details({
          'Forma de pago': m.forma_pago,
          'Aplicado a tratamientos': `${money(m.aplicado)} €`,
          Facturas: related.length > 1 ? related.map(invoiceLabel).join(' · ') : related.length ? null : 'Sin factura asociada',
          Notas: m.motivo_anulacion ? m.notas : null,
        }),
      });
    });
    else data.anticipos.forEach((a) =>
      add({
        id: `anticipo-${a.id}`,
        recordId: a.id,
        date: a.fecha,
        group: 'cobros',
        type: 'Anticipo',
        concept: a.concepto || 'Pago anticipado',
        ...historyStatus(a.anulado_at ? 'anulado' : 'cobrado'),
        amount: a.importe,
        paid: a.anulado_at ? '0' : a.importe,
        observation: a.motivo_anulacion || a.notas,
        fields: details({
          'Forma de pago': a.forma_pago?.nombre,
          Aplicación: 'A cuenta del paciente; sin factura vinculada',
          Anulación: a.anulado_at ? clinicDateKey(a.anulado_at) : null,
          Notas: a.motivo_anulacion ? a.notas : null,
        }),
      }),
    );
  }
  return rows;
}
export interface HistoryQuery {
  group: HistoryFilter;
  search: string;
  from: string;
  to: string;
  professional: string;
  state: string;
  piece: string;
  order: 'desc' | 'asc';
}
export function filterHistoryRows(rows: HistoryRow[], query: HistoryQuery) {
  const terms = normalizeHistoryText(query.search.trim()).split(/\s+/).filter(Boolean);
  return rows
    .filter(
      (r) =>
        (query.group === 'todo' || r.group === query.group) &&
        (!query.from || r.day >= query.from) &&
        (!query.to || (Boolean(r.day) && r.day <= query.to)) &&
        (!query.professional || r.professionalId === query.professional) &&
        (!query.state || r.status === query.state) &&
        (!query.piece || r.pieces.includes(Number(query.piece))) &&
        terms.every((term) => r.search.includes(term)),
    )
    .sort((a, b) => {
      // Keep undated records last in both directions. Offset timestamps sort as instants.
      if (!a.day || !b.day) return a.day ? -1 : b.day ? 1 : a.id.localeCompare(b.id);
      const time = (value: HistoryRow) =>
        value.date.includes('T') ? Date.parse(value.date) || 0 : Date.parse(`${value.day}T00:00:00`);
      const comparison = a.day.localeCompare(b.day) || time(a) - time(b) || a.id.localeCompare(b.id);
      return query.order === 'asc' ? comparison : -comparison;
    });
}
