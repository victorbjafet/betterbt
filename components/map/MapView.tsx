import React from 'react';
import { Platform } from 'react-native';

const MapViewComponent: React.ComponentType<any> =
  Platform.OS === 'web'
    ? require('./MapView.web').default
    : require('./MapView.native').default;

export default MapViewComponent;
