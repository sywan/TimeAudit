import type {Experiment} from './types.ts';

export function mergeExperiments(...groups:Experiment[][]):Experiment[]{
  const map=new Map<string,Experiment>();
  for(const group of groups)for(const item of group){
    const existing=map.get(item.id);
    if(!existing||(item.updatedAt??item.createdAt)>=(existing.updatedAt??existing.createdAt))map.set(item.id,item);
  }
  return [...map.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}
