import { requireNativeModule } from 'expo';

import { ExpoFluidsynthModule } from './expo-fluidsynth.types';

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoFluidsynthModule>('expo-fluidsynth');
