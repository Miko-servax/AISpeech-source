import os from 'node:os';
import {isIP} from 'node:net';
export function mobileAddress(env=process.env){
 if(env.MOBILE_HOST){if(isIP(env.MOBILE_HOST)!==4)throw new Error('MOBILE_HOST必须为本机局域网IPv4地址');return env.MOBILE_HOST;}
 const addresses=Object.entries(os.networkInterfaces()).flatMap(([name,list])=>list.filter(a=>a.family==='IPv4'&&!a.internal&&!/utun|tun|tap|docker|veth|vmnet|bridge/i.test(name)).map(a=>({name,address:a.address})));
 const chosen=addresses.find(a=>a.name==='en0')??addresses.find(a=>/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(a.address));
 if(!chosen)throw new Error('未找到局域网地址，请连接Wi-Fi，或设置MOBILE_HOST');return chosen.address;
}
export function mobileConfig(env=process.env){
 const host=mobileAddress(env);const port=(name,fallback)=>{const n=Number(env[name]||fallback);if(!Number.isInteger(n)||n<1024||n>65535)throw new Error(name+'端口无效');return n;};
 return {host,httpsPort:port('MOBILE_HTTPS_PORT',5443),certPort:port('MOBILE_CERT_PORT',5442),apiPort:port('MOBILE_API_PORT',8790),origin:`https://${host}:${port('MOBILE_HTTPS_PORT',5443)}`};
}
