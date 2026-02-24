import * as fs from 'fs';
import * as path from 'path';
import {
  Operation,
  ExecutionContext,
  ProgressUpdate,
  ExecutionComplete,
  ExecutionFailed,
  OperationHandler,
  ValidationError,
  APIError,
  FileSystemError
} from './operation-types';
import { SceneData, Template, Theme, Scene } from './types';
import { resolveParameters } from './scene-builder';
import { renderScene } from './renderer';
import {
  handleCreateCanvas,
  handleAddImageLayer,
  handleAddTextLayer,
  handleEditTextLayer,
  handleSetLayerVisibility,
  handleDeleteLayer,
  handleGenerateImage,
  handleEditImage,
  handleResizeImage,
  handleCropImage,
  handleRemoveBackground,
  handleUpscale,
  handleSegment,
  handleSetLayerAnchor,
  handleCreateFlexContainer,
  handleAddLayerToContainer,
  handleSetFlexLayout
} from './operation-handlers';

// Operation handler registry
const OPERATION_HANDLERS: Record<string, OperationHandler> = {
  create_canvas: handleCreateCanvas,
  add_image_layer: handleAddImageLayer,
  add_text_layer: handleAddTextLayer,
  edit_text_layer: handleEditTextLayer,
  set_layer_visibility: handleSetLayerVisibility,
  delete_layer: handleDeleteLayer,
  generate_image: handleGenerateImage,
  edit_image: handleEditImage,
  resize_image: handleResizeImage,
  crop_image: handleCropImage,
  remove_background: handleRemoveBackground,
  upscale: handleUpscale,
  segment: handleSegment,
  set_layer_anchor: handleSetLayerAnchor,
  create_flex_container: handleCreateFlexContainer,
  add_layer_to_container: handleAddLayerToContainer,
  set_flex_layout: handleSetFlexLayout
};

/**
 * Main execution entry point
 */
export async function executeOperations(
  ws: any,
  sceneId: string,
  sceneName: string,
  operations: Operation[]
): Promise<void> {
  try {
    // Initialize execution context
    const context: ExecutionContext = {
      sceneId,
      sceneName,
      data: {
        scene_id: sceneId,
        data_items: []
      },
      template: {
        template_id: `${sceneId}_template`,
        template_name: `${sceneName} Template`,
        canvas: {
          width: 800,
          height: 600
        },
        elements: []
      },
      theme: {
        theme_id: `${sceneId}_theme`,
        theme_name: `${sceneName} Theme`,
        color_palette: [],
        font_palette: []
      },
      currentStep: 0,
      totalSteps: operations.length,
      layerMap: new Map(),
      operationOutputs: new Map()
    };

    // Execute operations sequentially
    for (const operation of operations) {
      context.currentStep = operation.step;

      // Send progress update
      const progress: ProgressUpdate = {
        type: 'progress',
        currentStep: operation.step,
        totalSteps: context.totalSteps,
        operation: operation.operation,
        message: `Executing ${operation.operation}...`
      };

      ws.send(JSON.stringify({ type: 'EXECUTION_PROGRESS', data: progress }));

      // Find handler
      const handler = OPERATION_HANDLERS[operation.operation];
      if (!handler) {
        throw new ValidationError(`Unknown operation: ${operation.operation}`);
      }

      // Resolve parameter placeholders
      const resolvedParams = resolveParameters(operation.parameters, context);

      // Execute operation
      const result = await handler(context, resolvedParams);

      if (!result.success) {
        throw new Error(result.error || 'Operation failed');
      }

      // Store output for future reference
      if (result.output !== undefined) {
        context.operationOutputs.set(operation.step, result.output);
      }
    }

    // Validate final scene
    validateScene(context);

    // Save scene to directory
    const scenePath = await saveSceneToDirectory(context);

    // Render preview
    const scene: Scene = {
      data: context.data,
      template: context.template,
      theme: context.theme
    };

    const preview = renderScene(scene);

    // Send completion message
    const completion: ExecutionComplete = {
      type: 'complete',
      sceneId: context.sceneId,
      scenePath,
      files: [
        `${scenePath}/data.json`,
        `${scenePath}/template.json`,
        `${scenePath}/theme.json`,
        `${scenePath}/scene.json`
      ],
      preview
    };

    ws.send(JSON.stringify({ type: 'EXECUTION_COMPLETE', data: completion }));

  } catch (error: any) {
    console.error('Execution error:', error);

    const failure: ExecutionFailed = {
      type: 'failed',
      step: operations.findIndex(op => op.step === (error as any).step) + 1 || 0,
      operation: error.operation || 'unknown',
      error: error.message || 'Unknown error occurred'
    };

    ws.send(JSON.stringify({ type: 'EXECUTION_FAILED', data: failure }));
  }
}

/**
 * Validate final scene state
 */
function validateScene(context: ExecutionContext): void {
  // Check canvas is initialized
  if (!context.template.canvas || !context.template.canvas.width || !context.template.canvas.height) {
    throw new ValidationError('Canvas not initialized');
  }

  // Check color palette limit
  if (context.theme.color_palette.length > 16) {
    throw new ValidationError('Color palette exceeds limit of 16 colors');
  }

  // Check font palette limit
  if (context.theme.font_palette.length > 8) {
    throw new ValidationError('Font palette exceeds limit of 8 fonts');
  }

  // Check data item references
  const dataItemIds = new Set(context.data.data_items.map(item => item.id));
  const checkElement = (element: any) => {
    if (element.element_type === 'data_item' && element.data_item_id) {
      if (!dataItemIds.has(element.data_item_id)) {
        throw new ValidationError(`Element references non-existent data item: ${element.data_item_id}`);
      }
    }
    if (element.children) {
      element.children.forEach(checkElement);
    }
  };

  context.template.elements.forEach(checkElement);
}

/**
 * Save scene to directory structure
 */
async function saveSceneToDirectory(context: ExecutionContext): Promise<string> {
  const scenesDir = path.join(process.cwd(), 'scenes');
  const sceneDir = path.join(scenesDir, context.sceneId);

  try {
    // Create directories if they don't exist
    if (!fs.existsSync(scenesDir)) {
      fs.mkdirSync(scenesDir, { recursive: true });
    }

    if (!fs.existsSync(sceneDir)) {
      fs.mkdirSync(sceneDir, { recursive: true });
    }

    // Save data.json
    const dataPath = path.join(sceneDir, 'data.json');
    await Bun.write(dataPath, JSON.stringify(context.data, null, 2));

    // Save template.json
    const templatePath = path.join(sceneDir, 'template.json');
    await Bun.write(templatePath, JSON.stringify(context.template, null, 2));

    // Save theme.json
    const themePath = path.join(sceneDir, 'theme.json');
    await Bun.write(themePath, JSON.stringify(context.theme, null, 2));

    // Save scene.json (metadata)
    const sceneMetadata = {
      id: context.sceneId,
      name: context.sceneName,
      data: 'data.json',
      template: 'template.json',
      theme: 'theme.json'
    };

    const sceneMetadataPath = path.join(sceneDir, 'scene.json');
    await Bun.write(sceneMetadataPath, JSON.stringify(sceneMetadata, null, 2));

    return sceneDir;

  } catch (error: any) {
    throw new FileSystemError(`Failed to save scene files: ${error.message}`);
  }
}
