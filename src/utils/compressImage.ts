export type CompressImageResult = {
  blob: Blob;
  iterations: number;
  warning?: string;
};

type CompressImageOptions = {
  targetBytes: number;
  maxIterations?: number;
  minQuality?: number;
  preserveFormat?: boolean;
};

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode image"));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

function getOutputType(inputType: string, preserveFormat: boolean) {
  if (!preserveFormat) return "image/jpeg";
  if (inputType === "image/jpeg" || inputType === "image/png" || inputType === "image/webp") {
    return inputType;
  }
  return "image/jpeg";
}

export async function compressImageFile(file: File, options: CompressImageOptions): Promise<CompressImageResult> {
  const maxIterations = options.maxIterations ?? 10;
  const minQuality = options.minQuality ?? 0.1;
  const outputType = getOutputType(file.type, options.preserveFormat ?? true);
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const originalW = image.naturalWidth || image.width;
    const originalH = image.naturalHeight || image.height;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    let bestBlob: Blob = file;
    let bestSizeDelta = Math.abs(file.size - options.targetBytes);
    let warning: string | undefined;

    for (let i = 0; i < maxIterations; i += 1) {
      const ratio = i / Math.max(1, maxIterations - 1);
      const quality = Math.max(minQuality, 0.95 - ratio * 0.85);
      const scale = Math.max(0.35, 1 - ratio * 0.6);
      const width = Math.max(1, Math.round(originalW * scale));
      const height = Math.max(1, Math.round(originalH * scale));

      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      const maybeQuality = outputType === "image/png" ? undefined : quality;
      const compressed = await canvasToBlob(canvas, outputType, maybeQuality);
      const delta = Math.abs(compressed.size - options.targetBytes);

      if (delta < bestSizeDelta || compressed.size <= options.targetBytes) {
        bestBlob = compressed;
        bestSizeDelta = delta;
      }

      if (compressed.size <= options.targetBytes) {
        return { blob: compressed, iterations: i + 1 };
      }
    }

    if (bestBlob.size > options.targetBytes) {
      warning = "Could not hit target exactly. Downloading closest result.";
    }
    return { blob: bestBlob, iterations: maxIterations, warning };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
