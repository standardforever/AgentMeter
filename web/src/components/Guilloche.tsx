/**
 * The lattice behind every mandate: a guilloché, the interlaced curves printed on cheques and
 * banknotes to make them hard to forge. It also nods to lattice cryptography, the family behind
 * the post-quantum signatures QDay is moving to. Deterministic: same seed, same picture.
 */
export function Guilloche({ seed = 1, lines = 34, className }: { seed?: number; lines?: number; className?: string }) {
  const W = 1200;
  const H = 300;
  const paths: string[] = [];
  for (let k = 0; k < lines; k++) {
    const phase = (k / lines) * Math.PI * 2 + seed * 0.7;
    const amp1 = 52 + 18 * Math.sin(seed + k * 0.3);
    const amp2 = 24;
    let d = "";
    for (let x = 0; x <= W; x += 8) {
      const t = x / W;
      const y =
        H / 2 +
        (k - lines / 2) * (H / lines) * 0.9 +
        amp1 * Math.sin(t * Math.PI * 6 + phase) +
        amp2 * Math.sin(t * Math.PI * 17 - phase * 2 + seed) +
        14 * Math.cos(t * Math.PI * 3 + k * 0.45);
      d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
    }
    paths.push(d);
  }
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.7" vectorEffect="non-scaling-stroke">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}
