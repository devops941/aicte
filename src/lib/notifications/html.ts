/**
 * Escapes text before it is placed into the HTML part of an email.
 *
 * Notification bodies interpolate values the sender does not control —
 * institution names, application titles, EVC venues, document labels — so
 * without this a stored value containing markup would be rendered as live HTML
 * in the recipient's mail client.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
