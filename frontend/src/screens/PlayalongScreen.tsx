import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Pressable, GestureResponderEvent } from 'react-native';
import Animated, { 
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  SharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Song, Note, SongData, GuitarEvent } from '../types/song';
import { RootStackParamList } from '../../App';
import { useGameplayEngine } from '../hooks/useGameplayEngine';

type PlayalongRouteProp = RouteProp<RootStackParamList, 'Playalong'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Playback constants
const PIXELS_PER_BEAT = 80; // Reduced to show more notes
const HIT_LINE_X = 100;
const TOP_BAR_HEIGHT = 50;
const STRING_SPACING = 35; // Reduced for landscape mode
const NOTE_HEIGHT = 28; // Height of the note bar
const NOTE_BORDER_RADIUS = 6; // Rounded corners
const TECHNIQUE_BRIDGE_WIDTH = 24; // Width of the technique indicator between notes

// Ball animation constants
const MAX_BOUNCE_Y = 30;
const MIN_BOUNCE_V = 10;
const NOTE_TOP_OFFSET = 20;
const BOUNCE_MAP_FPS = 60;
const BOUNCE_FRAME_DURATION_MS = 1000 / BOUNCE_MAP_FPS;
const SEEK_STEP_MS = 5000;
const DOUBLE_TAP_WINDOW_MS = 280;
const SEEK_INDICATOR_VISIBLE_MS = 700;

// Calculate STRING_AREA_TOP dynamically to center strings vertically
const TOTAL_STRINGS_HEIGHT = 5 * STRING_SPACING; // 5 gaps between 6 strings
const STRING_AREA_TOP = TOP_BAR_HEIGHT + ((SCREEN_HEIGHT - TOP_BAR_HEIGHT - TOTAL_STRINGS_HEIGHT) / 2);

// String colors
const STRING_COLORS = [
  '#e94560', // E (high) - string 1
  '#f39c12', // B - string 2
  '#3498db', // G - string 3
  '#2ecc71', // D - string 4
  '#9b59b6', // A - string 5
  '#e74c3c', // E (low) - string 6
];

interface NoteRenderData {
  note: Note;
  stringNumber: number;
  y: number;
  baseBeat: number;
}

interface VisualNote {
  beat: number;
  len: number;
  fret: number;
  string: number;
  stringY: number;
  stringNumber: number;
  linkNext?: 'h' | 'p' | '/';
}

// Linked note chain for rendering hammer-ons, pull-offs, slides as single bar
interface LinkedNoteChain {
  notes: VisualNote[];           // All notes in the chain
  techniques: ('h' | 'p' | '/')[];  // Techniques between notes
  stringNumber: number;
  y: number;
  startBeat: number;       // First note's beat
  totalDuration: number;   // Combined duration from first note start to last note end
}

// Animated Bar Line Component
const AnimatedBarLine = ({ 
  barNumber, 
  beatsPerBar,
  currentBeat,
  stringAreaTop,
  totalStringsHeight,
}: { 
  barNumber: number;
  beatsPerBar: number;
  currentBeat: SharedValue<number>;
  stringAreaTop: number;
  totalStringsHeight: number;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    // barLineX = (barNumber * beatsPerBar * PixelsPerBeat) - (currentBeat * PixelsPerBeat)
    const barBeat = barNumber * beatsPerBar;
    const x = HIT_LINE_X + ((barBeat - currentBeat.value) * PIXELS_PER_BEAT);
    
    // Hide if off screen
    const isVisible = x > -10 && x < SCREEN_WIDTH + 10;
    
    return {
      position: 'absolute' as const,
      left: x,
      top: stringAreaTop - 30,
      height: totalStringsHeight + 60,
      width: 2,
      backgroundColor: '#ffffff',
      opacity: isVisible ? 0.4 : 0,
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <View style={styles.barLineLabel}>
        <Text style={styles.barLineLabelText}>{barNumber + 1}</Text>
      </View>
    </Animated.View>
  );
};

// Animated Note Component - renders linked notes with bridges between them
const AnimatedNote = ({ 
  chainData, 
  currentBeat 
}: { 
  chainData: LinkedNoteChain; 
  currentBeat: SharedValue<number>;
}) => {
  // Calculate total width needed for the chain
  const totalWidth = Math.max(chainData.totalDuration * PIXELS_PER_BEAT, 30);
  
  const animatedStyle = useAnimatedStyle(() => {
    const beatDiff = chainData.startBeat - currentBeat.value;
    const x = HIT_LINE_X + (beatDiff * PIXELS_PER_BEAT);
    
    // Hide if off screen (account for total width)
    const isVisible = x > -totalWidth && x < SCREEN_WIDTH + 100;
    
    return {
      position: 'absolute' as const,
      left: x,
      top: chainData.y - (NOTE_HEIGHT / 2),
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      height: NOTE_HEIGHT,
      opacity: isVisible ? 1 : 0,
    };
  });

  const stringColor = STRING_COLORS[chainData.stringNumber - 1];

  return (
    <Animated.View style={animatedStyle}>
      {chainData.notes.map((note, index) => {
        // Calculate this note's width based on its duration
        const noteWidth = Math.max(note.len * PIXELS_PER_BEAT, 30);
        const technique = index > 0 ? chainData.techniques[index - 1] : null;
        
        // Calculate gap to next note (if there's a technique bridge)
        // Gap is the time between this note's end and the next note's start
        const nextNote = chainData.notes[index + 1];
        const hasNextLink = index < chainData.techniques.length;
        
        // Calculate offset: position relative to chain start
        const noteOffset = (note.beat - chainData.startBeat) * PIXELS_PER_BEAT;
        
        return (
          <React.Fragment key={`note-${index}`}>
            {/* Technique bridge before this note (if not first note) */}
            {technique && (
              <View style={[styles.techniqueBridge, { backgroundColor: stringColor }]}>
                <Text style={styles.techniqueText}>{technique}</Text>
              </View>
            )}
            {/* The note box */}
            <View style={[styles.noteBar, { backgroundColor: stringColor, width: noteWidth - (hasNextLink ? TECHNIQUE_BRIDGE_WIDTH / 2 : 0) }]}>
              <Text style={styles.fretText}>{note.fret}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </Animated.View>
  );
};

export default function PlayalongScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PlayalongRouteProp>();
  const { song } = route.params;

  const isSongData = (value: Song | SongData): value is SongData => {
    return 'metadata' in value && 'timing' in value;
  };

  const songTitle = isSongData(song) ? song.metadata.title : song.name;
  const songBpm = isSongData(song) ? song.metadata.bpm : song.bpm;
  const beatsPerBar = isSongData(song) ? song.metadata.beatsPerBar : song.beatsPerBar || 4;
  const beatsPerMs = songBpm / 60000;

  const engineSong = useMemo((): Song => {
    if (!isSongData(song)) {
      return song;
    }

    const allEvents: GuitarEvent[] = [
      ...song.tracks.lead,
      ...(song.tracks.rhythm || []),
      ...(song.tracks.bass || []),
    ];

    const tracks = Array.from({ length: 6 }, (_, idx) => ({
      string: idx + 1,
      notes: [] as Note[],
    }));

    for (const event of allEvents) {
      const stringNumber = Math.max(1, Math.min(6, event.s + 1));
      const mappedLink = event.acc === 's' ? '/' : event.acc;
      tracks[stringNumber - 1].notes.push({
        beat: event.t * beatsPerMs,
        fret: event.f,
        len: Math.max(event.d * beatsPerMs, 0.05),
        string: stringNumber,
        linkNext: mappedLink === 'h' || mappedLink === 'p' || mappedLink === '/' ? mappedLink : undefined,
      });
    }

    for (const track of tracks) {
      track.notes.sort((a, b) => a.beat - b.beat);
    }

    return {
      id: song.metadata.id,
      name: song.metadata.title,
      bpm: song.metadata.bpm,
      beatsPerBar: song.metadata.beatsPerBar || 4,
      lastModified: Date.now(),
      tracks,
    };
  }, [song, beatsPerMs]);
  
  // Use the gameplay engine hook for audio management
  const {
    isPlaying,
    togglePlayback,
    setPlaybackSpeed: setEnginePlaybackSpeed,
    seekByMs,
    playbackSpeed,
    currentTimeMs,
    currentBeat,
    songDurationMs,
    isReady,
    error: engineError,
  } = useGameplayEngine(engineSong);
  
  const [hasEnded, setHasEnded] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<{ side: 'left' | 'right'; label: string } | null>(null);
  const topBarOffset = useSharedValue(0); // For sliding top bar animation
  const songEndedRef = useRef(false);
  const seekFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ side: 'left' | 'right' | null; ts: number }>({ side: null, ts: 0 });

  // BPM to beats conversion: beats = time(ms) * (BPM / 60000)

  const visualNotes = useMemo((): VisualNote[] => {
    if (isSongData(song)) {
      const allEvents: GuitarEvent[] = [
        ...song.tracks.lead,
        ...(song.tracks.rhythm || []),
        ...(song.tracks.bass || []),
      ];

      return allEvents
        .map((event) => {
          const stringNumber = Math.max(1, Math.min(6, event.s + 1));
          const mappedLink = event.acc === 's' ? '/' : event.acc;
          const linkNext: VisualNote['linkNext'] =
            mappedLink === 'h' || mappedLink === 'p' || mappedLink === '/'
              ? mappedLink
              : undefined;
          return {
            beat: event.t * beatsPerMs,
            len: Math.max(event.d * beatsPerMs, 0.05),
            fret: event.f,
            string: stringNumber,
            stringY: getStringY(stringNumber),
            stringNumber,
            linkNext,
          };
        })
        .sort((a, b) => a.beat - b.beat);
    }

    const notes: VisualNote[] = [];
    for (const track of song.tracks) {
      const trackStringY = getStringY(track.string);
      for (const note of track.notes) {
        notes.push({
          beat: note.beat,
          len: note.len,
          fret: note.fret,
          string: track.string,
          stringY: trackStringY,
          stringNumber: track.string,
          linkNext: note.linkNext,
        });
      }
    }
    return notes.sort((a, b) => a.beat - b.beat);
  }, [song, beatsPerMs]);

  // Calculate total song duration in beats (find the last note end)
  const songDurationBeats = useMemo(() => {
    let maxBeat = 0;
    for (const note of visualNotes) {
      const noteEnd = note.beat + note.len;
      if (noteEnd > maxBeat) {
        maxBeat = noteEnd;
      }
    }
    // Add buffer after the last note for final bounce (4 beats)
    return maxBeat + 4;
  }, [visualNotes]);

  const visualDurationMs = useMemo(() => {
    return songDurationBeats / beatsPerMs;
  }, [songDurationBeats, beatsPerMs]);

  const handleSongEnd = useCallback(() => {
    if (!songEndedRef.current) {
      songEndedRef.current = true;
      setHasEnded(true);
      navigation.goBack();
    }
  }, [navigation]);

  const showSeekFeedback = useCallback((side: 'left' | 'right', label: string) => {
    setSeekFeedback({ side, label });
    if (seekFeedbackTimerRef.current) {
      clearTimeout(seekFeedbackTimerRef.current);
    }
    seekFeedbackTimerRef.current = setTimeout(() => {
      setSeekFeedback(null);
      seekFeedbackTimerRef.current = null;
    }, SEEK_INDICATOR_VISIBLE_MS);
  }, []);

  const performSeek = useCallback((direction: 1 | -1) => {
    if (!isReady) return;

    const deltaMs = direction * SEEK_STEP_MS;
    seekByMs(deltaMs);

    showSeekFeedback(direction < 0 ? 'left' : 'right', direction < 0 ? '<< 5s' : '5s >>');
  }, [isReady, seekByMs, showSeekFeedback]);

  const handlePlayAreaPress = useCallback((event: GestureResponderEvent) => {
    const isLeftSide = event.nativeEvent.locationX < (SCREEN_WIDTH / 2);
    const side: 'left' | 'right' = isLeftSide ? 'left' : 'right';
    const now = Date.now();
    const isDoubleTap = lastTapRef.current.side === side && (now - lastTapRef.current.ts) <= DOUBLE_TAP_WINDOW_MS;

    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }

    if (isDoubleTap) {
      performSeek(side === 'left' ? -1 : 1);
      lastTapRef.current = { side: null, ts: 0 };
      return;
    }

    lastTapRef.current = { side, ts: now };
    singleTapTimerRef.current = setTimeout(() => {
      togglePlayback();
      singleTapTimerRef.current = null;
    }, DOUBLE_TAP_WINDOW_MS);
  }, [performSeek, togglePlayback]);

  // Animate top bar slide up/down based on playing state
  useEffect(() => {
    topBarOffset.value = withTiming(isPlaying ? -TOP_BAR_HEIGHT : 0, { duration: 300 });
  }, [isPlaying, topBarOffset]);

  // Animated style for top bar
  const topBarAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: topBarOffset.value }],
    };
  });

  // Handle playback speed change with buttons
  const handleSpeedChange = useCallback((delta: number) => {
    const newSpeed = Math.max(25, Math.min(125, playbackSpeed + delta));
    setEnginePlaybackSpeed(newSpeed);
  }, [playbackSpeed, setEnginePlaybackSpeed]);

  // Reset speed to 100%
  const handleSpeedReset = useCallback(() => {
    setEnginePlaybackSpeed(100);
  }, [setEnginePlaybackSpeed]);

  // Long press acceleration for speed buttons
  const longPressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressStep = useRef(1); // Start with step of 1
  const longPressCount = useRef(0);

  const startLongPress = useCallback((direction: 1 | -1) => {
    longPressStep.current = 1;
    longPressCount.current = 0;
    
    // Immediately apply first change
    handleSpeedChange(direction * longPressStep.current);
    
    // Start interval for continuous changes
    longPressInterval.current = setInterval(() => {
      longPressCount.current++;
      
      // Exponentially increase step: 1, 1, 1, 2, 2, 3, 3, 5, 5, 10...
      if (longPressCount.current > 15) {
        longPressStep.current = 10;
      } else if (longPressCount.current > 10) {
        longPressStep.current = 5;
      } else if (longPressCount.current > 6) {
        longPressStep.current = 3;
      } else if (longPressCount.current > 3) {
        longPressStep.current = 2;
      }
      
      handleSpeedChange(direction * longPressStep.current);
    }, 80); // 80ms interval for smooth acceleration
  }, [handleSpeedChange]);

  const stopLongPress = useCallback(() => {
    if (longPressInterval.current) {
      clearInterval(longPressInterval.current);
      longPressInterval.current = null;
    }
    longPressStep.current = 1;
    longPressCount.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressInterval.current) {
        clearInterval(longPressInterval.current);
      }
      if (seekFeedbackTimerRef.current) {
        clearTimeout(seekFeedbackTimerRef.current);
      }
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
      }
    };
  }, []);

  // Keep end handling in JS, but source-of-truth remains native audio position.
  useEffect(() => {
    if (hasEnded || !isPlaying) return;

    const endThresholdMs = songDurationMs - 30;
    const interval = setInterval(() => {
      if (!songEndedRef.current && currentTimeMs.value >= endThresholdMs) {
        handleSongEnd();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [currentTimeMs, handleSongEnd, hasEnded, isPlaying, songDurationMs]);

  // Calculate Y position for each string
  function getStringY(stringNumber: number): number {
    return STRING_AREA_TOP + (stringNumber - 1) * STRING_SPACING;
  }

  // Prepare all linked note chains (memoized)
  const allNoteChains = useMemo((): LinkedNoteChain[] => {
    const chains: LinkedNoteChain[] = [];

    const notesByString = new Map<number, VisualNote[]>();
    for (let stringNumber = 1; stringNumber <= 6; stringNumber++) {
      notesByString.set(stringNumber, visualNotes.filter((note) => note.stringNumber === stringNumber));
    }

    for (const [stringNumber, stringNotes] of notesByString) {
      const sortedNotes = [...stringNotes].sort((a, b) => a.beat - b.beat);
      const processedIndices = new Set<number>();
      
      for (let i = 0; i < sortedNotes.length; i++) {
        if (processedIndices.has(i)) continue;
        
        const chainNotes: VisualNote[] = [sortedNotes[i]];
        const techniques: ('h' | 'p' | '/')[] = [];
        let currentIndex = i;
        
        // Follow the chain while linkNext is defined
        while (sortedNotes[currentIndex]?.linkNext && currentIndex + 1 < sortedNotes.length) {
          techniques.push(sortedNotes[currentIndex].linkNext!);
          currentIndex++;
          chainNotes.push(sortedNotes[currentIndex]);
          processedIndices.add(currentIndex);
        }
        
        processedIndices.add(i);
        
        // Calculate total duration: from first note's beat to last note's end
        const firstNote = chainNotes[0];
        const lastNote = chainNotes[chainNotes.length - 1];
        const totalDuration = (lastNote.beat + lastNote.len) - firstNote.beat;
        
        chains.push({
          notes: chainNotes,
          techniques,
          stringNumber,
          y: getStringY(stringNumber),
          startBeat: firstNote.beat,
          totalDuration,
        });
      }
    }
    
    return chains;
  }, [visualNotes]);

  // Prepare sorted flat notes for ball animation.
  // When multiple notes share the same beat (chords), keep only the
  // topmost string (smallest stringY) so the ball doesn't teleport
  // between simultaneous notes.
  const sortedFlatNotes = useMemo(() => {
    const sorted = [...visualNotes].sort((a, b) => a.beat - b.beat);
    if (sorted.length === 0) return sorted;

    const merged: VisualNote[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = merged[merged.length - 1];
      // Treat notes within 0.01 beats as simultaneous (same chord)
      if (Math.abs(sorted[i].beat - prev.beat) < 0.01) {
        // Keep the note on the topmost string (smallest stringY = highest on screen)
        if (sorted[i].stringY < prev.stringY) {
          merged[merged.length - 1] = sorted[i];
        }
        // Otherwise skip this note — prev is already the top one
      } else {
        merged.push(sorted[i]);
      }
    }
    return merged;
  }, [visualNotes]);

  // Pre-calculate the entire bounce path so the UI thread only does array lookup.
  const bounceMap = useMemo(() => {
    const totalFrames = Math.max(2, Math.ceil(visualDurationMs / BOUNCE_FRAME_DURATION_MS) + 1);
    const map = new Float32Array(totalFrames);

    if (sortedFlatNotes.length === 0) {
      map.fill(STRING_AREA_TOP - NOTE_TOP_OFFSET);
      return map;
    }

    let noteIdx = 0;

    for (let i = 0; i < totalFrames; i++) {
      const sampleTimeMs = i * BOUNCE_FRAME_DURATION_MS;
      const beat = sampleTimeMs * beatsPerMs;

      while (noteIdx < sortedFlatNotes.length - 1 && beat > sortedFlatNotes[noteIdx + 1].beat) {
        noteIdx++;
      }

      const currentNote = sortedFlatNotes[noteIdx];
      const nextNote = sortedFlatNotes[noteIdx + 1];

      if (noteIdx === 0 && beat < sortedFlatNotes[0].beat) {
        const firstBeat = Math.max(sortedFlatNotes[0].beat, 0.0001);
        const progress = beat / firstBeat;
        const clampedProgress = Math.max(0, Math.min(1, progress));
        const jumpOffset = 4 * MAX_BOUNCE_Y * clampedProgress * (1 - clampedProgress);
        map[i] = sortedFlatNotes[0].stringY - NOTE_TOP_OFFSET - jumpOffset;
        continue;
      }

      if (!nextNote) {
        const remainingBeats = songDurationBeats - currentNote.beat;
        if (remainingBeats <= 0) {
          map[i] = currentNote.stringY - NOTE_TOP_OFFSET;
          continue;
        }
        const progress = (beat - currentNote.beat) / remainingBeats;
        const clampedProgress = Math.max(0, Math.min(1, progress));
        const jumpOffset = 4 * MAX_BOUNCE_Y * clampedProgress * (1 - clampedProgress);
        map[i] = currentNote.stringY - NOTE_TOP_OFFSET - jumpOffset;
        continue;
      }

      const gap = nextNote.beat - currentNote.beat;
      const safeGap = Math.max(gap, 0.0001);
      const progress = (beat - currentNote.beat) / safeGap;
      const clampedProgress = Math.max(0, Math.min(1, progress));

      let availableRoom = currentNote.stringY - NOTE_TOP_OFFSET - MAX_BOUNCE_Y;
      if (currentNote.stringNumber === 1) {
        availableRoom *= 2;
      }
      const targetHeight = Math.max(MIN_BOUNCE_V, (safeGap / 4) * availableRoom);
      const finalHeight = Math.min(targetHeight, availableRoom);

      const jumpOffset = 4 * finalHeight * clampedProgress * (1 - clampedProgress);
      const lerpY = currentNote.stringY + (nextNote.stringY - currentNote.stringY) * clampedProgress;

      map[i] = lerpY - NOTE_TOP_OFFSET - jumpOffset;
    }

    return map;
  }, [sortedFlatNotes, beatsPerMs, songDurationBeats, visualDurationMs]);

  // Ball Y position lookup with frame interpolation for high refresh-rate displays.
  const ballY = useDerivedValue(() => {
    const mapLength = bounceMap.length;
    if (mapLength === 0) return STRING_AREA_TOP - NOTE_TOP_OFFSET;

    const framePosition = currentTimeMs.value / BOUNCE_FRAME_DURATION_MS;

    if (framePosition <= 0) return bounceMap[0];

    const lastIndex = mapLength - 1;
    if (framePosition >= lastIndex) return bounceMap[lastIndex];

    const lowerIndex = Math.floor(framePosition);
    const upperIndex = Math.min(lowerIndex + 1, lastIndex);
    const alpha = framePosition - lowerIndex;
    const lowerValue = bounceMap[lowerIndex];
    const upperValue = bounceMap[upperIndex];

    return lowerValue + ((upperValue - lowerValue) * alpha);
  }, [bounceMap]);

  // Calculate bar numbers to render (memoized)
  const barNumbers = useMemo((): number[] => {
    const totalBars = Math.ceil(songDurationBeats / beatsPerBar);
    return Array.from({ length: totalBars + 1 }, (_, i) => i);
  }, [beatsPerBar, songDurationBeats]);

  // Total strings height for bar lines
  const totalStringsHeight = 5 * STRING_SPACING;

  return (
    <View style={styles.container}>
      {/* Top Bar - slides up when playing */}
      <Animated.View style={[styles.topBar, topBarAnimatedStyle]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.songTitle} numberOfLines={1}>{songTitle}</Text>
        <Text style={styles.bpmText}>{songBpm} BPM</Text>
      </Animated.View>

      {/* Playalong Area */}
      <TouchableOpacity 
        style={styles.playArea} 
        onPress={handlePlayAreaPress}
        activeOpacity={1}
      >
        {/* Floating Speed Control - Top Right */}
        <View style={styles.floatingSpeedControl} pointerEvents="box-none">
          <View style={styles.speedControlContainer}>
            {/* Decrease button */}
            <Pressable
              style={styles.speedBtn}
              onPressIn={() => startLongPress(-1)}
              onPressOut={stopLongPress}
            >
              <Text style={styles.speedBtnText}>−</Text>
            </Pressable>
            
            {/* Speed display - tap to reset */}
            <TouchableOpacity 
              style={styles.speedValueContainer}
              onPress={handleSpeedReset}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.speedValueText,
                playbackSpeed === 100 && styles.speedValueNormal
              ]}>
                {playbackSpeed}%
              </Text>
            </TouchableOpacity>
            
            {/* Increase button */}
            <Pressable
              style={styles.speedBtn}
              onPressIn={() => startLongPress(1)}
              onPressOut={stopLongPress}
            >
              <Text style={styles.speedBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
        {/* Static strings */}
        <View style={styles.stringsContainer}>
          {/* Render guitar strings */}
          {[1, 2, 3, 4, 5, 6].map((stringNum) => (
            <View
              key={`string-${stringNum}`}
              style={[styles.stringLine, {
                top: getStringY(stringNum) - (stringNum <= 3 ? 1 : 1.5),
                height: stringNum <= 3 ? 2 : 3,
                backgroundColor: STRING_COLORS[stringNum - 1],
                opacity: 0.6,
              }]}
            />
          ))}

          {/* Subtle hit zone indicator line */}
          <View style={[styles.hitLine, {
            left: HIT_LINE_X,
            top: STRING_AREA_TOP - 20,
            height: 5 * STRING_SPACING + 40,
          }]} />
        </View>

        {/* Animated Bar Lines Layer */}
        <View style={styles.barLinesContainer}>
          {barNumbers.map((barNumber) => (
            <AnimatedBarLine
              key={`bar-${barNumber}`}
              barNumber={barNumber}
              beatsPerBar={beatsPerBar}
              currentBeat={currentBeat}
              stringAreaTop={STRING_AREA_TOP}
              totalStringsHeight={totalStringsHeight}
            />
          ))}
        </View>

        {/* Animated Notes Layer */}
        <View style={styles.notesContainer}>
          {allNoteChains.map((chainData, index) => (
            <AnimatedNote
              key={`chain-${chainData.stringNumber}-${chainData.startBeat}-${index}`}
              chainData={chainData}
              currentBeat={currentBeat}
            />
          ))}
        </View>

        {/* Ball Animation */}
        <Animated.View style={useAnimatedStyle(() => ({
          position: 'absolute',
          left: HIT_LINE_X - 10,
          top: ballY.value,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: '#ffffff',
          zIndex: 10,
        }))} />

        {/* Play/Pause indicator */}
        <View style={styles.playIndicator}>
          <Text style={styles.playIndicatorText}>
            {isPlaying ? '⏸ Tap to Pause' : '▶ Tap to Play'}
          </Text>
        </View>

        {seekFeedback && (
          <View style={[
            styles.seekIndicator,
            seekFeedback.side === 'left' ? styles.seekIndicatorLeft : styles.seekIndicatorRight,
          ]}>
            <Text style={styles.seekIndicatorText}>{seekFeedback.label}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backButtonText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: '600',
  },
  songTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  bpmText: {
    color: '#888',
    fontSize: 14,
  },
  playArea: {
    flex: 1,
  },
  floatingSpeedControl: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 100,
  },
  speedControlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 52, 96, 0.95)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  speedBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#16213e',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
  },
  speedValueContainer: {
    paddingHorizontal: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  speedValueText: {
    color: '#e94560',
    fontSize: 15,
    fontWeight: 'bold',
  },
  speedValueNormal: {
    color: '#2ecc71',
  },
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
  stringsContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  stringLine: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  hitLine: {
    position: 'absolute',
    width: 1,
    backgroundColor: '#ffffff',
    opacity: 0.3,
  },
  notesContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  barLinesContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  barLineLabel: {
    position: 'absolute',
    top: -20,
    left: -10,
    width: 22,
    height: 18,
    backgroundColor: '#0f3460',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barLineLabelText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '600',
  },
  noteBar: {
    height: NOTE_HEIGHT,
    borderRadius: NOTE_BORDER_RADIUS,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 30,
  },
  fretText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  techniqueBridge: {
    width: TECHNIQUE_BRIDGE_WIDTH,
    height: NOTE_HEIGHT - 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
    marginHorizontal: -2, // Overlap slightly with notes for visual connection
  },
  techniqueText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  playIndicator: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  playIndicatorText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '500',
  },
  seekIndicator: {
    position: 'absolute',
    top: '42%',
    backgroundColor: 'rgba(15, 52, 96, 0.88)',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e94560',
  },
  seekIndicatorLeft: {
    left: 28,
  },
  seekIndicatorRight: {
    right: 28,
  },
  seekIndicatorText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
