/**
 * MapView (Web Implementation)
 * Uses react-leaflet for a fully interactive map with geospatially anchored markers.
 * Platform-specific: file loaded on web via Expo Router
 */

import { MAP_CONFIG } from '@/constants/config';
import { Bus, Stop } from '@/types/transit';
import React, { useEffect, useMemo, useRef, useState } from 'react';

type LeafletModules = {
  MapContainer: React.ComponentType<any>;
  TileLayer: React.ComponentType<any>;
  Marker: React.ComponentType<any>;
  Popup: React.ComponentType<any>;
  CircleMarker: React.ComponentType<any>;
  useMap: () => any;
  L: typeof import('leaflet');
};

interface MapViewProps {
  buses: Bus[];
  stops?: Stop[];
  selectedRouteId?: string;
  focusedStop?: Stop | null;
  onBusPress?: (bus: Bus) => void;
  onStopPress?: (stop: Stop) => void;
}

export default function TransitMapView({
  buses,
  stops = [],
  selectedRouteId,
  focusedStop,
  onBusPress,
  onStopPress,
}: MapViewProps) {
  const [leaflet, setLeaflet] = useState<LeafletModules | null>(null);
  const [focusedBus, setFocusedBus] = useState<{ latitude: number; longitude: number } | null>(null);
  const lastAutoFocusedRouteId = useRef<string | null>(null);
  const didAutoFitAllBuses = useRef(false);

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
    ? buses
    : buses.filter((bus) => bus.routeId === selectedRouteId);

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
        html: `<div style="width:34px;height:34px;border-radius:17px;background:${bus.routeColor};border:2px solid #fff;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);font:700 10px/1 sans-serif;transform:rotate(${bus.heading}deg)">${bus.routeId}</div>`,
      });
      return acc;
    }, {});
  }, [filteredBuses, leaflet]);

  if (!leaflet) {
    return <div style={styles.loadingState}>Loading map...</div>;
  }

  const { MapContainer, TileLayer, Marker, Popup, CircleMarker } = leaflet;

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
          duration: 0.6,
        });
        didAutoFitAllBuses.current = true;
        return;
      }

      const latitudes = allBuses.map((bus) => bus.latitude);
      const longitudes = allBuses.map((bus) => bus.longitude);

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

  const FocusRouteBuses: React.FC<{ busesOnRoute: Bus[]; activeRouteId?: string }> = ({
    busesOnRoute,
    activeRouteId,
  }) => {
    const map = leaflet.useMap();

    useEffect(() => {
      if (!activeRouteId) {
        lastAutoFocusedRouteId.current = null;
        return;
      }

      if (lastAutoFocusedRouteId.current === activeRouteId) return;
      if (busesOnRoute.length === 0) return;

      if (busesOnRoute.length === 1) {
        const onlyBus = busesOnRoute[0];
        map.flyTo([onlyBus.latitude, onlyBus.longitude], Math.max(map.getZoom(), 16), {
          animate: true,
          duration: 0.6,
        });
        lastAutoFocusedRouteId.current = activeRouteId;
        return;
      }

      const latitudes = busesOnRoute.map((bus) => bus.latitude);
      const longitudes = busesOnRoute.map((bus) => bus.longitude);

      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const minLng = Math.min(...longitudes);
      const maxLng = Math.max(...longitudes);

      const midpointLat = (minLat + maxLat) / 2;
      const midpointLng = (minLng + maxLng) / 2;

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

      map.panTo([midpointLat, midpointLng], {
        animate: true,
        duration: 0.45,
      });
      lastAutoFocusedRouteId.current = activeRouteId;
    }, [activeRouteId, busesOnRoute, map]);

    return null;
  };

  const FlyToBus: React.FC<{ target: { latitude: number; longitude: number } | null }> = ({ target }) => {
    const map = leaflet.useMap();

    useEffect(() => {
      if (!target) return;
      map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.6,
      });
    }, [map, target]);

    return null;
  };

  const FlyToStop: React.FC<{ target: Stop | null | undefined }> = ({ target }) => {
    const map = leaflet.useMap();

    useEffect(() => {
      if (!target) return;
      map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 17), {
        animate: true,
        duration: 0.55,
      });
    }, [map, target]);

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
        <FocusRouteBuses busesOnRoute={filteredBuses} activeRouteId={selectedRouteId} />
        <FocusAllBuses allBuses={filteredBuses} activeRouteId={selectedRouteId} />
        <FlyToBus target={focusedBus} />
        <FlyToStop target={focusedStop} />

        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

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
                setFocusedBus({ latitude: bus.latitude, longitude: bus.longitude });
                onBusPress?.(bus);
              },
            }}
          >
            <Popup>
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

                  {typeof bus.passengers === 'number' && (
                    <>
                      <span className="betterbt-popup-label">Passengers</span>
                      <span className="betterbt-popup-value">{bus.passengers}</span>
                    </>
                  )}

                  {typeof bus.occupancyPercent === 'number' && (
                    <>
                      <span className="betterbt-popup-label">Occupancy</span>
                      <span className="betterbt-popup-value">{Math.round(bus.occupancyPercent)}%</span>
                    </>
                  )}

                  {typeof bus.isAtStop === 'boolean' && (
                    <>
                      <span className="betterbt-popup-label">Status</span>
                      <span className="betterbt-popup-value">{bus.isAtStop ? 'At stop' : 'In motion'}</span>
                    </>
                  )}
                </div>
              </div>
            </Popup>
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
