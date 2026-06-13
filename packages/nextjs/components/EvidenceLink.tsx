// Renders an evidence string as a clickable link when it looks like a URL or
// IPFS reference, otherwise as plain text (PRD §12: URL, IPFS CID, or text).
export function EvidenceLink({ evidence }: { evidence: string }) {
  const v = (evidence || "").trim();
  let href: string | null = null;

  if (/^https?:\/\//i.test(v)) {
    href = v;
  } else if (/^ipfs:\/\//i.test(v)) {
    href = `https://ipfs.io/ipfs/${v.replace(/^ipfs:\/\//i, "")}`;
  } else if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]+)$/.test(v)) {
    href = `https://ipfs.io/ipfs/${v}`;
  }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-all font-medium text-brand-300 underline decoration-brand-500/40 underline-offset-2 hover:text-brand-200"
      >
        {v}
      </a>
    );
  }

  return <p className="whitespace-pre-wrap break-words text-gray-200">{v}</p>;
}
