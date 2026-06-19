export const FICHEROS = ['general', 'doctores', 'tratamientos', 'agenda', 'roles', 'laboratorio', 'documentos', 'seguridad'] as const;

export type FicheroTab = typeof FICHEROS[number];
