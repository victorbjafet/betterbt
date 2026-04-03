import React from 'react';
import { Platform } from 'react-native';
import { TransitMapViewProps } from './types';

const MapViewComponent: React.ComponentType<TransitMapViewProps> =
  Platform.OS === 'web'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ? require('./MapView.web').default
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    : require('./MapView.native').default;

export default MapViewComponent;
