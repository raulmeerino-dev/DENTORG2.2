import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getPendingAccounts } from "../../../api/accounts";
import { getFacturas, openFacturaPdf } from "../../../api/billing";
import { getRecordPage } from "../../../api/records";
import { getReportKpis } from "../../../api/reporting";
import { getApiErrorMessage } from "../../../api/errors";
import { ToolbarContribution } from "../../../design-system/ToolbarSlots";
import { ContextToolbar } from "../../../design-system/ContextToolbar";
import { StatusChip } from "../../../design-system";
import { formatDate, money } from "../../../shared/format";
import { clinicDate } from "../../../shared/time/clinicTime";
import { PatientCheckout } from "../checkout/PatientCheckout";
import CheckoutQueue from "../../scheduling/workspace/CheckoutQueue";
import "./cash-register.css";

type CashView = "salidas" | "cuentas" | "pagos" | "facturas";

export default function CajaPage() {
  const today = clinicDate(new Date());
  const [view, setView] = useState<CashView>("salidas");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState("todas");
  const [error, setError] = useState("");
  const accounts = useQuery({
    queryKey: ["cuentas-pendientes", search, page],
    queryFn: () => getPendingAccounts(search, page * 50),
    enabled: view === "cuentas",
  });
  const payments = useQuery({
    queryKey: ["registros", "caja-pagos", search, page],
    queryFn: ({ signal }) =>
      getRecordPage(
        "cobros",
        {
          q: search,
          offset: page * 50,
          limit: 50,
          sort_by: "fecha",
          sort_dir: "desc",
        },
        signal,
      ),
    enabled: view === "pagos",
  });
  const invoices = useQuery({
    queryKey: ["caja-facturas"],
    queryFn: ({ signal }) => getFacturas(undefined, signal),
    enabled: view === "facturas",
  });
  const kpis = useQuery({
    queryKey: ["caja-kpis", today],
    queryFn: () => getReportKpis({ fecha_desde: today, fecha_hasta: today }),
  });
  const invoiceRows = (invoices.data ?? []).filter(
    (f) =>
      (invoiceFilter !== "pendientes" ||
        (f.estado !== "anulada" && Number(f.pendiente) > 0)) &&
      (invoiceFilter !== "hoy" || f.fecha.slice(0, 10) === today) &&
      `${f.paciente?.nombre} ${f.paciente?.apellidos} ${f.serie}-${f.numero}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const total =
    view === "cuentas"
      ? (accounts.data?.total ?? 0)
      : view === "pagos"
        ? (payments.data?.total ?? 0)
        : invoiceRows.length;
  const selectedQuery =
    view === "cuentas" ? accounts : view === "pagos" ? payments : invoices;
  return (
    <section className="cash-workspace" aria-label="Caja">
      <ToolbarContribution slot="module">
        <span>Cobros y salida</span>
        <time dateTime={today}>{formatDate(today)}</time>
      </ToolbarContribution>
      <ContextToolbar className="cash-tabs" aria-label="Vistas de caja">
        {(
          [
            ["salidas", "Pendiente de salida"],
            ["cuentas", "Cuentas pendientes"],
            ["pagos", "Pagos"],
            ["facturas", "Facturas"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={view === key ? "active" : ""}
            aria-pressed={view === key}
            onClick={() => {
              setView(key);
              setPage(0);
              setSearch("");
            }}
          >
            {label}
          </button>
        ))}
        {view !== "salidas" && (
          <input
            type="search"
            aria-label="Buscar en caja"
            placeholder="Buscar paciente…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        )}
        {view === "facturas" && (
          <select
            aria-label="Filtrar facturas"
            value={invoiceFilter}
            onChange={(event) => {
              setInvoiceFilter(event.target.value);
              setPage(0);
            }}
          >
            <option value="todas">Todas las facturas</option>
            <option value="pendientes">Pendientes de cobro</option>
            <option value="hoy">Emitidas hoy</option>
          </select>
        )}
      </ContextToolbar>
      <div className="cash-summary" aria-label="Resumen de caja">
        <span>
          Pendiente total{" "}
          <strong>
            {kpis.data ? money(kpis.data.facturacion.pendiente) : "—"}
          </strong>
        </span>
        <span>
          Cobrado hoy{" "}
          <strong>
            {kpis.data ? money(kpis.data.facturacion.total_cobrado) : "—"}
          </strong>
        </span>
        <span>
          Facturado hoy{" "}
          <strong>
            {kpis.data ? money(kpis.data.facturacion.total_facturado) : "—"}
          </strong>
        </span>
      </div>
      {kpis.isError && (
        <p role="alert">
          No se pudo cargar el resumen.{" "}
          <button onClick={() => void kpis.refetch()}>Reintentar</button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div
        className="cash-ledger"
        tabIndex={0}
        role="region"
        aria-label={
          view === "salidas"
            ? "Salidas de caja"
            : "Movimientos y cuentas de caja"
        }
      >
        {view === "salidas" ? (
          <CheckoutQueue />
        ) : (
          <>
            {selectedQuery.isError && (
              <p role="alert">
                No se pudieron cargar los datos.{" "}
                <button onClick={() => void selectedQuery.refetch()}>
                  Reintentar
                </button>
              </p>
            )}
            {selectedQuery.isLoading && <p role="status">Cargando…</p>}
            {view === "cuentas" && (
              <table className="dentcore-table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Historia</th>
                    <th className="num">Cargos</th>
                    <th className="num">Recibido</th>
                    <th className="num">Pendiente</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.data?.items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/pacientes?paciente_id=${a.id}`}>
                          {[a.apellidos, a.nombre].filter(Boolean).join(", ")}
                        </Link>
                        {a.sin_valorar > 0 && (
                          <small> · {a.sin_valorar} por valorar</small>
                        )}
                      </td>
                      <td>{a.num_historial}</td>
                      <td className="num">{money(a.total_cargos)}</td>
                      <td className="num">{money(a.total_cobrado)}</td>
                      <td className="num">{money(a.saldo)}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setCheckoutId(a.id)}
                        >
                          {Number(a.saldo) > 0 ? "Cobrar" : "Revisar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {view === "pagos" && (
              <table className="dentcore-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Paciente</th>
                    <th>Movimiento</th>
                    <th>Forma de pago</th>
                    <th className="num">Importe</th>
                    <th>Estado</th>
                    <th>Cuenta</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data?.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(String(r.cells.fecha ?? ""))}</td>
                      <td>{r.cells.paciente}</td>
                      <td>
                        {r.cells.tipo === "anticipo" ? "Anticipo" : "Cobro"}
                      </td>
                      <td>{r.cells.concepto}</td>
                      <td className="num">
                        {money(Number(r.cells.importe ?? 0))}
                      </td>
                      <td>
                        {r.cells.estado === "anulado"
                          ? "Anulado"
                          : "Registrado"}
                      </td>
                      <td>
                        {r.target?.patient_id && (
                          <button
                            type="button"
                            onClick={() => setCheckoutId(r.target!.patient_id!)}
                          >
                            Ver cuenta
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {view === "facturas" && (
              <table className="dentcore-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Factura</th>
                    <th>Paciente</th>
                    <th className="num">Total</th>
                    <th className="num">Cobrado</th>
                    <th className="num">Pendiente</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.slice(page * 50, (page + 1) * 50).map((f) => (
                    <tr key={f.id}>
                      <td>{formatDate(f.fecha)}</td>
                      <td>
                        {f.serie}-{f.numero}
                      </td>
                      <td>
                        <Link to={`/pacientes?paciente_id=${f.paciente_id}`}>
                          {f.paciente?.apellidos}, {f.paciente?.nombre}
                        </Link>
                      </td>
                      <td className="num">{money(f.total)}</td>
                      <td className="num">{money(f.total_cobrado)}</td>
                      <td className="num">{money(f.pendiente)}</td>
                      <td>
                        <StatusChip
                          tone={
                            f.estado === "pagada"
                              ? "success"
                              : f.estado === "anulada"
                                ? "neutral"
                                : "warning"
                          }
                        >
                          {f.estado}
                        </StatusChip>
                      </td>
                      <td>
                        <button onClick={() => setCheckoutId(f.paciente_id)}>
                          Ver cuenta / cobrar
                        </button>{" "}
                        <button
                          onClick={() =>
                            void openFacturaPdf(f.id).catch((e) =>
                              setError(
                                getApiErrorMessage(
                                  e,
                                  "No se pudo abrir la factura.",
                                ),
                              ),
                            )
                          }
                        >
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!selectedQuery.isLoading &&
              !selectedQuery.isError &&
              total === 0 && (
                <p className="cash-empty">
                  {view === "cuentas"
                    ? "No hay cuentas pendientes en esta búsqueda."
                    : "Sin movimientos en este filtro."}
                </p>
              )}
          </>
        )}
      </div>
      {view !== "salidas" && (
        <footer className="cash-pagination">
          <span>{total} resultados</span>
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <button
            disabled={(page + 1) * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </footer>
      )}
      {checkoutId && (
        <PatientCheckout
          patientId={checkoutId}
          onClose={() => setCheckoutId(null)}
        />
      )}
    </section>
  );
}
