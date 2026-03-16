import React, { useState, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  FlatList, 
  ActivityIndicator, 
  TouchableOpacity,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { listSongs, loadSong, deleteSong } from '../storage/songStorage';
import { SongMetadata } from '../types/song';
import { RootStackParamList } from '../../App';
import { preloadSamplesForSong, initAudio } from '../audio/guitarAudio';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Songs'>;

const EXTRA_LEFT_INSET = 16;

export default function SongsScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const [songs, setSongs] = useState<SongMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSong, setLoadingSong] = useState(false);
  const [selectedSongs, setSelectedSongs] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const loadSongsList = useCallback(async () => {
    setLoading(true);
    const songList = await listSongs();
    setSongs(songList);
    setLoading(false);
  }, []);

  // Reload songs when screen comes into focus and exit selection mode
  useFocusEffect(
    useCallback(() => {
      loadSongsList();
      // Exit selection mode when returning to screen
      setIsSelectionMode(false);
      setSelectedSongs(new Set());
    }, [loadSongsList])
  );

  // Handle long press to enter selection mode
  const handleLongPress = useCallback((songId: string) => {
    setIsSelectionMode(true);
    setSelectedSongs(new Set([songId]));
  }, []);

  // Handle tap in selection mode (toggle selection) or normal mode (play)
  const handleSongPress = useCallback(async (songId: string) => {
    if (isSelectionMode) {
      setSelectedSongs(prev => {
        const newSet = new Set(prev);
        if (newSet.has(songId)) {
          newSet.delete(songId);
          // Exit selection mode if no songs selected
          if (newSet.size === 0) {
            setIsSelectionMode(false);
          }
        } else {
          newSet.add(songId);
        }
        return newSet;
      });
    } else {
      // Show loading modal while preloading samples
      setLoadingSong(true);
      try {
        // Initialize audio mode
        await initAudio();
        
        const song = await loadSong(songId);
        if (song) {
          // Preload only the samples needed for this song
          await preloadSamplesForSong(song);
          navigation.navigate('Playalong', { song });
        }
      } catch (e) {
        console.error('Error loading song:', e);
        Alert.alert('Error', 'Failed to load song samples');
      } finally {
        setLoadingSong(false);
      }
    }
  }, [isSelectionMode, navigation]);

  // Cancel selection mode
  const handleCancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedSongs(new Set());
  }, []);

  // Delete selected songs
  const handleDeleteSelected = useCallback(() => {
    const count = selectedSongs.size;
    Alert.alert(
      'Delete Songs',
      `Are you sure you want to delete ${count} song${count > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const songId of selectedSongs) {
              deleteSong(songId);
            }
            setIsSelectionMode(false);
            setSelectedSongs(new Set());
            loadSongsList();
          },
        },
      ]
    );
  }, [selectedSongs, loadSongsList]);

  // Edit selected song (navigate to Editor with song data)
  const handleEditSelected = useCallback(async () => {
    const songId = Array.from(selectedSongs)[0];
    const song = await loadSong(songId);
    if (song) {
      setIsSelectionMode(false);
      setSelectedSongs(new Set());
      navigation.navigate('Editor', { song });
    }
  }, [selectedSongs, navigation]);

  // Navigate to blank editor for new song
  const handleCreateNewSong = useCallback(() => {
    navigation.navigate('Editor', { song: undefined });
  }, [navigation]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  const renderSongItem = ({ item }: { item: SongMetadata }) => {
    const isSelected = selectedSongs.has(item.id);
    
    return (
      <TouchableOpacity 
        style={[
          styles.songItem,
          isSelected && styles.songItemSelected,
        ]}
        onPress={() => handleSongPress(item.id)}
        onLongPress={() => handleLongPress(item.id)}
        activeOpacity={0.7}
        delayLongPress={300}
      >
        {isSelectionMode && (
          <View style={[
            styles.checkbox,
            isSelected && styles.checkboxSelected,
          ]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
        <View style={styles.songInfo}>
          <Text style={styles.songName}>{item.name}</Text>
          <Text style={styles.songMeta}>
            {item.bpm} BPM • Modified: {formatDate(item.lastModified)}
          </Text>
        </View>
        {!isSelectionMode && <Text style={styles.playIcon}>▶</Text>}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e94560" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Loading Overlay for sample preloading (using View instead of Modal to avoid iOS crash) */}
        {loadingSong && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color="#e94560" />
              <Text style={styles.loadingText}>Loading samples...</Text>
            </View>
          </View>
        )}

        {/* Selection mode header */}
        {isSelectionMode ? (
          <View style={styles.selectionHeader}>
            <TouchableOpacity onPress={handleCancelSelection} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.selectionCount}>
              {selectedSongs.size} selected
            </Text>
            <View style={styles.selectionActions}>
              {selectedSongs.size === 1 && (
                <TouchableOpacity onPress={handleEditSelected} style={styles.editButton}>
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleDeleteSelected} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.header}>
            <Text style={styles.title}>My Songs</Text>
            <TouchableOpacity onPress={handleCreateNewSong} style={styles.addButton}>
              <Text style={styles.addIcon}>+</Text>
            </TouchableOpacity>
          </View>
        )}
        {songs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No songs yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create your first song</Text>
          </View>
        ) : (
          <FlatList
            data={songs}
            keyExtractor={(item) => item.id}
            renderItem={renderSongItem}
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20 + EXTRA_LEFT_INSET,
    paddingRight: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 26,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingLeft: 20 + EXTRA_LEFT_INSET,
    paddingRight: 20,
    paddingBottom: 20,
  },
  songItem: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#e94560',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  songInfo: {
    flex: 1,
  },
  songName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  songMeta: {
    fontSize: 12,
    color: '#888',
  },
  playIcon: {
    fontSize: 18,
    color: '#e94560',
    marginLeft: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  // Selection mode styles
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20 + EXTRA_LEFT_INSET,
    paddingRight: 20,
    paddingVertical: 12,
    backgroundColor: '#0f3460',
    marginBottom: 8,
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: '#4a90d9',
    fontSize: 16,
  },
  selectionCount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#4a90d9',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  deleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#e94560',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  songItemSelected: {
    backgroundColor: '#1e3a5f',
    borderLeftColor: '#4a90d9',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#888',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#4a90d9',
    borderColor: '#4a90d9',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  loadingContent: {
    backgroundColor: '#16213e',
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
