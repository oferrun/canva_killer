import { Element, DataItem, SceneData, Template, Theme, ElementStyle } from './types';
import { ExecutionContext, OperationResult, ValidationError, ReferenceError as OpReferenceError } from './operation-types';
import {
  generateId,
  hexToRGBA,
  ensureColorInTheme,
  ensureFontInTheme,
  findElement,
  removeElementFromTemplate,
  addElementToContainer,
  calculateAnchorPosition
} from './scene-builder';
import { runReplicateImageCreator } from './ck_backend';

// ============================================================================
// CANVAS & LAYER MANAGEMENT
// ============================================================================

/**
 * Create canvas and initialize scene
 */
export async function handleCreateCanvas(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const { width, height, background_color } = params;

  if (!width || !height) {
    throw new ValidationError('Canvas width and height are required');
  }

  // Initialize template with canvas dimensions
  context.template.canvas = {
    width,
    height
  };

  // If background color is specified, add a background rectangle
  if (background_color) {
    const colorId = ensureColorInTheme(context.theme, background_color);

    const bgElement: Element = {
      element_id: generateId('elem'),
      element_type: 'shape',
      shape_type: 'rectangle',
      style: {
        width: '100%',
        height: '100%',
        background_color: colorId
      }
    };

    context.template.elements.push(bgElement);
  }

  return {
    success: true,
    output: { width, height }
  };
}

/**
 * Add image layer to scene
 */
export async function handleAddImageLayer(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const {
    layer_name,
    input_image,
    x = 0,
    y = 0,
    width,
    height,
    opacity = 1
  } = params;

  if (!layer_name || !input_image) {
    throw new ValidationError('layer_name and input_image are required');
  }

  // Create data item for the image
  const dataItemId = generateId('data');

  const dataItem: DataItem = {
    id: dataItemId,
    type: 'image',
    display_name: layer_name,
    image_url: input_image
  };

  context.data.data_items.push(dataItem);

  // Create element for the image
  const elementId = generateId('elem');

  const style: ElementStyle = {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`
  };

  if (width) {
    style.width = typeof width === 'number' ? `${width}px` : width;
  }

  if (height) {
    style.height = typeof height === 'number' ? `${height}px` : height;
  }

  const element: Element = {
    element_id: elementId,
    element_type: 'data_item',
    data_item_id: dataItemId,
    style
  };

  context.template.elements.push(element);

  // Track layer in layerMap
  context.layerMap.set(layer_name, elementId);

  return {
    success: true,
    output: { elementId, dataItemId }
  };
}

/**
 * Add text layer to scene
 */
export async function handleAddTextLayer(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const {
    layer_name,
    text,
    text_content,
    x,
    y,
    anchor,
    offset_x = 0,
    offset_y = 0,
    font,
    font_name,
    size,
    font_size,
    color = '#000000',
    opacity = 1,
    alignment,
    text_align,
    bold = false,
    italic = false,
    shadow_enabled = false,
    shadow_color = '#000000',
    shadow_offset_x = 0,
    shadow_offset_y = 0,
    shadow_blur = 0,
    shadow_opacity = 1
  } = params;

  // Accept both "text" and "text_content"
  const textValue = text || text_content;
  if (!layer_name || !textValue) {
    throw new ValidationError('layer_name and text are required');
  }

  // Accept both "font" and "font_name", "size" and "font_size", "alignment" and "text_align"
  const fontValue = font || font_name || 'Arial';
  const sizeValue = size || font_size || 16;
  const alignValue = alignment || text_align || 'left';

  // Ensure font and color are in theme
  const fontId = await ensureFontInTheme(context.theme, fontValue);
  const colorId = ensureColorInTheme(context.theme, color);

  // Create data item for the text
  const dataItemId = generateId('data');

  const dataItem: DataItem = {
    id: dataItemId,
    type: 'text',
    display_name: layer_name,
    content: textValue
  };

  context.data.data_items.push(dataItem);

  // Determine positioning strategy
  let elementLeft: string;
  let elementTop: string;
  let elementTransform: string | undefined;

  if (anchor) {
    // Priority 1: Explicit anchor positioning
    const canvasWidth = context.template.canvas?.width || 800;
    const canvasHeight = context.template.canvas?.height || 600;

    // For center-based anchors, use CSS transform for precise centering
    if (anchor === 'center' || anchor === 'top-center' || anchor === 'bottom-center') {
      elementLeft = '50%';
      elementTransform = anchor === 'center'
        ? `translate(calc(-50% + ${offset_x}px), calc(-50% + ${offset_y}px))`
        : `translateX(calc(-50% + ${offset_x}px))`;

      if (anchor === 'center') {
        elementTop = '50%';
      } else if (anchor === 'top-center') {
        elementTop = `${offset_y}px`;
      } else { // bottom-center
        elementTop = `calc(100% - ${offset_y}px)`;
      }
    } else {
      // For other anchors, calculate pixel positions
      const estimatedWidth = 100;  // Text auto-sizes, this is approximate
      const estimatedHeight = typeof sizeValue === 'number' ? sizeValue : 16;

      const position = calculateAnchorPosition(
        anchor,
        canvasWidth,
        canvasHeight,
        estimatedWidth,
        estimatedHeight,
        offset_x,
        offset_y
      );

      elementLeft = `${position.x}px`;
      elementTop = `${position.y}px`;
    }

  } else if (x !== undefined || y !== undefined) {
    // Priority 2: Explicit absolute positioning
    elementLeft = `${x ?? 0}px`;
    elementTop = `${y ?? 0}px`;

  } else {
    // Priority 3: Default to full centering
    elementLeft = '50%';
    elementTop = '50%';
    elementTransform = 'translate(-50%, -50%)';
  }

  // Create element for the text
  const elementId = generateId('elem');

  const style: ElementStyle = {
    position: 'absolute',
    left: elementLeft,
    top: elementTop,
    font: fontId,
    font_size: typeof sizeValue === 'number' ? `${sizeValue}px` : sizeValue,
    color: colorId,
    text_align: alignValue
  };

  // Add font weight for bold
  if (bold) {
    style.font_weight = 'bold';
  }

  // Add font style for italic
  if (italic) {
    style.font_style = 'italic';
  }

  // Add transform for centering if needed
  if (elementTransform) {
    style.transform = elementTransform;
  }

  // Add text shadow if enabled
  if (shadow_enabled) {
    // Ensure shadow color is in theme (we still need to do this for consistency)
    ensureColorInTheme(context.theme, shadow_color);
    // Format: offset-x offset-y blur-radius color
    // Use the actual hex color value for the shadow
    const shadowColorWithOpacity = shadow_opacity < 1
      ? `rgba(${parseInt(shadow_color.slice(1,3), 16)}, ${parseInt(shadow_color.slice(3,5), 16)}, ${parseInt(shadow_color.slice(5,7), 16)}, ${shadow_opacity})`
      : shadow_color;
    style.text_shadow = `${shadow_offset_x}px ${shadow_offset_y}px ${shadow_blur}px ${shadowColorWithOpacity}`;
  }

  const element: Element = {
    element_id: elementId,
    element_type: 'data_item',
    data_item_id: dataItemId,
    style
  };

  context.template.elements.push(element);

  // Track layer in layerMap
  context.layerMap.set(layer_name, elementId);

  return {
    success: true,
    output: { elementId, dataItemId }
  };
}

/**
 * Edit text layer properties
 */
export async function handleEditTextLayer(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const {
    layer_name,
    text_content,
    font_name,
    font_size,
    color,
    opacity,
    text_align
  } = params;

  if (!layer_name) {
    throw new ValidationError('layer_name is required');
  }

  // Find element
  const elementId = context.layerMap.get(layer_name);
  if (!elementId) {
    throw new OpReferenceError(`Layer not found: ${layer_name}`);
  }

  const element = findElement(context.template.elements, elementId);
  if (!element) {
    throw new OpReferenceError(`Element not found: ${elementId}`);
  }

  if (element.element_type !== 'data_item') {
    throw new ValidationError(`Layer ${layer_name} is not a text layer`);
  }

  // Find data item
  const dataItem = context.data.data_items.find(item => item.id === element.data_item_id);
  if (!dataItem || dataItem.type !== 'text') {
    throw new ValidationError(`Layer ${layer_name} is not a text layer`);
  }

  // Update text content
  if (text_content !== undefined) {
    dataItem.content = text_content;
  }

  // Update styles
  if (!element.style) {
    element.style = {};
  }

  if (font_name !== undefined) {
    const fontId = await ensureFontInTheme(context.theme, font_name);
    element.style.font = fontId;
  }

  if (font_size !== undefined) {
    element.style.font_size = font_size;
  }

  if (color !== undefined) {
    const colorId = ensureColorInTheme(context.theme, color);
    element.style.color = colorId;
  }

  if (text_align !== undefined) {
    element.style.text_align = text_align;
  }

  return {
    success: true,
    output: { elementId }
  };
}

/**
 * Set layer visibility
 */
export async function handleSetLayerVisibility(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const { layer_name, visible } = params;

  if (!layer_name || visible === undefined) {
    throw new ValidationError('layer_name and visible are required');
  }

  // Find element
  const elementId = context.layerMap.get(layer_name);
  if (!elementId) {
    throw new OpReferenceError(`Layer not found: ${layer_name}`);
  }

  const element = findElement(context.template.elements, elementId);
  if (!element) {
    throw new OpReferenceError(`Element not found: ${elementId}`);
  }

  // Update visibility
  if (!element.style) {
    element.style = {};
  }

  element.style.display = visible ? 'block' : 'none';

  return {
    success: true,
    output: { elementId, visible }
  };
}

/**
 * Delete layer from scene
 */
export async function handleDeleteLayer(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const { layer_name } = params;

  if (!layer_name) {
    throw new ValidationError('layer_name is required');
  }

  // Find element
  const elementId = context.layerMap.get(layer_name);
  if (!elementId) {
    throw new OpReferenceError(`Layer not found: ${layer_name}`);
  }

  const element = findElement(context.template.elements, elementId);
  if (!element) {
    throw new OpReferenceError(`Element not found: ${elementId}`);
  }

  // Remove data item if it's a data_item element
  if (element.element_type === 'data_item' && element.data_item_id) {
    const dataItemIndex = context.data.data_items.findIndex(
      item => item.id === element.data_item_id
    );
    if (dataItemIndex !== -1) {
      context.data.data_items.splice(dataItemIndex, 1);
    }
  }

  // Remove element from template
  const removed = removeElementFromTemplate(context.template, elementId);
  if (!removed) {
    throw new OpReferenceError(`Failed to remove element: ${elementId}`);
  }

  // Remove from layerMap
  context.layerMap.delete(layer_name);

  return {
    success: true,
    output: { elementId }
  };
}

// ============================================================================
// IMAGE OPERATIONS
// ============================================================================

/**
 * Generate image using AI
 */
export async function handleGenerateImage(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const { prompt, aspect_ratio, output_format } = params;

  if (!prompt) {
    throw new ValidationError('prompt is required');
  }

  try {
    // Call Replicate API
    const prediction = await runReplicateImageCreator(prompt, undefined, aspect_ratio, output_format);

    // Extract image URL from prediction output
    let imageUrl: string;
    if (Array.isArray(prediction.output)) {
      imageUrl = prediction.output[0];
    } else if (typeof prediction.output === 'string') {
      imageUrl = prediction.output;
    } else {
      throw new ValidationError('Unexpected prediction output format');
    }

    return {
      success: true,
      output: imageUrl
    };
  } catch (error) {
    throw new ValidationError(`Image generation failed: ${error}`);
  }
}

/**
 * Edit image using AI
 */
export async function handleEditImage(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const { input_images, prompt, aspect_ratio, output_format } = params;

  if (!input_images || !prompt) {
    throw new ValidationError('input_images and prompt are required');
  }

  // Ensure input_images is an array
  const imageArray = Array.isArray(input_images) ? input_images : [input_images];

  try {
    // Call Replicate API for image editing
    const prediction = await runReplicateImageCreator(prompt, imageArray, aspect_ratio, output_format);

    // Extract image URL from prediction output
    let imageUrl: string;
    if (Array.isArray(prediction.output)) {
      imageUrl = prediction.output[0];
    } else if (typeof prediction.output === 'string') {
      imageUrl = prediction.output;
    } else {
      throw new ValidationError('Unexpected prediction output format');
    }

    return {
      success: true,
      output: imageUrl
    };
  } catch (error) {
    throw new ValidationError(`Image editing failed: ${error}`);
  }
}

/**
 * Resize image (PLACEHOLDER)
 */
export async function handleResizeImage(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  throw new ValidationError('resize_image operation is not implemented yet');
}

/**
 * Crop image (PLACEHOLDER)
 */
export async function handleCropImage(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  throw new ValidationError('crop_image operation is not implemented yet');
}

/**
 * Remove background from image (PLACEHOLDER)
 */
export async function handleRemoveBackground(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  throw new ValidationError('remove_background operation is not implemented yet');
}

/**
 * Upscale image (PLACEHOLDER)
 */
export async function handleUpscale(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  throw new ValidationError('upscale operation is not implemented yet');
}

/**
 * Segment image (PLACEHOLDER)
 */
export async function handleSegment(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  throw new ValidationError('segment operation is not implemented yet');
}

// ============================================================================
// LAYOUT OPERATIONS
// ============================================================================

/**
 * Set layer anchor position
 */
export async function handleSetLayerAnchor(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const {
    layer_name,
    anchor,
    relative_to,
    offset_x = 0,
    offset_y = 0
  } = params;

  if (!layer_name || !anchor) {
    throw new ValidationError('layer_name and anchor are required');
  }

  // Find element
  const elementId = context.layerMap.get(layer_name);
  if (!elementId) {
    throw new OpReferenceError(`Layer not found: ${layer_name}`);
  }

  const element = findElement(context.template.elements, elementId);
  if (!element) {
    throw new OpReferenceError(`Element not found: ${elementId}`);
  }

  // Get canvas dimensions
  const canvasWidth = context.template.canvas?.width || 800;
  const canvasHeight = context.template.canvas?.height || 600;

  // Get element dimensions (default to 100x100 if not specified)
  const elementWidth = parseFloat(element.style?.width || '100');
  const elementHeight = parseFloat(element.style?.height || '100');

  let baseWidth = canvasWidth;
  let baseHeight = canvasHeight;
  let baseX = 0;
  let baseY = 0;

  // If relative_to is specified, use that element's position and size
  if (relative_to) {
    const relativeElementId = context.layerMap.get(relative_to);
    if (!relativeElementId) {
      throw new OpReferenceError(`Relative layer not found: ${relative_to}`);
    }

    const relativeElement = findElement(context.template.elements, relativeElementId);
    if (!relativeElement) {
      throw new OpReferenceError(`Relative element not found: ${relativeElementId}`);
    }

    baseWidth = parseFloat(relativeElement.style?.width || '100');
    baseHeight = parseFloat(relativeElement.style?.height || '100');
    baseX = parseFloat(relativeElement.style?.left || '0');
    baseY = parseFloat(relativeElement.style?.top || '0');
  }

  // Calculate position
  const position = calculateAnchorPosition(
    anchor,
    baseWidth,
    baseHeight,
    elementWidth,
    elementHeight,
    offset_x,
    offset_y
  );

  // Apply position relative to base
  if (!element.style) {
    element.style = {};
  }

  element.style.position = 'absolute';
  element.style.left = `${baseX + position.x}px`;
  element.style.top = `${baseY + position.y}px`;

  return {
    success: true,
    output: { elementId, x: baseX + position.x, y: baseY + position.y }
  };
}

/**
 * Create flex container
 */
export async function handleCreateFlexContainer(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const {
    container_name,
    direction = 'row',
    justify = 'flex-start',
    align = 'flex-start',
    gap = '0px',
    x = 0,
    y = 0,
    width,
    height
  } = params;

  if (!container_name) {
    throw new ValidationError('container_name is required');
  }

  // Create container element
  const elementId = generateId('elem');

  const style: ElementStyle = {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    display: 'flex',
    flex_direction: direction,
    justify_content: justify,
    align_items: align,
    gap: typeof gap === 'number' ? `${gap}px` : gap
  };

  if (width) {
    style.width = typeof width === 'number' ? `${width}px` : width;
  }

  if (height) {
    style.height = typeof height === 'number' ? `${height}px` : height;
  }

  const element: Element = {
    element_id: elementId,
    element_type: 'container',
    children: [],
    style
  };

  context.template.elements.push(element);

  // Track container in layerMap
  context.layerMap.set(container_name, elementId);

  return {
    success: true,
    output: { elementId }
  };
}

/**
 * Add layer to container
 */
export async function handleAddLayerToContainer(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const { layer_name, container_name } = params;

  if (!layer_name || !container_name) {
    throw new ValidationError('layer_name and container_name are required');
  }

  // Find layer element
  const layerElementId = context.layerMap.get(layer_name);
  if (!layerElementId) {
    throw new OpReferenceError(`Layer not found: ${layer_name}`);
  }

  // Find container element
  const containerElementId = context.layerMap.get(container_name);
  if (!containerElementId) {
    throw new OpReferenceError(`Container not found: ${container_name}`);
  }

  // Move layer into container
  addElementToContainer(context.template, layerElementId, containerElementId);

  return {
    success: true,
    output: { layerElementId, containerElementId }
  };
}

/**
 * Set flex layout (convenience wrapper)
 */
export async function handleSetFlexLayout(
  context: ExecutionContext,
  params: any
): Promise<OperationResult> {
  const {
    container_name,
    direction,
    justify,
    align,
    gap
  } = params;

  if (!container_name) {
    throw new ValidationError('container_name is required');
  }

  // Find container
  const containerElementId = context.layerMap.get(container_name);
  if (!containerElementId) {
    throw new OpReferenceError(`Container not found: ${container_name}`);
  }

  const container = findElement(context.template.elements, containerElementId);
  if (!container) {
    throw new OpReferenceError(`Element not found: ${containerElementId}`);
  }

  if (container.element_type !== 'container') {
    throw new ValidationError(`Element ${container_name} is not a container`);
  }

  // Update flex properties
  if (!container.style) {
    container.style = {};
  }

  // Ensure display is flex
  container.style.display = 'flex';

  if (direction !== undefined) {
    container.style.flex_direction = direction;
  }

  if (justify !== undefined) {
    container.style.justify_content = justify;
  }

  if (align !== undefined) {
    container.style.align_items = align;
  }

  if (gap !== undefined) {
    container.style.gap = typeof gap === 'number' ? `${gap}px` : gap;
  }

  return {
    success: true,
    output: { containerElementId }
  };
}
