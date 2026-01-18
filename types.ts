// Type definitions for the scene visualization system

export interface Color {
  id: string;
  name: string;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Font {
  font_id: string;
  font_name: string;
  font_url: string;
}

export interface Theme {
  theme_id: string;
  theme_name: string;
  color_palette: Color[];
  font_palette: Font[];
}

export interface DataItem {
  id: string;
  type: 'text' | 'image';
  display_name: string;
  content?: string;  // For text items
  image_url?: string;  // For image items
}

export interface SceneData {
  scene_id: string;
  data_items: DataItem[];
}

export interface ElementStyle {
  // Layout
  width?: string;
  height?: string;
  margin_top?: string;
  margin_bottom?: string;
  margin_left?: string;
  margin_right?: string;
  padding?: string;
  display?: string;

  // Positioning
  position?: string;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  z_index?: string;

  // Text
  font?: string;  // References font_id from theme
  font_size?: string;
  font_weight?: string;
  font_style?: string;
  text_align?: string;
  line_height?: string;
  letter_spacing?: string;
  text_transform?: string;

  // Colors
  color?: string;  // References color id from theme
  fill?: string;   // References color id from theme (for shapes)
  background_color?: string;  // References color id from theme
  border?: string;
  border_color?: string;  // References color id from theme

  // Image
  object_fit?: string;  // cover, contain, fill, none, scale-down
}

export type ElementType = 'data_item' | 'shape' | 'svg' | 'container' | 'image';
export type ShapeType = 'rectangle' | 'circle';

export interface Element {
  element_id: string;
  element_type: ElementType;

  // For data_item type
  data_item_id?: string;

  // For shape type
  shape_type?: ShapeType;

  // For svg type
  svg_content?: string;

  // For image type (non-data images)
  image_url?: string;

  // Style
  style?: ElementStyle;

  // For container type
  children?: Element[];
}

export interface Template {
  template_id: string;
  template_name: string;
  canvas: {
    width: number;
    height: number;
  };
  elements: Element[];
}

export interface Scene {
  data: SceneData;
  template: Template;
  theme: Theme;
}

export interface RenderResult {
  html: string;
  css: string;
}
