import type {InsightFeedback} from './types.ts';

export function mergeInsightFeedback(...groups:InsightFeedback[][]):InsightFeedback[]{
  const byId=new Map<string,InsightFeedback>();
  for(const item of groups.flat()){
    const previous=byId.get(item.id);
    if(!previous||item.updatedAt>previous.updatedAt)byId.set(item.id,item);
  }
  return [...byId.values()];
}
