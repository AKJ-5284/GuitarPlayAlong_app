import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { initializeDefaultSongs } from './src/storage/songStorage';
import { SongsScreen, EditorScreen, PlayalongScreen, DebugPlayalongScreen } from './src/screens';
import { Song } from './src/types/song';

// Type definitions for navigation
export type RootStackParamList = {
  MainTabs: undefined;
  Playalong: { song: Song };
};

export type TabParamList = {
  Songs: undefined;
  Editor: { song?: Song } | undefined;
  Debug: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#16213e',
          borderTopColor: '#0f3460',
        },
        tabBarActiveTintColor: '#e94560',
        tabBarInactiveTintColor: '#888',
      }}
    >
      <Tab.Screen
        name="Songs"
        component={SongsScreen}
        options={{
          tabBarLabel: 'My Songs',
        }}
      />
      <Tab.Screen
        name="Editor"
        component={EditorScreen}
        options={{
          tabBarLabel: 'Editor',
        }}
      />
      <Tab.Screen
        name="Debug"
        component={DebugPlayalongScreen}
        options={{
          tabBarLabel: 'Debug',
        }}
      />
    </Tab.Navigator>
  );
}

export default function App(): React.JSX.Element {
  useEffect(() => {
    // Initialize default songs on first app launch
    initializeDefaultSongs();
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={MainTabs} />
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
