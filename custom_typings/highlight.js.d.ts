declare module 'highlight.js' {
  interface HighlightAutoResult {
    /** detected language */
    language: string;
    /** integer value */
    relevance: number;
    /** HTML with highlighting markup */
    value: string;
    /** second-best heuristically detected language */
    second_best?: HighlightAutoResult;
  }
  export function highlightAuto(
      code: string, languageOptions?: string[]): HighlightAutoResult;
}
