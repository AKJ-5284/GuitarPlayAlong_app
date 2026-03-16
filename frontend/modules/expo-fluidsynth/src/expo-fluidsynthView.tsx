import { requireNativeView } from 'expo';
import * as React from 'react';

import { expo-fluidsynthViewProps } from './expo-fluidsynth.types';

const NativeView: React.ComponentType<expo-fluidsynthViewProps> =
  requireNativeView('expo-fluidsynth');

export default function expo-fluidsynthView(props: expo-fluidsynthViewProps) {
  return <NativeView {...props} />;
}
