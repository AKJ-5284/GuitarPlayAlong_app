import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  Keyboard,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Canvas, Line, vec, RoundedRect } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Song, Note } from '../types/song';
import {
  createNewSong,
  saveSong,
  createNote,
  addNoteToSong,
  removeNoteFromSong,
  snapToGrid,
  generateSongId,
  GRID_SNAP,
  getUniqueSongName,
} from '../storage/songStorage';
import { RootStackParamList } from '../../App';

type EditorRouteProp = RouteProp<RootStackParamList, 'Editor'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Editor constants
const PIXELS_PER_BEAT = 60;
const TOP_BAR_HEIGHT = 60;
const STRING_SPACING = 40;
const NOTE_HEIGHT = 30;
const DEFAULT_BEATS_PER_BAR = 4;
const TOTAL_BARS = 32;
const LEFT_MARGIN = 20;

// BPM constraints
const MIN_BPM = 40;
const MAX_BPM = 240;
const DEFAULT_BPM = 120;

// Canvas positioning
const STRING_AREA_TOP = 50;

// String colors
const STRING_COLORS = [
  '#e94560', '#f39c12', '#3498db', '#2ecc71', '#9b59b6', '#e74c3c',
];

// Note edit modal - inline component to avoid Modal presentation issues
interface NoteEditModalProps {
  visible: boolean;
  note: Note | null;
  onClose: () => void;
  onUpdate: (note: Note) => void;
  onDelete: () => void;
}

function NoteEditModal({ visible, note, onClose, onUpdate, onDelete }: NoteEditModalProps) {
  const [editedNote, setEditedNote] = useState<Note | null>(null);

  React.useEffect(() => {
    if (note) setEditedNote({ ...note });
  }, [note]);

  if (!visible || !note || !editedNote) return null;

  const adjustLength = (delta: number) => {
    const newLen = Math.max(GRID_SNAP, snapToGrid(editedNote.len + delta));
    setEditedNote({ ...editedNote, len: newLen });
  };

  const adjustFret = (delta: number) => {
    const newFret = Math.max(0, Math.min(24, editedNote.fret + delta));
    setEditedNote({ ...editedNote, fret: newFret });
  };

  const setLinkNext = (link: 'h' | 'p' | '/' | undefined) => {
    setEditedNote({ ...editedNote, linkNext: link });
  };

  return (
    <View style={styles.modalOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Edit Note</Text>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Fret:</Text>
          <TouchableOpacity style={styles.controlButton} onPress={() => adjustFret(-1)}>
            <Text style={styles.controlButtonText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.controlValue}>{editedNote.fret}</Text>
          <TouchableOpacity style={styles.controlButton} onPress={() => adjustFret(1)}>
            <Text style={styles.controlButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Length:</Text>
          <TouchableOpacity style={styles.controlButton} onPress={() => adjustLength(-0.25)}>
            <Text style={styles.controlButtonText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.controlValue}>{editedNote.len}</Text>
          <TouchableOpacity style={styles.controlButton} onPress={() => adjustLength(0.25)}>
            <Text style={styles.controlButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Link:</Text>
          <View style={styles.linkButtons}>
            {(['h', 'p', '/', undefined] as const).map((link) => (
              <TouchableOpacity
                key={link ?? 'none'}
                style={[styles.linkButton, editedNote.linkNext === link && styles.linkButtonActive]}
                onPress={() => setLinkNext(link)}
              >
                <Text style={styles.linkButtonText}>{link ?? 'None'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.infoText}>Beat: {editedNote.beat} | String: {editedNote.string}</Text>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveModalButton} onPress={() => { onUpdate(editedNote); onClose(); }}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Name input modal for saving songs
interface NameInputModalProps {
  visible: boolean;
  initialName: string;
  title: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}

function NameInputModal({ visible, initialName, title, onCancel, onSave }: NameInputModalProps) {
  const [name, setName] = useState(initialName);
  
  React.useEffect(() => {
    if (visible) setName(initialName);
  }, [visible, initialName]);

  if (!visible) return null;

  const handleSave = () => {
    const trimmedName = name.trim();
    if (trimmedName.length > 0) {
      onSave(trimmedName);
    }
  };

  return (
    <View style={styles.modalOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          autoFocus
          selectTextOnFocus
          maxLength={50}
          placeholder="Enter song name"
          placeholderTextColor="#666"
          onSubmitEditing={handleSave}
          returnKeyType="done"
        />
        
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.cancelModalButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveModalButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Draggable Note Component with gesture handling
interface DraggableNoteProps {
  note: Note;
  x: number;
  y: number;
  width: number;
  scrollOffset: number;
  onTap: () => void;
  onDragEnd: (note: Note, newBeat: number, newString: number) => void;
}

function DraggableNote({ note, x, y, width, scrollOffset, onTap, onDragEnd }: DraggableNoteProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);

  const getBeatFromXWorklet = (screenX: number, scroll: number): number => {
    'worklet';
    const absoluteX = screenX + scroll - LEFT_MARGIN;
    return Math.round(absoluteX / PIXELS_PER_BEAT * 4) / 4; // Snap to 0.25
  };

  const getStringFromYWorklet = (screenY: number): number => {
    'worklet';
    const relativeY = screenY - STRING_AREA_TOP;
    const stringIndex = Math.round(relativeY / STRING_SPACING);
    return Math.max(1, Math.min(6, stringIndex + 1));
  };

  const handleDragEnd = useCallback((newBeat: number, newString: number) => {
    onDragEnd(note, newBeat, newString);
  }, [note, onDragEnd]);

  const handleTap = useCallback(() => {
    onTap();
  }, [onTap]);

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.15);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd(() => {
      isDragging.value = false;
      scale.value = withSpring(1);
      
      // Calculate new position
      const newScreenX = x + translateX.value;
      const newScreenY = y + translateY.value;
      const newBeat = getBeatFromXWorklet(newScreenX, scrollOffset);
      const newString = getStringFromYWorklet(newScreenY);
      
      // Reset visual position
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      
      // Update song state
      if (newBeat >= 0 && newString >= 1 && newString <= 6) {
        runOnJS(handleDragEnd)(newBeat, newString);
      }
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(handleTap)();
    });

  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: isDragging.value ? 100 : 1,
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.draggableNote,
          {
            left: x,
            top: y - NOTE_HEIGHT / 2,
            width: width,
            height: NOTE_HEIGHT,
            backgroundColor: STRING_COLORS[note.string - 1],
          },
          animatedStyle,
        ]}
      >
        <Text style={styles.noteLabelInline}>
          {note.fret}{note.linkNext ? ` ${note.linkNext}` : ''}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

export default function EditorScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EditorRouteProp>();
  const passedSong = route.params?.song;
  
  // Determine if this is a new song or editing existing
  const isNewSong = !passedSong;
  
  const [song, setSong] = useState<Song>(() => 
    passedSong || createNewSong('New Song', 120, DEFAULT_BEATS_PER_BAR)
  );
  const [originalSong, setOriginalSong] = useState<Song>(() => 
    passedSong ? { ...passedSong } : createNewSong('New Song', 120, DEFAULT_BEATS_PER_BAR)
  );
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // Name input modal state
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [saveMode, setSaveMode] = useState<'new' | 'overwrite'>('new');
  const [pendingBackNavigation, setPendingBackNavigation] = useState(false);
  
  // Track unsaved changes by comparing with original
  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(song) !== JSON.stringify(originalSong);
  }, [song, originalSong]);
  
  // Update song when navigated with a different song or reset to blank
  useEffect(() => {
    if (passedSong) {
      setSong(passedSong);
      setOriginalSong({ ...passedSong });
    } else if (passedSong === undefined && route.params !== undefined) {
      // Explicitly navigated with undefined song = create new blank song
      const newSong = createNewSong('New Song', 120, DEFAULT_BEATS_PER_BAR);
      setSong(newSong);
      setOriginalSong({ ...newSong });
    }
  }, [passedSong, route.params]);
  
  // Editing states for song name and BPM
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(song.name);
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [editingBpm, setEditingBpm] = useState(String(song.bpm));
  
  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  
  // Show toast notification
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
      setToastMessage(null);
    }, 2500);
  }, []);

  // Dynamic grid calculations based on song's beatsPerBar
  const beatsPerBar = song.beatsPerBar;
  const totalBeats = TOTAL_BARS * beatsPerBar;
  const contentWidth = totalBeats * PIXELS_PER_BEAT;

  // Handle beats per bar change
  const handleBeatsPerBarChange = useCallback((delta: number) => {
    const newBeatsPerBar = Math.max(2, Math.min(12, beatsPerBar + delta));
    setSong(prev => ({ ...prev, beatsPerBar: newBeatsPerBar }));
  }, [beatsPerBar]);

  // Handle song name editing
  const handleNamePress = useCallback(() => {
    setEditingName(song.name);
    setIsEditingName(true);
  }, [song.name]);

  const handleNameSubmit = useCallback(() => {
    const trimmedName = editingName.trim();
    if (trimmedName.length > 0) {
      setSong(prev => ({ ...prev, name: trimmedName }));
    } else {
      setEditingName(song.name); // Reset to original if empty
    }
    setIsEditingName(false);
    Keyboard.dismiss();
  }, [editingName, song.name]);

  // Handle BPM editing
  const handleBpmPress = useCallback(() => {
    setEditingBpm(String(song.bpm));
    setIsEditingBpm(true);
  }, [song.bpm]);

  const handleBpmSubmit = useCallback(() => {
    const newBpm = parseInt(editingBpm, 10);
    if (!isNaN(newBpm)) {
      const clampedBpm = Math.max(MIN_BPM, Math.min(MAX_BPM, newBpm));
      setSong(prev => ({ ...prev, bpm: clampedBpm }));
      setEditingBpm(String(clampedBpm));
    } else {
      setEditingBpm(String(song.bpm)); // Reset to original if invalid
    }
    setIsEditingBpm(false);
    Keyboard.dismiss();
  }, [editingBpm, song.bpm]);

  const handleBpmChange = useCallback((delta: number) => {
    const newBpm = Math.max(MIN_BPM, Math.min(MAX_BPM, song.bpm + delta));
    setSong(prev => ({ ...prev, bpm: newBpm }));
  }, [song.bpm]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.x;
    setScrollOffset(offset);
  }, []);

  const getStringY = useCallback((stringNumber: number): number => {
    return STRING_AREA_TOP + (stringNumber - 1) * STRING_SPACING;
  }, []);

  const getStringFromY = useCallback((y: number): number => {
    const relativeY = y - STRING_AREA_TOP;
    const stringIndex = Math.round(relativeY / STRING_SPACING);
    return Math.max(1, Math.min(6, stringIndex + 1));
  }, []);

  const getBeatFromX = useCallback((x: number, scroll: number): number => {
    const absoluteX = x + scroll - LEFT_MARGIN;
    return snapToGrid(absoluteX / PIXELS_PER_BEAT);
  }, []);

  const getXFromBeat = useCallback((beat: number, scroll: number): number => {
    return LEFT_MARGIN + beat * PIXELS_PER_BEAT - scroll;
  }, []);

  const findNoteAtPosition = useCallback((x: number, y: number, scroll: number): Note | null => {
    const beat = getBeatFromX(x, scroll);
    const stringNum = getStringFromY(y);
    for (const track of song.tracks) {
      if (track.string === stringNum) {
        for (const note of track.notes) {
          if (beat >= note.beat && beat < note.beat + note.len) return note;
        }
      }
    }
    return null;
  }, [song, getBeatFromX, getStringFromY]);

  const handleNoteUpdate = useCallback((updatedNote: Note) => {
    if (!selectedNote) return;
    const updatedSong = { ...song };
    removeNoteFromSong(updatedSong, selectedNote);
    addNoteToSong(updatedSong, updatedNote);
    setSong(updatedSong);
    setSelectedNote(null);
  }, [song, selectedNote]);

  const handleNoteDelete = useCallback(() => {
    if (!selectedNote) return;
    const updatedSong = { ...song };
    removeNoteFromSong(updatedSong, selectedNote);
    setSong(updatedSong);
    setSelectedNote(null);
    setModalVisible(false);
  }, [song, selectedNote]);

  // Handle tap on empty canvas area to create new note
  const handleCanvasPress = useCallback((pageX: number, pageY: number) => {
    const x = pageX;
    const y = pageY - TOP_BAR_HEIGHT;
    
    const existingNote = findNoteAtPosition(x, y, scrollOffset);
    if (!existingNote) {
      const beat = getBeatFromX(x, scrollOffset);
      const stringNum = getStringFromY(y);
      if (beat >= 0 && stringNum >= 1 && stringNum <= 6) {
        const newNote = createNote(beat, 0, stringNum, GRID_SNAP);
        const updatedSong = { ...song };
        addNoteToSong(updatedSong, newNote);
        setSong(updatedSong);
      }
    }
  }, [scrollOffset, findNoteAtPosition, getBeatFromX, getStringFromY, song]);

  // Handle note drag completion
  const handleNoteDragEnd = useCallback((note: Note, newBeat: number, newString: number) => {
    if (newBeat === note.beat && newString === note.string) return;
    
    const updatedSong = { ...song };
    removeNoteFromSong(updatedSong, note);
    const movedNote = { ...note, beat: newBeat, string: newString };
    addNoteToSong(updatedSong, movedNote);
    setSong(updatedSong);
  }, [song]);

  // Handle note tap to open edit modal
  const handleNoteTap = useCallback((note: Note) => {
    setSelectedNote(note);
    setModalVisible(true);
  }, []);

  // Filter visible notes - only render what's on screen
  const visibleNotes = useMemo(() => {
    const notes: Note[] = [];
    const visibleStartBeat = (scrollOffset - LEFT_MARGIN) / PIXELS_PER_BEAT - 2;
    const visibleEndBeat = (scrollOffset + SCREEN_WIDTH - LEFT_MARGIN) / PIXELS_PER_BEAT + 2;
    for (const track of song.tracks) {
      for (const note of track.notes) {
        const noteEnd = note.beat + note.len;
        if (noteEnd >= visibleStartBeat && note.beat <= visibleEndBeat) {
          notes.push(note);
        }
      }
    }
    return notes;
  }, [song, scrollOffset]);

  // Calculate visible beat lines with subdivisions
  const visibleGridLines = useMemo(() => {
    const lines: {
      x: number;
      type: 'bar' | 'beat' | 'half' | 'quarter';
      beat: number;
    }[] = [];
    
    const startBeat = Math.max(0, Math.floor((scrollOffset - LEFT_MARGIN) / PIXELS_PER_BEAT) - 1);
    const endBeat = Math.min(totalBeats, Math.ceil((scrollOffset + SCREEN_WIDTH) / PIXELS_PER_BEAT) + 1);
    
    for (let beat = startBeat; beat <= endBeat; beat++) {
      const x = LEFT_MARGIN + beat * PIXELS_PER_BEAT - scrollOffset;
      const isBarStart = beat % beatsPerBar === 0;
      
      // Primary: Bar lines
      if (isBarStart) {
        lines.push({ x, type: 'bar', beat });
      } else {
        // Secondary: Beat lines
        lines.push({ x, type: 'beat', beat });
      }
      
      // Tertiary: Half-beat subdivisions (0.5)
      const halfX = x + PIXELS_PER_BEAT * 0.5;
      lines.push({ x: halfX, type: 'half', beat: beat + 0.5 });
      
      // Tertiary: Quarter-beat subdivisions (0.25 and 0.75)
      const quarterX1 = x + PIXELS_PER_BEAT * 0.25;
      const quarterX2 = x + PIXELS_PER_BEAT * 0.75;
      lines.push({ x: quarterX1, type: 'quarter', beat: beat + 0.25 });
      lines.push({ x: quarterX2, type: 'quarter', beat: beat + 0.75 });
    }
    
    return lines;
  }, [scrollOffset, beatsPerBar, totalBeats]);

  // Get bar numbers for labels
  const visibleBarNumbers = useMemo(() => {
    const bars: { barNum: number; x: number }[] = [];
    const startBeat = Math.max(0, Math.floor((scrollOffset - LEFT_MARGIN) / PIXELS_PER_BEAT) - 1);
    const endBeat = Math.min(totalBeats, Math.ceil((scrollOffset + SCREEN_WIDTH) / PIXELS_PER_BEAT) + 1);
    
    for (let beat = startBeat; beat <= endBeat; beat++) {
      if (beat % beatsPerBar === 0) {
        const x = LEFT_MARGIN + beat * PIXELS_PER_BEAT - scrollOffset;
        bars.push({ barNum: Math.floor(beat / beatsPerBar) + 1, x });
      }
    }
    return bars;
  }, [scrollOffset, beatsPerBar, totalBeats]);

  // Complete the save with the given name
  const completeSave = useCallback(async (finalName: string, mode: 'new' | 'overwrite') => {
    // Get unique name to avoid duplicates
    const excludeId = mode === 'overwrite' ? song.id : undefined;
    const uniqueName = await getUniqueSongName(finalName, excludeId);
    
    if (mode === 'new') {
      // Create new song with new ID
      const newSong: Song = {
        ...song,
        id: generateSongId(),
        name: uniqueName,
        lastModified: Date.now(),
      };
      saveSong(newSong);
      setSong(newSong);
      setOriginalSong({ ...newSong });
      showToast('Song created!');
    } else {
      // Overwrite existing song
      const updatedSong: Song = {
        ...song,
        name: uniqueName,
        lastModified: Date.now(),
      };
      saveSong(updatedSong);
      setSong(updatedSong);
      setOriginalSong({ ...updatedSong });
      showToast('Song saved!');
    }
    
    // If we were pending back navigation, go back now
    if (pendingBackNavigation) {
      setPendingBackNavigation(false);
      navigation.goBack();
    }
  }, [song, showToast, pendingBackNavigation, navigation]);

  // Handle name modal save
  const handleNameModalSave = useCallback((name: string) => {
    setNameModalVisible(false);
    completeSave(name, saveMode);
  }, [completeSave, saveMode]);
  
  // Handle name modal cancel
  const handleNameModalCancel = useCallback(() => {
    setNameModalVisible(false);
    setPendingBackNavigation(false);
  }, []);

  // Show save dialog - different flow for new vs existing songs
  const handleSaveSong = useCallback(() => {
    if (isNewSong) {
      // New song: just show name modal and save
      setSaveMode('new');
      setNameModalVisible(true);
    } else {
      // Editing existing song: ask overwrite or create new
      Alert.alert(
        'Save Song',
        'How would you like to save?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Create Copy',
            onPress: () => {
              setSaveMode('new');
              setNameModalVisible(true);
            },
          },
          {
            text: 'Overwrite',
            style: 'destructive',
            onPress: () => {
              setSaveMode('overwrite');
              setNameModalVisible(true);
            },
          },
        ]
      );
    }
  }, [isNewSong]);

  // Handle back button with unsaved changes warning
  const handleBackPress = useCallback(() => {
    if (!hasUnsavedChanges) {
      navigation.goBack();
      return;
    }
    
    // Show unsaved changes warning
    Alert.alert(
      'Unsaved Changes',
      'You have unsaved changes. What would you like to do?',
      [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Save',
          onPress: () => {
            setPendingBackNavigation(true);
            if (isNewSong) {
              // New song: show name modal
              setSaveMode('new');
              setNameModalVisible(true);
            } else {
              // Existing song: ask overwrite or create new
              Alert.alert(
                'Save Song',
                'How would you like to save?',
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => setPendingBackNavigation(false),
                  },
                  {
                    text: 'Create Copy',
                    onPress: () => {
                      setSaveMode('new');
                      setNameModalVisible(true);
                    },
                  },
                  {
                    text: 'Overwrite',
                    onPress: () => {
                      setSaveMode('overwrite');
                      setNameModalVisible(true);
                    },
                  },
                ]
              );
            }
          },
        },
      ]
    );
  }, [hasUnsavedChanges, navigation, isNewSong]);

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.topBar}>
        {/* Back Button */}
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        
        {/* Editable Song Name */}
        {isEditingName ? (
          <TextInput
            style={styles.songNameInput}
            value={editingName}
            onChangeText={setEditingName}
            onBlur={handleNameSubmit}
            onSubmitEditing={handleNameSubmit}
            autoFocus
            selectTextOnFocus
            maxLength={50}
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity onPress={handleNamePress}>
            <Text style={styles.songName}>{song.name}</Text>
          </TouchableOpacity>
        )}
        
        <View style={styles.topBarRight}>
          {/* Editable BPM Control */}
          <View style={styles.bpmControl}>
            <TouchableOpacity 
              style={styles.smallButton} 
              onPress={() => handleBpmChange(-5)}
            >
              <Text style={styles.smallButtonText}>-</Text>
            </TouchableOpacity>
            {isEditingBpm ? (
              <TextInput
                style={styles.bpmInput}
                value={editingBpm}
                onChangeText={setEditingBpm}
                onBlur={handleBpmSubmit}
                onSubmitEditing={handleBpmSubmit}
                keyboardType="number-pad"
                autoFocus
                selectTextOnFocus
                maxLength={3}
                returnKeyType="done"
              />
            ) : (
              <TouchableOpacity onPress={handleBpmPress}>
                <Text style={styles.bpmText}>{song.bpm}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.bpmLabel}>BPM</Text>
            <TouchableOpacity 
              style={styles.smallButton} 
              onPress={() => handleBpmChange(5)}
            >
              <Text style={styles.smallButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          
          {/* Time Signature / Beats Per Bar Control */}
          <View style={styles.timeSignatureControl}>
            <TouchableOpacity 
              style={styles.smallButton} 
              onPress={() => handleBeatsPerBarChange(-1)}
            >
              <Text style={styles.smallButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.timeSignatureText}>{beatsPerBar}/4</Text>
            <TouchableOpacity 
              style={styles.smallButton} 
              onPress={() => handleBeatsPerBarChange(1)}
            >
              <Text style={styles.smallButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveSong}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.editorArea}>
        {/* Scrollable content area */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={styles.scrollView}
          contentContainerStyle={{ width: contentWidth }}
          scrollEnabled={!isDragging}
        >
          {/* Touch area for creating notes on empty space */}
          <Pressable
            style={[styles.touchArea, { width: contentWidth }]}
            onPress={(e) => handleCanvasPress(e.nativeEvent.pageX, e.nativeEvent.pageY)}
          />
        </ScrollView>

        {/* Fixed Canvas layer - renders grid and strings */}
        <View style={styles.canvasWrapper} pointerEvents="none">
          <Canvas style={styles.canvas}>
            {/* Guitar strings */}
            {[1, 2, 3, 4, 5, 6].map((stringNum) => (
              <Line
                key={`string-${stringNum}`}
                p1={vec(0, getStringY(stringNum))}
                p2={vec(SCREEN_WIDTH, getStringY(stringNum))}
                color={STRING_COLORS[stringNum - 1]}
                style="stroke"
                strokeWidth={stringNum <= 3 ? 2 : 3}
                opacity={0.6}
              />
            ))}

            {/* Visible grid lines - rendered by type */}
            {visibleGridLines.map(({ x, type, beat }) => {
              // Bar lines (primary) - thick, bright
              if (type === 'bar') {
                return (
                  <Line
                    key={`bar-${beat}`}
                    p1={vec(x, STRING_AREA_TOP - 20)}
                    p2={vec(x, STRING_AREA_TOP + 5 * STRING_SPACING + 20)}
                    color="#ffffff"
                    style="stroke"
                    strokeWidth={2.5}
                    opacity={0.9}
                  />
                );
              }
              // Beat lines (secondary) - medium, darker
              if (type === 'beat') {
                return (
                  <Line
                    key={`beat-${beat}`}
                    p1={vec(x, STRING_AREA_TOP - 10)}
                    p2={vec(x, STRING_AREA_TOP + 5 * STRING_SPACING + 10)}
                    color="#888888"
                    style="stroke"
                    strokeWidth={1.5}
                    opacity={0.6}
                  />
                );
              }
              // Half-beat subdivisions (tertiary) - thin, faint
              if (type === 'half') {
                return (
                  <Line
                    key={`half-${beat}`}
                    p1={vec(x, STRING_AREA_TOP)}
                    p2={vec(x, STRING_AREA_TOP + 5 * STRING_SPACING)}
                    color="#555555"
                    style="stroke"
                    strokeWidth={1}
                    opacity={0.35}
                  />
                );
              }
              // Quarter-beat subdivisions (tertiary) - very thin, very faint
              if (type === 'quarter') {
                return (
                  <Line
                    key={`quarter-${beat}`}
                    p1={vec(x, STRING_AREA_TOP + STRING_SPACING)}
                    p2={vec(x, STRING_AREA_TOP + 4 * STRING_SPACING)}
                    color="#444444"
                    style="stroke"
                    strokeWidth={0.5}
                    opacity={0.25}
                  />
                );
              }
              return null;
            })}
          </Canvas>
        </View>

        {/* Bar number labels */}
        <View style={styles.labelsWrapper} pointerEvents="none">
          {visibleBarNumbers.map(({ barNum, x }) => (
            <Text key={`bar-label-${barNum}`} style={[styles.barLabel, { left: x + 4 }]}>
              {barNum}
            </Text>
          ))}
        </View>

        {/* Draggable Notes Layer */}
        <View style={styles.notesLayer} pointerEvents="box-none">
          {visibleNotes.map((note, index) => {
            const x = getXFromBeat(note.beat, scrollOffset);
            const y = getStringY(note.string);
            const width = Math.max(note.len * PIXELS_PER_BEAT - 4, 20);
            return (
              <DraggableNote
                key={`note-${note.beat}-${note.string}-${note.fret}-${index}`}
                note={note}
                x={x}
                y={y}
                width={width}
                scrollOffset={scrollOffset}
                onTap={() => handleNoteTap(note)}
                onDragEnd={handleNoteDragEnd}
              />
            );
          })}
        </View>
      </View>

      {modalVisible && (
        <NoteEditModal
          visible={modalVisible}
          note={selectedNote}
          onClose={() => { setModalVisible(false); setSelectedNote(null); }}
          onUpdate={handleNoteUpdate}
          onDelete={handleNoteDelete}
        />
      )}
      
      {/* Toast Notification */}
      {toastVisible && toastMessage && (
        <View style={styles.toastContainer}>
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      )}
      
      {/* Name Input Modal */}
      <NameInputModal
        visible={nameModalVisible}
        initialName={song.name}
        title={isNewSong ? "Name Your Song" : (saveMode === 'new' ? "Name Your Copy" : "Rename Song")}
        onCancel={handleNameModalCancel}
        onSave={handleNameModalSave}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 12,
  },
  backButtonText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: '600',
  },
  songName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  songNameInput: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    borderBottomWidth: 1,
    borderBottomColor: '#4a90d9',
    paddingVertical: 2,
    paddingHorizontal: 4,
    minWidth: 100,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bpmControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  bpmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 4,
    minWidth: 30,
    textAlign: 'center',
  },
  bpmInput: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    borderBottomWidth: 1,
    borderBottomColor: '#4a90d9',
    paddingVertical: 0,
    paddingHorizontal: 2,
    minWidth: 35,
    textAlign: 'center',
  },
  bpmLabel: {
    color: '#888',
    fontSize: 12,
    paddingHorizontal: 4,
  },
  timeSignatureControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  timeSignatureText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    minWidth: 40,
    textAlign: 'center',
  },
  smallButton: {
    width: 28,
    height: 28,
    backgroundColor: '#16213e',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  editorArea: { flex: 1, position: 'relative' },
  scrollView: { flex: 1 },
  touchArea: { height: '100%' },
  canvasWrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  canvas: { flex: 1 },
  labelsWrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  notesLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  barLabel: { position: 'absolute', top: STRING_AREA_TOP - 35, color: '#888888', fontSize: 12, fontWeight: '500' },
  draggableNote: {
    position: 'absolute',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  noteLabelInline: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: { 
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', 
    justifyContent: 'center', 
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: { backgroundColor: '#16213e', borderRadius: 16, padding: 24, width: 300, borderWidth: 1, borderColor: '#0f3460' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  controlRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  controlLabel: { color: '#888', fontSize: 14, width: 60 },
  controlButton: { width: 40, height: 40, backgroundColor: '#0f3460', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  controlButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  controlValue: { color: '#fff', fontSize: 18, fontWeight: 'bold', width: 60, textAlign: 'center' },
  linkButtons: { flexDirection: 'row', gap: 8, flex: 1 },
  linkButton: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#0f3460', borderRadius: 6 },
  linkButtonActive: { backgroundColor: '#e94560' },
  linkButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  infoText: { color: '#666', fontSize: 12, textAlign: 'center', marginVertical: 12 },
  actionButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  deleteButton: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#e74c3c', borderRadius: 8 },
  deleteButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  saveButton: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#2ecc71', borderRadius: 8 },
  saveModalButton: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#2ecc71', borderRadius: 8 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Name input modal styles
  nameInput: { 
    backgroundColor: '#1a1a2e', 
    borderWidth: 1, 
    borderColor: '#444', 
    borderRadius: 8, 
    padding: 12, 
    fontSize: 16, 
    color: '#fff', 
    marginBottom: 20 
  },
  cancelModalButton: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#666', borderRadius: 8 },
  cancelButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Toast styles
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2000,
  },
  toast: {
    backgroundColor: '#2ecc71',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
