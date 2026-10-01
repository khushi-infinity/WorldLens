"use client";
import { useState } from "react";
import { useWorld } from "@/store/useWorldStore";

const EXAMPLES = [
  "Artificial Intelligence in India",
  "Semiconductor ecosystem in India",
  "Electric Vehicle ecosystem in India",
];

export default function Landing({ onExplore }: { onExplore: (topic: string, mode: "LIVE" | "CACHED") => void }) {
  const [value, setValue] = useState("");
  const { demoTopics } = useWorld();
  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[480px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        <div className="absolute left-1/2 top-2/3 h-[320px] w-[520px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-[120px]" />
      </div>
      <p className="relative mb-4 text-[11px] font-semibold uppercase tracking-[0.4em] text-cyan-300/80">WorldLens</p>
      <h1 className="relative max-w-3xl text-5xl font-bold leading-tight text-white sm:text-6xl">
        Don&apos;t search the web.<br />
        <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent">Step inside it.</span>
      </h1>
      <p className="relative mt-4 max-w-xl text-sm text-slate-400">
        Live search evidence transformed into an interactive 3D knowledge world. Companies, labs,
        researchers, technologies and the evidence behind every relationship.
      </p>
      <form
        className="relative mt-8 flex w-full max-w-xl items-center gap-2 rounded-full border border-white/10 bg-white/5 p-2 pl-5 backdrop-blur"
        onSubmit={(e) => { e.preventDefault(); if (value.trim()) onExplore(value.trim(), "LIVE"); }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Explore anything..."
          className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        <button type="submit" className="shrink-0 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
          Explore
        </button>
      </form>
      <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
        {EXAMPLES.map(t => (
          <button key={t} onClick={() => onExplore(t, "LIVE")}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-300 hover:border-cyan-300/40 hover:text-white">
            {t}
          </button>
        ))}
      </div>
      <button onClick={() => onExplore(demoTopics[0] ?? EXAMPLES[0], "CACHED")}
        className="relative mt-6 text-xs text-slate-500 underline decoration-dotted underline-offset-4 hover:text-cyan-300">
        No network? Enter Demo Mode (cached real captures, zero fabrication) →
      </button>
      <p className="relative mt-2 text-[11px] text-slate-600">Flagship demo: {demoTopics[0]}</p>
    </div>
  );
}
