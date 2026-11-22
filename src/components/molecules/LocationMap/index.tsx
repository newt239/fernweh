import { useEffect, useRef } from "react";

import { addOsmTileLayer, loadLeaflet } from "#/lib/leaflet.ts";

import classes from "./LocationMap.module.css";

import type * as Leaflet from "leaflet";

type LocationMapProps = {
  latitude: number;
  longitude: number;
  zoom: number;
  onChange: (latitude: number, longitude: number) => void;
};

export const LocationMap = ({ latitude, longitude, zoom, onChange }: LocationMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.CircleMarker | null>(null);
  const latestRef = useRef({ latitude, longitude, onChange, zoom });

  // 地図のイベントから最新の props を参照するため描画のたびに ref へ同期する
  useEffect(() => {
    latestRef.current = { latitude, longitude, onChange, zoom };
  });

  // Leaflet は window に依存し SSR では読み込めないため、マウント後に動的 import して地図を生成する
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((leaflet) => {
      const container = containerRef.current;
      if (cancelled || !container) {
        return;
      }
      const {
        latitude: initialLatitude,
        longitude: initialLongitude,
        zoom: initialZoom,
      } = latestRef.current;
      const map = new leaflet.Map(container, { scrollWheelZoom: false }).setView(
        [initialLatitude, initialLongitude],
        initialZoom,
      );
      addOsmTileLayer(leaflet, map);
      markerRef.current = leaflet
        .circleMarker([initialLatitude, initialLongitude], {
          color: "#228be6",
          fillColor: "#228be6",
          fillOpacity: 0.75,
          radius: 8,
          weight: 2,
        })
        .addTo(map);
      map.on("click", (event) => {
        latestRef.current.onChange(event.latlng.lat, event.latlng.lng);
      });
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // 親が持つ座標の変化をマウント済みの地図へ反映する
  useEffect(() => {
    markerRef.current?.setLatLng([latitude, longitude]);
    const map = mapRef.current;
    if (map && !map.getBounds().contains([latitude, longitude])) {
      map.setView([latitude, longitude]);
    }
  }, [latitude, longitude]);

  return <div ref={containerRef} className={classes.map} />;
};
