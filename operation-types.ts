import { SceneData, Template, Theme } from './types';

/**
 * Represents a single operation to be executed
 */
export interface Operation {
  step: number;
  operation: string;
  parameters: Record<string, any>;
}

/**
 * Result of executing an operation
 */
export interface OperationResult {
  success: boolean;
  output?: any;  // e.g., image URL, element ID, etc.
  error?: string;
}

/**
 * Progress update message for WebSocket
 */
export interface ProgressUpdate {
  type: 'progress';
  currentStep: number;
  totalSteps: number;
  operation: string;
  message: string;
}

/**
 * Completion message for WebSocket
 */
export interface ExecutionComplete {
  type: 'complete';
  sceneId: string;
  scenePath: string;
  files: string[];
  preview: {
    html: string;
    css: string;
  };
}

/**
 * Failure message for WebSocket
 */
export interface ExecutionFailed {
  type: 'failed';
  step: number;
  operation: string;
  error: string;
}

/**
 * Scene state during execution
 */
export interface ExecutionContext {
  sceneId: string;
  sceneName: string;
  data: SceneData;           // Scene data items
  template: Template;        // Layout and elements
  theme: Theme;              // Colors and fonts
  currentStep: number;
  totalSteps: number;
  layerMap: Map<string, string>;  // layer_name -> element_id
  operationOutputs: Map<number, any>;  // step -> output (e.g., image URL)
}

/**
 * Operation handler function signature
 */
export type OperationHandler = (
  context: ExecutionContext,
  params: any
) => Promise<OperationResult>;

/**
 * Custom error types for better error handling
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class APIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'APIError';
  }
}

export class ReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceError';
  }
}

export class FileSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileSystemError';
  }
}
