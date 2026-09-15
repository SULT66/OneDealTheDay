/*
 * Background music for the Live stage, made in the browser.
 *
 * Nothing is downloaded: a licensed track would need a licence per broadcast,
 * and a file from a free site is a claim waiting to happen. So it is a soft
 * chord loop synthesised with Web Audio — warm pad, a slow pluck, a low root —
 * quiet under Chloe's voice and rising in the pauses while the product has the
 * stage.
 *
 * It needs an AudioContext, which a browser only lets start after a click; the
 * "Watch Chloe live" button is that click.
 */

const CHORDS = [
  [53, 57, 60, 64], // Fmaj7
  [52, 55, 59, 62], // Em7
  [50, 53, 57, 60], // Dm7
  [48, 52, 55, 59], // Cmaj7
];
const BEAT = 60 / 78;
const BAR = BEAT * 4;
const freq = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/* Loudness of the whole mix: under her voice, and in the pauses. */
export const MUSIC_UNDER_VOICE = 0.05;
export const MUSIC_IN_PAUSE = 0.32;

export type StageMusic = {
  context: AudioContext;
  setTalking: (talking: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  stop: () => void;
};

export function startStageMusic(context: AudioContext): StageMusic {
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);

  const tone = context.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 1800;
  tone.connect(master);

  /* A short echo on the pluck, which is most of what makes it sound like music
     rather than a test signal. */
  const echo = context.createDelay(1);
  echo.delayTime.value = BEAT * 0.75;
  const feedback = context.createGain();
  feedback.gain.value = 0.32;
  echo.connect(feedback).connect(echo);
  echo.connect(tone);

  let talking = false;
  let enabled = true;
  const applyLevel = () => {
    const target = enabled ? (talking ? MUSIC_UNDER_VOICE : MUSIC_IN_PAUSE) : 0;
    master.gain.setTargetAtTime(target, context.currentTime, talking ? 0.25 : 0.8);
  };

  const voice = (type: OscillatorType, note: number, start: number, length: number, level: number, attack: number, to: AudioNode) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = freq(note);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + attack);
    gain.gain.setTargetAtTime(0, start + Math.max(attack, length - 0.6), 0.35);
    osc.connect(gain).connect(to);
    osc.start(start);
    osc.stop(start + length + 2);
  };

  let bar = 0;
  let nextBarAt = context.currentTime + 0.1;
  const schedule = () => {
    while (nextBarAt < context.currentTime + 1.5) {
      const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
      if (bar % 2 === 0) {
        for (const note of chord) voice("triangle", note, nextBarAt, BAR * 2, 0.045, 1.2, tone);
        voice("sine", chord[0] - 12, nextBarAt, BAR * 2, 0.12, 0.3, tone);
      }
      for (let step = 0; step < 8; step += 1) {
        if (step % 2 === 1 && Math.random() < 0.5) continue;
        const note = chord[Math.floor(Math.random() * chord.length)] + 12;
        const at = nextBarAt + step * (BEAT / 2);
        voice("sine", note, at, 0.7, 0.05, 0.01, tone);
        voice("sine", note, at, 0.7, 0.02, 0.01, echo);
      }
      bar += 1;
      nextBarAt += BAR;
    }
  };
  schedule();
  const timer = setInterval(schedule, 400);
  applyLevel();

  return {
    context,
    setTalking(next) {
      if (next === talking) return;
      talking = next;
      applyLevel();
    },
    setEnabled(next) {
      enabled = next;
      applyLevel();
    },
    stop() {
      clearInterval(timer);
      master.gain.setTargetAtTime(0, context.currentTime, 0.2);
      setTimeout(() => master.disconnect(), 800);
    },
  };
}
