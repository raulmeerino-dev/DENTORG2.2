import { ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { recordsReturnPath } from '../navigation/recordTargets';

export default function RecordReturnLink() {
  const location = useLocation();
  const destination = recordsReturnPath(location.state);
  if (!destination || /^\/(registros|archivos)(\/|$)/.test(location.pathname)) return null;
  return <div className="dc-record-return"><Link to={destination}><ArrowLeft size={13} />Volver a {destination.startsWith('/archivos') ? 'Archivos' : 'Registros'}</Link><span>La consulta conserva sus filtros y orden</span></div>;
}
