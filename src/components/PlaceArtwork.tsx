/** Stable original vector artwork, never a claimed real photograph or billable generation. */
export function PlaceArtwork({
  kind,
  label,
  compact = false,
}: {
  kind: string;
  label: string;
  compact?: boolean;
}) {
  const outdoors = ["park", "garden"].includes(kind),
    books = ["library", "bookshop"].includes(kind),
    night = kind === "bar";
  return (
    <div className={`relative overflow-hidden rounded-2xl ${compact ? "h-24" : "h-44"}`}>
      <svg
        viewBox="0 0 420 180"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="img"
        aria-label={`Illustration of the fictional ${label}`}
      >
        <rect
          width="420"
          height="180"
          fill={night ? "#253b47" : outdoors ? "#dce8db" : "#eee5d7"}
        />
        <circle cx="340" cy="35" r="21" fill={night ? "#f1d5a4" : "#faf4df"} />
        <path d="M0 134Q100 100 210 137T420 128V180H0Z" fill={outdoors ? "#a9c3a6" : "#cfbda7"} />
        {outdoors ? (
          <g>
            <path d="M210 180Q150 130 235 112" fill="none" stroke="#eee1c5" strokeWidth="24" />
            <path d="M81 145V62M310 140V75" stroke="#7a8070" strokeWidth="8" />
            <circle cx="81" cy="60" r="39" fill="#628c76" />
            <circle cx="310" cy="68" r="33" fill="#7a9f7b" />
            <path d="M115 136h60m-55 0v17m48-17v17" stroke="#776a5a" strokeWidth="7" />
          </g>
        ) : (
          <g>
            <rect
              x="68"
              y="43"
              width="264"
              height="107"
              rx="7"
              fill={night ? "#647572" : "#d2b593"}
            />
            <path d="M52 50L202 11 348 50" fill={night ? "#4d6564" : "#78918a"} />
            <rect x="181" y="79" width="40" height="71" rx="4" fill="#526b63" />
            {[92, 246].map((x) => (
              <g key={x}>
                <rect
                  x={x}
                  y="72"
                  width="63"
                  height="47"
                  rx="4"
                  fill={night ? "#f1ce8f" : "#f5edda"}
                />
                {books ? (
                  [0, 1, 2, 3, 4].map((n) => (
                    <rect
                      key={n}
                      x={x + 8 + n * 10}
                      y={86 + (n % 2) * 4}
                      width="7"
                      height={27 - (n % 2) * 4}
                      rx="1"
                      fill={["#78918a", "#a47965", "#a6b18d"][n % 3]}
                    />
                  ))
                ) : (
                  <path d={`M${x + 31} 73v45m-30-23h61`} stroke="#c4ad8a" strokeWidth="3" />
                )}
              </g>
            ))}
            <path
              d="M38 158h100m-84 0v18m65-18v18M280 158h103m-86 0v18m67-18v18"
              stroke="#7a8273"
              strokeWidth="6"
            />
          </g>
        )}
      </svg>
      <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-1 text-[10px] text-muted-foreground">
        Fictional venue · illustration
      </span>
    </div>
  );
}
