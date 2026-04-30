export type OutputFormat = "image/jpeg" | "image/png" | "image/webp";

export type ConvertImageParams = {
  file: File;
  outputFormat: OutputFormat;
  quality: number;
};

export type ConvertImageResult = {
  blob: Blob;
  outputFormat: OutputFormat;
};

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, outputFormat: OutputFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    const q = outputFormat === "image/png" ? undefined : quality;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to convert image"));
          return;
        }
        resolve(blob);
      },
      outputFormat,
      q
    );
  });
}

export async function convertImage({ file, outputFormat, quality }: ConvertImageParams): Promise<ConvertImageResult> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, outputFormat, quality);
    return { blob, outputFormat };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
