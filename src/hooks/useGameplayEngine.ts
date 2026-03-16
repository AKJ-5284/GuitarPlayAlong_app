import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Platform } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { EventEmitter } from 'expo-modules-core';
import ExpoFluidsynth from '../../modules/expo-fluidsynth';
import { Song } from '../types/song';
import type { NoteEvent } from '../../modules/expo-fluidsynth';
import { Paths } from 'expo-file-system';

// SoundFont filename
const SOUNDFONT_FILENAME = 'guitar.sf2';

// FluidSynth initialization state (module-level to persist across hook instances)
let fluidsynthInitialized = false;
let fluidsynthInitializing = false;
let cachedSoundfontPath: string | null = null;

// Event emitter for native events
const eventEmitter = new EventEmitter(ExpoFluidsynth as any);

/**
 * Guitar standard tuning MIDI note numbers
 */
const STRING_BASE_NOTES = [64, 59, 55, 50, 45, 40]; // E4, B3, G3, D3, A2, E2
const GUITAR_TRANSPOSE_SEMITONES = 12;

interface UseGameplayEngineReturn {
  isPlaying: boolean;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  seekByMs: (deltaMs: number) => void;
  seekToMs: (positionMs: number) => void;
  playbackSpeed: number;
  currentTimeMs: ReturnType<typeof useSharedValue<number>>;
  currentBeat: ReturnType<typeof useSharedValue<number>>;
  songDurationMs: number;
  isReady: boolean;
  error: string | null;
}

/**
 * Convert string/fret to MIDI note number
 */
function stringFretToMidi(stringNumber: number, fret: number): number {
  if (stringNumber < 1 || stringNumber > 6) return 60; // Default to middle C
  return STRING_BASE_NOTES[stringNumber - 1] + fret + GUITAR_TRANSPOSE_SEMITONES;
}

/**
 * Get the SoundFont file path.
 */
async function getSoundfontPath(): Promise<string> {
  if (cachedSoundfontPath) {
    return cachedSoundfontPath;
  }

  console.log('[GameplayEngine] Getting SoundFont path via native module...');
  
  const result = await ExpoFluidsynth.getAssetPath(SOUNDFONT_FILENAME);
  
  if (!result.success || !result.path) {
    throw new Error(`Failed to get SoundFont path: ${result.error}`);
  }
  
  cachedSoundfontPath = result.path;
  console.log('[GameplayEngine] SoundFont path:', cachedSoundfontPath);
  return cachedSoundfontPath;
}

/**
 * Initialize FluidSynth with the guitar SoundFont.
 */
async function initFluidSynth(): Promise<void> {
  if (Platform.OS !== 'android') {
    console.warn('[GameplayEngine] FluidSynth is only available on Android');
    return;
  }

  if (fluidsynthInitialized) {
    console.log('[GameplayEngine] FluidSynth already initialized');
    return;
  }

  if (fluidsynthInitializing) {
    console.log('[GameplayEngine] FluidSynth initialization in progress, waiting...');
    while (fluidsynthInitializing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return;
  }

  fluidsynthInitializing = true;

  try {
    console.log('[GameplayEngine] Initializing FluidSynth...');
    
    const soundfontPath = await getSoundfontPath();
    
    const result = await ExpoFluidsynth.initSynth(
      soundfontPath,
      44100, // Sample rate
      1.4    // Gain (0.0 - 10.0)
    );
    
    if (result.success) {
      console.log('[GameplayEngine] FluidSynth initialized:', result);
      fluidsynthInitialized = true;
    } else {
      throw new Error(result.error || 'Unknown FluidSynth error');
    }
  } finally {
    fluidsynthInitializing = false;
  }
}

/**
 * Hook for managing gameplay audio engine with PRE-RENDERED audio.
 * 
 * The audio is rendered to a WAV file upfront, then played via MediaPlayer
 * with pitch-preserving tempo control. This eliminates all latency.
 * 
 * @param song The song to play
 * @returns Engine state and controls
 */
export function useGameplayEngine(song: Song): UseGameplayEngineReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeedState] = useState(100); // Percentage (25-125)
  
  // Shared value for Reanimated UI sync
  const currentTimeMs = useSharedValue(0);
  const currentBeat = useSharedValue(0);
  
  // Refs for playback state
  const isPlayingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const wavFilePathRef = useRef<string | null>(null);
  const playbackSpeedRef = useRef(100);
  const audioLoadedRef = useRef(false); // Track if WAV is loaded in MediaPlayer
  const pendingSeekPositionMsRef = useRef(0);
  
  // Keep speed ref in sync
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);
  
  // BPM calculations
  const msPerBeat = 60000 / song.bpm;
  const beatsPerMs = song.bpm / 60000;

  // Calculate total song duration in ms
  const songDurationMs = useMemo(() => {
    let maxBeat = 0;
    for (const track of song.tracks) {
      for (const note of track.notes) {
        const noteEnd = note.beat + note.len;
        if (noteEnd > maxBeat) {
          maxBeat = noteEnd;
        }
      }
    }
    // Add 2 seconds for note release tails
    return (maxBeat * msPerBeat) + 2000;
  }, [song, msPerBeat]);

  // Convert song to note events for rendering
  const noteEvents = useMemo((): NoteEvent[] => {
    const events: NoteEvent[] = [];
    
    for (const track of song.tracks) {
      const channel = track.string - 1; // channels 0-5 for strings 1-6
      
      for (const note of track.notes) {
        const midiNote = stringFretToMidi(track.string, note.fret);
        const timeMs = note.beat * msPerBeat;
        const durationMs = note.len * msPerBeat;
        
        // Adjust velocity for techniques
        let velocity = 100;
        if (note.linkNext === 'h') velocity = 80;
        else if (note.linkNext === 'p') velocity = 70;
        
        // NoteEvent format: [timeMs, channel, midiNote, velocity, durationMs]
        events.push([timeMs, channel, midiNote, velocity, durationMs]);
      }
    }
    
    console.log(`[GameplayEngine] Prepared ${events.length} note events for rendering`);
    // Log first 5 notes for debugging
    events.slice(0, 5).forEach((e, i) => {
      console.log(`[GameplayEngine] Note ${i}: time=${e[0]}ms, ch=${e[1]}, midi=${e[2]}, vel=${e[3]}, dur=${e[4]}ms`);
    });
    return events;
  }, [song, msPerBeat]);

  // Initialize FluidSynth and pre-render audio on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Initialize FluidSynth
        await initFluidSynth();
        
        if (!mounted) return;
        
        // Generate WAV file path
        const cacheDir = Paths.cache;
        const cachePath = (cacheDir.uri || String(cacheDir)).replace(/^file:\/\//, '');
        const wavPath = `${cachePath}/song_${song.id}_${Date.now()}.wav`;
        
        console.log(`[GameplayEngine] Pre-rendering ${noteEvents.length} notes to WAV...`);
        console.log(`[GameplayEngine] Song duration: ${songDurationMs}ms`);
        console.log(`[GameplayEngine] Output path: ${wavPath}`);
        
        // Pre-render the audio
        const renderResult = await ExpoFluidsynth.renderSongToWav(
          noteEvents,
          wavPath,
          songDurationMs
        );
        
        if (!renderResult.success) {
          throw new Error(renderResult.error || 'Failed to render audio');
        }
        
        console.log(`[GameplayEngine] Audio rendered: ${renderResult.sizeBytes} bytes`);
        wavFilePathRef.current = renderResult.path!;
        
        if (mounted) {
          setIsReady(true);
          setError(null);
        }
      } catch (e) {
        console.error('[GameplayEngine] Initialization error:', e);
        if (mounted) {
          setError(e instanceof Error ? e.message : 'Failed to initialize audio');
        }
      }
    };

    init();

    return () => {
      mounted = false;
      // TODO: Clean up WAV file on unmount
    };
  }, [song.id, noteEvents, songDurationMs]);

  useEffect(() => {
    const subscription = (eventEmitter as any).addListener(
      'onAudioPlaybackComplete',
      () => {
        console.log('[GameplayEngine] Audio playback completed');
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // Sync UI to audio position when playing
  useEffect(() => {
    isPlayingRef.current = isPlaying;

    if (isPlaying) {
      const updateBeat = () => {
        if (!isPlayingRef.current) return;

        // Get actual audio position from MediaPlayer
        const positionMs = ExpoFluidsynth.getAudioPosition();
        if (positionMs >= 0) {
          currentTimeMs.value = positionMs;
          // Convert position to beats (accounting for playback speed)
          currentBeat.value = positionMs * beatsPerMs;
        }

        animationFrameRef.current = requestAnimationFrame(updateBeat);
      };

      animationFrameRef.current = requestAnimationFrame(updateBeat);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, beatsPerMs, currentBeat, currentTimeMs]);

  const seekToMs = useCallback((positionMs: number) => {
    const clampedPositionMs = Math.max(0, Math.min(songDurationMs, positionMs));

    currentTimeMs.value = clampedPositionMs;
    currentBeat.value = clampedPositionMs * beatsPerMs;

    if (!audioLoadedRef.current) {
      pendingSeekPositionMsRef.current = clampedPositionMs;
      return;
    }

    const success = ExpoFluidsynth.seekAudio(clampedPositionMs);
    if (!success) {
      console.warn(`[GameplayEngine] Failed to seek audio to ${clampedPositionMs}ms`);
    }
  }, [beatsPerMs, currentBeat, currentTimeMs, songDurationMs]);

  const seekByMs = useCallback((deltaMs: number) => {
    const currentPositionMs = currentTimeMs.value;
    seekToMs(currentPositionMs + deltaMs);
  }, [currentTimeMs, seekToMs]);

  // Toggle playback
  const togglePlayback = useCallback(async () => {
    if (!isReady || !wavFilePathRef.current) {
      console.warn('[GameplayEngine] Not ready, cannot toggle playback');
      return;
    }

    const newIsPlaying = !isPlaying;
    
    if (newIsPlaying) {
      if (!audioLoadedRef.current) {
        // First time playing - load and start
        const speedMultiplier = playbackSpeed / 100;
        
        console.log(`[GameplayEngine] Loading and starting playback at speed ${speedMultiplier}`);
        console.log(`[GameplayEngine] WAV file: ${wavFilePathRef.current}`);
        
        const result = await ExpoFluidsynth.loadAndPlayAudio(
          wavFilePathRef.current,
          speedMultiplier
        );
        
        if (!result.success) {
          console.error('[GameplayEngine] Failed to start playback:', result.error);
          setError(result.error || 'Failed to start playback');
          return;
        }
        
        audioLoadedRef.current = true;
        console.log(`[GameplayEngine] Playback started, duration: ${result.duration}ms`);

        if (pendingSeekPositionMsRef.current > 0) {
          const seekSuccess = ExpoFluidsynth.seekAudio(pendingSeekPositionMsRef.current);
          if (!seekSuccess) {
            console.warn(`[GameplayEngine] Failed to apply pending seek to ${pendingSeekPositionMsRef.current}ms`);
          }
        }
      } else {
        // Already loaded - just resume
        console.log('[GameplayEngine] Resuming playback');
        ExpoFluidsynth.resumeAudio();
      }
    } else {
      // Pause playback (don't stop - keeps position)
      console.log('[GameplayEngine] Pausing playback');
      ExpoFluidsynth.pauseAudio();
    }

    setIsPlaying(newIsPlaying);
  }, [isPlaying, isReady, playbackSpeed]);

  // Set playback speed (affects MediaPlayer tempo)
  const setPlaybackSpeed = useCallback((speed: number) => {
    const clampedSpeed = Math.max(25, Math.min(125, speed));
    setPlaybackSpeedState(clampedSpeed);
    
    // Update native playback speed if playing
    if (isPlayingRef.current) {
      const multiplier = clampedSpeed / 100;
      ExpoFluidsynth.setPlaybackSpeed(multiplier);
      console.log(`[GameplayEngine] Playback speed changed to ${multiplier}`);
    }

    console.log('[GameplayEngine] Playback speed set to:', clampedSpeed);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ExpoFluidsynth.stopAudio();
      audioLoadedRef.current = false;
    };
  }, []);

  return {
    isPlaying,
    togglePlayback,
    setPlaybackSpeed,
    seekByMs,
    seekToMs,
    playbackSpeed,
    currentTimeMs,
    currentBeat,
    songDurationMs,
    isReady,
    error,
  };
}

/**
 * Play a single note immediately (for manual triggering).
 */
export function playNote(stringNumber: number, fret: number): void {
  if (Platform.OS !== 'android' || !fluidsynthInitialized) {
    return;
  }
  ExpoFluidsynth.playTab(stringNumber, fret, 100);
}

/**
 * Play a legato note (hammer-on or pull-off).
 */
export function playLegato(stringNumber: number, fret: number, technique: 'h' | 'p'): void {
  if (Platform.OS !== 'android' || !fluidsynthInitialized) {
    return;
  }
  const velocity = technique === 'h' ? 75 : 65;
  ExpoFluidsynth.playTab(stringNumber, fret, velocity);
}

/**
 * Play a slide from one fret to another.
 */
export function playSlide(stringNumber: number, fromFret: number, toFret: number): void {
  if (Platform.OS !== 'android' || !fluidsynthInitialized) {
    return;
  }
  ExpoFluidsynth.playSlide(stringNumber, fromFret, toFret, 120);
}
