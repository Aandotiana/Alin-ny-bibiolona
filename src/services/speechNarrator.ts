// Text-To-Speech Narrator for Mpitantara using Web Speech API

class SpeechNarrator {
  private synth: SpeechSynthesis | null = null;
  public enabled: boolean = true;
  public isSpeaking: boolean = false;
  private selectedVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    // Prefer French or Malagasy / expressive deep storyteller voices
    this.selectedVoice =
      voices.find((v) => v.lang.startsWith('fr') && (v.name.includes('Thomas') || v.name.includes('Henri') || v.name.includes('Natural') || v.name.includes('Google'))) ||
      voices.find((v) => v.lang.startsWith('fr')) ||
      voices[0] ||
      null;
  }

  speak(text: string, onEnd?: () => void) {
    if (!this.enabled || !this.synth) {
      if (onEnd) onEnd();
      return;
    }

    try {
      this.stop();
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.rate = 0.95; // Slightly slower, solemn storyteller cadence
      utterance.pitch = 0.9; // Deeper tone for mystical atmosphere
      utterance.lang = 'fr-FR';

      utterance.onstart = () => {
        this.isSpeaking = true;
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        if (onEnd) onEnd();
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        if (onEnd) onEnd();
      };

      this.synth.speak(utterance);
    } catch {
      this.isSpeaking = false;
      if (onEnd) onEnd();
    }
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
  }
}

export const speechNarrator = new SpeechNarrator();
