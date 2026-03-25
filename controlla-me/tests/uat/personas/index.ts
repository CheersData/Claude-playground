/**
 * UAT Persona Layer — Public API
 */

export type {
  Persona,
  PersonaBehavior,
  PersonaDemographics,
  PersonaScenarioCombo,
  TypingSpeed,
  ReadTime,
  ScrollPattern,
  TechLevel,
  PatienceLevel,
} from "./types";

export {
  TYPING_DELAYS,
  READ_DELAYS,
  MOBILE_VIEWPORT,
  TYPO_PROBABILITY,
} from "./types";

export {
  PERSONAS,
  DEFAULT_PERSONA_ID,
  getPersona,
  getAllPersonaIds,
  getAllPersonas,
} from "./personas";

export {
  executeStepWithPersona,
  setupPersona,
} from "./persona-runner";

export {
  generatePersonaMatrix,
  getAllScenarios,
  getScenarioById,
} from "./persona-scenarios";
