export type InitSynthResult = {
  success: boolean;
  soundfontId?: number;
  sampleRate?: number;
  error?: string;
};

export type GetAssetPathResult = {
  success: boolean;
  path?: string;
  error?: string;
};

export type InitSynthOptions = {
  soundfontPath: string;
  sampleRate?: number;
  gain?: number;
};

export type PitchDetectedEvent = {
  hz: number;
  note: number;
  probability: number;
};

export interface ExpoFluidsynthModule {
  isInitialized(): boolean;
  getAssetPath(assetName: string): Promise<GetAssetPathResult>;
  initSynth(soundfontPath: string, sampleRate?: number, gain?: number): Promise<InitSynthResult>;
  playNote(channel: number, midiNote: number, velocity: number): boolean;
  stopNote(channel: number, midiNote: number): boolean;
  playNoteDelayed(channel: number, midiNote: number, velocity: number, delayMs: number): Promise<boolean>;
  playTab(stringNum: number, fret: number, velocity: number): boolean;
  stopTab(stringNum: number, fret: number): boolean;
  playSlide(stringNum: number, fromFret: number, toFret: number, durationMs: number): boolean;
  allNotesOff(): boolean;
  selectProgram(channel: number, bank: number, preset: number): Promise<boolean>;
  setGain(gain: number): boolean;
  startPitchDetection(): boolean;
  stopPitchDetection(): boolean;
  cleanup(): Promise<boolean>;
}
