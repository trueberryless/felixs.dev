// A generative space lullaby, synthesized live with the Web Audio API: soft
// pad chords, a sine bass and sparse music-box notes in a long reverb. Nothing
// to download and nothing to license, and it never loops exactly.

const VOLUME = 0.16;
const FADE_IN_S = 4;
const FADE_OUT_S = 1.2;
const CHORD_S = 8;
const LOOKAHEAD_S = 1.5;
const SCHEDULE_EVERY_MS = 300;

// MIDI notes: bass, then the voicing. Fmaj9, G6/9, Em9, Am9.
const PROGRESSION = [
  { bass: 41, voicing: [57, 60, 64, 67] },
  { bass: 43, voicing: [59, 62, 64, 69] },
  { bass: 40, voicing: [55, 59, 62, 66] },
  { bass: 45, voicing: [60, 64, 67, 71] },
] as const;
const NOTE_GAPS_S = [0.45, 0.6, 0.9, 1.2, 1.8] as const;
const GESTURES = ["pointerdown", "keydown", "touchend"] as const;

export function createSpaceMusic(): SpaceMusic {
  let context: AudioContext | undefined;
  let master: GainNode | undefined;
  let padBus: AudioNode | undefined;
  let bellBus: AudioNode | undefined;
  let scheduler = 0;
  let nextChordAt = 0;
  let nextNoteAt = 0;
  let chordIndex = 0;
  let isPlaying = false;

  function setUp() {
    const ctx = new AudioContext();
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = createImpulse(ctx, 4.5);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    reverb.connect(wet).connect(out);

    // The pad breathes: a slow LFO opens and closes its low-pass filter.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 1000;
    padFilter.Q.value = 0.4;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.045;
    lfoDepth.gain.value = 450;
    lfo.connect(lfoDepth).connect(padFilter.frequency);
    lfo.start();
    padFilter.connect(out);
    padFilter.connect(reverb);

    const bells = ctx.createGain();
    bells.gain.value = 0.55;
    bells.connect(out);
    bells.connect(reverb);

    context = ctx;
    master = out;
    padBus = padFilter;
    bellBus = bells;
  }

  function play() {
    if (isPlaying) return;
    isPlaying = true;
    if (!context) setUp();
    const ctx = context!;
    void ctx.resume();
    // Browsers only start audio after an interaction; until then, wait for one.
    if (ctx.state !== "running") waitForGesture();

    const now = ctx.currentTime;
    master!.gain.cancelScheduledValues(now);
    master!.gain.setValueAtTime(master!.gain.value, now);
    master!.gain.linearRampToValueAtTime(VOLUME, now + FADE_IN_S);
    nextChordAt = Math.max(nextChordAt, now + 0.05);
    nextNoteAt = Math.max(nextNoteAt, now + 2);
    schedule();
    scheduler = window.setInterval(schedule, SCHEDULE_EVERY_MS);
  }

  function pause() {
    if (!isPlaying || !context) return;
    isPlaying = false;
    window.clearInterval(scheduler);
    const now = context.currentTime;
    master!.gain.cancelScheduledValues(now);
    master!.gain.setValueAtTime(master!.gain.value, now);
    master!.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
    const ctx = context;
    window.setTimeout(() => {
      if (!isPlaying) void ctx.suspend();
    }, FADE_OUT_S * 1000);
  }

  function destroy() {
    pause();
    const ctx = context;
    context = undefined;
    window.setTimeout(() => void ctx?.close(), FADE_OUT_S * 1000 + 100);
  }

  function waitForGesture() {
    const resume = () => {
      if (isPlaying) void context?.resume();
      for (const type of GESTURES) window.removeEventListener(type, resume);
    };
    for (const type of GESTURES) {
      window.addEventListener(type, resume, { passive: true });
    }
  }

  function schedule() {
    const ctx = context;
    if (!ctx || !isPlaying) return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;

    while (nextChordAt < horizon) {
      const chord = PROGRESSION[chordIndex % PROGRESSION.length]!;
      playChord(ctx, chord, nextChordAt);
      chordIndex++;
      nextChordAt += CHORD_S;
    }

    while (nextNoteAt < horizon) {
      const chord =
        PROGRESSION[
          (chordIndex - 1 + PROGRESSION.length) % PROGRESSION.length
        ]!;
      if (Math.random() < 0.72) {
        const note = pick(chord.voicing) + 12 * (Math.random() < 0.35 ? 2 : 1);
        playBell(ctx, note, nextNoteAt);
      }
      nextNoteAt += pick(NOTE_GAPS_S);
    }
  }

  function playChord(ctx: AudioContext, chord: Chord, at: number) {
    // Each chord fades in slowly and overlaps the next one, like a pad.
    const length = CHORD_S + 3;
    for (const note of chord.voicing) {
      for (const [type, detune] of [
        ["triangle", -6],
        ["sine", 7],
      ] as const) {
        playTone(ctx, padBus!, {
          at,
          attack: 2.8,
          detune,
          frequency: toFrequency(note),
          length,
          peak: 0.035,
          type,
        });
      }
    }
    playTone(ctx, padBus!, {
      at,
      attack: 1.5,
      detune: 0,
      frequency: toFrequency(chord.bass),
      length,
      peak: 0.09,
      type: "sine",
    });
  }

  function playBell(ctx: AudioContext, note: number, at: number) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.random() * 1.2 - 0.6;
    panner.connect(bellBus!);
    const frequency = toFrequency(note);
    // A music box: a bright strike that rings out, with a faint overtone.
    for (const [ratio, peak] of [
      [1, 0.06],
      [3, 0.012],
    ] as const) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency * ratio;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
      oscillator.connect(gain).connect(panner);
      oscillator.start(at);
      oscillator.stop(at + 2.5);
      oscillator.addEventListener("ended", () => panner.disconnect(), {
        once: true,
      });
    }
  }

  return { destroy, pause, play };
}

function playTone(
  ctx: AudioContext,
  destination: AudioNode,
  { at, attack, detune, frequency, length, peak, type }: ToneOptions
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detune;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.setValueAtTime(peak, at + length - 3);
  gain.gain.linearRampToValueAtTime(0, at + length);
  oscillator.connect(gain).connect(destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.05);
}

// Decaying stereo noise makes a convincing hall without any sample file.
function createImpulse(ctx: AudioContext, seconds: number) {
  const length = Math.round(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index++) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3;
    }
  }
  return impulse;
}

function toFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}

export interface SpaceMusic {
  destroy: () => void;
  pause: () => void;
  play: () => void;
}

interface Chord {
  bass: number;
  voicing: readonly number[];
}

interface ToneOptions {
  at: number;
  attack: number;
  detune: number;
  frequency: number;
  length: number;
  peak: number;
  type: OscillatorType;
}
