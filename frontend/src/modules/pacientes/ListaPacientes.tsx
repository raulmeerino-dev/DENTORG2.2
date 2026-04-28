import { useState } from 'react';
import type { Paciente } from '../../types/paciente';

interface Props {
  pacientes: Paciente[];
  onSelect: (p: Paciente) => void;
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatSaldo(saldo: number): string {
  if (saldo === 0) return '0,00 €';
  const sign = saldo < 0 ? '-' : '+';
  return `${sign}${Math.abs(saldo).toFixed(2).replace('.', ',')} €`;
}

export default function ListaPacientes({ pacientes, onSelect }: Props) {
  const [busqueda, setBusqueda] = useState('');

  const filtrados = busqueda.trim()
    ? pacientes.filter((p) => {
        const q = busqueda.toLowerCase();
        return (
          p.nHistoria.toLowerCase().includes(q) ||
          `${p.nombre} ${p.apellidos}`.toLowerCase().includes(q) ||
          p.telefono.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
        );
      })
    : pacientes;

  return (
    <div className="lista-pacientes">
      <div className="lista-header">
        <input
          className="buscador"
          type="text"
          placeholder="Buscar por nombre, teléfono o Nº historia…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          autoFocus
        />
        <span className="lista-count">{filtrados.length} paciente{filtrados.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="tabla-wrapper">
        <table className="tabla-pacientes">
          <thead>
            <tr>
              <th>Nº Historia</th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Última visita</th>
              <th>Próxima visita</th>
              <th className="col-saldo">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="tabla-empty">
                  No se encontraron pacientes
                </td>
              </tr>
            ) : (
              filtrados.map((p) => (
                <tr key={p.id} className="tabla-row" onClick={() => onSelect(p)}>
                  <td className="col-historia">{p.nHistoria}</td>
                  <td className="col-nombre">{p.nombre} {p.apellidos}</td>
                  <td>{p.telefono}</td>
                  <td>{formatFecha(p.ultimaVisita)}</td>
                  <td className={p.proximaVisita ? 'proxima-visita' : ''}>
                    {formatFecha(p.proximaVisita)}
                  </td>
                  <td className={`col-saldo saldo-${p.saldo < 0 ? 'negativo' : p.saldo > 0 ? 'positivo' : 'cero'}`}>
                    {formatSaldo(p.saldo)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
