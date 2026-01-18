import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Load a JSON schema from file
 */
function loadSchema(schemaPath: string) {
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  return JSON.parse(schemaContent);
}

/**
 * Validate a JSON file against a schema
 */
export function validateJson(
  jsonPath: string,
  schemaPath: string
): { valid: boolean; errors: any[] | null } {
  try {
    // Create a new Ajv instance for each validation to avoid schema conflicts
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);

    // Load the schema
    const schema = loadSchema(schemaPath);
    const validate = ajv.compile(schema);

    // Load and parse the JSON file
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(jsonContent);

    // Validate
    const valid = validate(data);

    return {
      valid,
      errors: validate.errors || null
    };
  } catch (error: any) {
    return {
      valid: false,
      errors: [{ message: error.message }]
    };
  }
}

/**
 * Validate all sample scene files
 */
function validateSampleFiles() {
  // When running from dist/, go up one level to get to the root
  const rootDir = path.join(__dirname, '..');

  console.log('Validating scene files...\n');

  const validations = [
    {
      name: 'Wedding Invitation Data',
      jsonFile: path.join(rootDir, 'wedding-invitation-data.json'),
      schemaFile: path.join(rootDir, 'scene-data-schema.json')
    },
    {
      name: 'Wedding Invitation Template',
      jsonFile: path.join(rootDir, 'wedding-invitation-template.json'),
      schemaFile: path.join(rootDir, 'scene-template-schema.json')
    },
    {
      name: 'Elegant Wedding Theme',
      jsonFile: path.join(rootDir, 'wedding-invitation-theme.json'),
      schemaFile: path.join(rootDir, 'scene-theme-schema.json')
    },
    {
      name: 'Modern Wedding Theme',
      jsonFile: path.join(rootDir, 'wedding-invitation-theme-modern.json'),
      schemaFile: path.join(rootDir, 'scene-theme-schema.json')
    }
  ];

  let allValid = true;

  validations.forEach(({ name, jsonFile, schemaFile }) => {
    const result = validateJson(jsonFile, schemaFile);

    if (result.valid) {
      console.log(`✓ ${name}: Valid`);
    } else {
      console.log(`✗ ${name}: Invalid`);
      console.log('  Errors:');
      result.errors?.forEach(error => {
        console.log(`    - ${error.instancePath || '/'}: ${error.message}`);
      });
      allValid = false;
    }
  });

  console.log('\n' + (allValid ? 'All files are valid!' : 'Some files have validation errors.'));
  process.exit(allValid ? 0 : 1);
}

// Run validation if this file is executed directly
if (require.main === module) {
  validateSampleFiles();
}
