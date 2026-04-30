"use client";

type Props = {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  label: string;
};

function formatKb(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(2)} MB`;
  return `${value} KB`;
}

export default function Slider({ min, max, value, onChange, label }: Props) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-800">{label}</span>
        <span className="text-slate-500">{formatKb(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-emerald-600"
      />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>{formatKb(min)}</span>
        <span>{formatKb(max)}</span>
      </div>
    </label>
  );
}
