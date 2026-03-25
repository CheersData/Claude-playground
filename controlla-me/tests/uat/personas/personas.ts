/**
 * UAT Persona Layer — Predefined personas
 *
 * 5 personas representing typical Controlla.me users with distinct
 * demographics and interaction behaviors.
 */

import type { Persona } from "./types";

export const PERSONAS: Record<string, Persona> = {
  "mario-pensionato": {
    id: "mario-pensionato",
    name: "Mario il Pensionato",
    description:
      "Pensionato 68enne, poca dimestichezza con la tecnologia ma grande pazienza. " +
      "Legge tutto attentamente, digita lentamente, non commette errori perche controlla ogni tasto.",
    behavior: {
      typingSpeed: "slow",
      readTime: "careful",
      errorProne: false,
      scrollPattern: "linear",
      uploadRetries: 2,
      mobileUser: false,
    },
    demographics: {
      age: 68,
      techLevel: "low",
      patience: "high",
    },
  },

  "giulia-freelancer": {
    id: "giulia-freelancer",
    name: "Giulia la Freelancer",
    description:
      "Freelancer 32enne, nativa digitale. Naviga velocissima, non legge quasi nulla, " +
      "va dritta al punto. Usa spesso il telefono per controllare documenti tra un meeting e l'altro.",
    behavior: {
      typingSpeed: "fast",
      readTime: "skimmer",
      errorProne: false,
      scrollPattern: "jumpy",
      uploadRetries: 1,
      mobileUser: true,
    },
    demographics: {
      age: 32,
      techLevel: "high",
      patience: "low",
    },
  },

  "ahmed-studente": {
    id: "ahmed-studente",
    name: "Ahmed lo Studente",
    description:
      "Studente universitario 22enne di giurisprudenza. Molto a suo agio con la tecnologia, " +
      "digita velocemente, legge con attenzione media. Usa il desktop.",
    behavior: {
      typingSpeed: "fast",
      readTime: "reader",
      errorProne: false,
      scrollPattern: "linear",
      uploadRetries: 1,
      mobileUser: false,
    },
    demographics: {
      age: 22,
      techLevel: "high",
      patience: "medium",
    },
  },

  "rosa-imprenditrice": {
    id: "rosa-imprenditrice",
    name: "Rosa l'Imprenditrice",
    description:
      "Imprenditrice 55enne, gestisce una PMI. Usa il computer regolarmente ma non e esperta. " +
      "Ha poco tempo, scorre velocemente le pagine, digita a velocita normale.",
    behavior: {
      typingSpeed: "normal",
      readTime: "skimmer",
      errorProne: false,
      scrollPattern: "jumpy",
      uploadRetries: 2,
      mobileUser: false,
    },
    demographics: {
      age: 55,
      techLevel: "medium",
      patience: "low",
    },
  },

  "luca-avvocato": {
    id: "luca-avvocato",
    name: "Luca l'Avvocato",
    description:
      "Avvocato 45enne, usa strumenti digitali quotidianamente. Legge ogni dettaglio con attenzione, " +
      "digita a velocita normale, grande pazienza. Vuole capire esattamente cosa fa il sistema.",
    behavior: {
      typingSpeed: "normal",
      readTime: "careful",
      errorProne: false,
      scrollPattern: "linear",
      uploadRetries: 3,
      mobileUser: false,
    },
    demographics: {
      age: 45,
      techLevel: "medium",
      patience: "high",
    },
  },
};

/** Default persona used for smoke tests and when no persona is specified */
export const DEFAULT_PERSONA_ID = "giulia-freelancer";

/** Get a persona by ID, or undefined if not found */
export function getPersona(id: string): Persona | undefined {
  return PERSONAS[id];
}

/** Get all persona IDs */
export function getAllPersonaIds(): string[] {
  return Object.keys(PERSONAS);
}

/** Get all personas as an array */
export function getAllPersonas(): Persona[] {
  return Object.values(PERSONAS);
}
