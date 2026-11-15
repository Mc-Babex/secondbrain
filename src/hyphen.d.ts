/** Minimale Typen für die deutschen Trennmuster des Pakets `hyphen` (liefert selbst keine Typen). */
declare module 'hyphen/de' {
  export interface HyphenOptions {
    hyphenChar?: string
    minWordLength?: number
  }
  export function hyphenateSync(text: string, options?: HyphenOptions): string
  const exported: { hyphenateSync: typeof hyphenateSync }
  export default exported
}
