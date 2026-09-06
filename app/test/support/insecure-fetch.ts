import { Agent, fetch as undiciFetch } from 'undici';

/**
 * Los servidores fixture de test usan un certificado autofirmado; solo este
 * fetch (inyectado vía `FETCH_CLIENT` en tests) confía en él. Nunca se usa
 * en producción.
 */
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export const insecureFetch = ((input, init) =>
  undiciFetch(input as never, {
    ...(init as Record<string, unknown>),
    dispatcher: insecureAgent,
  } as never)) as typeof fetch;
