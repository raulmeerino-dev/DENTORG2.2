import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientAccount } from "../../../api/accounts";
import { PatientCheckout } from "./PatientCheckout";

const api = vi.hoisted(() => ({
  account: vi.fn(),
  checkout: vi.fn(),
  invoice: vi.fn(),
  value: vi.fn(),
}));
vi.mock("../../../api/accounts", () => ({
  getPatientAccount: api.account,
  confirmCheckout: api.checkout,
  invoiceCharges: api.invoice,
  valueCharge: api.value,
}));
vi.mock("../../../api/billing", () => ({
  getFormasPago: async () => [{ id: "card", nombre: "Tarjeta" }],
  openFacturaPdf: vi.fn(),
}));
vi.mock("../../identity/session/AuthContext", () => ({
  useAuth: () => ({ user: { id: "reception", rol: "recepcion" } }),
}));
const account: PatientAccount = {
  paciente_id: "p1",
  paciente_nombre: "Paciente de prueba",
  version: "v1",
  cargos: [
    {
      id: "c1",
      historial_id: "h1",
      factura_id: null,
      cita_id: "visit",
      doctor_id: "d1",
      concepto: "Obturación",
      fecha: "2026-09-25",
      pieza_dental: 36,
      caras: "O",
      importe: "140",
      cobrado: "0",
      pendiente: "140",
      motivo_cero: null,
      origen: "tratamiento",
    },
  ],
  movimientos: [],
  total_cargos: "140",
  total_cobrado: "0",
  pendiente_cargos: "140",
  saldo_favor: "0",
  saldo: "140",
  realizado_hoy: "140",
  saldo_anterior: "0",
  sin_valorar: 0,
  cita_id: "visit",
  doctor_id: "d1",
  gabinete_id: null,
  pendiente_salida: true,
};
function setup(leavePending = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <PatientCheckout
        patientId="p1"
        citaId="visit"
        leavePending={leavePending}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("Patient checkout independent of invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    api.account.mockResolvedValue(account);
    api.checkout.mockResolvedValue({
      operacion_id: "o1",
      cobro_id: "pay1",
      importe_recibido: "50",
      saldo_aplicado: "0",
      saldo_pendiente: "90",
      salida_resuelta: true,
    });
  });
  it("collects a partial payment and leaves the invoice as an explicit separate action", async () => {
    const user = userEvent.setup();
    setup();
    const input = await screen.findByLabelText("Importe a cobrar (€)");
    await user.clear(input);
    await user.type(input, "50");
    await user.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
    await screen.findByText("Salida resuelta");
    expect(api.checkout).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({
        importe: "50.00",
        forma_pago_id: "card",
        cita_id: "visit",
        resolver_salida: true,
      }),
    );
    expect(api.invoice).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("dentcore-checkout:reception:p1")).toBeNull();
  });
  it("leaves a visit pending without inventing a payment, also when applying advance credit", async () => {
    api.account.mockResolvedValue({
      ...account,
      saldo_favor: "40",
      saldo: "100",
    });
    const user = userEvent.setup();
    setup(true);
    await user.click(
      await screen.findByRole("checkbox", { name: /Aplicar saldo a favor/ }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /Confirmar salida y dejar pendiente/,
      }),
    );
    await waitFor(() =>
      expect(api.checkout).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          importe: "0.00",
          forma_pago_id: null,
          usar_saldo_favor: true,
        }),
      ),
    );
  });
  it("reuses the exact operation after a lost response and after remounting", async () => {
    api.checkout.mockRejectedValueOnce(new Error("Conexión interrumpida"));
    const user = userEvent.setup();
    const mounted = setup();
    await user.click(
      await screen.findByRole("button", { name: /Confirmar cobro/ }),
    );
    const pending = api.checkout.mock.calls[0][1];
    expect(
      JSON.parse(sessionStorage.getItem("dentcore-checkout:reception:p1")!),
    ).toEqual(pending);
    mounted.unmount();
    setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Verificar / reintentar operación",
      }),
    );
    await screen.findByText("Salida resuelta");
    expect(api.checkout.mock.calls[1][1]).toEqual(pending);
    expect(api.checkout).toHaveBeenCalledTimes(2);
  });
  it("blocks overpayment and prevents duplicate clicks during submission", async () => {
    let resolve!: (value: unknown) => void;
    api.checkout.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const user = userEvent.setup();
    setup();
    const input = await screen.findByLabelText("Importe a cobrar (€)");
    await user.clear(input);
    await user.type(input, "141");
    expect(
      screen.getByRole("button", { name: /Confirmar cobro/ }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cobrar todo" }));
    await user.dblClick(
      screen.getByRole("button", { name: /Confirmar cobro/ }),
    );
    expect(api.checkout).toHaveBeenCalledTimes(1);
    resolve({
      operacion_id: "o1",
      importe_recibido: "140",
      saldo_aplicado: "0",
      saldo_pendiente: "0",
      salida_resuelta: true,
    });
    await screen.findByText("Salida resuelta");
  });
});
