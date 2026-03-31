/**
 * MapView (Web Implementation)
 * Uses react-leaflet for a fully interactive map with geospatially anchored markers.
 * Platform-specific: file loaded on web via Expo Router
 */

import { MAP_CONFIG, REFRESH_INTERVALS } from '@/constants/config';
import { distanceMeters, interpolateCoordinate, predictBusCoordinate } from '@/services/map/busPrediction';
import { Bus, RouteGeometryPath, Stop } from '@/types/transit';
import React, { useEffect, useMemo, useRef, useState } from 'react';

type LeafletModules = {
  MapContainer: React.ComponentType<any>;
  TileLayer: React.ComponentType<any>;
  Marker: React.ComponentType<any>;
  Popup: React.ComponentType<any>;
  CircleMarker: React.ComponentType<any>;
  Polyline: React.ComponentType<any>;
  useMap: () => any;
  L: typeof import('leaflet');
};

interface MapViewProps {
  buses: Bus[];
  stops?: Stop[];
  routePaths?: RouteGeometryPath[];
  selectedRouteId?: string;
  focusedBus?: Bus | null;
  focusedStop?: Stop | null;
  onBusPress?: (bus: Bus) => void;
  onStopPress?: (stop: Stop) => void;
  onMapPress?: () => void;
}

export default function TransitMapView({
  buses,
  stops = [],
  routePaths = [],
  selectedRouteId,
  focusedBus,
  focusedStop,
  onBusPress,
  onStopPress,
  onMapPress,
}: MapViewProps) {
  const SNAP_TO_REAL_POSITION_METERS = 28;

  const [leaflet, setLeaflet] = useState<LeafletModules | null>(null);
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
        const predictedEnd = predictBusCoordinate(bus, now, routePaths, {
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

        nextTrackById[bus.id] = {
          start,
          end: predictedEnd,
          startedAtMs: now,
          durationMs: REFRESH_INTERVALS.VEHICLES,
        };
        nextPredictedEndpoints[bus.id] = predictedEnd;

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
  }, [buses, routePaths, stops]);

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
    `;

    document.head.appendChild(styleEl);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadLeaflet = async () => {
      const [reactLeaflet, leafletLib] = await Promise.all([
        import('react-leaflet'),
        import('leaflet'),
      ]);

      if (!isMounted) return;

      setLeaflet({
        MapContainer: reactLeaflet.MapContainer,
        TileLayer: reactLeaflet.TileLayer,
        Marker: reactLeaflet.Marker,
        Popup: reactLeaflet.Popup,
        CircleMarker: reactLeaflet.CircleMarker,
        Polyline: reactLeaflet.Polyline,
        useMap: reactLeaflet.useMap,
        L: leafletLib,
      });
    };

    void loadLeaflet();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredBuses = !selectedRouteId
    ? displayBuses
    : displayBuses.filter((bus) => bus.routeId === selectedRouteId);

  const filteredStops = !selectedRouteId
    ? stops
    : stops.filter((stop) => stop.routes.includes(selectedRouteId));

  const center: [number, number] =
    filteredBuses.length > 0
      ? [filteredBuses[0].latitude, filteredBuses[0].longitude]
      : [MAP_CONFIG.INITIAL_LATITUDE, MAP_CONFIG.INITIAL_LONGITUDE];

  const busIcons = useMemo(() => {
    if (!leaflet) return {} as Record<string, ReturnType<typeof leaflet.L.divIcon>>;

    return filteredBuses.reduce<Record<string, ReturnType<typeof leaflet.L.divIcon>>>((acc, bus) => {
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

  if (!leaflet) {
    return <div style={styles.loadingState}>Loading map...</div>;
  }

  const { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline } = leaflet;

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

    useEffect(() => {
      const onClick = (event: any) => {
        const clickTarget = event?.originalEvent?.target as HTMLElement | null;
        if (clickTarget?.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-interactive')) {
          return;
        }
        onMapPress?.();
      };
      const onManualMoveStart = () => {
        onMapPress?.();
      };

      map.on('click', onClick);
      map.on('dragstart', onManualMoveStart);
      map.on('zoomstart', onManualMoveStart);
      return () => {
        map.off('click', onClick);
        map.off('dragstart', onManualMoveStart);
        map.off('zoomstart', onManualMoveStart);
      };
    }, [map]);

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
          />
        ))}

        {filteredStops.map((stop) => (
          <CircleMarker
            key={stop.id}
            center={[stop.latitude, stop.longitude]}
            radius={5}
            pathOptions={{ color: '#ffffff', weight: 1, fillColor: '#0f766e', fillOpacity: 1 }}
            eventHandlers={{
              click: () => {
                onStopPress?.(stop);
              },
            }}
          >
            <Popup>{stop.name}</Popup>
          </CircleMarker>
        ))}

        {filteredBuses.map((bus) => (
          <Marker
            key={bus.id}
            position={[bus.latitude, bus.longitude]}
            icon={busIcons[bus.id]}
            eventHandlers={{
              click: () => {
                setClickedBus({
                  key: `marker-${bus.id}-${Date.now()}`,
                  latitude: bus.latitude,
                  longitude: bus.longitude,
                });
                onBusPress?.(bus);
              },
            }}
          >
            <Popup>{renderBusPopupContent(bus)}</Popup>
          </Marker>
        ))}

        {selectedBusLive ? (
          <Popup
            key={`selected-${selectedBusLive.id}`}
            position={[selectedBusLive.latitude, selectedBusLive.longitude]}
            autoClose={false}
            closeOnClick={false}
            closeButton={false}
          >
            {renderBusPopupContent(selectedBusLive)}
          </Popup>
        ) : null}
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
