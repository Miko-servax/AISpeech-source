import {watch} from 'vue';
import type {useVehicleStore} from '../stores/vehicle';
/** Dialogue lifetime must not depend on whether WebGL is currently rendering. */
export function watchDialogueExpiry(store:ReturnType<typeof useVehicleStore>){
 let timer:ReturnType<typeof setTimeout>|undefined;
 const stop=watch(()=>[store.dialogueContext?.expiresAt,store.pendingAction?.expiresAt,store.pendingBatch?.expiresAt],dates=>{
  clearTimeout(timer);const deadline=Math.min(...dates.filter((v):v is number=>v!==undefined));
  if(Number.isFinite(deadline))timer=setTimeout(()=>store.expireDialogue(),Math.max(0,deadline-Date.now())+1);
 },{immediate:true,flush:'sync'});
 return ()=>{stop();clearTimeout(timer);};
}
