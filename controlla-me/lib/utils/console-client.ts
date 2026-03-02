/**
 * Utility client-side per l'autenticazione console.
 *
 * Fornisce `getConsoleAuthHeaders()` per aggiungere il token HMAC
 * alle chiamate fetch verso le route /api/company/* protette.
 *
 * Compatibile con sessionStorage (browser only).
 */

/**
 * Ritorna gli header Authorization con il token console se disponibile.
 * Ritorna oggetto vuoto in SSR o se il token non è presente.
 */
export function getConsoleAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = sessionStorage.getItem("lexmea-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Ritorna gli header Authorization + Content-Type JSON.
 */
export function getConsoleJsonHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...getConsoleAuthHeaders(),
  };
}
