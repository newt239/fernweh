import type * as Leaflet from "leaflet";

export const DEFAULT_CENTER: [number, number] = [35.681_2, 139.767_1];
export const DEFAULT_ZOOM = 4;

// React Compiler はコンポーネント内の動的 import を解析できないためここで読み込む
export const loadLeaflet = () => import("leaflet");

export const addOsmTileLayer = (leaflet: typeof Leaflet, map: Leaflet.Map) => {
  leaflet
    .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    })
    .addTo(map);
};
