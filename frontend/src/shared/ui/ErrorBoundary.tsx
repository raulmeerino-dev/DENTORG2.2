import { Component, type ErrorInfo, type ReactNode } from 'react';

type State = { hasError: boolean };

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de interfaz', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="page error-screen">
          <p className="eyebrow">Interfaz</p>
          <h1>No se ha podido mostrar esta pantalla</h1>
          <p>Vuelve al inicio o recarga la aplicacion. La sesion y los datos guardados se mantienen.</p>
          <button type="button" onClick={() => window.location.assign('/dashboard')}>Ir a inicio</button>
        </section>
      );
    }

    return this.props.children;
  }
}
