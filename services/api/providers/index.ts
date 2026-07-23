/**
 * Provider registry + selection.
 *
 * The active provider is chosen once from `API_PROVIDER` (config, env-overridable
 * via EXPO_PUBLIC_API_PROVIDER). Consumers go through the `btApi` facade and
 * never import a provider directly.
 */

import { API_PROVIDER, ApiProviderId } from '@/constants/config';
import { bt4uProvider } from './bt4u/bt4uProvider';
import { ridebtProvider } from './ridebt/ridebtProvider';
import { TransitApiProvider } from './types';

const PROVIDERS: Record<ApiProviderId, TransitApiProvider> = {
  ridebt: ridebtProvider,
  bt4u: bt4uProvider,
};

export const getTransitApiProvider = (): TransitApiProvider => PROVIDERS[API_PROVIDER] ?? ridebtProvider;

export type { TransitApiProvider } from './types';
