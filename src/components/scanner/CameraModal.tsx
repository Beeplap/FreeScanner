"use client";

type Props = {
  open: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraError: string | null;
  cameraReady: boolean;
  captureFrame: () => void | Promise<void>;
  closeCamera: () => void;
};

export default function CameraModal({ open, videoRef, cameraError, cameraReady, captureFrame, closeCamera }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Live Scanner</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Camera permission powered capture</h2>
          </div>
          <button onClick={closeCamera} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
            Close
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="bg-slate-950 p-4">
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-900">
              <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 m-8 rounded-[32px] border-2 border-dashed border-emerald-300/80" />
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div className="rounded-[24px] bg-slate-50 p-4 text-sm text-slate-600">
              {cameraError ? cameraError : "On mobile, this opens the rear camera when supported. On desktop, use your webcam to capture documents."}
            </div>
            <button
              onClick={() => void captureFrame()}
              disabled={!cameraReady}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Capture Document
            </button>
            <button
              onClick={closeCamera}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              Finish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
