"use client";

import { MapPin } from "lucide-react";

/**
 * Stylized map, not real map tiles. Pins show small variations around the
 * single real outdoor reading (from Open-Meteo) to represent nearby-area
 * conditions, since a real dense outdoor sensor network isn't available.
 * Swap for real Leaflet/OpenStreetMap tiles + real distributed sensors in
 * a production deployment.
 */
const PIN_OFFSETS = [
  { top: "18%", left: "14%", delta: 1.0, condition: "Sunny" },
  { top: "22%", left: "55%", delta: -0.5, condition: "Cloudy" },
  { top: "60%", left: "80%", delta: 1.6, condition: "Sunny" },
  { top: "78%", left: "20%", delta: -1.7, condition: "Sunny" },
  { top: "72%", left: "58%", delta: 0.9, condition: "Sunny" },
];

export default function SurroundingMap({ outdoorTempC }: { outdoorTempC: number | null }) {
  const base = outdoorTempC ?? 24;

  return (
    <div className="map-wrap">
      {PIN_OFFSETS.map((pin, i) => (
        <div key={i} className="map-pin" style={{ top: pin.top, left: pin.left }}>
          <strong>{(base + pin.delta).toFixed(1)}°C</strong>
          <span>{pin.condition}</span>
        </div>
      ))}
      <div className="map-center">
        <MapPin size={18} />
      </div>
    </div>
  );
}
