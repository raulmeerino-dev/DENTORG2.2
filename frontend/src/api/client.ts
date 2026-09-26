import axios from 'axios';
import { API_BASE_URL, API_LOG_PREFIX } from './config';
import { installSessionInterceptors } from './session';
import { installMutationInterceptors } from './mutations';

if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
  console.info(`${API_LOG_PREFIX} base URL usada`, { baseURL: API_BASE_URL });
}

export const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

if (import.meta.env.DEV && (import.meta.env.VITE_DEMO_MODE === 'true' || import.meta.env.VITE_DEMO_FALLBACK === 'true')) {
  api.defaults.adapter = async (config) => {
    const { demoAdapter } = await import('./demo/adapter');
    return demoAdapter(config);
  };
}

installSessionInterceptors(api);
installMutationInterceptors(api);
