import { createCanvas, loadImage } from "canvas";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Uso: node scripts/test-face-detection.mjs <caminho-da-foto>");
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error("Arquivo nao encontrado:", imagePath);
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Teste de deteccao facial com @mediapipe/tasks-vision");
  console.log("=".repeat(60));
  console.log("Foto:", imagePath);
  console.log("Tamanho:", (fs.statSync(imagePath).size / 1024).toFixed(1), "KB");
  console.log();

  // Load the mediapipe module
  const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
  console.log("[OK] @mediapipe/tasks-vision carregado");

  // Load WASM
  const wasmUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
  const vision = await FilesetResolver.forVisionTasks(wasmUrl);
  console.log("[OK] WASM carregado");

  // Load the image
  const image = await loadImage(imagePath);
  console.log(`[OK] Imagem carregada: ${image.width}x${image.height}`);

  // Create canvas at original size first
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  // Try different delegates and confidences
  const delegates = ["GPU", "CPU"];
  const confidences = [0.3, 0.45];

  for (const delegate of delegates) {
    for (const minDetectionConfidence of confidences) {
      const scale = 1280 / Math.max(image.width, image.height);
      const w = Math.round(image.width * scale);
      const h = Math.round(image.height * scale);

      console.log(`\n--- Delegate: ${delegate}, confidence: ${minDetectionConfidence} ---`);

      // Try at original size
      try {
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: { delegate, modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" },
          minDetectionConfidence,
          runningMode: "IMAGE",
        });

        const result = detector.detect(canvas);
        const count = result.detections?.length ?? 0;
        console.log(`  Original (${image.width}x${image.height}): ${count} rostos`);
        detector.close();
      } catch (error) {
        console.log(`  Original: ERRO - ${error.message}`);
      }

      // Try at smaller size
      if (scale < 1) {
        try {
          const smallCanvas = createCanvas(w, h);
          const smallCtx = smallCanvas.getContext("2d");
          smallCtx.drawImage(image, 0, 0, w, h);

          const detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: { delegate, modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" },
            minDetectionConfidence,
            runningMode: "IMAGE",
          });

          const result = detector.detect(smallCanvas);
          const count = result.detections?.length ?? 0;
          console.log(`  Reduzido (${w}x${h}): ${count} rostos`);
          detector.close();
        } catch (error) {
          console.log(`  Reduzido: ERRO - ${error.message}`);
        }
      }
    }
  }

  // Try createFromModelPath (simpler API)
  console.log(`\n--- createFromModelPath (simpler API) ---`);
  try {
    const detector = await FaceDetector.createFromModelPath(
      vision,
      "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
    );
    const result = detector.detect(canvas);
    const count = result.detections?.length ?? 0;
    console.log(`  Original: ${count} rostos`);
    detector.close();
  } catch (error) {
    console.log(`  ERRO: ${error.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Teste concluido.");
}

main().catch(console.error);
