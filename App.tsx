import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { initializeDefaultSongs } from './src/storage/songStorage';
import { SongsScreen, EditorScreen, PlayalongScreen } from './src/screens';
import { Song } from './src/types/song';

// Type definitions for navigation
export type RootStackParamList = {
  Songs: undefined;
  Editor: { song?: Song } | undefined;
  Playalong: { song: Song };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): React.JSX.Element {
  useEffect(() => {
    // Initialize default songs on first app launch
    initializeDefaultSongs();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Songs" component={SongsScreen} />
          <Stack.Screen 
            name="Editor" 
            component={EditorScreen}
            options={{
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen 
            name="Playalong" 
            component={PlayalongScreen}
            options={{
              animation: 'slide_from_right',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
