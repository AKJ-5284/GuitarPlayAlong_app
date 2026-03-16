import { registerWebModule, NativeModule } from 'expo';

import { InitSynthResult, GetAssetPathResult, ExpoFluidsynthModule, AudioPlaybackResult, MidiPlaybackResult, RenderSongResult, NoteEvent } from './expo-fluidsynth.types';

// Web stub - FluidSynth is only available on Android
class ExpoFluidsynthModuleWeb extends NativeModule<{}> implements ExpoFluidsynthModule {
  isInitialized(): boolean {
    console.warn('expo-fluidsynth: FluidSynth is not available on web');
    return false;
  }

  async getAssetPath(_assetName: string): Promise<GetAssetPathResult> {
    console.warn('expo-fluidsynth: FluidSynth is not available on web');
    return { success: false, error: 'FluidSynth is not available on web' };
  }

  async initSynth(_soundfontPath: string, _sampleRate?: number, _gain?: number): Promise<InitSynthResult> {
    console.warn('expo-fluidsynth: FluidSynth is not available on web');
    return { success: false, error: 'FluidSynth is not available on web' };
  }

  playNote(_channel: number, _midiNote: number, _velocity: number): boolean {
    return false;
  }

  stopNote(_channel: number, _midiNote: number): boolean {
    return false;
  }

  async playNoteDelayed(_channel: number, _midiNote: number, _velocity: number, _delayMs: number): Promise<boolean> {
    return false;
  }

  playTab(_stringNum: number, _fret: number, _velocity: number): boolean {
    return false;
  }

  stopTab(_stringNum: number, _fret: number): boolean {
    return false;
  }

  playSlide(_stringNum: number, _fromFret: number, _toFret: number, _durationMs: number): boolean {
    return false;
  }

  allNotesOff(): boolean {
    return false;
  }

  async selectProgram(_channel: number, _bank: number, _preset: number): Promise<boolean> {
    return false;
  }

  setGain(_gain: number): boolean {
    return false;
  }

  async cleanup(): Promise<boolean> {
    return true;
  }

  // Native Audio Player with Time-Stretching
  async loadAndPlayAudio(_filePath: string, _initialSpeed: number): Promise<AudioPlaybackResult> {
    console.warn('expo-fluidsynth: Audio playback is not available on web');
    return { success: false, error: 'Not available on web' };
  }

  setPlaybackSpeed(_speed: number): boolean {
    return false;
  }

  pauseAudio(): boolean {
    return false;
  }

  resumeAudio(): boolean {
    return false;
  }

  stopAudio(): boolean {
    return false;
  }

  seekAudio(_positionMs: number): boolean {
    return false;
  }

  getAudioPosition(): number {
    return -1;
  }

  getPlaybackSpeed(): number {
    return 1.0;
  }

  // FluidSynth MIDI Player (Native Sequencer)
  async playMidiFile(_filePath: string, _tempoMultiplier: number): Promise<MidiPlaybackResult> {
    console.warn('expo-fluidsynth: MIDI playback is not available on web');
    return { success: false, error: 'Not available on web' };
  }

  setMidiTempo(_tempoMultiplier: number): boolean {
    return false;
  }

  stopMidiPlayback(): boolean {
    return false;
  }

  seekMidi(_ticks: number): boolean {
    return false;
  }

  isMidiPlaying(): boolean {
    return false;
  }
  
  // Pre-render song to WAV file
  async renderSongToWav(_notes: NoteEvent[], _outputPath: string, _durationMs: number): Promise<RenderSongResult> {
    console.warn('expo-fluidsynth: renderSongToWav is not available on web');
    return { success: false, error: 'Not available on web' };
  }
}

export default registerWebModule(ExpoFluidsynthModuleWeb, 'expo-fluidsynth');
