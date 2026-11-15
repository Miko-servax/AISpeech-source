import type {Id,Operation,Intent,IntentContext} from './intent.mjs';
export type BatchItem={targets:Id[];operation:Operation|null;candidates?:Id[]};
export type PreparedBatch={items:BatchItem[];ready:boolean;missingIndex:number};
export type BatchIntent={type:'command'|'clarify'|'unsupported';items:{clause:string;intent:Intent}[]};
export function splitClauses(raw:string):string[];
export function prepareBatch(items:BatchItem[]):PreparedBatch;
export function validateBatchIntent(value:unknown,raw:string,context:IntentContext,now?:number):BatchIntent;
export const batchSchema:object;

export function requestContent(raw:string):string;
