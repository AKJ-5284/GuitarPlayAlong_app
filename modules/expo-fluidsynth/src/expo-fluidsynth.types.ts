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

export type AudioPlaybackResult = {
  success: boolean;
  duration?: number;
  speed?: number;
  error?: string;
};

export type MidiPlaybackResult = {
  success: boolean;
  tempoMultiplier?: number;
  error?: string;
};

export type AudioPlaybackCompleteEvent = {
  filePath: string;
};

export type AudioPlaybackErrorEvent = {
  error: string;
  code: number;
};

export type MidiPlaybackCompleteEvent = {
  filePath: string;
};

export type RenderSongResult = {
  success: boolean;
  path?: string;
  durationMs?: number;
  sizeBytes?: number;
  error?: string;
};

// Note format for renderSongToWav: [timeMs, channel, midiNote, velocity, durationMs]
export type NoteEvent = [number, number, number, number, number];

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
  cleanup(): Promise<boolean>;
  
  // Native Audio Player with Time-Stretching
  loadAndPlayAudio(filePath: string, initialSpeed: number): Promise<AudioPlaybackResult>;
  setPlaybackSpeed(speed: number): boolean;
  pauseAudio(): boolean;
  resumeAudio(): boolean;
  stopAudio(): boolean;
  seekAudio(positionMs: number): boolean;
  getAudioPosition(): number;
  getPlaybackSpeed(): number;
  
  // FluidSynth MIDI Player (Native Sequencer)
  playMidiFile(filePath: string, tempoMultiplier: number): Promise<MidiPlaybackResult>;
  setMidiTempo(tempoMultiplier: number): boolean;
  stopMidiPlayback(): boolean;
  seekMidi(ticks: number): boolean;
  isMidiPlaying(): boolean;
  
  // Pre-render song to WAV file
  renderSongToWav(notes: NoteEvent[], outputPath: string, durationMs: number): Promise<RenderSongResult>;
}
