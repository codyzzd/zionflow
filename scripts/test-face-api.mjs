import { createCanvas, loadImage } from "canvas";
import * as faceapi from "@vladmandic/face-api";
import fs from "node:fs";

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.error("Uso: node scripts/test-face-api.mjs <caminho-da-foto>");
    process.exit(1);
  }

  console.log("Carregando modelo...");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk("/tmp");
  // Fallback: load from URL
  if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
    await faceapi.nets.ssdMobilenetv1.load("https://justadudewhohacks.github.io/face-api.js/models");
  }
  console.log("Modelo carregado");

  const image = await loadImage(imagePath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  const results = await faceapi.detectAllFaces(canvas);
  console.log(`Detectado: ${results.length} rostos`);
  results.forEach((r, i) => {
    console.log(`  Rosto ${i + 1}: score=${r.score?.toFixed(3)} box=(${Math.round(r.box.x)},${Math.round(r.box.y)}) ${Math.round(r.box.width)}x${Math.round(r.box.height)}`);
  });
}

main().catch(console.error);
