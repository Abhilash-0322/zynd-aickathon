"use client";

import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";

const particleOptions: ISourceOptions = {
  fullScreen: false,
  fpsLimit: 60,
  background: { color: { value: "transparent" } },
  particles: {
    number: {
      value: 42,
      density: { enable: true, width: 1600, height: 900 },
    },
    color: {
      value: ["#0ea5e9", "#22d3ee", "#34d399"],
    },
    shape: { type: "circle" },
    opacity: {
      value: { min: 0.07, max: 0.22 },
      animation: { enable: true, speed: 0.35, startValue: "random", sync: false },
    },
    size: {
      value: { min: 1, max: 2.6 },
      animation: { enable: true, speed: 0.8, startValue: "random", sync: false },
    },
    links: {
      enable: true,
      distance: 150,
      color: "#0ea5e9",
      opacity: 0.06,
      width: 1,
    },
    move: {
      enable: true,
      speed: 0.45,
      direction: "none",
      random: true,
      straight: false,
      outModes: { default: "out" },
    },
  },
  interactivity: {
    events: {
      onHover: { enable: true, mode: "repulse" },
      resize: { enable: true },
    },
    modes: {
      repulse: { distance: 85, duration: 0.25, speed: 0.35 },
    },
  },
  detectRetina: true,
};

export default function ParticleBackground() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <Particles
      id="zynd-particles"
      className="pointer-events-none fixed inset-0 z-0 opacity-80"
      style={{ position: "fixed", inset: 0, zIndex: 0 }}
      options={particleOptions}
    />
  );
}
