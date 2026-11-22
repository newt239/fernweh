import { useEffect, useRef, useState } from "react";

import { DEFAULT_CENTER, DEFAULT_ZOOM, addOsmTileLayer, loadLeaflet } from "#/lib/leaflet.ts";

import classes from "./TimelineMatchMap.module.css";

import type * as Leaflet from "leaflet";

type TimelineMatchPoint = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  selected: boolean;
};

type Props = {
  points: TimelineMatchPoint[];
  focusedId: string | null;
};

export const TimelineMatchMap = ({ points, focusedId }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, Leaflet.CircleMarker>());
  const boundsKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  // Leaflet は window に依存し SSR では読み込めないため、マウント後に動的 import して地図を生成する
  useEffect(() => {
    const markers = markersRef.current;
    let cancelled = false;
    let map: Leaflet.Map | null = null;
    loadLeaflet().then((leaflet) => {
      const container = containerRef.current;
      if (cancelled || !container) {
        return;
      }
      map = new leaflet.Map(container).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      addOsmTileLayer(leaflet, map);
      leafletRef.current = leaflet;
      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map?.remove();
      leafletRef.current = null;
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
      boundsKeyRef.current = null;
      setReady(false);
    };
  }, []);

  // Leaflet のレイヤーは React の管理外のため、points の変化を命令的に反映する
  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !leaflet || !map || !layer) {
      return;
    }
    layer.clearLayers();
    markersRef.current.clear();
    for (const point of points) {
      const color = point.selected ? "#228be6" : "#adb5bd";
      const marker = leaflet
        .circleMarker([point.latitude, point.longitude], {
          color,
          fillColor: color,
          fillOpacity: 0.75,
          radius: 7,
          weight: 2,
        })
        .addTo(layer);
      const tooltip = document.createElement("div");
      tooltip.textContent = point.label;
      marker.bindTooltip(tooltip);
      markersRef.current.set(point.id, marker);
    }
    const boundsKey = points.map((point) => point.id).join(",");
    if (points.length > 0 && boundsKeyRef.current !== boundsKey) {
      boundsKeyRef.current = boundsKey;
      map.fitBounds(
        leaflet.latLngBounds(points.map((point) => [point.latitude, point.longitude])),
        { maxZoom: 16, padding: [32, 32] },
      );
    }
  }, [points, ready]);

  // 選択された行の推定位置へ地図を動かす処理も Leaflet の命令的 API を呼ぶ必要がある
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || focusedId === null) {
      return;
    }
    const marker = markersRef.current.get(focusedId);
    if (!marker) {
      return;
    }
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
    marker.bringToFront();
    marker.openTooltip();
  }, [focusedId, ready]);

  return <div ref={containerRef} className={classes.map} />;
};
