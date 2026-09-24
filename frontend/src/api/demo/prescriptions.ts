import type {
  RecetaClinica,
  RecetaPlantilla,
  RecetaProviderStatus,
} from '../types';

export async function getRecetasPaciente(): Promise<RecetaClinica[]> {
  return [] as RecetaClinica[];
}

export async function getRecetaProviderStatus(): Promise<RecetaProviderStatus> {
  return {
      mode: 'disabled',
      provider_available: false,
      real_certification_enabled: false,
      warning: 'Receta no certificada. Modo local/mock o proveedor real no configurado.',
    } satisfies RecetaProviderStatus;
}

export async function getRecetaPlantillas(): Promise<RecetaPlantilla[]> {
  return [] as RecetaPlantilla[];
}
