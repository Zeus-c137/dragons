import coinSoundUrl from "@/src/assets/audio/coin.mp3";

let coinAudio: HTMLAudioElement | null = null;
let soundUnlock: Promise<void> | null = null;

function getCoinAudio() {
  if (!coinAudio) {
    coinAudio = new Audio(coinSoundUrl);
    coinAudio.preload = "auto";
    coinAudio.volume = 0.5;
    coinAudio.load();
  }
  return coinAudio;
}

if (typeof window !== "undefined") {
  getCoinAudio();
}

/** Unlock the audio element during the original tap so async claims can play it later. */
export function primeCheckinSound() {
  if (typeof window === "undefined" || soundUnlock) return;
  const audio = getCoinAudio();
  const wasMuted = audio.muted;
  audio.muted = true;
  const playback = audio.play();
  soundUnlock = Promise.resolve(playback).then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = wasMuted;
  }).catch(() => {
    audio.muted = wasMuted;
  }).finally(() => {
    soundUnlock = null;
  });
}

/** Play the reward sound after a claim succeeds. */
export function playCheckinSound() {
  if (typeof window === "undefined") return;
  const audio = getCoinAudio();
  const play = () => {
    audio.muted = false;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Audio feedback must never affect a successful claim.
    });
  };
  if (soundUnlock) {
    void soundUnlock.then(play);
    return;
  }
  play();
}
