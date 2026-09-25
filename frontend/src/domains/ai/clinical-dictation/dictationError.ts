import { isAxiosError } from 'axios';

export function dictationError(error: unknown, fallback: string) {
  const detail = isAxiosError(error) ? error.response?.data?.detail : undefined;
  return typeof detail === 'string' ? detail : error instanceof Error && !isAxiosError(error) ? error.message : fallback;
}
