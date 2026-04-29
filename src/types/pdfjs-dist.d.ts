declare module "pdfjs-dist/legacy/build/pdf" {
  export function getDocument(src: unknown): {
    promise: Promise<{
      numPages: number;
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
