/**
 * Renders the SVG logo icon for known instruments.
 * Inputs: props with instrument symbol string.
 * Outputs: SVG or fallback monogram.
 * Side effects: none.
 * Failure modes: renders 2-letter fallback monogram for unknown symbols.
 */
export function InstrumentLogo({ symbol }: { symbol: string }) {
  switch (symbol) {
    case "BTCUSDT":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#F7931A" />
          <path
            fill="#FFF"
            d="M22.184 14.037c.365-2.443-1.496-3.757-4.042-4.633l.826-3.311-2.015-.502-.804 3.225c-.53-.132-1.074-.256-1.615-.38l.81-3.249-2.016-.502-.826 3.31c-.439-.1-.87-.198-1.29-.3l.002-.009-2.78-.694-.537 2.15s1.496.343 1.465.364c.816.204.964.743.939 1.17l-.94 3.771c.056.014.129.035.21.068l-.213-.053-1.318 5.283c-.1.247-.354.618-.925.477.02.03-1.465-.366-1.465-.366l-1.002 2.312 2.624.654c.488.122.966.248 1.44.37l-.836 3.355 2.014.502.826-3.312c.55.149 1.085.285 1.61.414l-.823 3.303 2.016.502.836-3.354c3.438.651 6.023.388 7.112-2.72.877-2.502-.043-3.945-1.85-4.885 1.315-.304 2.304-1.17 2.569-2.955zm-4.59 6.452c-.623 2.504-4.836 1.15-6.201.81l1.107-4.437c1.366.341 5.733 1.018 5.094 3.627zm.624-6.49c-.568 2.277-4.077 1.12-5.215.836l1.004-4.025c1.138.284 4.792.813 4.211 3.189z"
          />
        </svg>
      );
    case "ETHUSDT":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path fill="#FFF" fillOpacity=".6" d="M16 4v9.065l7.656 3.42z" />
          <path fill="#FFF" d="M16 4L8.344 16.485 16 13.065z" />
          <path fill="#FFF" fillOpacity=".6" d="M16 23.336v5.66L23.663 18.2z" />
          <path fill="#FFF" d="M16 28.996v-5.66L8.344 18.2z" />
          <path fill="#FFF" fillOpacity=".2" d="M16 21.916l7.656-4.431L16 13.067z" />
          <path fill="#FFF" fillOpacity=".6" d="M8.344 17.485L16 21.916V13.067z" />
        </svg>
      );
    case "XAUUSD":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#B45309" />
          <path fill="#FEF08A" d="M7 11h18l-3 10H10L7 11z" />
          <path fill="#FDE047" d="M10 11l2 10h8l2-10H10z" />
          <path fill="#CA8A04" d="M7 11l3 10H8L5 11h2z" />
          <path fill="#FFF" fillOpacity=".4" d="M11 13h10v1.5H11z" />
        </svg>
      );
    case "EURUSD":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#1E3A8A" />
          <path
            fill="#FACC15"
            d="M16 6l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6zm-5 2l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6zm10 0l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6zm-12 5l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6zm14 0l.5 1.5h1.6l-1.3 1 .5 1.5-1.3-.9-1.3.9.5-1.5-1.3-1h1.6z"
          />
        </svg>
      );
    case "GBPUSD":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0 shadow-xs rounded-full">
          <circle cx="16" cy="16" r="16" fill="#012169" />
          <path stroke="#FFF" strokeWidth="2.5" d="M0 0l32 32M32 0L0 32M16 0v32M0 16h32" />
          <path stroke="#C8102E" strokeWidth="1.5" d="M16 0v32M0 16h32" />
        </svg>
      );
    default:
      return (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-mono text-[9px] font-bold text-emerald-400">
          {symbol.slice(0, 2)}
        </div>
      );
  }
}
