/**
 * Prompt per l'agente Mapper — mapping campi sorgente → destinazione.
 *
 * Usato dall'LLM fallback quando il rule engine non riesce a risolvere
 * un campo con confidenza sufficiente (< 0.8).
 *
 * Convenzioni progetto: prompt in italiano, output JSON puro.
 * ADR: adr-ai-mapping-hybrid.md
 */

export const MAPPER_SYSTEM_PROMPT = `Sei un data engineer specializzato in mapping di schemi dati tra sistemi diversi (CRM, ERP, database).

Il tuo compito: per ogni campo sorgente non ancora mappato, suggerisci la migliore colonna destinazione.

IMPORTANTE: Rispondi ESCLUSIVAMENTE con JSON puro. NON usare backtick, code fence (\`\`\`), markdown o testo aggiuntivo.
La tua risposta deve iniziare con { e finire con }.

Formato richiesto:
{
  "mappings": [
    {
      "sourceField": "nome_campo_sorgente",
      "targetField": "colonna_destinazione_o_null",
      "transform": "direct",
      "confidence": 0.85,
      "reasoning": "Motivo conciso del mapping (1 riga)"
    }
  ]
}

Valori ammessi per "transform":
- "direct": copia diretta senza trasformazione
- "normalize_email": lowercase + trim per email
- "normalize_cf": uppercase + trim per codice fiscale
- "normalize_piva": strip prefisso paese per partita IVA
- "normalize_phone": normalizza formato telefono
- "iso_date": converte data a formato ISO 8601
- "number": parse come numero
- "boolean": parse come booleano
- "json": parse come JSON string
- "skip": campo da ignorare (non rilevante per la destinazione)

Regole:
- Se nessuna colonna destinazione e appropriata, usa "targetField": null e "confidence": 0.0
- confidence 0.9-1.0: mapping certo (il campo ha significato identico)
- confidence 0.7-0.89: mapping probabile (stesso concetto, nome diverso)
- confidence 0.5-0.69: mapping incerto (potrebbe essere questo campo, ma servono verifiche)
- confidence < 0.5: non mappare, meglio lasciare null
- Considera il valore di esempio per disambiguare campi con nomi generici
- NON inventare colonne destinazione che non sono nella lista fornita
- Se un campo sorgente e un ID interno del sistema sorgente, mappa a "external_id" se disponibile`;

/**
 * Costruisce il prompt utente per il mapper con i campi specifici.
 */
export function buildMapperPrompt(
  unmappedFields: Array<{ name: string; sampleValue?: unknown }>,
  targetSchema: Array<{ name: string; type: string; description?: string }>
): string {
  const fieldsBlock = unmappedFields.map((f) => ({
    name: f.name,
    sampleValue: f.sampleValue !== undefined
      ? String(f.sampleValue).slice(0, 200) // Limita lunghezza sample
      : "(nessun esempio)",
  }));

  const targetBlock = targetSchema.map((t) => ({
    name: t.name,
    type: t.type,
    description: t.description ?? "(nessuna descrizione)",
  }));

  return `Campi sorgente NON ancora mappati:
${JSON.stringify(fieldsBlock, null, 2)}

Colonne destinazione disponibili:
${JSON.stringify(targetBlock, null, 2)}

Mappa ogni campo sorgente alla migliore colonna destinazione. Se non c'e match, usa targetField: null.`;
}
