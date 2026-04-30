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
      <div className="w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Live Scanner</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Camera permission powered capture</h2>
          </div>
          <button onClick={closeCamera} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
            Close
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="bg-slate-950 p-4">
            <div className="mx-auto max-h-[72vh] max-w-[520px]">
              <div className="relative aspect-[595/842] overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-2xl">
                <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-emerald-300/90" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(16,185,129,0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(16,185,129,0.18)_1px,transparent_1px)] bg-[size:33.333%_25%]" />
              </div>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              {cameraError ? cameraError : "On mobile, this opens the rear camera when supported. On desktop, use your webcam to capture documents."}
            </div>
            <button
              onClick={() => void captureFrame()}
              disabled={!cameraReady}
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Capture Document
            </button>
            <button
              onClick={closeCamera}
              className="inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-3 font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              Finish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
