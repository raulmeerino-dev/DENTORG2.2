import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  api,
  confirmarPortalCita,
  createClinica,
  createOdontogramaPaciente,
  createProductoInventario,
  createPresupuestoFromOdontograma,
  duplicateOdontogramaVersion,
  saveOdontograma,
  updateHorarioDoctor,
  updateOdontogramaPieza,
  updateOdontogramaSuperficie,
} from './api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mutaciones criticas del odontograma sin demo fallback', () => {
  it('saveOdontograma propaga el error real cuando el backend falla', async () => {
    const spy = vi.spyOn(api, 'put').mockRejectedValueOnce(new Error('Backend caido'));
    await expect(saveOdontograma('pres-1', { version: 1, teeth: {} })).rejects.toThrow('Backend caido');
    expect(spy).toHaveBeenCalled();
  });

  it('createPresupuestoFromOdontograma propaga el error real', async () => {
    const spy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Sin respuesta'));
    await expect(
      createPresupuestoFromOdontograma('odo-1', { doctor_id: 'doc-1', items: [] }),
    ).rejects.toThrow('Sin respuesta');
    expect(spy).toHaveBeenCalled();
  });

  it('updateOdontogramaPieza propaga el error real', async () => {
    const spy = vi.spyOn(api, 'patch').mockRejectedValueOnce(new Error('500 internal'));
    await expect(updateOdontogramaPieza('odo-1', 24, { estado_general: 'tratamiento_realizado' })).rejects.toThrow('500 internal');
    expect(spy).toHaveBeenCalled();
  });

  it('updateOdontogramaSuperficie propaga el error real', async () => {
    const spy = vi.spyOn(api, 'patch').mockRejectedValueOnce(new Error('403'));
    await expect(
      updateOdontogramaSuperficie('odo-1', 24, 'oclusal_incisal', { condicion: 'tratamiento_realizado' }),
    ).rejects.toThrow('403');
    expect(spy).toHaveBeenCalled();
  });

  it('createOdontogramaPaciente propaga el error real', async () => {
    const spy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Network down'));
    await expect(createOdontogramaPaciente('pac-1')).rejects.toThrow('Network down');
    expect(spy).toHaveBeenCalled();
  });

  it('duplicateOdontogramaVersion propaga el error real', async () => {
    const spy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Conflicto'));
    await expect(duplicateOdontogramaVersion('odo-1')).rejects.toThrow('Conflicto');
    expect(spy).toHaveBeenCalled();
  });
});

describe('mutaciones criticas del odontograma devuelven el payload real', () => {
  it('saveOdontograma resuelve el objeto del backend', async () => {
    vi.spyOn(api, 'put').mockResolvedValueOnce({ data: { presupuesto_id: 'pres-1', odontograma: { version: 1, teeth: {} } } } as never);
    const result = await saveOdontograma('pres-1', { version: 1, teeth: {} });
    expect(result.presupuesto_id).toBe('pres-1');
  });

  it('updateOdontogramaSuperficie resuelve la superficie devuelta por el backend', async () => {
    vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: { id: 'sup-1', superficie: 'oclusal_incisal', condicion: 'tratamiento_realizado' } } as never);
    const result = await updateOdontogramaSuperficie('odo-1', 24, 'oclusal_incisal', { condicion: 'tratamiento_realizado' });
    expect(result.superficie).toBe('oclusal_incisal');
    expect(result.condicion).toBe('tratamiento_realizado');
  });
});

describe('otras escrituras reales sin demo fallback', () => {
  it('createClinica propaga el error real', async () => {
    const spy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Backend caido'));
    await expect(createClinica({ nombre: 'Clinica Real' })).rejects.toThrow('Backend caido');
    expect(spy).toHaveBeenCalledWith('/clinicas', { nombre: 'Clinica Real' });
  });

  it('confirmarPortalCita propaga el error real', async () => {
    const spy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Sin token portal'));
    await expect(confirmarPortalCita('cita-1', 'pac-1')).rejects.toThrow('Sin token portal');
    expect(spy).toHaveBeenCalled();
  });

  it('updateHorarioDoctor propaga el error real', async () => {
    const spy = vi.spyOn(api, 'put').mockRejectedValueOnce(new Error('Horario invalido'));
    await expect(updateHorarioDoctor('doc-1', 1, {
      tipo_dia: 'laborable',
      bloques: [{ inicio: '09:00', fin: '13:00' }],
      intervalo_min: 10,
    })).rejects.toThrow('Horario invalido');
    expect(spy).toHaveBeenCalled();
  });

  it('createProductoInventario propaga el error real', async () => {
    const spy = vi.spyOn(api, 'post').mockRejectedValueOnce(new Error('Stock rechazado'));
    await expect(createProductoInventario({
      nombre: 'Guantes',
      stock_min: 10,
      stock_act: 4,
    })).rejects.toThrow('Stock rechazado');
    expect(spy).toHaveBeenCalledWith('/inventario', {
      nombre: 'Guantes',
      stock_min: 10,
      stock_act: 4,
    });
  });
});
