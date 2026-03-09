import * as React from 'react';

import { expo-fluidsynthViewProps } from './expo-fluidsynth.types';

export default function expo-fluidsynthView(props: expo-fluidsynthViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
