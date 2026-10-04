// Tiny inline icons (no icon library yet: adding one is a new dependency, so it needs sign-off). Decorative: aria-hidden.
type P = { className?: string };
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;
export const SearchIcon = ({ className }: P) => (<svg {...base} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const MenuIcon = ({ className }: P) => (<svg {...base} className={className}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const PhoneIcon = ({ className }: P) => (<svg {...base} width={16} height={16} className={className}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>);
export const GlobeIcon = ({ className }: P) => (<svg {...base} width={16} height={16} className={className}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>);
export const PinIcon = ({ className }: P) => (<svg {...base} width={16} height={16} className={className}><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>);
export const ArrowRightIcon = ({ className }: P) => (<svg {...base} width={16} height={16} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
// Placeholder mark until the real logo is supplied as a vector (see docs/DESIGN_TOKENS.md).
export const MountainMark = ({ className }: P) => (<svg viewBox="0 0 40 28" width={36} height={25} fill="currentColor" aria-hidden focusable={false} className={className}><path d="M0 28 14 6l7 10 5-7 14 19Z" /><circle cx="30" cy="6" r="3.5" opacity=".7" /></svg>);
