interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export class AeonSpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private continuousMode: boolean = true;
  private interimResults: boolean = true;
  private maxAlternatives: number = 1;
  private onResultCallback: (transcript: string, isFinal: boolean) => void;
  private onErrorCallback: (error: string) => void;

  constructor(
    onResult: (transcript: string, isFinal: boolean) => void,
    onError: (error: string) => void
  ) {
    this.onResultCallback = onResult;
    this.onErrorCallback = onError;
    this.initialize();
  }

  private initialize() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.onErrorCallback('Speech recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = this.continuousMode;
    this.recognition.interimResults = this.interimResults;
    this.recognition.maxAlternatives = this.maxAlternatives;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0])
        .map((result) => result.transcript)
        .join('');
      
      const isFinal = event.results[event.resultIndex].isFinal;
      this.onResultCallback(transcript, isFinal);
    };

    this.recognition.onerror = (event: Event) => {
      this.onErrorCallback(`Recognition error: ${(event as any).error}`);
    };
  }

  start() {
    if (this.recognition) {
      this.recognition.start();
    }
  }

  stop() {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  setLanguage(lang: string) {
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }
}