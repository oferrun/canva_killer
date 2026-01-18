import { createEmptyScene, addDataItemToScene, saveSceneToFile } from "./ckengine";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "create": {
      const sceneId = args[1] || "new-scene";
      const scene = createEmptyScene(sceneId);

      // Set canvas size to 1240x1748
      scene.template.canvas.width = 1240;
      scene.template.canvas.height = 1748;

      // Add yellow to color palette (as fallback)
      scene.theme.color_palette.push({
        id: "yellow",
        name: "Yellow",
        r: 255,
        g: 255,
        b: 0,
        a: 1
      });

      // Add names color (blue) to color palette
      scene.theme.color_palette.push({
        id: "names",
        name: "Names",
        r: 0,
        g: 0,
        b: 255,
        a: 1
      });

      // Add background image data item
      addDataItemToScene(scene.data, {
        id: "background_image",
        type: "image",
        display_name: "Background Image",
        image_url: "waterbg.png"
      });

      // Add background element that uses the data item image
      scene.template.elements.push({
        element_id: "background",
        element_type: "data_item",
        data_item_id: "background_image",
        style: {
          width: "100%",
          height: "100%",
          object_fit: "cover",
          background_color: "yellow"
        }
      });

      // Add road image element (non-data item)
      scene.template.elements.push({
        element_id: "road",
        element_type: "image",
        image_url: "road.png",
        style: {
          position: "absolute",
          left: "-59px",
          top: "1464px"
        }
      });

      // Add aisle image element
      scene.template.elements.push({
        element_id: "aisle",
        element_type: "image",
        image_url: "aisle.png",
        style: {
          position: "absolute",
          left: "268px",
          top: "782px"
        }
      });

      // Add Dancing Script font to font palette
      scene.theme.font_palette.push({
        font_id: "halimum",
        font_name: "Dancing Script",
        font_url: "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400..700&display=swap"
      });

      // Add names text data item
      addDataItemToScene(scene.data, {
        id: "names",
        type: "text",
        display_name: "Names",
        content: "Emma & Caden"
      });

      // Add names element connected to the data item
      scene.template.elements.push({
        element_id: "names_element",
        element_type: "data_item",
        data_item_id: "names",
        style: {
          position: "absolute",
          left: "0",
          right: "0",
          top: "342px",
          text_align: "center",
          font: "halimum",
          font_size: "87.5px",
          color: "names"
        }
      });

      // Save the scene
      const savedFiles = await saveSceneToFile(
        scene.data,
        scene.template,
        scene.theme,
        sceneId
      );

      console.log("Scene created:");
      console.log(`  Scene: ${savedFiles.sceneFile}`);
      console.log(`  Data: ${savedFiles.dataFile}`);
      console.log(`  Template: ${savedFiles.templateFile}`);
      console.log(`  Theme: ${savedFiles.themeFile}`);
      break;
    }

    default:
      console.log("Usage: bun cli.ts <command> [args]");
      console.log("");
      console.log("Commands:");
      console.log("  create [sceneId]  - Create a new scene");
      break;
  }
}

main().catch(console.error);
