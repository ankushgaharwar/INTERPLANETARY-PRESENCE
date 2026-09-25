import type { Participant } from "../simulation/types";

const activeUtterances = new Set<SpeechSynthesisUtterance>();

const getSynthesis = () =>
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;

export const prepareSpeechSynthesis = () => {
  const synthesis = getSynthesis();
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return false;
  }

  synthesis.resume();
  synthesis.getVoices();
  const unlock = new SpeechSynthesisUtterance(" ");
  unlock.volume = 0;
  synthesis.speak(unlock);
  return true;
};

export const speakPresenceMessage = (
  text: string,
  sender: Participant
) => {
  const synthesis = getSynthesis();
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = synthesis.getVoices();
  utterance.voice =
    voices.find((voice) => voice.lang === "en-US" && voice.localService) ??
    voices.find((voice) => voice.lang.startsWith("en")) ??
    null;
  utterance.lang = utterance.voice?.lang ?? "en-US";
  utterance.pitch = sender === "daughter" ? 1.08 : 0.9;
  utterance.rate = 0.95;
  utterance.volume = 1;

  const release = () => activeUtterances.delete(utterance);
  utterance.onend = release;
  utterance.onerror = release;
  activeUtterances.add(utterance);

  synthesis.resume();
  synthesis.speak(utterance);
  window.setTimeout(() => synthesis.resume(), 80);
  return true;
};

export const stopSpeechSynthesis = () => {
  getSynthesis()?.cancel();
  activeUtterances.clear();
};
