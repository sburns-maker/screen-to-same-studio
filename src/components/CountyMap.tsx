import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { TOWN_PLACES } from "@/lib/town";
/** OSM public raster tiles. No geolocation request, key, SDK, or paid map service. */
export function CountyMap({
  places = TOWN_PLACES.slice(0, 4),
}: {
  places?:
    | readonly Pick<(typeof TOWN_PLACES)[number], "key" | "label" | "latitude" | "longitude">[]
    | undefined;
}) {
  const [zoom, setZoom] = useState(12),
    [center, setCenter] = useState({ lat: 40.5187, lon: -78.3947 });
  const n = 2 ** zoom;
  const project = (lat: number, lon: number) => ({
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
  });
  const c = project(center.lat, center.lon),
    left = Math.floor(c.x) - 1,
    top = Math.floor(c.y) - 1;
  return (
    <section
      aria-label="Blair County virtual map"
      className="overflow-hidden rounded-3xl border bg-[#e5eadc]"
    >
      <div className="relative aspect-square overflow-hidden">
        <svg
          viewBox="0 0 768 768"
          role="img"
          aria-label="Geographic map with fictional public venues"
        >
          <title>Virtual places in Blair County</title>
          {Array.from({ length: 9 }, (_, i) => {
            const x = left + (i % 3),
              y = top + Math.floor(i / 3);
            return (
              <image
                key={`${zoom}:${x}:${y}`}
                href={`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`}
                x={(x - left) * 256}
                y={(y - top) * 256}
                width="256"
                height="256"
              />
            );
          })}
          {places.map((p) => {
            const a = project(p.latitude, p.longitude);
            return (
              <Link
                key={p.key}
                to="/place/$placeKey"
                params={{ placeKey: p.key }}
                aria-label={p.label}
              >
                <g transform={`translate(${(a.x - left) * 256},${(a.y - top) * 256})`}>
                  <circle r="19" fill="var(--primary, #1e6159)" stroke="white" strokeWidth="5" />
                  <text
                    x="25"
                    y="6"
                    fontSize="21"
                    fontWeight="600"
                    paintOrder="stroke"
                    stroke="white"
                    strokeWidth="6"
                    fill="#183d37"
                  >
                    {p.label}
                  </text>
                </g>
              </Link>
            );
          })}
        </svg>
        <div className="absolute right-3 top-3 flex flex-col rounded-xl border bg-background shadow">
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(15, z + 1))}
            className="h-11 w-11 text-xl"
          >
            +
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(10, z - 1))}
            className="h-11 w-11 border-t text-xl"
          >
            −
          </button>
        </div>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-0 right-0 bg-white/90 px-2 text-[10px] text-black"
        >
          © OpenStreetMap contributors
        </a>
      </div>
      <div className="flex flex-wrap gap-2 p-3">
        {[
          { label: "Altoona", lat: 40.5187, lon: -78.3947 },
          { label: "Hollidaysburg", lat: 40.4273, lon: -78.3889 },
          { label: "Tyrone", lat: 40.6706, lon: -78.2386 },
          { label: "Duncansville", lat: 40.4234, lon: -78.4339 },
        ].map((c) => (
          <button
            key={c.label}
            onClick={() => setCenter(c)}
            className="rounded-full bg-background px-3 py-2 text-xs"
          >
            {c.label}
          </button>
        ))}
      </div>
    </section>
  );
}
