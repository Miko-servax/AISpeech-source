import type {IncomingMessage,ServerResponse} from 'node:http';
export function modelGzip(root:string):(req:IncomingMessage,res:ServerResponse,next:()=>void)=>void;
