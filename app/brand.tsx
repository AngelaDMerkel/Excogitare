import identity from "../branding/identity.json";
import wordmark from "../branding/wordmark.json";

/** Decorative when paired with the named wordmark. No font or network dependency. */
export function WayfinderMark({ small = false }: { small?: boolean }) {
  return <svg className="excogitare-mark" viewBox={identity.viewBox} aria-hidden="true" focusable="false">
    <circle cx={identity.circle.cx} cy={identity.circle.cy} r={identity.circle.r} fill="none" stroke="currentColor" strokeWidth={small ? identity.circle.smallStrokeWidth : identity.circle.strokeWidth} />
    <path d={small ? identity.smallPath : identity.path} fill="currentColor" fillRule="evenodd" />
  </svg>;
}

export function ExcogitareWordmark() {
  return <svg className="excogitare-wordmark" viewBox={wordmark.viewBox} role="img" aria-label="Excogitare" focusable="false">
    <path d={wordmark.path} fill="currentColor" />
  </svg>;
}
