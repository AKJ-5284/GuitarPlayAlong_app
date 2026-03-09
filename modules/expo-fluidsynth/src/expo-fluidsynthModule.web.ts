import { registerWebModule, NativeModule } from 'expo';

import { InitSynthResult, GetAssetPathResult, ExpoFluidsynthModule } from './expo-fluidsynth.types';

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
}

export default registerWebModule(ExpoFluidsynthModuleWeb, 'expo-fluidsynth');
