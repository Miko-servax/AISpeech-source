export const RuleReason: {readonly Matched:'matched';readonly Cancel:'cancel';readonly Empty:'empty';readonly Negated:'negated';readonly NonImperative:'non_imperative';readonly Ambiguous:'ambiguous';readonly InvalidMagnitude:'invalid_magnitude';readonly UnsupportedDevice:'unsupported_device';readonly UnsupportedExpression:'unsupported_expression';readonly ModelFallback:'model_fallback'};
export type Reason = typeof RuleReason[keyof typeof RuleReason];
export type Id = 'FL'|'FR'|'RL'|'RR';
export type Operation = {kind:'absolute';value:number}|{kind:'relative';delta:number};
export type Intent = {type:'command'|'clarify'|'unsupported';target:{source:'explicit'|'context'|'pending'|'unknown';ids:Id[];candidates:Id[]};operation:Operation|null;missing:null|'target'|'action'|'amount'};
export type IntentContext = {active:{target:Id;expiresAt:number}|null;pending:{operation:Operation;expiresAt:number;candidates:Id[]|null}|null};
export const IDS: Id[];
export function classifyText(raw:string): Reason;
export function normalize(raw:string): string;
export type IntentConstraints={targets:Id[]|null;candidates:Id[]|null;requiresTargetClarification:boolean;mode:'absolute'|'relative'|null;magnitude:number|null;direction:1|-1|null};
export function extractConstraints(raw:string):IntentConstraints;
export class IntentValidationError extends Error {code:string;path:string;constructor(code:string,message:string,path:string);}
export function clarificationCandidates(intent:Intent,raw:string,context:IntentContext,now?:number):Id[];
export function validateIntent(intent:unknown,raw:string,context:IntentContext,now?:number): Intent;
export function validateContext(c:unknown): IntentContext;
export function operationValid(o:unknown):boolean;
export const intentSchema:object;
