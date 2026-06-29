import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IMAGE_PATH = process.argv[2];
if (!IMAGE_PATH || !fs.existsSync(IMAGE_PATH)) {
  console.error("Uso: node scripts/test-face-detection-browser.mjs <caminho-da-foto>");
  process.exit(1);
}

async function main() {
  const imageBuffer = fs.readFileSync(IMAGE_PATH);
  const imageBase64 = imageBuffer.toString("base64");
  const ext = path.extname(IMAGE_PATH).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${imageBase64}`;

  const html = `<!DOCTYPE html>
<html>
<body>
  <img id="photo" style="max-width:800px" />
  <pre id="output"></pre>
  <script type="module">
    const photo = document.getElementById("photo");
    const output = document.getElementById("output");

    function log(msg) {
      output.textContent += msg + "\\n";
      console.log(msg);
    }

    photo.onload = async () => {
      log("Imagem carregada: " + photo.naturalWidth + "x" + photo.naturalHeight);

      try {
        const { FaceDetector, FilesetResolver } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs");
        log("MediaPipe carregado");

        const wasmUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
        const modelUrl = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
        const modelUrlLatest = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
        const modelUrlFull = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite";

        const vision = await FilesetResolver.forVisionTasks(wasmUrl);
        log("WASM resolvido");

        const delegates = ["GPU", "CPU"];
        const confidences = [0.3, 0.45];

        for (const delegate of delegates) {
          for (const minDetectionConfidence of confidences) {
            try {
              const detector = await FaceDetector.createFromOptions(vision, {
                baseOptions: { delegate, modelAssetPath: modelUrl },
                minDetectionConfidence,
                runningMode: "IMAGE",
              });
              const result = detector.detect(photo);
              const count = result.detections?.length ?? 0;
              log(delegate + " conf=" + minDetectionConfidence + " model=1 => " + count + " rostos");
              detector.close();
            } catch (e) {
              log(delegate + " conf=" + minDetectionConfidence + " model=1 => ERRO: " + e.message);
            }
          }
        }

        // Try with createFromModelPath
        try {
          const detector = await FaceDetector.createFromModelPath(vision, modelUrl);
          const result = detector.detect(photo);
          const count = result.detections?.length ?? 0;
          log("createFromModelPath => " + count + " rostos");
          detector.close();
        } catch (e) {
          log("createFromModelPath => ERRO: " + e.message);
        }

        // Try with latest URL
        for (const delegate of delegates) {
          try {
            const detector = await FaceDetector.createFromOptions(vision, {
              baseOptions: { delegate, modelAssetPath: modelUrlLatest },
              minDetectionConfidence: 0.3,
              runningMode: "IMAGE",
            });
            const result = detector.detect(photo);
            const count = result.detections?.length ?? 0;
            log(delegate + " conf=0.3 model=latest => " + count + " rostos");
            detector.close();
          } catch (e) {
            log(delegate + " conf=0.3 model=latest => ERRO: " + e.message);
          }
        }

        // Try with FULL RANGE model
        for (const delegate of delegates) {
          for (const minDetectionConfidence of confidences) {
            try {
              const detector = await FaceDetector.createFromOptions(vision, {
                baseOptions: { delegate, modelAssetPath: modelUrlFull },
                minDetectionConfidence,
                runningMode: "IMAGE",
              });
              const result = detector.detect(photo);
              const count = result.detections?.length ?? 0;
              log(delegate + " conf=" + minDetectionConfidence + " model=full_range => " + count + " rostos");
              detector.close();
            } catch (e) {
              log(delegate + " conf=" + minDetectionConfidence + " model=full_range => ERRO: " + e.message);
            }
          }
        }

        log("\\nTESTE CONCLUIDO");
        document.title = "DONE";
      } catch (e) {
        log("FATAL: " + e.message);
        document.title = "ERROR";
      }
    };
    photo.src = "${dataUrl}";
  </script>
</body>
</html>`;

  const htmlPath = "/tmp/face-test.html";
  fs.writeFileSync(htmlPath, html);

  console.log("Iniciando Chromium headless...");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "log") console.log("[browser]", msg.text());
      if (msg.type() === "error") console.error("[browser ERROR]", msg.text());
    });

    await page.goto("file://" + htmlPath, { waitUntil: "networkidle" });

    // Wait for test to complete (max 60 seconds)
    try {
      await page.waitForFunction(() => document.title === "DONE" || document.title === "ERROR", { timeout: 60000 });
    } catch {
      // timeout
    }

    const output = await page.evaluate(() => document.getElementById("output").textContent);
    console.log("\n" + "=".repeat(60));
    console.log("RESULTADO:");
    console.log(output);
  } finally {
    await browser.close();
  }

  console.log("=".repeat(60));
  console.log("Fim do teste.");
}

main().catch(console.error);
