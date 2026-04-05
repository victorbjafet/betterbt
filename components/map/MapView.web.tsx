/**
 * MapView (Web Implementation)
 * Uses react-leaflet for a fully interactive map with geospatially anchored markers.
 * Platform-specific: file loaded on web via Expo Router
 */

import { MAP_CONFIG, REFRESH_INTERVALS } from '@/constants/config';
import { blendCoordinates, distanceMeters, interpolateCoordinate, predictBusCoordinate } from '@/services/map/busPrediction';
import { Bus, RouteGeometryPath, Stop } from '@/types/transit';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TransitMapViewProps } from './types';

type LeafletLikeComponent = React.ComponentType<Record<string, unknown>>;

type LeafletModules = {
  MapContainer: LeafletLikeComponent;
  TileLayer: LeafletLikeComponent;
  Marker: LeafletLikeComponent;
  Tooltip: LeafletLikeComponent;
  CircleMarker: LeafletLikeComponent;
  Polyline: LeafletLikeComponent;
  useMap: () => import('leaflet').Map;
  L: typeof import('leaflet');
};

type LeafletInteractionEvent = {
  originalEvent?: {
    stopPropagation?: () => void;
    target?: EventTarget | null;
  };
  latlng?: {
    lat: number;
    lng: number;
  };
};

export default function TransitMapView({
  buses,
  stops = [],
  stopDeparturesById = {},
  routePaths = [],
  predictionRoutePaths,
  selectedRouteId,
  resetViewToken = 0,
  fullscreenViewToken = 0,
  layoutVersion = 0,
  focusedBus,
  focusedStop,
  onBusPress,
  onStopPress,
  onStopInfoPress,
  onMapPress,
}: TransitMapViewProps) {
  const SNAP_TO_REAL_POSITION_METERS = 28;
  const LOW_MOVEMENT_THRESHOLD_METERS = 8;
  const LOW_MOVEMENT_END_BLEND_FACTOR = 0.45;
  const LOW_MOVEMENT_DURATION_MULTIPLIER = 1.6;
  const STOP_SELECTION_RADIUS_METERS = 28;

  const [leaflet, setLeaflet] = useState<LeafletModules | null>(null);
  const [leafletLoadError, setLeafletLoadError] = useState<string | null>(null);
  const [isLeafletLoadTimedOut, setIsLeafletLoadTimedOut] = useState(false);
  const [mapZoom, setMapZoom] = useState<number>(MAP_CONFIG.INITIAL_ZOOM);
  const motionTrackRef = useRef<Record<string, {
    start: { latitude: number; longitude: number };
    end: { latitude: number; longitude: number };
    startedAtMs: number;
    durationMs: number;
  }>>({});
  const predictedEndpointRef = useRef<Record<string, { latitude: number; longitude: number }>>({});
  const [displayBuses, setDisplayBuses] = useState<Bus[]>(buses);
  const [clickedBus, setClickedBus] = useState<{ key: string; latitude: number; longitude: number } | null>(null);
  const lastAutoFocusedRouteKey = useRef<string | null>(null);
  const didAutoFitAllBuses = useRef(false);
  const lastHandledBusFocusKey = useRef<string | null>(null);
  const lastHandledStopFocusKey = useRef<string | null>(null);
  const lastHandledResetToken = useRef(-1);
  const lastHandledViewportToken = useRef('');
  const lastFocusedBusId = useRef<string | null>(null);
  const lastMarkerInteractionAtRef = useRef(0);

  useEffect(() => {
    const now = Date.now();

    setDisplayBuses((previousDisplayBuses) => {
      const previousById = new Map(
        previousDisplayBuses.map((bus) => [bus.id, { latitude: bus.latitude, longitude: bus.longitude }])
      );

      const nextTrackById: Record<string, {
        start: { latitude: number; longitude: number };
        end: { latitude: number; longitude: number };
        startedAtMs: number;
        durationMs: number;
      }> = {};
      const nextPredictedEndpoints: Record<string, { latitude: number; longitude: number }> = {};

      const seeded = buses.map((bus) => {
        const realPosition = { latitude: bus.latitude, longitude: bus.longitude };
        const predictionPaths = (predictionRoutePaths ?? routePaths).filter((path) => path.routeId === bus.routeId);
        const predictedEnd = predictBusCoordinate(bus, now, predictionPaths, {
          stops,
          horizonSeconds: REFRESH_INTERVALS.VEHICLES / 1000,
        });

        const previousPredicted = predictedEndpointRef.current[bus.id];
        const shouldSnapToReal =
          Boolean(previousPredicted) &&
          distanceMeters(previousPredicted!, realPosition) > SNAP_TO_REAL_POSITION_METERS;

        const start = shouldSnapToReal
          ? realPosition
          : (previousById.get(bus.id) ?? realPosition);

        const movementMeters = distanceMeters(start, realPosition);
        const hasLowMovement = movementMeters > 0 && movementMeters <= LOW_MOVEMENT_THRESHOLD_METERS;
        const end = hasLowMovement
          ? blendCoordinates(start, predictedEnd, LOW_MOVEMENT_END_BLEND_FACTOR)
          : predictedEnd;
        const durationMs = hasLowMovement
          ? Math.round(REFRESH_INTERVALS.VEHICLES * LOW_MOVEMENT_DURATION_MULTIPLIER)
          : REFRESH_INTERVALS.VEHICLES;

        nextTrackById[bus.id] = {
          start,
          end,
          startedAtMs: now,
          durationMs,
        };
        nextPredictedEndpoints[bus.id] = end;

        return {
          ...bus,
          latitude: start.latitude,
          longitude: start.longitude,
        };
      });

      motionTrackRef.current = nextTrackById;
      predictedEndpointRef.current = nextPredictedEndpoints;

      return seeded;
    });
  }, [buses, predictionRoutePaths, routePaths, stops]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      setDisplayBuses((previousBuses) => {
        return previousBuses.map((bus) => {
          const track = motionTrackRef.current[bus.id];
          if (!track) return bus;

          const progress = Math.min(Math.max((now - track.startedAtMs) / track.durationMs, 0), 1);
          const interpolated = interpolateCoordinate(track.start, track.end, progress);

          return {
            ...bus,
            latitude: interpolated.latitude,
            longitude: interpolated.longitude,
          };
        });
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedRouteId) {
      setClickedBus(null);
      lastHandledBusFocusKey.current = null;
    }
  }, [selectedRouteId]);

  useEffect(() => {
    const currentFocusedBusId = focusedBus?.id ?? null;

    // If user clears a previously focused bus, drop marker-click fallback so viewport stays put.
    if (lastFocusedBusId.current && !currentFocusedBusId) {
      setClickedBus(null);
      lastHandledBusFocusKey.current = null;
    }

    lastFocusedBusId.current = currentFocusedBusId;
  }, [focusedBus]);

  useEffect(() => {
    const styleId = 'betterbt-leaflet-runtime-css';
    if (document.getElementById(styleId)) return;

    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      .leaflet-container {
        overflow: hidden;
        outline: 0;
      }
      .leaflet-pane,
      .leaflet-tile,
      .leaflet-marker-icon,
      .leaflet-marker-shadow,
      .leaflet-tile-container,
      .leaflet-pane > svg,
      .leaflet-pane > canvas {
        position: absolute;
        left: 0;
        top: 0;
      }
      .leaflet-tile,
      .leaflet-marker-icon,
      .leaflet-marker-shadow {
        user-select: none;
        -webkit-user-drag: none;
      }
      .leaflet-container img,
      .leaflet-container svg,
      .leaflet-container canvas {
        max-width: none !important;
        max-height: none !important;
      }
      .leaflet-tile {
        width: 256px;
        height: 256px;
      }
      .leaflet-zoom-animated {
        transform-origin: 0 0;
      }
      .leaflet-pane { z-index: 400; }
      .leaflet-tile-pane { z-index: 200; }
      .leaflet-overlay-pane { z-index: 400; }
      .leaflet-marker-pane { z-index: 600; }
      .leaflet-popup-pane { z-index: 700; }
      .leaflet-control { z-index: 800; position: relative; }
      .leaflet-popup-content-wrapper {
        background: rgba(9, 14, 27, 0.92);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      }
      .leaflet-popup-content {
        margin: 0;
      }
      .leaflet-popup-tip {
        background: rgba(9, 14, 27, 0.92);
      }
      .betterbt-popup {
        color: #f3f4f6;
        min-width: 220px;
        padding: 10px 12px;
        font: 500 13px/1.35 ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .betterbt-popup-route {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-weight: 700;
      }
      .betterbt-popup-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 28px;
        padding: 0 8px;
        border-radius: 999px;
        color: #ffffff;
        border: 2px solid rgba(255, 255, 255, 0.85);
        font-size: 11px;
        line-height: 1;
      }
      .betterbt-popup-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        row-gap: 4px;
        column-gap: 8px;
      }
      .betterbt-popup-label {
        color: #9ca3af;
      }
      .betterbt-popup-value {
        color: #f9fafb;
      }
      .betterbt-selected-bus-tooltip {
        background: rgba(9, 14, 27, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
        padding: 0;
      }
      .betterbt-selected-bus-tooltip::before {
        border-top-color: rgba(9, 14, 27, 0.94);
      }
      .betterbt-selected-bus-tooltip .betterbt-popup {
        min-width: 132px;
        padding: 6px 7px;
        font: 500 8px/1.28 ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .betterbt-selected-bus-tooltip .betterbt-popup-route {
        gap: 5px;
        margin-bottom: 5px;
      }
      .betterbt-selected-bus-tooltip .betterbt-popup-chip {
        min-width: 17px;
        height: 17px;
        padding: 0 5px;
        border-width: 1px;
        font-size: 7px;
      }
      .betterbt-selected-bus-tooltip .betterbt-popup-grid {
        row-gap: 2px;
        column-gap: 5px;
      }
      .betterbt-selected-stop-tooltip {
        background: rgba(9, 14, 27, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
        padding: 0;
      }
      .betterbt-selected-stop-tooltip::before {
        border-top-color: rgba(9, 14, 27, 0.94);
      }
      .betterbt-stop-focus-card {
        min-width: 156px;
        padding: 8px 10px;
        color: #f3f4f6;
        font: 600 11px/1.3 ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .betterbt-stop-focus-title {
        margin-bottom: 7px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .betterbt-stop-focus-id {
        margin-bottom: 7px;
        color: #cbd5e1;
        font: 500 10px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .betterbt-stop-focus-button {
        border: 1px solid rgba(255, 255, 255, 0.28);
        background: rgba(255, 255, 255, 0.08);
        color: #f9fafb;
        border-radius: 999px;
        padding: 4px 9px;
        font: 600 10px/1.1 ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: default;
      }
    `;

    document.head.appendChild(styleEl);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let didFinishLoad = false;
    const timeoutId = window.setTimeout(() => {
      if (!isMounted) return;
      if (!didFinishLoad) {
        setIsLeafletLoadTimedOut(true);
      }
    }, 8000);

    const loadLeaflet = async () => {
      try {
        const [reactLeaflet, leafletLib] = await Promise.all([
          import('react-leaflet'),
          import('leaflet'),
        ]);

        if (!isMounted) return;
        didFinishLoad = true;

        setLeaflet({
          MapContainer: reactLeaflet.MapContainer as unknown as LeafletLikeComponent,
          TileLayer: reactLeaflet.TileLayer as unknown as LeafletLikeComponent,
          Marker: reactLeaflet.Marker as unknown as LeafletLikeComponent,
          Tooltip: reactLeaflet.Tooltip as unknown as LeafletLikeComponent,
          CircleMarker: reactLeaflet.CircleMarker as unknown as LeafletLikeComponent,
          Polyline: reactLeaflet.Polyline as unknown as LeafletLikeComponent,
          useMap: reactLeaflet.useMap,
          L: leafletLib,
        });
      } catch (error) {
        if (!isMounted) return;
        didFinishLoad = true;
        setLeafletLoadError(error instanceof Error ? error.message : 'Unknown map initialization error');
      }
    };

    void loadLeaflet();

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const filteredBuses = !selectedRouteId
    ? displayBuses
    : displayBuses.filter((bus) => bus.routeId === selectedRouteId);

  const filteredStops = !selectedRouteId
    ? stops
    : stops.filter((stop) => stop.routes.includes(selectedRouteId));

  const selectNearestStopFromPoint = (latitude: number, longitude: number) => {
    if (filteredStops.length === 0) return false;

    const tappedPoint = { latitude, longitude };
    let nearestStop: Stop | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const stop of filteredStops) {
      const stopPoint = { latitude: stop.latitude, longitude: stop.longitude };
      const meters = distanceMeters(tappedPoint, stopPoint);
      if (meters < nearestDistance) {
        nearestDistance = meters;
        nearestStop = stop;
      }
    }

    // Keep generous geometry snapping but avoid selecting distant nearby stops.
    if (!nearestStop || nearestDistance > STOP_SELECTION_RADIUS_METERS) return false;

    lastMarkerInteractionAtRef.current = Date.now();
    onStopPress?.(nearestStop);
    return true;
  };

  const center: [number, number] =
    filteredBuses.length > 0
      ? [filteredBuses[0].latitude, filteredBuses[0].longitude]
      : [MAP_CONFIG.INITIAL_LATITUDE, MAP_CONFIG.INITIAL_LONGITUDE];

  const busIcons = useMemo(() => {
    if (!leaflet) return {} as Record<string, import('leaflet').DivIcon>;

    return filteredBuses.reduce<Record<string, import('leaflet').DivIcon>>((acc, bus) => {
      acc[bus.id] = leaflet.L.divIcon({
        className: 'betterbt-bus-icon',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        html: `<div style="width:34px;height:34px;border-radius:17px;background:${bus.routeColor};border:2px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);font:700 10px/1 sans-serif;transform:rotate(${bus.heading}deg);position:relative;"><span style="position:absolute;top:3px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid #fff;"></span>${bus.routeId}</div>`,
      });
      return acc;
    }, {});
  }, [filteredBuses, leaflet]);

  const selectedBusLive = useMemo(() => {
    if (!focusedBus) return null;
    return filteredBuses.find((bus) => bus.id === focusedBus.id) ?? null;
  }, [filteredBuses, focusedBus]);

  const renderBusPopupContent = (bus: Bus) => {
    const estimatedPassengers =
      typeof bus.capacity === 'number' && typeof bus.occupancyPercent === 'number'
        ? Math.round((bus.capacity * bus.occupancyPercent) / 100)
        : null;

    return (
      <div className="betterbt-popup">
        <div className="betterbt-popup-route">
          <span className="betterbt-popup-chip" style={{ backgroundColor: bus.routeColor }}>
            {bus.routeId}
          </span>
          <span>{bus.routeName}</span>
        </div>

        <div className="betterbt-popup-grid">
          <span className="betterbt-popup-label">Bus</span>
          <span className="betterbt-popup-value">#{bus.id}</span>

          <span className="betterbt-popup-label">Speed</span>
          <span className="betterbt-popup-value">{Math.round(bus.speed)} mph</span>

          {typeof bus.currentStopId === 'string' && bus.currentStopId.length > 0 && (
            <>
              <span className="betterbt-popup-label">Current stop</span>
              <span className="betterbt-popup-value">{bus.currentStopId}</span>
            </>
          )}

          {typeof bus.capacity === 'number' && (
            <>
              <span className="betterbt-popup-label">Capacity</span>
              <span className="betterbt-popup-value">{bus.capacity}</span>
            </>
          )}

          <span className="betterbt-popup-label">Passengers (estimated)</span>
          <span className="betterbt-popup-value">{estimatedPassengers ?? 'N/A'}</span>

          {typeof bus.occupancyPercent === 'number' && (
            <>
              <span className="betterbt-popup-label">Occupancy</span>
              <span className="betterbt-popup-value">{Math.round(bus.occupancyPercent)}%</span>
            </>
          )}
        </div>
      </div>
    );
  };

  const focusedBusTarget = useMemo(() => {
    if (selectedBusLive) {
      return {
        key: `follow-${selectedBusLive.id}-${selectedBusLive.latitude.toFixed(5)}-${selectedBusLive.longitude.toFixed(5)}`,
        latitude: selectedBusLive.latitude,
        longitude: selectedBusLive.longitude,
        follow: true,
      };
    }

    if (clickedBus) {
      return {
        ...clickedBus,
        follow: false,
      };
    }

    return null;
  }, [clickedBus, selectedBusLive]);

  const visibleStops = useMemo(() => {
    if (mapZoom <= 12) return [];
    if (mapZoom <= 14) return filteredStops.slice(0, 180);
    return filteredStops;
  }, [filteredStops, mapZoom]);

  if (leafletLoadError) {
    return <div style={styles.errorState}>Map unavailable: {leafletLoadError}</div>;
  }

  if (isLeafletLoadTimedOut && !leaflet) {
    return <div style={styles.errorState}>Map is taking too long to initialize. Check your network and retry.</div>;
  }

  if (!leaflet) {
    return <div style={styles.loadingState}>Loading map...</div>;
  }

  const { MapContainer, TileLayer, Marker, Tooltip, CircleMarker, Polyline } = leaflet;

  const FocusRouteBuses: React.FC<{ busesOnRoute: Bus[]; routeGeometry: RouteGeometryPath[]; activeRouteId?: string }> = ({
    busesOnRoute,
    routeGeometry,
    activeRouteId,
  }) => {
    const map = leaflet.useMap();

    useEffect(() => {
      if (!activeRouteId) {
        lastAutoFocusedRouteKey.current = null;
        return;
      }

      const routeFocusKey = `${activeRouteId}:${routeGeometry.map((path) => path.id).join('|')}`;
      if (lastAutoFocusedRouteKey.current === routeFocusKey) return;

      const routeCoordinates = routeGeometry.flatMap((path) => path.coordinates);

      if (busesOnRoute.length === 0 && routeCoordinates.length === 0) return;

      if (routeCoordinates.length <= 1 && busesOnRoute.length <= 1) {
        const target = routeCoordinates[0] || busesOnRoute[0];
        map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 16), {
          animate: true,
          duration: 0.6,
        });
        lastAutoFocusedRouteKey.current = routeFocusKey;
        return;
      }

      const focusPoints = routeCoordinates.length > 0
        ? routeCoordinates
        : busesOnRoute.map((bus) => ({ latitude: bus.latitude, longitude: bus.longitude }));

      const latitudes = focusPoints.map((point) => point.latitude);
      const longitudes = focusPoints.map((point) => point.longitude);

      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const minLng = Math.min(...longitudes);
      const maxLng = Math.max(...longitudes);

      map.fitBounds(
        [
          [minLat, minLng],
          [maxLat, maxLng],
        ],
        {
          padding: [48, 48],
          animate: true,
          duration: 0.6,
          maxZoom: 16,
        }
      );

      lastAutoFocusedRouteKey.current = routeFocusKey;
    }, [activeRouteId, busesOnRoute, map, routeGeometry]);

    return null;
  };

  const FocusAllBuses: React.FC<{ allBuses: Bus[]; activeRouteId?: string }> = ({ allBuses, activeRouteId }) => {
    const map = leaflet.useMap();

    useEffect(() => {
      if (activeRouteId) {
        didAutoFitAllBuses.current = false;
        return;
      }

      if (didAutoFitAllBuses.current) return;
      if (allBuses.length === 0) return;

      if (allBuses.length === 1) {
        const onlyBus = allBuses[0];
        map.flyTo([onlyBus.latitude, onlyBus.longitude], Math.max(map.getZoom(), 16), {
          animate: true,
          duration: 0.55,
        });
        didAutoFitAllBuses.current = true;
        return;
      }

      const latitudes = allBuses.map((bus) => bus.latitude);
      const longitudes = allBuses.map((bus) => bus.longitude);

      map.fitBounds(
        [
          [Math.min(...latitudes), Math.min(...longitudes)],
          [Math.max(...latitudes), Math.max(...longitudes)],
        ],
        {
          padding: [56, 56],
          animate: true,
          duration: 0.65,
          maxZoom: 16,
        }
      );

      didAutoFitAllBuses.current = true;
    }, [activeRouteId, allBuses, map]);

    return null;
  };

  const FlyToBus: React.FC<{ target: { key: string; latitude: number; longitude: number; follow: boolean } | null }> = ({ target }) => {
    const map = leaflet.useMap();

    useEffect(() => {
      if (!target) {
        lastHandledBusFocusKey.current = null;
        return;
      }
      if (lastHandledBusFocusKey.current === target.key) return;

      map.stop();

      const targetZoom = target.follow ? Math.max(map.getZoom(), 17) : Math.max(map.getZoom(), 16);
      if (target.follow) {
        // For continuous follow updates, use non-animated setView to avoid tile/overlay desync.
        map.setView([target.latitude, target.longitude], targetZoom, { animate: false });
      } else {
        map.flyTo([target.latitude, target.longitude], targetZoom, {
          animate: true,
          duration: 0.55,
        });
      }

      map.invalidateSize({ pan: false });
      lastHandledBusFocusKey.current = target.key;
    }, [map, target]);

    return null;
  };

  const FlyToStop: React.FC<{ target: Stop | null | undefined }> = ({ target }) => {
    const map = leaflet.useMap();

    useEffect(() => {
      if (!target) {
        lastHandledStopFocusKey.current = null;
        return;
      }

      if (lastHandledStopFocusKey.current === target.id) return;

      map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 17), {
        animate: true,
        duration: 0.55,
      });
      lastHandledStopFocusKey.current = target.id;
    }, [map, target]);

    return null;
  };

  const HandleMapBackgroundClick: React.FC = () => {
    const map = leaflet.useMap();
    type LeafletMouseEvent = import('leaflet').LeafletMouseEvent;

    useEffect(() => {
      const onClick = (event: LeafletMouseEvent) => {
        if (Date.now() - lastMarkerInteractionAtRef.current < 300) {
          return;
        }

        const clickTarget = event?.originalEvent?.target as HTMLElement | null;
        if (clickTarget?.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-interactive')) {
          return;
        }

        const latlng = event?.latlng;
        if (selectedRouteId && latlng && selectNearestStopFromPoint(latlng.lat, latlng.lng)) {
          return;
        }

        setClickedBus(null);
        lastHandledBusFocusKey.current = null;
        onMapPress?.();
      };

      map.on('click', onClick);
      return () => {
        map.off('click', onClick);
      };
    }, [map]);

    return null;
  };

  const HandleZoomTracking: React.FC = () => {
    const map = leaflet.useMap();

    useEffect(() => {
      const handleZoomEnd = () => {
        setMapZoom(map.getZoom());
      };

      handleZoomEnd();
      map.on('zoomend', handleZoomEnd);
      return () => {
        map.off('zoomend', handleZoomEnd);
      };
    }, [map]);

    return null;
  };

  const HandleMapResize: React.FC = () => {
    const map = leaflet.useMap();

    useEffect(() => {
      const container = map.getContainer();

      const invalidate = () => {
        map.invalidateSize({ pan: false });
      };

      // Run immediately and after paint to catch expand/collapse layout transitions.
      invalidate();
      const animationFrameId = requestAnimationFrame(invalidate);
      const timeoutId = window.setTimeout(invalidate, 120);

      const observer = new ResizeObserver(() => {
        invalidate();
      });

      observer.observe(container);
      window.addEventListener('resize', invalidate);

      return () => {
        cancelAnimationFrame(animationFrameId);
        window.clearTimeout(timeoutId);
        observer.disconnect();
        window.removeEventListener('resize', invalidate);
      };
    }, [map]);

    return null;
  };

  const ResetViewport: React.FC<{ token: number; allBuses: Bus[] }> = ({ token, allBuses }) => {
    const map = leaflet.useMap();

    useEffect(() => {
      if (token <= 0) return;
      if (lastHandledResetToken.current === token) return;

      map.stop();

      if (allBuses.length > 0) {
        const latitudes = allBuses.map((bus) => bus.latitude);
        const longitudes = allBuses.map((bus) => bus.longitude);

        if (allBuses.length === 1) {
          map.flyTo([allBuses[0].latitude, allBuses[0].longitude], Math.max(map.getZoom(), 16), {
            animate: true,
            duration: 0.55,
          });
        } else {
          map.fitBounds(
            [
              [Math.min(...latitudes), Math.min(...longitudes)],
              [Math.max(...latitudes), Math.max(...longitudes)],
            ],
            {
              padding: [56, 56],
              animate: true,
              duration: 0.65,
              maxZoom: 16,
            }
          );
        }
      } else {
        map.flyTo([MAP_CONFIG.INITIAL_LATITUDE, MAP_CONFIG.INITIAL_LONGITUDE], MAP_CONFIG.INITIAL_ZOOM, {
          animate: true,
          duration: 0.6,
        });
      }

      setClickedBus(null);
      lastAutoFocusedRouteKey.current = null;
      didAutoFitAllBuses.current = false;
      lastHandledBusFocusKey.current = null;
      lastHandledStopFocusKey.current = null;
      lastHandledResetToken.current = token;
    }, [allBuses, map, token]);

    return null;
  };

  const RecenterOnViewportChange: React.FC<{
    fullscreenToken: number;
    layoutToken: number;
    allBuses: Bus[];
    activeRouteId?: string;
    routeGeometry: RouteGeometryPath[];
    focusedBus: Bus | null;
  }> = ({ fullscreenToken, layoutToken, allBuses, activeRouteId, routeGeometry, focusedBus }) => {
    const map = leaflet.useMap();

    useEffect(() => {
      if (fullscreenToken <= 0 && layoutToken <= 0) return;

      const viewportToken = `${fullscreenToken}:${layoutToken}`;
      if (lastHandledViewportToken.current === viewportToken) return;

      map.stop();
      map.invalidateSize({ pan: false });

      if (focusedBus) {
        map.flyTo([focusedBus.latitude, focusedBus.longitude], Math.max(map.getZoom(), 17), {
          animate: true,
          duration: 0.55,
        });
      } else if (activeRouteId) {
        const routeCoordinates = routeGeometry.flatMap((path) => path.coordinates);

        if (routeCoordinates.length > 0) {
          const latitudes = routeCoordinates.map((point) => point.latitude);
          const longitudes = routeCoordinates.map((point) => point.longitude);
          map.fitBounds(
            [
              [Math.min(...latitudes), Math.min(...longitudes)],
              [Math.max(...latitudes), Math.max(...longitudes)],
            ],
            {
              padding: [48, 48],
              animate: true,
              duration: 0.6,
              maxZoom: 16,
            }
          );
        } else if (allBuses.length > 0) {
          const latitudes = allBuses.map((bus) => bus.latitude);
          const longitudes = allBuses.map((bus) => bus.longitude);
          map.fitBounds(
            [
              [Math.min(...latitudes), Math.min(...longitudes)],
              [Math.max(...latitudes), Math.max(...longitudes)],
            ],
            {
              padding: [48, 48],
              animate: true,
              duration: 0.6,
              maxZoom: 16,
            }
          );
        }
      } else if (allBuses.length > 0) {
        const latitudes = allBuses.map((bus) => bus.latitude);
        const longitudes = allBuses.map((bus) => bus.longitude);

        if (allBuses.length === 1) {
          map.flyTo([allBuses[0].latitude, allBuses[0].longitude], Math.max(map.getZoom(), 16), {
            animate: true,
            duration: 0.55,
          });
        } else {
          map.fitBounds(
            [
              [Math.min(...latitudes), Math.min(...longitudes)],
              [Math.max(...latitudes), Math.max(...longitudes)],
            ],
            {
              padding: [56, 56],
              animate: true,
              duration: 0.65,
              maxZoom: 16,
            }
          );
        }
      } else {
        map.flyTo([MAP_CONFIG.INITIAL_LATITUDE, MAP_CONFIG.INITIAL_LONGITUDE], MAP_CONFIG.INITIAL_ZOOM, {
          animate: true,
          duration: 0.6,
        });
      }

      lastHandledViewportToken.current = viewportToken;
    }, [activeRouteId, allBuses, focusedBus, fullscreenToken, layoutToken, map, routeGeometry]);

    return null;
  };

  return (
    <div style={styles.container}>
      <MapContainer
        center={center}
        zoom={MAP_CONFIG.INITIAL_ZOOM}
        style={styles.mapFrame}
        scrollWheelZoom
      >
        <FocusAllBuses allBuses={filteredBuses} activeRouteId={selectedRouteId} />
        <FocusRouteBuses busesOnRoute={filteredBuses} routeGeometry={routePaths} activeRouteId={selectedRouteId} />
        <FlyToBus target={focusedBusTarget} />
        <FlyToStop target={focusedStop} />
        <ResetViewport token={resetViewToken} allBuses={filteredBuses} />
        <RecenterOnViewportChange
          fullscreenToken={fullscreenViewToken}
          layoutToken={layoutVersion}
          allBuses={filteredBuses}
          activeRouteId={selectedRouteId}
          routeGeometry={routePaths}
          focusedBus={selectedBusLive}
        />
        <HandleMapResize />
        <HandleZoomTracking />
        <HandleMapBackgroundClick />

        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routePaths.map((path) => (
          <Polyline
            key={path.id}
            positions={path.coordinates.map((point) => [point.latitude, point.longitude])}
            pathOptions={{ color: path.color, weight: 4, opacity: 0.78 }}
            eventHandlers={{
              click: (event: LeafletInteractionEvent) => {
                event.originalEvent?.stopPropagation?.();
                const latlng = event.latlng;
                if (!latlng) return;
                selectNearestStopFromPoint(latlng.lat, latlng.lng);
              },
            }}
          />
        ))}

        {visibleStops.map((stop) => (
          <CircleMarker
            key={stop.id}
            center={[stop.latitude, stop.longitude]}
            radius={8}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: '#0f766e',
              fillOpacity: 1,
              bubblingMouseEvents: false,
            }}
            eventHandlers={{
              click: (event: LeafletInteractionEvent) => {
                event.originalEvent?.stopPropagation?.();
                lastMarkerInteractionAtRef.current = Date.now();
                onStopPress?.(stop);
              },
              mousedown: (event: LeafletInteractionEvent) => {
                event.originalEvent?.stopPropagation?.();
                lastMarkerInteractionAtRef.current = Date.now();
              },
              touchstart: (event: LeafletInteractionEvent) => {
                event.originalEvent?.stopPropagation?.();
                lastMarkerInteractionAtRef.current = Date.now();
              },
            }}
          >
            {focusedStop?.id === stop.id ? (
              <Tooltip
                permanent
                interactive
                direction="top"
                offset={[0, -16]}
                className="betterbt-selected-stop-tooltip"
              >
                <div className="betterbt-stop-focus-card">
                  <div className="betterbt-stop-focus-title" title={stop.name}>{stop.name}</div>
                  <div className="betterbt-stop-focus-id">Stop #{stop.id}</div>
                  {(stopDeparturesById[stop.id] ?? []).filter((time) => time && time !== '--').length > 0 ? (
                    <div style={{ marginBottom: 7 }}>
                      <div className="betterbt-popup-label" style={{ marginBottom: 2 }}>
                        {selectedRouteId ? `Next ${selectedRouteId} departures` : 'Next departures'}
                      </div>
                      <ul style={{ margin: '0 0 0 14px', padding: 0 }}>
                        {(stopDeparturesById[stop.id] ?? [])
                          .filter((time) => time && time !== '--')
                          .slice(0, 3)
                          .map((time) => (
                          <li key={`${stop.id}-focus-${time}`} className="betterbt-popup-value">{time}</li>
                          ))}
                      </ul>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 7 }}>
                      <div className="betterbt-popup-label" style={{ marginBottom: 2 }}>
                        {selectedRouteId ? `Next ${selectedRouteId} departures` : 'Next departures'}
                      </div>
                      <div className="betterbt-popup-value">none</div>
                    </div>
                  )}
                  {onStopInfoPress ? (
                    <button
                      type="button"
                      className="betterbt-stop-focus-button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onStopInfoPress(stop);
                      }}
                    >
                      See stop info
                    </button>
                  ) : null}
                </div>
              </Tooltip>
            ) : null}
          </CircleMarker>
        ))}

        {filteredBuses.map((bus) => (
          <Marker
            key={bus.id}
            position={[bus.latitude, bus.longitude]}
            icon={busIcons[bus.id]}
            eventHandlers={{
              click: (event: LeafletInteractionEvent) => {
                event.originalEvent?.stopPropagation?.();
                lastMarkerInteractionAtRef.current = Date.now();
                setClickedBus({
                  key: `marker-${bus.id}-${Date.now()}`,
                  latitude: bus.latitude,
                  longitude: bus.longitude,
                });
                onBusPress?.(bus);
              },
            }}
          >
            {selectedBusLive?.id === bus.id ? (
              <Tooltip
                permanent
                interactive
                direction="top"
                offset={[0, -22]}
                className="betterbt-selected-bus-tooltip"
              >
                {renderBusPopupContent(bus)}
              </Tooltip>
            ) : null}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 360,
    background: '#0b1220',
  },
  mapFrame: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
  loadingState: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
    background: '#0b1220',
    font: '500 14px/1.4 sans-serif',
  },
  errorState: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fca5a5',
    background: '#0b1220',
    font: '500 14px/1.4 sans-serif',
    padding: '0 16px',
    textAlign: 'center',
  },
};
