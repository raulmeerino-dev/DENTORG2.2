import { openPaymentReceipt } from '../../../api/billing';
import { useState } from "react";
import {
  cancelAccountPayment,
  type PatientAccount,
} from "../../../api/accounts";
import { getApiErrorMessage } from "../../../api/errors";
import { formatDate, money } from "../../../shared/format";
import { useAuth } from "../../identity/session/AuthContext";

export function AccountMovements({
  account,
  onChanged,
  onBusy,
}: {
  account: PatientAccount;
  onChanged: () => Promise<unknown>;
  onBusy: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!account.movimientos.length) return null;
  async function cancel() {
    if (!selected || busy || reason.trim().length < 3) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await cancelAccountPayment(account.paciente_id, selected, reason.trim());
      setSelected(null);
      setReason("");
      await onChanged();
    } catch (e) {
      setError(getApiErrorMessage(e, "No se pudo anular el cobro."));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <details className="checkout-movements">
      <summary>Pagos y anticipos ({account.movimientos.length})</summary>
      <div
        className="checkout-charges"
        role="region"
        aria-label="Movimientos de la cuenta"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Movimiento</th>
              <th>Importe</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {account.movimientos.map((m) => (
              <tr key={m.id}>
                <td>{formatDate(m.fecha)}</td>
                <td>
                  {m.tipo === "anticipo" ? "Anticipo" : "Cobro"} ·{" "}
                  {m.forma_pago}
                </td>
                <td>{money(m.importe)}</td>
                <td>{m.anulado ? "Anulado" : "Registrado"}</td>
                <td>
                  {m.tipo === "cobro" && <button type="button" onClick={() => void openPaymentReceipt(m.id).catch(e => setError(getApiErrorMessage(e, "No se pudo abrir el recibo.")))}>Recibo</button>}
                  {!m.anulado &&
                    m.tipo === "cobro" &&
                    user?.rol === "admin" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSelected(m.id);
                          setReason("");
                        }}
                      >
                        Anular cobro
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="checkout-valuation">
          <p>
            Se anulará el pago completo de{" "}
            {money(
              account.movimientos.find((m) => m.id === selected)?.importe ?? 0,
            )}{" "}
            y volverá a quedar pendiente su importe aplicado. El registro
            original se conserva.
          </p>
          <label>
            Motivo de la anulación
            <input
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Cancelar
            </button>{" "}
            <button
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void cancel()}
            >
              Confirmar anulación
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
