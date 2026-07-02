// Animated SVG network — nodes + connecting lines rendered in the network-* CSS
// vars from globals.css. Hub nodes pulse; ambient blurred orbs drift slowly.
// Purely decorative (aria-hidden), positioned by the parent (fixed site-wide, or
// absolute within a single section).

const BC_NODES: { x: number; y: number; r: number; hub?: true }[] = [
  { x: 3, y: 7, r: 3.5 },
  { x: 16, y: 20, r: 6.5, hub: true },
  { x: 31, y: 9, r: 4 },
  { x: 47, y: 24, r: 8.5, hub: true },
  { x: 62, y: 11, r: 4 },
  { x: 78, y: 22, r: 6, hub: true },
  { x: 94, y: 8, r: 3.5 },
  { x: 8, y: 42, r: 5 },
  { x: 24, y: 36, r: 4 },
  { x: 40, y: 48, r: 5.5 },
  { x: 56, y: 42, r: 7.5, hub: true },
  { x: 71, y: 38, r: 4 },
  { x: 88, y: 46, r: 7, hub: true },
  { x: 4, y: 62, r: 3.5 },
  { x: 20, y: 58, r: 5.5 },
  { x: 36, y: 66, r: 4 },
  { x: 53, y: 60, r: 8, hub: true },
  { x: 70, y: 64, r: 4.5 },
  { x: 86, y: 56, r: 5.5 },
  { x: 96, y: 70, r: 3 },
  { x: 12, y: 80, r: 4.5 },
  { x: 30, y: 84, r: 5.5, hub: true },
  { x: 50, y: 82, r: 4 },
  { x: 67, y: 80, r: 4.5 },
  { x: 84, y: 86, r: 3.5 },
  { x: 44, y: 32, r: 4.5 },
  { x: 22, y: 50, r: 3.5 },
  { x: 82, y: 33, r: 4.5 },
  { x: 58, y: 74, r: 3.5 },
];

const BC_EDGES: [number, number][] = (() => {
  const out: [number, number][] = [];
  const MAX = 23;
  for (let i = 0; i < BC_NODES.length; i++) {
    for (let j = i + 1; j < BC_NODES.length; j++) {
      const dx = BC_NODES[i].x - BC_NODES[j].x;
      const dy = BC_NODES[i].y - BC_NODES[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < MAX) out.push([i, j]);
    }
  }
  return out;
})();

export function BlockchainBg() {
  const hubs = BC_NODES.filter(n => n.hub);
  const regulars = BC_NODES.filter(n => !n.hub);

  return (
    <>
      <style>{`
        @keyframes bcHubPulse {
          0%, 100% { opacity: 0.16; }
          50%       { opacity: 0.36; }
        }
        @keyframes bcBlobDrift {
          0%, 100% { opacity: 0.04;  transform: scale(1);   }
          50%       { opacity: 0.065; transform: scale(1.12); }
        }
        @keyframes bcBlobDriftB {
          0%, 100% { opacity: 0.03;  transform: scale(1.05); }
          50%       { opacity: 0.055; transform: scale(0.92); }
        }
      `}</style>

      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
      >
        <defs>
          <filter id="bcNodeGlow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="bcHubGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="bcLineGlow" x="-30%" y="-800%" width="160%" height="1700%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="bcOrbBlur" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="55" />
          </filter>
          <filter id="bcOrbBlurB" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="40" />
          </filter>
        </defs>

        {/* Ambient purple/teal glow orbs */}
        <circle
          cx="22%" cy="38%" r="220" fill="var(--network-blob-a)" filter="url(#bcOrbBlur)"
          style={{ opacity: 0.04, animation: "bcBlobDrift 7s ease-in-out 0s infinite", transformOrigin: "22% 38%" }}
        />
        <circle
          cx="74%" cy="62%" r="180" fill="var(--network-blob-b)" filter="url(#bcOrbBlur)"
          style={{ opacity: 0.03, animation: "bcBlobDriftB 9s ease-in-out 1.5s infinite", transformOrigin: "74% 62%" }}
        />
        <circle
          cx="55%" cy="15%" r="140" fill="var(--network-blob-a)" filter="url(#bcOrbBlurB)"
          style={{ opacity: 0.04, animation: "bcBlobDrift 11s ease-in-out 3s infinite", transformOrigin: "55% 15%" }}
        />
        <circle
          cx="85%" cy="20%" r="110" fill="var(--network-blob-b)" filter="url(#bcOrbBlurB)"
          style={{ opacity: 0.03, animation: "bcBlobDriftB 8s ease-in-out 0.8s infinite", transformOrigin: "85% 20%" }}
        />

        {/* Connection lines — blurred glow layer under crisp lines */}
        <g stroke="var(--network-node)" strokeWidth="0.6" opacity="0.13" filter="url(#bcLineGlow)">
          {BC_EDGES.map(([i, j], k) => (
            <line
              key={k}
              x1={`${BC_NODES[i].x}%`} y1={`${BC_NODES[i].y}%`}
              x2={`${BC_NODES[j].x}%`} y2={`${BC_NODES[j].y}%`}
            />
          ))}
        </g>
        <g stroke="var(--network-node)" strokeWidth="0.5" opacity="0.07">
          {BC_EDGES.map(([i, j], k) => (
            <line
              key={k}
              x1={`${BC_NODES[i].x}%`} y1={`${BC_NODES[i].y}%`}
              x2={`${BC_NODES[j].x}%`} y2={`${BC_NODES[j].y}%`}
            />
          ))}
        </g>

        {/* Regular nodes — small dots with soft bloom */}
        <g filter="url(#bcNodeGlow)">
          {regulars.map((n, i) => (
            <circle key={i} cx={`${n.x}%`} cy={`${n.y}%`} r={n.r} fill="var(--network-node)" opacity={0.15} />
          ))}
        </g>

        {/* Hub nodes — larger, brighter, pulsing bloom */}
        <g filter="url(#bcHubGlow)">
          {hubs.map((n, i) => (
            <circle
              key={i} cx={`${n.x}%`} cy={`${n.y}%`} r={n.r} fill="var(--network-hub)"
              style={{ opacity: 0.16, animation: `bcHubPulse ${3.8 + i * 0.65}s ease-in-out ${i * 0.7}s infinite` }}
            />
          ))}
        </g>
      </svg>
    </>
  );
}
