import type { ClientSignal } from "@contracts/instruments";
import { formatPrice, getInstrument } from "@contracts/instruments";
import { toast } from "sonner";

export type ExportFormat = "telegram" | "mt5" | "json";

/**
 * Formats a signal into Telegram/Discord friendly markdown with emojis and levels.
 * Inputs: signal - ClientSignal.
 * Outputs: formatted string.
 * Side effects: none.
 * Failure modes: formats with default decimals if instrument is unknown.
 */
export function formatTelegramSetup(signal: ClientSignal): string {
  const inst = getInstrument(signal.symbol);
  const decimals = inst?.decimals ?? 2;
  const isBuy = signal.side === "buy";
  const actionEmoji = isBuy ? "🟢 BUY / LONG" : "🔴 SELL / SHORT";

  return [
    `⚡ **KR-SIGNAL TRADE SETUP**`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📌 **Asset**: #${signal.symbol} (${inst?.name ?? signal.symbol})`,
    `⏱ **Timeframe**: ${signal.timeframe} | **Style**: ${signal.style.toUpperCase()}`,
    `📊 **Direction**: ${actionEmoji}`,
    `🎯 **Confluence score**: ${signal.confidence}/100 (${signal.engine === "rules" ? "Rule Engine" : "AI Council"}; not a win probability)`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📍 **Entry**: \`${formatPrice(signal.entry, decimals)}\``,
    `🛑 **Stop Loss**: \`${formatPrice(signal.stopLoss, decimals)}\``,
    `🏆 **Target 1 (1.4R)**: \`${formatPrice(signal.tp1, decimals)}\``,
    `🏆 **Target 2 (2.2R)**: \`${formatPrice(signal.tp2, decimals)}\``,
    `🏆 **Target 3 (3.0R)**: \`${formatPrice(signal.tp3, decimals)}\``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🛡 *Risk Management: Pure rule-based execution. 1% risk per trade.*`,
  ].join("\n");
}

/**
 * Formats a signal into standard MT5 / Exchange Order Ticket string.
 * Inputs: signal - ClientSignal.
 * Outputs: single-line formatted order string.
 * Side effects: none.
 * Failure modes: none.
 */
export function formatMt5Setup(signal: ClientSignal): string {
  const inst = getInstrument(signal.symbol);
  const decimals = inst?.decimals ?? 2;
  const orderType = signal.side === "buy" ? "BUY LIMIT" : "SELL LIMIT";

  return `SYMBOL: ${signal.symbol} | TYPE: ${orderType} | ENTRY: ${formatPrice(signal.entry, decimals)} | SL: ${formatPrice(signal.stopLoss, decimals)} | TP1: ${formatPrice(signal.tp1, decimals)} | TP2: ${formatPrice(signal.tp2, decimals)} | TP3: ${formatPrice(signal.tp3, decimals)}`;
}

/**
 * Formats a signal into pretty-printed JSON.
 * Inputs: signal - ClientSignal.
 * Outputs: JSON string.
 * Side effects: none.
 * Failure modes: none.
 */
export function formatJsonSetup(signal: ClientSignal): string {
  return JSON.stringify(signal, null, 2);
}

/**
 * Copies formatted trade setup to clipboard and triggers a toast notification.
 * Inputs: signal - ClientSignal, format - ExportFormat.
 * Outputs: Promise<boolean> indicating success.
 * Side effects: writes to clipboard, displays toast.
 * Failure modes: displays error toast on clipboard rejection.
 */
export async function copySetupToClipboard(
  signal: ClientSignal,
  format: ExportFormat = "telegram"
): Promise<boolean> {
  let content = "";
  let label = "Telegram format";

  if (format === "telegram") {
    content = formatTelegramSetup(signal);
    label = "Telegram format";
  } else if (format === "mt5") {
    content = formatMt5Setup(signal);
    label = "MT5 order ticket";
  } else {
    content = formatJsonSetup(signal);
    label = "JSON parameters";
  }

  try {
    await navigator.clipboard.writeText(content);
    toast.success(`Copied ${signal.symbol} Setup`, {
      description: `${label} copied to clipboard.`,
    });
    return true;
  } catch {
    toast.error("Failed to copy", {
      description: "Clipboard permissions denied by browser.",
    });
    return false;
  }
}
