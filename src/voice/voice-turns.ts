/** A recording-wide fence. Delayed first result and final-only result use the same
 * start-time version. No cloud event arrival is treated as the microphone start. */
export class VoiceTurns {
  private version = 0;
  private session: string | null = null;
  private sentences = new Map<number, number>();
  private lastFinal = -1;
  begin(version: number){this.version=version;this.session=null;this.sentences.clear();this.lastFinal=-1;}
  bind(session: string){this.session=session;}
  observe(event: {session?:string;index?:number}){
    if(!this.session||event.session!==this.session||!Number.isInteger(event.index)||event.index!<0)return null;
    if(!this.sentences.has(event.index!))this.sentences.set(event.index!,this.version);
    return this.sentences.get(event.index!)!;
  }
  final(event: {session?:string;index?:number}){
    const version=this.observe(event);
    if(version===null||event.index!<=this.lastFinal)return null;
    this.lastFinal=event.index!;return version;
  }
}
