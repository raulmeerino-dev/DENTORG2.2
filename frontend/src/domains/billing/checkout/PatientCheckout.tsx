import { AccountMovements } from "./AccountMovements";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { X } from "lucide-react";
import {
  confirmCheckout,
  getPatientAccount,
  invoiceCharges,
  valueCharge,
  type CheckoutInput,
  type CheckoutReceipt,
  type PatientAccount,
  type PatientCharge,
} from "../../../api/accounts";
import { getFormasPago, openFacturaPdf, openPaymentReceipt } from "../../../api/billing";
import { getApiErrorMessage } from "../../../api/errors";
import type { Factura } from "../../../api/types";
import { Dialog } from "../../../design-system/Dialog";
import { money } from "../../../shared/format";
import { invalidatePatientWorkspaceQueries } from "../../../shared/query/queryInvalidation";
import { useAuth } from "../../identity/session/AuthContext";
import "./checkout.css";

function UnvaluedCharge({
  charge,
  patientId,
  onValued,
}: {
  charge: PatientCharge;
  patientId: string;
  onValued: () => void;
}) {
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="checkout-valuation">
      <strong>{charge.concepto} · Importe histórico sin registrar</strong>
      <label>
        Base sin IVA (€)
        <input
          value={amount}
          type="number"
          min="0"
          step="0.01"
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label>
        Motivo de la valoración
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button
        className="btn btn-secondary"
        disabled={
          busy ||
          amount === "" ||
          Number(amount) < 0 ||
          reason.trim().length < 3
        }
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await valueCharge(patientId, charge.id, amount, reason);
            onValued();
          } catch (e) {
            setError(getApiErrorMessage(e, "No se pudo valorar el cargo."));
          } finally {
            setBusy(false);
          }
        }}
      >
        Guardar valoración
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function PatientCheckout({
  patientId,
  citaId,
  leavePending = false,
  onClose,
}: {
  patientId: string;
  citaId?: string | null;
  leavePending?: boolean;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["cuenta-paciente", patientId, citaId ?? ""],
    queryFn: () => getPatientAccount(patientId, citaId),
    refetchOnWindowFocus: false,
  });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      label="Cobro y salida"
      className="dc-checkout"
      onClose={onClose}
      closeDisabled={busy}
    >
      <header className="dc-checkout-header">
        <div>
          <strong>
            {leavePending ? "Dejar saldo pendiente" : "Cobro y salida"}
          </strong>
          <span>{query.data?.paciente_nombre || "Cuenta del paciente"}</span>
        </div>
        <button
          type="button"
          className="btn-icon"
          aria-label="Cerrar checkout"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {query.isPending ? (
        <p role="status">Cargando cuenta…</p>
      ) : query.isError ? (
        <p role="alert">
          No se pudo cargar la cuenta.{" "}
          <button onClick={() => void query.refetch()}>Reintentar</button>
        </p>
      ) : (
        <CheckoutForm
          account={query.data}
          leavePending={leavePending}
          onBusy={setBusy}
          onRefresh={async () => (await query.refetch()).data}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function CheckoutForm({
  account,
  leavePending,
  onBusy,
  onRefresh,
  onClose,
}: {
  account: PatientAccount;
  leavePending: boolean;
  onBusy: (busy: boolean) => void;
  onRefresh: () => Promise<PatientAccount | undefined>;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const storageKey = `dentcore-checkout:${user?.id}:${account.paciente_id}`;
  const [stored] = useState<CheckoutInput | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  });
  const request = useRef<CheckoutInput | null>(stored);
  const lock = useRef(false);
  const [uncertain, setUncertain] = useState(Boolean(stored));
  const [useCredit, setUseCredit] = useState(!leavePending);
  const credit = useCredit
    ? Math.min(Number(account.saldo_favor), Number(account.pendiente_cargos))
    : 0;
  const maximum = Math.max(0, Number(account.pendiente_cargos) - credit);
  const [amount, setAmount] = useState(leavePending ? "0" : String(maximum));
  const [methodId, setMethodId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null),
    [invoice, setInvoice] = useState<Factura | null>(null);
  const [invoiceRequest, setInvoiceRequest] = useState<{ id: string; cargos: string[] } | null>(null);
  const methods = useQuery({
    queryKey: ["formas-pago"],
    queryFn: getFormasPago,
  });
  const selectedMethod = methodId || methods.data?.[0]?.id || "";
  const number = Number(amount.replace(",", "."));
  const valid =
    Number.isFinite(number) &&
    number >= 0 &&
    number <= maximum &&
    (number === 0 || selectedMethod);
  const visible = account.cargos.filter(
    (c) =>
      Number(c.pendiente) > 0 ||
      c.importe === null ||
      (c.cita_id === account.cita_id && Boolean(account.cita_id)),
  );
  const uninvoiced = account.cargos.filter(
    (c) => !c.factura_id && c.importe !== null,
  );
  function storeRequest(payload: CheckoutInput | null) {
    try {
      if (payload) sessionStorage.setItem(storageKey, JSON.stringify(payload));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* Server idempotency still protects retries in this dialog. */
    }
  }
  async function refresh() {
    request.current = null;
    setUncertain(false);
    storeRequest(null);
    const fresh = await onRefresh();
    if (fresh)
      setAmount(
        leavePending
          ? "0"
          : Math.max(
              0,
              Number(fresh.pendiente_cargos) -
                (useCredit ? Number(fresh.saldo_favor) : 0),
            ).toFixed(2),
      );
    setError("");
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    const payload = request.current || {
      request_id: crypto.randomUUID(),
      version: account.version,
      importe: number.toFixed(2),
      forma_pago_id: number > 0 ? selectedMethod : null,
      usar_saldo_favor: useCredit,
      cita_id: account.cita_id,
      resolver_salida: account.pendiente_salida,
    };
    request.current = payload;
    try {
      storeRequest(payload);
      const result = await confirmCheckout(account.paciente_id, payload);
      setReceipt(result);
      setUncertain(false);
      request.current = null;
      storeRequest(null);
      invalidatePatientWorkspaceQueries(queries, account.paciente_id);
      await onRefresh();
    } catch (e) {
      if (
        isAxiosError(e) &&
        e.response &&
        e.response.status >= 400 &&
        e.response.status < 500
      ) {
        request.current = null;
        storeRequest(null);
        setUncertain(false);
      } else setUncertain(true);
      setError(
        getApiErrorMessage(
          e,
          "No se pudo verificar el resultado. Reintenta la misma operación; no duplicará el cobro.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  async function issueInvoice() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const attempt = invoiceRequest ?? { id: crypto.randomUUID(), cargos: uninvoiced.map(c => c.id) };
      setInvoiceRequest(attempt);
      setInvoice(await invoiceCharges(account.paciente_id, attempt.cargos, attempt.id));
      invalidatePatientWorkspaceQueries(queries, account.paciente_id);
      await onRefresh();
    } catch (e) {
      setError(
        getApiErrorMessage(
          e,
          "No se pudo emitir la factura. El cobro ya registrado se conserva.",
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <>
      <div className="dc-checkout-body">
        {receipt ? (
          <div className="checkout-result" role="status">
            <strong>
              {receipt.salida_resuelta
                ? "Salida resuelta"
                : "Operación registrada"}
            </strong>
            <span>
              Recibido: {money(receipt.importe_recibido)} · Saldo aplicado:{" "}
              {money(receipt.saldo_aplicado)}
            </span>
            {receipt.cobro_id && <button type="button" className="btn btn-secondary" onClick={() => void openPaymentReceipt(receipt.cobro_id!).catch(e => setError(getApiErrorMessage(e, "No se pudo abrir el recibo.")))}>Abrir recibo</button>}
            <b>
              Pendiente: {money(Math.max(0, Number(receipt.saldo_pendiente)))}
            </b>
          </div>
        ) : (
          <>
            <div
              className="checkout-charges"
              tabIndex={0}
              role="region"
              aria-label="Tratamientos y cargos"
            >
              <table>
                <thead>
                  <tr>
                    <th>Tratamiento / cargo</th>
                    <th>Pieza</th>
                    <th>Importe</th>
                    <th>Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.concepto}
                        <small>
                          {c.fecha}
                          {c.factura_id ? " · Con factura" : " · Sin factura"}
                          {c.motivo_cero ? ` · ${c.motivo_cero}` : ""}
                        </small>
                      </td>
                      <td>
                        {c.pieza_dental || "—"} {c.caras}
                      </td>
                      <td>
                        {c.importe === null ? "Sin valorar" : money(c.importe)}
                      </td>
                      <td>{c.importe === null ? "—" : money(c.pendiente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && <p>Sin cargos pendientes.</p>}
            </div>
            <dl className="checkout-totals">
              <div>
                <dt>
                  {account.cita_id
                    ? "Realizado en esta visita"
                    : "Realizado hoy"}
                </dt>
                <dd>{money(account.realizado_hoy)}</dd>
              </div>
              <div>
                <dt>Pendiente anterior</dt>
                <dd>{money(account.saldo_anterior)}</dd>
              </div>
              <div>
                <dt>Total pendiente de aplicar</dt>
                <dd>{money(account.pendiente_cargos)}</dd>
              </div>
              {Number(account.saldo_favor) > 0 && (
                <div>
                  <dt>Saldo a favor disponible</dt>
                  <dd>{money(account.saldo_favor)}</dd>
                </div>
              )}
            </dl>
            {account.sin_valorar > 0 && (
              <div className="checkout-warning">
                Hay {account.sin_valorar} cargos históricos sin precio
                registrado. Revísalos; no están incluidos en el total.
                {account.cargos
                  .filter((c) => c.importe === null)
                  .map((c) => (
                    <UnvaluedCharge
                      key={c.id}
                      charge={c}
                      patientId={account.paciente_id}
                      onValued={() => {
                        invalidatePatientWorkspaceQueries(
                          queries,
                          account.paciente_id,
                        );
                        void onRefresh();
                      }}
                    />
                  ))}
              </div>
            )}
            <fieldset className="checkout-payment" disabled={busy || uncertain}>
              <legend>
                {leavePending ? "Salida sin cobro" : "Registrar pago"}
              </legend>
              {Number(account.saldo_favor) > 0 && (
                <label className="checkout-credit">
                  <input
                    type="checkbox"
                    checked={useCredit}
                    onChange={(event) => {
                      setUseCredit(event.target.checked);
                      setAmount(
                        leavePending
                          ? "0"
                          : String(
                              Math.max(
                                0,
                                Number(account.pendiente_cargos) -
                                  (event.target.checked
                                    ? Number(account.saldo_favor)
                                    : 0),
                              ),
                            ),
                      );
                    }}
                  />{" "}
                  Aplicar saldo a favor ({money(credit)})
                </label>
              )}
              {!leavePending && (
                <>
                  <label>
                    Importe a cobrar (€)
                    <input
                      aria-label="Importe a cobrar (€)"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </label>
                  <label>
                    Forma de pago
                    <select
                      value={selectedMethod}
                      onChange={(event) => setMethodId(event.target.value)}
                    >
                      <option value="">Seleccionar…</option>
                      {methods.data?.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setAmount(maximum.toFixed(2))}
                  >
                    Cobrar todo
                  </button>
                </>
              )}
              <p>
                Quedará pendiente:{" "}
                <strong>
                  {money(
                    Math.max(
                      0,
                      maximum - (Number.isFinite(number) ? number : 0),
                    ),
                  )}
                </strong>
              </p>
            </fieldset>
            {methods.isError && !leavePending && (
              <p role="alert">
                No se pudieron cargar las formas de pago.{" "}
                <button onClick={() => void methods.refetch()}>
                  Reintentar
                </button>
              </p>
            )}
          </>
        )}
        {!receipt && !uncertain && (
          <AccountMovements
            account={account}
            onChanged={async () => {
              invalidatePatientWorkspaceQueries(queries, account.paciente_id);
              await refresh();
            }}
            onBusy={(value) => {
              setBusy(value);
              onBusy(value);
            }}
          />
        )}
        {uncertain && (
          <p role="alert">
            Hay una operación pendiente de verificar. Reintenta para recuperar
            su resultado sin duplicarla.
          </p>
        )}
        {error && (
          <p role="alert" className="checkout-error">
            {error}
            {!uncertain && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
              >
                Actualizar cuenta
              </button>
            )}
          </p>
        )}
        {!uncertain &&
          !invoice &&
          (uninvoiced.length > 0 || invoiceRequest) && (
            <details className="checkout-invoice" open={Boolean(receipt)}>
              <summary>Documentación económica</summary>
              <p>
                {receipt ? "El pago ya está registrado. " : ""}Puedes emitir la
                factura de los cargos sin documentar. La emisión conserva el
                saldo actual.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void issueInvoice()}
              >
                Emitir factura ·{" "}
                {money(
                  uninvoiced.reduce((sum, c) => sum + Number(c.importe), 0),
                )}
              </button>
            </details>
          )}
        {invoice && (
          <div className="checkout-invoice">
            <strong>
              Factura {invoice.serie}-{invoice.numero} emitida
            </strong>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                void openFacturaPdf(invoice.id).catch((e) =>
                  setError(getApiErrorMessage(e, "No se pudo abrir el PDF.")),
                )
              }
            >
              Abrir factura
            </button>
          </div>
        )}
      </div>
      <footer className="dc-checkout-footer">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={onClose}
        >
          {receipt ? "Terminar" : "Cerrar"}
        </button>
        {!receipt && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              busy ||
              (!uncertain &&
                (!valid ||
                  (number === 0 && credit === 0 && !account.pendiente_salida)))
            }
            onClick={() => void submit()}
          >
            {busy
              ? "Registrando…"
              : uncertain
                ? "Verificar / reintentar operación"
                : leavePending
                  ? "Confirmar salida y dejar pendiente"
                  : number > 0
                    ? `Confirmar cobro de ${money(number)}`
                    : credit > 0
                      ? "Aplicar saldo y confirmar"
                      : "Confirmar salida sin cobro"}
          </button>
        )}
      </footer>
    </>
  );
}
