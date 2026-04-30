declare module "pdfjs-dist/legacy/build/pdf" {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(src: unknown): {
    promise: Promise<{
      numPages: number;
      destroy?: () => Promise<void>;
      getPage: (pageNumber: number) => Promise<{
        getViewport: (options: { scale: number }) => { width: number; height: number };
        render: (options: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
    }>;
  };
}
