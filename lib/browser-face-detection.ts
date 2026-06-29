"use client";

import type { FaceDetector, ObjectDetector } from "@mediapipe/tasks-vision";

const MEDIAPIPE_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const ORT_WASM_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
const YOLOV8S_MODEL_URL = "https://huggingface.co/Kalray/yolov8/resolve/main/yolov8s.onnx";
const FACE_DETECTOR_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite";
const PERSON_DETECTOR_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite";
const YOLO_INPUT_SIZE = 640;
const YOLO_PERSON_CLASS_INDEX = 0;
const YOLO_SCORE_THRESHOLD = 0.16;
const FACE_SCORE_THRESHOLD = 0.2;
const YOLO_IOU_THRESHOLD = 0.45;
const YOLO_MAX_DETECTIONS = 200;
const SENSITIVE_GRID_MIN_DETECTIONS = 12;

const DELEGATE_PRIORITY: ("GPU" | "CPU")[] = ["GPU", "CPU"];

let detectorPromise: Promise<FaceDetector> | null = null;
let personDetectorPromise: Promise<ObjectDetector> | null = null;
let yoloPersonDetectorPromise: Promise<YoloPersonDetector> | null = null;

export type DetectedFace = {
  id: string;
  box: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  imageUrl: string;
  score?: number;
  source?: "model" | "face" | "manual";
};

export type FaceDetectionPhotoResult = {
  fileName: string;
  photoId: string;
  imageHeight?: number;
  imageUrl?: string;
  imageWidth?: number;
  faces: DetectedFace[];
  model?: string;
  detectedImageUrl?: string;
};

type DetectionProgress = (message: string) => void;

type YoloPersonDetector = {
  detect: (image: HTMLImageElement, fileName: string, fileIndex: number, onProgress?: DetectionProgress) => Promise<FaceDetectionPhotoResult>;
  model: string;
};

type DetectionCandidate = {
  box: DetectedFace["box"];
  score: number;
  source: "model" | "face";
};

type DetectionCrop = {
  canvas?: HTMLCanvasElement;
  height: number;
  label: string;
  source: HTMLCanvasElement | HTMLImageElement;
  sourceX: number;
  sourceY: number;
  width: number;
};

async function loadPersonDetector() {
  if (!personDetectorPromise) {
    personDetectorPromise = import("@mediapipe/tasks-vision").then(async ({ ObjectDetector, FilesetResolver }) => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const errors: string[] = [];

      for (const delegate of DELEGATE_PRIORITY) {
        try {
          return await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
              delegate,
              modelAssetPath: PERSON_DETECTOR_MODEL_URL,
            },
            scoreThreshold: 0.2,
            runningMode: "IMAGE",
            maxResults: 200,
          });
        } catch (error) {
          errors.push(`${delegate}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      throw new Error(`Nao foi possivel criar detector de pessoas: ${errors.join("; ")}`);
    });
  }

  return personDetectorPromise;
}

export async function detectPeopleFromPhotos(files: File[]): Promise<FaceDetectionPhotoResult[]> {
  const detector = await loadPersonDetector();

  return Promise.all(
    files.map(async (file, fileIndex) => {
      const image = await readImage(file);
      let result: ReturnType<ObjectDetector["detect"]>;

      try {
        result = detector.detect(image);
      } catch (error) {
        console.warn("[person-detection] detect() falhou para", file.name, error);
        return { fileName: file.name, faces: [], photoId: `${file.name}-${fileIndex}` };
      }

      const faces =
        result.detections
          ?.filter((detection) => {
            const topCategory = detection.categories?.[0];
            return topCategory?.categoryName === "person" || topCategory?.index === 1;
          })
          .map((detection, faceIndex) => {
            const boundingBox = detection.boundingBox;
            const box = {
              height: Math.max(0, boundingBox?.height ?? 0),
              width: Math.max(0, boundingBox?.width ?? 0),
              x: Math.max(0, boundingBox?.originX ?? 0),
              y: Math.max(0, boundingBox?.originY ?? 0),
            };

            return {
              id: `${file.name}-${fileIndex}-${faceIndex}`,
              box,
              imageUrl: faceToImageUrl(image, box),
            };
          }) ?? [];

      const detectedImageUrl = drawPersonDetections(
        image,
        faces.map((face) => face.box),
      );

      return {
        fileName: file.name,
        faces,
        photoId: `${file.name}-${fileIndex}`,
        detectedImageUrl,
      };
    }),
  );
}

export async function detectPeopleWithYolov8sFromPhotos(files: File[], onProgress?: DetectionProgress): Promise<FaceDetectionPhotoResult[]> {
  onProgress?.("Carregando YOLOv8s...");
  const detector = await loadYolov8sPersonDetector();
  const results: FaceDetectionPhotoResult[] = [];

  for (const [fileIndex, file] of files.entries()) {
    onProgress?.(`Processando ${fileIndex + 1} de ${files.length}: ${file.name}`);
    const image = await readImage(file);

    try {
      results.push(await detector.detect(image, file.name, fileIndex, onProgress));
    } catch (error) {
      console.warn("[yolov8s-person-detection] detect() falhou para", file.name, error);
      results.push({
        faces: [],
        fileName: file.name,
        imageHeight: image.naturalHeight,
        imageUrl: imageToDataUrl(image),
        imageWidth: image.naturalWidth,
        model: detector.model,
        photoId: `${file.name}-${fileIndex}`,
      });
    }
  }

  onProgress?.("Detecção concluída.");
  return results;
}

async function loadYolov8sPersonDetector(): Promise<YoloPersonDetector> {
  if (!yoloPersonDetectorPromise) {
    yoloPersonDetectorPromise = import("onnxruntime-web").then(async (ort) => {
      ort.env.wasm.wasmPaths = ORT_WASM_URL;
      const session = await ort.InferenceSession.create(YOLOV8S_MODEL_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      const inputName = session.inputNames[0];
      const outputName = session.outputNames[0];

      return {
        model: "yolov8s-coco-onnx",
        detect: async (image: HTMLImageElement, fileName: string, fileIndex: number, onProgress?: DetectionProgress) => {
          const faceDetector = await loadDetector();
          const candidates: DetectionCandidate[] = [];
          const fullCrop = createFullImageCrop(image);

          onProgress?.(`Analisando ${fileName} inteira...`);
          candidates.push(...(await runYoloDetection(session, inputName, outputName, fullCrop, image.naturalWidth, image.naturalHeight)));

          if (candidates.length < SENSITIVE_GRID_MIN_DETECTIONS || Math.max(image.naturalWidth, image.naturalHeight) >= 1600) {
            const crops = createDetectionCrops(image);

            for (const [cropIndex, crop] of crops.entries()) {
              onProgress?.(`Analisando corte ${cropIndex + 1} de ${crops.length}: ${fileName}`);
              candidates.push(...(await runYoloDetection(session, inputName, outputName, crop, image.naturalWidth, image.naturalHeight)));
            }
          }

          onProgress?.(`Buscando rostos em ${fileName}...`);
          candidates.push(...detectFaceCandidates(faceDetector, image));

          const detections = nonMaxSuppression(candidates).slice(0, YOLO_MAX_DETECTIONS);

          return {
            faces: detections.map((detection, detectionIndex) => ({
              box: detection.box,
              id: `${fileName}-${fileIndex}-${detection.source}-${detectionIndex}`,
              imageUrl: faceToImageUrl(image, detection.box),
              score: detection.score,
              source: detection.source,
            })),
            fileName,
            imageHeight: image.naturalHeight,
            imageUrl: imageToDataUrl(image),
            imageWidth: image.naturalWidth,
            model: "yolov8s-coco-onnx+blazeface-full-range",
            photoId: `${fileName}-${fileIndex}`,
          };
        },
      };

      async function runYoloDetection(
        currentSession: typeof session,
        currentInputName: string,
        currentOutputName: string,
        crop: DetectionCrop,
        imageWidth: number,
        imageHeight: number,
      ): Promise<DetectionCandidate[]> {
        const prepared = prepareYoloInput(crop.source, crop.width, crop.height);
        const tensor = new ort.Tensor("float32", prepared.data, [1, 3, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE]);
        const output = await currentSession.run({ [currentInputName]: tensor });
        const detections = parseYoloDetections(
          output[currentOutputName].data as Float32Array,
          output[currentOutputName].dims,
          prepared.scale,
          prepared.padX,
          prepared.padY,
          crop.width,
          crop.height,
        );

        return detections.map((detection) => ({
          box: clampBox(
            {
              height: detection.box.height,
              width: detection.box.width,
              x: detection.box.x + crop.sourceX,
              y: detection.box.y + crop.sourceY,
            },
            imageWidth,
            imageHeight,
          ),
          score: detection.score,
          source: "model" as const,
        }));
      }
    });
  }

  return yoloPersonDetectorPromise;
}

async function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = import("@mediapipe/tasks-vision").then(async ({ FaceDetector, FilesetResolver }) => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const errors: string[] = [];

      for (const delegate of DELEGATE_PRIORITY) {
        try {
          return await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              delegate,
              modelAssetPath: FACE_DETECTOR_MODEL_URL,
            },
            minDetectionConfidence: 0.3,
            runningMode: "IMAGE",
          });
        } catch (error) {
          errors.push(`${delegate}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      throw new Error(`Nao foi possivel criar detector facial: ${errors.join("; ")}`);
    });
  }

  return detectorPromise;
}

function readImage(file: File) {
  return new Promise<HTMLImageElement>(async (resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = async () => {
      try {
        await image.decode();
      } catch {
        // decode failure is not fatal
      }
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Nao foi possivel abrir ${file.name}.`));
    };
    image.src = url;
  });
}

function imageToDataUrl(image: HTMLImageElement, maxDimension = 1600) {
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  if (width > maxDimension || height > maxDimension) {
    const scale = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;
  if (!context) return "";

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function createFullImageCrop(image: HTMLImageElement): DetectionCrop {
  return {
    height: image.naturalHeight,
    label: "inteira",
    source: image,
    sourceX: 0,
    sourceY: 0,
    width: image.naturalWidth,
  };
}

function createDetectionCrops(image: HTMLImageElement): DetectionCrop[] {
  const crops: DetectionCrop[] = [];
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const gridSizes = Math.max(width, height) >= 1800 ? [2, 3] : [2];

  for (const gridSize of gridSizes) {
    const overlap = 0.18;
    const cropWidth = Math.round(width / (gridSize - (gridSize - 1) * overlap));
    const cropHeight = Math.round(height / (gridSize - (gridSize - 1) * overlap));
    const stepX = Math.max(1, Math.round(cropWidth * (1 - overlap)));
    const stepY = Math.max(1, Math.round(cropHeight * (1 - overlap)));

    for (let row = 0; row < gridSize; row += 1) {
      for (let column = 0; column < gridSize; column += 1) {
        const sourceX = Math.min(width - cropWidth, column * stepX);
        const sourceY = Math.min(height - cropHeight, row * stepY);
        const actualWidth = Math.min(cropWidth, width - sourceX);
        const actualHeight = Math.min(cropHeight, height - sourceY);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = actualWidth;
        canvas.height = actualHeight;

        if (!context || actualWidth < 80 || actualHeight < 80) continue;

        context.drawImage(image, sourceX, sourceY, actualWidth, actualHeight, 0, 0, actualWidth, actualHeight);
        crops.push({
          canvas,
          height: actualHeight,
          label: `${gridSize}x${gridSize}-${row}-${column}`,
          source: canvas,
          sourceX,
          sourceY,
          width: actualWidth,
        });
      }
    }
  }

  return crops;
}

function detectFaceCandidates(detector: FaceDetector, image: HTMLImageElement): DetectionCandidate[] {
  let result: ReturnType<FaceDetector["detect"]>;

  try {
    result = detector.detect(image);
  } catch (error) {
    console.warn("[face-detection] fallback falhou", error);
    return [];
  }

  const candidates: DetectionCandidate[] = [];

  for (const detection of result.detections ?? []) {
    const boundingBox = detection.boundingBox;
    const score = detection.categories?.[0]?.score ?? 0.45;
    if (!boundingBox || score < FACE_SCORE_THRESHOLD) continue;

    const faceWidth = Math.max(0, boundingBox.width ?? 0);
    const faceHeight = Math.max(0, boundingBox.height ?? 0);
    if (faceWidth < 6 || faceHeight < 6) continue;

    const centerX = (boundingBox.originX ?? 0) + faceWidth / 2;
    const bodyWidth = faceWidth * 1.85;
    const bodyHeight = faceHeight * 3.2;
    const box = clampBox(
      {
        height: bodyHeight,
        width: bodyWidth,
        x: centerX - bodyWidth / 2,
        y: (boundingBox.originY ?? 0) - faceHeight * 0.45,
      },
      image.naturalWidth,
      image.naturalHeight,
    );

    candidates.push({
      box,
      score: Math.max(0.18, score * 0.82),
      source: "face",
    });
  }

  return candidates;
}

function prepareYoloInput(source: HTMLCanvasElement | HTMLImageElement, sourceWidth: number, sourceHeight: number) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const data = new Float32Array(3 * YOLO_INPUT_SIZE * YOLO_INPUT_SIZE);
  const scale = Math.min(YOLO_INPUT_SIZE / sourceWidth, YOLO_INPUT_SIZE / sourceHeight);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  const padX = Math.floor((YOLO_INPUT_SIZE - width) / 2);
  const padY = Math.floor((YOLO_INPUT_SIZE - height) / 2);

  canvas.width = YOLO_INPUT_SIZE;
  canvas.height = YOLO_INPUT_SIZE;

  if (!context) {
    return { data, padX, padY, scale };
  }

  context.fillStyle = "rgb(114, 114, 114)";
  context.fillRect(0, 0, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE);
  context.drawImage(source, padX, padY, width, height);

  const imageData = context.getImageData(0, 0, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE).data;
  const channelSize = YOLO_INPUT_SIZE * YOLO_INPUT_SIZE;

  for (let index = 0; index < channelSize; index += 1) {
    const pixelIndex = index * 4;
    data[index] = imageData[pixelIndex] / 255;
    data[channelSize + index] = imageData[pixelIndex + 1] / 255;
    data[channelSize * 2 + index] = imageData[pixelIndex + 2] / 255;
  }

  return { data, padX, padY, scale };
}

function parseYoloDetections(
  data: Float32Array,
  dims: readonly number[],
  scale: number,
  padX: number,
  padY: number,
  imageWidth: number,
  imageHeight: number,
) {
  const [first, second, third] = dims;
  const rows = third && second > third ? third : second;
  const valuesPerRow = third && second > third ? second : third ?? Math.floor(data.length / rows);
  const transposed = Boolean(third && second > third);
  const detections: Array<{ box: DetectedFace["box"]; score: number }> = [];

  for (let row = 0; row < rows; row += 1) {
    const read = (column: number) => {
      if (!first) return data[row * valuesPerRow + column] ?? 0;
      return transposed ? data[column * rows + row] ?? 0 : data[row * valuesPerRow + column] ?? 0;
    };
    const score = read(4 + YOLO_PERSON_CLASS_INDEX);

    if (score < YOLO_SCORE_THRESHOLD) continue;

    const centerX = read(0);
    const centerY = read(1);
    const width = read(2);
    const height = read(3);
    const x = (centerX - width / 2 - padX) / scale;
    const y = (centerY - height / 2 - padY) / scale;
    const box = clampBox(
      {
        height: height / scale,
        width: width / scale,
        x,
        y,
      },
      imageWidth,
      imageHeight,
    );

    if (box.width >= 8 && box.height >= 8) {
      detections.push({ box, score });
    }
  }

  return nonMaxSuppression(detections).slice(0, YOLO_MAX_DETECTIONS);
}

function clampBox(box: DetectedFace["box"], imageWidth: number, imageHeight: number): DetectedFace["box"] {
  const x = Math.max(0, Math.min(imageWidth, box.x));
  const y = Math.max(0, Math.min(imageHeight, box.y));
  const width = Math.max(0, Math.min(imageWidth - x, box.width));
  const height = Math.max(0, Math.min(imageHeight - y, box.height));

  return { height, width, x, y };
}

function nonMaxSuppression<T extends { box: DetectedFace["box"]; score: number }>(detections: T[]) {
  const selected: typeof detections = [];
  const candidates = [...detections].sort((a, b) => b.score - a.score);

  while (candidates.length && selected.length < YOLO_MAX_DETECTIONS) {
    const current = candidates.shift();
    if (!current) break;
    selected.push(current);

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      if (shouldSuppressBox(current.box, candidates[index].box)) {
        candidates.splice(index, 1);
      }
    }
  }

  return selected;
}

function shouldSuppressBox(a: DetectedFace["box"], b: DetectedFace["box"]) {
  if (boxIou(a, b) > YOLO_IOU_THRESHOLD) return true;

  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  const smaller = aArea <= bArea ? a : b;
  const larger = aArea <= bArea ? b : a;
  const smallerCenterX = smaller.x + smaller.width / 2;
  const smallerCenterY = smaller.y + smaller.height / 2;
  const centerInside =
    smallerCenterX >= larger.x &&
    smallerCenterX <= larger.x + larger.width &&
    smallerCenterY >= larger.y &&
    smallerCenterY <= larger.y + larger.height;
  const areaRatio = Math.min(aArea, bArea) / Math.max(aArea, bArea);

  return centerInside && areaRatio > 0.18;
}

function boxIou(a: DetectedFace["box"], b: DetectedFace["box"]) {
  const intersectionX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const intersectionY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = intersectionX * intersectionY;
  const union = a.width * a.height + b.width * b.height - intersection;

  return union > 0 ? intersection / union : 0;
}

function faceToImageUrl(image: HTMLImageElement, box: DetectedFace["box"]) {
  const padding = Math.round(Math.max(box.width, box.height) * 0.22);
  const sourceX = Math.max(0, Math.floor(box.x - padding));
  const sourceY = Math.max(0, Math.floor(box.y - padding));
  const sourceWidth = Math.min(image.naturalWidth - sourceX, Math.ceil(box.width + padding * 2));
  const sourceHeight = Math.min(image.naturalHeight - sourceY, Math.ceil(box.height + padding * 2));
  const canvas = document.createElement("canvas");
  const size = 160;
  const context = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;

  if (!context || sourceWidth <= 0 || sourceHeight <= 0) return "";

  context.fillStyle = "#f4f4f5";
  context.fillRect(0, 0, size, size);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, size, size);

  return canvas.toDataURL("image/jpeg", 0.82);
}

function drawPersonDetections(
  image: HTMLImageElement,
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
  maxDimension = 1000,
): string {
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  if (width > maxDimension || height > maxDimension) {
    const scale = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.drawImage(image, 0, 0, width, height);

  const scaleX = width / image.naturalWidth;
  const scaleY = height / image.naturalHeight;

  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = Math.max(2, Math.round(width / 200));

  for (const box of boxes) {
    ctx.strokeRect(box.x * scaleX, box.y * scaleY, box.width * scaleX, box.height * scaleY);
  }

  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function detectFacesFromPhotos(files: File[]): Promise<FaceDetectionPhotoResult[]> {
  const detector = await loadDetector();

  return Promise.all(
    files.map(async (file, fileIndex) => {
      const image = await readImage(file);
      let result: ReturnType<FaceDetector["detect"]>;

      try {
        result = detector.detect(image);
      } catch (error) {
        console.warn("[face-detection] detect() falhou para", file.name, error);
        return { fileName: file.name, faces: [], photoId: `${file.name}-${fileIndex}` };
      }

      const faces =
        result.detections?.map((detection, faceIndex) => {
          const boundingBox = detection.boundingBox;
          const box = {
            height: Math.max(0, boundingBox?.height ?? 0),
            width: Math.max(0, boundingBox?.width ?? 0),
            x: Math.max(0, boundingBox?.originX ?? 0),
            y: Math.max(0, boundingBox?.originY ?? 0),
          };

          return {
            id: `${file.name}-${fileIndex}-${faceIndex}`,
            box,
            imageUrl: faceToImageUrl(image, box),
          };
        }) ?? [];

      return {
        fileName: file.name,
        faces,
        photoId: `${file.name}-${fileIndex}`,
      };
    }),
  );
}
