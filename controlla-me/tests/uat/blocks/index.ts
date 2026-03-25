/**
 * UAT Blocks — Registry of all building block executors.
 *
 * Each block is a function: (page, params, expect?) => Promise<BlockResult>
 */

import type { BlockType, BlockExecutor } from "../types";
import { executePageLoad } from "./page-load";
import { executeFileUpload } from "./file-upload";
import { executeSseStream } from "./sse-stream";
import { executeFormSubmit } from "./form-submit";
import { executeWizardFlow } from "./wizard-flow";
import { executeApiCall } from "./api-call";
import { executeAuthSetup } from "./auth-setup";
import { executeVisualCheck } from "./visual-check";

const BLOCK_REGISTRY: Record<BlockType, BlockExecutor> = {
  "page-load": executePageLoad,
  "file-upload": executeFileUpload,
  "sse-stream": executeSseStream,
  "form-submit": executeFormSubmit,
  "wizard-flow": executeWizardFlow,
  "api-call": executeApiCall,
  "auth-setup": executeAuthSetup,
  "visual-check": executeVisualCheck,
};

/**
 * Get the executor for a block type.
 */
export function getBlockExecutor(type: BlockType): BlockExecutor | undefined {
  return BLOCK_REGISTRY[type];
}

/**
 * List all available block types.
 */
export function availableBlockTypes(): BlockType[] {
  return Object.keys(BLOCK_REGISTRY) as BlockType[];
}

export {
  executePageLoad,
  executeFileUpload,
  executeSseStream,
  executeFormSubmit,
  executeWizardFlow,
  executeApiCall,
  executeAuthSetup,
  executeVisualCheck,
};
