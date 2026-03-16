import { Song, SongData, GuitarEvent } from '../types/song';
import { Paths, File, Directory } from 'expo-file-system';

/**
 * Guitar standard tuning MIDI note numbers
 * String 1 (high E) = E4 = 64
 * String 2 (B) = B3 = 59
 * String 3 (G) = G3 = 55
 * String 4 (D) = D3 = 50
 * String 5 (A) = A2 = 45
 * String 6 (low E) = E2 = 40
 */
const STRING_BASE_NOTES = [64, 59, 55, 50, 45, 40];

const isSongData = (value: Song | SongData): value is SongData => {
  return 'metadata' in value && 'timing' in value;
};

/**
 * Convert string/fret to MIDI note number
 */
function stringFretToMidi(stringNumber: number, fret: number): number {
  if (stringNumber < 1 || stringNumber > 6) {
    throw new Error(`Invalid string number: ${stringNumber}`);
  }
  return STRING_BASE_NOTES[stringNumber - 1] + fret;
}

/**
 * Write a variable-length quantity (VLQ) for MIDI delta times
 */
function writeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  
  const bytes: number[] = [];
  let v = value;
  
  bytes.unshift(v & 0x7F);
  v >>= 7;
  
  while (v > 0) {
    bytes.unshift((v & 0x7F) | 0x80);
    v >>= 7;
  }
  
  return bytes;
}

/**
 * Convert a number to big-endian bytes
 */
function toBytes(value: number, byteCount: number): number[] {
  const bytes: number[] = [];
  for (let i = byteCount - 1; i >= 0; i--) {
    bytes.push((value >> (i * 8)) & 0xFF);
  }
  return bytes;
}

/**
 * Export a Song to MIDI format (Standard MIDI File Format 0)
 * Returns the file path where the MIDI was saved
 */
export async function exportSongToMidi(song: Song | SongData): Promise<string> {
  const songName = isSongData(song) ? song.metadata.title : song.name;
  const songBpm = isSongData(song) ? song.metadata.bpm : song.bpm;
  const beatsPerBar = isSongData(song) ? song.metadata.beatsPerBar : song.beatsPerBar;
  const songId = isSongData(song) ? song.metadata.id : song.id;
  const msPerBeat = isSongData(song)
    ? (song.timing.msPerBeat > 0 ? song.timing.msPerBeat : (60000 / song.metadata.bpm))
    : (60000 / song.bpm);

  console.log(`[MidiExport] Exporting song "${songName}" at ${songBpm} BPM`);

  const ticksPerBeat = 480; // Standard resolution
  const microsecondsPerBeat = Math.round(60000000 / songBpm);
  
  // Collect all notes from all tracks
  interface MidiEvent {
    tick: number;
    type: 'noteOn' | 'noteOff';
    channel: number;
    note: number;
    velocity: number;
  }
  
  const events: MidiEvent[] = [];
  
  if (isSongData(song)) {
    const tuning = song.metadata.tuning?.length === 6 ? song.metadata.tuning : STRING_BASE_NOTES;
    const allEvents: GuitarEvent[] = [
      ...song.tracks.lead,
      ...(song.tracks.rhythm || []),
      ...(song.tracks.bass || []),
    ];

    for (const event of allEvents) {
      const channel = Math.max(0, Math.min(5, event.s));
      const midiNote = tuning[channel] + event.f;
      const startBeat = event.t / msPerBeat;
      const endBeat = (event.t + event.d) / msPerBeat;
      const startTick = Math.round(startBeat * ticksPerBeat);
      const endTick = Math.round(endBeat * ticksPerBeat);

      let velocity = 100;
      if (typeof event.v === 'number') {
        velocity = Math.max(1, Math.min(127, Math.round(event.v * 127)));
      } else if (event.acc === 'h') {
        velocity = 75;
      } else if (event.acc === 'p') {
        velocity = 65;
      }

      events.push({
        tick: startTick,
        type: 'noteOn',
        channel,
        note: midiNote,
        velocity,
      });

      events.push({
        tick: endTick,
        type: 'noteOff',
        channel,
        note: midiNote,
        velocity: 0,
      });
    }
  } else {
    // Debug: Log raw notes from legacy Song
    const allNotes: { beat: number; len: number; string: number; fret: number }[] = [];
    for (const track of song.tracks) {
      for (const note of track.notes) {
        allNotes.push({ beat: note.beat, len: note.len, string: track.string, fret: note.fret });
      }
    }
    allNotes.sort((a, b) => a.beat - b.beat);
    console.log('[MidiExport] Raw notes from song:', JSON.stringify(allNotes.slice(0, 10)));

    for (const track of song.tracks) {
      const channel = track.string - 1;

      for (const note of track.notes) {
        const midiNote = stringFretToMidi(track.string, note.fret);
        const startTick = Math.round(note.beat * ticksPerBeat);
        const endTick = Math.round((note.beat + note.len) * ticksPerBeat);

        let velocity = 100;
        if (note.linkNext === 'h') {
          velocity = 75;
        } else if (note.linkNext === 'p') {
          velocity = 65;
        }

        events.push({
          tick: startTick,
          type: 'noteOn',
          channel,
          note: midiNote,
          velocity,
        });

        events.push({
          tick: endTick,
          type: 'noteOff',
          channel,
          note: midiNote,
          velocity: 0,
        });
      }
    }
  }
  
  // Sort events by tick, with noteOff before noteOn at same tick
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    // noteOff before noteOn at same tick
    if (a.type === 'noteOff' && b.type === 'noteOn') return -1;
    if (a.type === 'noteOn' && b.type === 'noteOff') return 1;
    return 0;
  });
  
  const totalNotes = events.filter(e => e.type === 'noteOn').length;
  console.log(`[MidiExport] Collected ${totalNotes} notes, ${events.length} total events`);
  
  if (totalNotes === 0) {
    console.warn('[MidiExport] WARNING: Song has no notes to export!');
  }
  
  // Debug: Log first few events to verify timing
  console.log('[MidiExport] First 10 events:', events.slice(0, 10).map(e => 
    `${e.type}@tick${e.tick} ch${e.channel} note${e.note}`
  ));
  
  // Build track data
  const trackData: number[] = [];
  
  // Tempo meta event: FF 51 03 tt tt tt (microseconds per beat)
  trackData.push(...writeVLQ(0)); // Delta time 0
  trackData.push(0xFF, 0x51, 0x03);
  trackData.push(...toBytes(microsecondsPerBeat, 3));
  
  // Time signature meta event: FF 58 04 nn dd cc bb
  trackData.push(...writeVLQ(0)); // Delta time 0
  trackData.push(0xFF, 0x58, 0x04);
  trackData.push(beatsPerBar, 2, 24, 8); // beatsPerBar/4, quarter note, 24 clocks/tick, 8 32nds/quarter
  
  // Program change for each channel (guitar preset 24 = nylon guitar)
  for (let ch = 0; ch < 6; ch++) {
    trackData.push(...writeVLQ(0)); // Delta time 0
    trackData.push(0xC0 | ch, 24); // Program change to nylon guitar
  }
  
  // Add note events
  let lastTick = 0;
  const deltaLog: string[] = [];
  for (const event of events) {
    const deltaTick = event.tick - lastTick;
    lastTick = event.tick;
    
    if (deltaLog.length < 15) {
      deltaLog.push(`delta=${deltaTick} (tick=${event.tick})`);
    }
    
    trackData.push(...writeVLQ(deltaTick));
    
    if (event.type === 'noteOn') {
      trackData.push(0x90 | event.channel, event.note, event.velocity);
    } else {
      trackData.push(0x80 | event.channel, event.note, 0);
    }
  }
  
  console.log('[MidiExport] Delta times:', deltaLog);
  
  // End of track meta event
  trackData.push(...writeVLQ(0));
  trackData.push(0xFF, 0x2F, 0x00);
  
  // Build complete MIDI file
  const midiData: number[] = [];
  
  // Header chunk: MThd
  midiData.push(0x4D, 0x54, 0x68, 0x64); // "MThd"
  midiData.push(...toBytes(6, 4)); // Header length = 6
  midiData.push(...toBytes(0, 2)); // Format 0 (single track)
  midiData.push(...toBytes(1, 2)); // 1 track
  midiData.push(...toBytes(ticksPerBeat, 2)); // Ticks per beat
  
  // Track chunk: MTrk
  midiData.push(0x4D, 0x54, 0x72, 0x6B); // "MTrk"
  midiData.push(...toBytes(trackData.length, 4)); // Track length
  midiData.push(...trackData);
  
  // Convert to Uint8Array
  const bytes = new Uint8Array(midiData);
  
  // Save to cache directory
  const fileName = `${songId}_${Date.now()}.mid`;
  const cacheDir = new Directory(Paths.cache);
  if (!cacheDir.exists) {
    cacheDir.create();
  }
  const file = new File(cacheDir, fileName);
  file.write(bytes);
  
  // Convert URI to path (strip file:// scheme for native use)
  const filePath = file.uri.replace(/^file:\/\//, '');
  
  console.log(`[MidiExport] Exported ${totalNotes} notes (${bytes.length} bytes) to ${filePath}`);
  
  return filePath;
}

/**
 * Delete a previously exported MIDI file
 */
export async function deleteMidiFile(filePath: string): Promise<void> {
  try {
    // Add file:// scheme back if needed for expo-file-system
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    const file = new File(uri);
    if (file.exists) {
      file.delete();
      console.log(`[MidiExport] Deleted ${filePath}`);
    }
  } catch (e) {
    console.warn('[MidiExport] Failed to delete MIDI file:', e);
  }
}
