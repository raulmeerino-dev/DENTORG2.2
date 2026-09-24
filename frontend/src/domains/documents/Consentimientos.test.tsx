import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DocumentDesignerModal } from './Consentimientos';
import type { ApiPaciente, PlantillaConsentimiento } from '../../api/types';

const paciente: ApiPaciente = {
  id: 'pac-1',
  codigo: '#1',
  num_historial: 1,
  nombre: 'Pilar',
  apellidos: 'PDF',
  fecha_nacimiento: null,
  dni_nie: null,
  telefono: null,
  telefono2: null,
  email: null,
  direccion: null,
  ciudad: null,
  provincia: null,
  codigo_postal: null,
  doctor_habitual_id: null,
  datos_salud: null,
  activo: true,
  observaciones: null,
};

const plantillas: PlantillaConsentimiento[] = [{
  id: 'plant-1',
  codigo: 'endo',
  nombre: 'Endodoncia',
  version: '1',
  version_num: 1,
  tratamientos: ['endodoncia'],
  contenido: 'Yo, {{paciente}}, autorizo la endodoncia.',
}];

describe('DocumentDesignerModal', () => {
  it('permite revisar y editar en una tarea sin modal y conserva el contexto del paciente', async () => {
    const user = userEvent.setup();
    render(<DocumentDesignerModal mode="consentimiento" paciente={paciente} plantillas={[{ ...plantillas[0], contenido: 'Documento para {{paciente_nombre}}.' }]} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Consentimiento informado' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Texto del documento' })).toHaveValue('Documento para Pilar PDF.');
    await user.click(screen.getByRole('button', { name: 'Vista previa' }));
    expect(screen.getByRole('article', { name: 'Vista previa del documento' })).toHaveTextContent('Documento para Pilar PDF.');
    await user.click(screen.getByRole('button', { name: 'Editar texto' }));
    expect(screen.getByRole('textbox', { name: 'Texto del documento' })).toHaveValue('Documento para Pilar PDF.');
  });
  it('bloquea guardar consentimiento desde plantilla si el canvas esta vacio', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <DocumentDesignerModal
        mode="consentimiento"
        paciente={paciente}
        plantillas={plantillas}
        initialTipo="Endodoncia"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Guardar PDF en ficha/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Firma el consentimiento/i);
  });

  it('genera documento clinico/circular con categoria de editor correcta', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <DocumentDesignerModal
        mode="circular"
        paciente={paciente}
        plantillas={[]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Guardar PDF en ficha/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'Justificante de asistencia',
      titulo: 'Justificante de asistencia',
      contenido: expect.stringContaining('Pilar PDF'),
      firmaDataUrl: null,
    }));
  });
});
