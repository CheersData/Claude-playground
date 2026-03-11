/**
 * StoreFactory — Registry generico per store plugin.
 *
 * Ogni DataType puo avere uno StorePlugin registrato che sa come
 * validare e persistere i record di quel tipo.
 *
 * Pattern: alternativa leggera al plugin-registry.ts per casi in cui
 * serve un'interfaccia piu semplice (validate + store) senza la
 * complessita di StoreInterface<T> (che include dryRun, skipEmbeddings, ecc.).
 *
 * Uso:
 *   const factory = new StoreFactory();
 *   factory.register({
 *     dataType: "contacts",
 *     validate: (item) => !!item.email,
 *     store: async (items) => { ... },
 *   });
 *
 *   const plugin = factory.getStore("contacts");
 *   if (plugin) {
 *     const valid = items.filter(plugin.validate);
 *     const result = await plugin.store(valid);
 *   }
 *
 * ADR-1: Complementa il plugin-registry per connettori business
 * che hanno bisogno di validazione custom per tipo di entita.
 */

import type { DataType } from "../types";

// ─── StorePlugin Interface ───

/**
 * Plugin per lo store di un tipo di dato specifico.
 *
 * Ogni plugin sa come:
 * 1. Validare un singolo item del tipo T
 * 2. Persistere un batch di item (dopo validazione)
 *
 * Il tipo generico T rappresenta il record gia trasformato dalla fase MODEL,
 * pronto per essere salvato nel DB.
 */
export interface StorePlugin<T = unknown> {
  /** DataType gestito da questo plugin */
  readonly dataType: DataType;

  /**
   * Valida un singolo item prima della persistenza.
   * Ritorna true se l'item e' valido e puo essere salvato.
   * Ritorna false se l'item deve essere scartato (loggato come errore).
   */
  validate(item: T): boolean;

  /**
   * Persiste un batch di item gia validati.
   * @returns Conteggio di item salvati e errori riscontrati.
   */
  store(items: T[]): Promise<StorePluginResult>;
}

/**
 * Risultato dell'operazione di store.
 */
export interface StorePluginResult {
  stored: number;
  errors: number;
  /** Dettagli errori per debugging (max 50 per evitare log enormi) */
  errorDetails?: Array<{ index: number; error: string }>;
}

// ─── StoreFactory Class ───

/**
 * Registry centralizzato per StorePlugin.
 *
 * Singleton pattern: usare getStoreFactory() per ottenere l'istanza globale,
 * oppure creare istanze separate per testing.
 */
export class StoreFactory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private plugins: Map<DataType, StorePlugin<any>> = new Map();

  /**
   * Registra un plugin per un DataType.
   * Se un plugin per lo stesso DataType e' gia registrato, viene sovrascritto.
   */
  register<T>(plugin: StorePlugin<T>): void {
    this.plugins.set(plugin.dataType, plugin);
  }

  /**
   * Registra un plugin con chiave composita "dataType:connectorId".
   * Utile per differenziare store diversi sullo stesso dataType
   * (es. "contacts:hubspot" vs "contacts:salesforce").
   */
  registerComposite<T>(
    dataType: DataType,
    connectorId: string,
    plugin: StorePlugin<T>
  ): void {
    const compositeKey = `${dataType}:${connectorId}` as DataType;
    this.plugins.set(compositeKey, plugin);
  }

  /**
   * Recupera il plugin per un DataType.
   * Cerca prima con chiave composita "dataType:connectorId" (se connectorId fornito),
   * poi per solo dataType.
   *
   * @returns Il plugin se trovato, undefined altrimenti.
   */
  getStore<T = unknown>(
    dataType: DataType,
    connectorId?: string
  ): StorePlugin<T> | undefined {
    // 1. Chiave composita se connectorId fornito
    if (connectorId) {
      const compositeKey = `${dataType}:${connectorId}` as DataType;
      const compositePlugin = this.plugins.get(compositeKey);
      if (compositePlugin) {
        return compositePlugin as StorePlugin<T>;
      }
    }

    // 2. Solo dataType
    return this.plugins.get(dataType) as StorePlugin<T> | undefined;
  }

  /**
   * Verifica se esiste un plugin per un DataType.
   */
  has(dataType: DataType, connectorId?: string): boolean {
    if (connectorId) {
      const compositeKey = `${dataType}:${connectorId}` as DataType;
      if (this.plugins.has(compositeKey)) return true;
    }
    return this.plugins.has(dataType);
  }

  /**
   * Lista tutti i DataType con plugin registrati.
   */
  listRegistered(): DataType[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Rimuove un plugin registrato (utile per testing).
   */
  unregister(dataType: DataType, connectorId?: string): boolean {
    if (connectorId) {
      const compositeKey = `${dataType}:${connectorId}` as DataType;
      return this.plugins.delete(compositeKey);
    }
    return this.plugins.delete(dataType);
  }

  /**
   * Rimuove tutti i plugin registrati (utile per testing).
   */
  clear(): void {
    this.plugins.clear();
  }
}

// ─── Singleton globale ───

let globalInstance: StoreFactory | null = null;

/**
 * Ritorna l'istanza globale di StoreFactory.
 * Lazy initialization — creata al primo accesso.
 */
export function getStoreFactory(): StoreFactory {
  if (!globalInstance) {
    globalInstance = new StoreFactory();
  }
  return globalInstance;
}
