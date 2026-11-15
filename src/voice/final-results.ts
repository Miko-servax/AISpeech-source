/** One terminal result per sentence. Interim revisions never become actions. */
export class FinalResults {
  private seen = new Set<string>();
  accept(session: string, event: { type: string; index?: number; text?: string }) {
    if(event.type !== 'final' || !Number.isInteger(event.index) || event.index! < 0) return null;
    const key = `${session}:${event.index}`;
    if(this.seen.has(key)) return null;
    this.seen.add(key);
    return { text: event.text ?? '', id: key };
  }
}
