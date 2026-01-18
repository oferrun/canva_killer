# JSON Schema Reference

This document explains how to use the JSON schemas in this project for validation and IDE support.

## Available Schemas

1. **scene-data-schema.json** - Validates scene data files
2. **scene-template-schema.json** - Validates template files
3. **scene-theme-schema.json** - Validates theme files

## Using Schemas in Your IDE

Most modern IDEs support JSON Schema for autocomplete and validation. Add a `$schema` property at the top of your JSON files:

### Scene Data Files

```json
{
  "$schema": "./scene-data-schema.json",
  "scene_id": "my_scene_001",
  "data_items": [
    ...
  ]
}
```

### Template Files

```json
{
  "$schema": "./scene-template-schema.json",
  "template_id": "my_template_001",
  "template_name": "My Template",
  "canvas": {
    "width": 800,
    "height": 1200
  },
  "elements": [
    ...
  ]
}
```

### Theme Files

```json
{
  "$schema": "./scene-theme-schema.json",
  "theme_id": "my_theme_001",
  "theme_name": "My Theme",
  "color_palette": [
    ...
  ],
  "font_palette": [
    ...
  ]
}
```

## Validation

Run validation on all sample files:

```bash
npm run validate
```

This will check:
- ✓ Wedding Invitation Data
- ✓ Wedding Invitation Template
- ✓ Elegant Wedding Theme
- ✓ Modern Wedding Theme

## Schema Constraints

### Data Schema
- `type` must be either "text" or "image"
- Text items require `content` field
- Image items require `image_url` field

### Template Schema
- `element_type` must be one of: data_item, shape, svg, container, image
- Shape types: rectangle, circle
- Canvas dimensions must be positive integers
- Element styles follow CSS naming conventions with underscores (e.g., `margin_top`)

### Theme Schema
- Maximum 16 colors in palette
- Maximum 8 fonts in palette
- RGB values must be 0-255
- Alpha values must be 0.0-1.0
- Font URLs should be valid URIs

## IDE Support

### VS Code
VS Code automatically recognizes JSON schemas when the `$schema` property is present. You'll get:
- Autocomplete for properties
- Validation errors inline
- Hover documentation

### Other IDEs
Most modern IDEs (IntelliJ, WebStorm, etc.) also support JSON Schema validation. Check your IDE's documentation for specific setup instructions.
