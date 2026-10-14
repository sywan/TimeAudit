import type { Locale } from './i18n';

// IPIP 50-item Big-Five markers are public-domain items. Traditional Chinese
// wording: Sih-Ci Jhu translation listed by IPIP. Order and keying follow
// https://www.ipip.ori.org/New_IPIP-50-item-scale.htm
export const ipipItems: Array<{en:string;zh:string;factor:number;reverse:boolean}> = [
  {en:'I am the life of the party.',zh:'我是派對中的靈魂人物。',factor:0,reverse:false},
  {en:'I feel little concern for others.',zh:'我覺得自己很少關心別人。',factor:1,reverse:true},
  {en:'I am always prepared.',zh:'我隨時做好準備。',factor:2,reverse:false},
  {en:'I get stressed out easily.',zh:'我容易感到壓力過大。',factor:3,reverse:true},
  {en:'I have a rich vocabulary.',zh:'我詞彙豐富。',factor:4,reverse:false},
  {en:"I don't talk a lot.",zh:'我話不多。',factor:0,reverse:true},
  {en:'I am interested in people.',zh:'我對人感興趣。',factor:1,reverse:false},
  {en:'I leave my belongings around.',zh:'我總是丟三落四。',factor:2,reverse:true},
  {en:'I am relaxed most of the time.',zh:'我大多時候是放鬆的。',factor:3,reverse:false},
  {en:'I have difficulty understanding abstract ideas.',zh:'我對於理解抽象概念有困難。',factor:4,reverse:true},
  {en:'I feel comfortable around people.',zh:'我和其他人在一起時感覺自在。',factor:0,reverse:false},
  {en:'I insult people.',zh:'我會侮辱別人。',factor:1,reverse:true},
  {en:'I pay attention to details.',zh:'我經常注意細節。',factor:2,reverse:false},
  {en:'I worry about things.',zh:'我時常為事擔心。',factor:3,reverse:true},
  {en:'I have a vivid imagination.',zh:'我有生動的想像力。',factor:4,reverse:false},
  {en:'I keep in the background.',zh:'我是個低調的人。',factor:0,reverse:true},
  {en:"I sympathize with others' feelings.",zh:'我會同情他人的感受。',factor:1,reverse:false},
  {en:'I make a mess of things.',zh:'我常把事物弄得一團糟。',factor:2,reverse:true},
  {en:'I seldom feel blue.',zh:'我很少感到鬱悶。',factor:3,reverse:false},
  {en:'I am not interested in abstract ideas.',zh:'我對抽象概念不感興趣。',factor:4,reverse:true},
  {en:'I start conversations.',zh:'我總是主動開始談話。',factor:0,reverse:false},
  {en:"I am not interested in other people's problems.",zh:'我對別人的問題不感興趣。',factor:1,reverse:true},
  {en:'I get chores done right away.',zh:'我會立即將日常家務做完。',factor:2,reverse:false},
  {en:'I am easily disturbed.',zh:'我容易受擾亂。',factor:3,reverse:true},
  {en:'I have excellent ideas.',zh:'我常有絕佳的點子。',factor:4,reverse:false},
  {en:'I have little to say.',zh:'我沒什麼話說。',factor:0,reverse:true},
  {en:'I have a soft heart.',zh:'我有顆柔軟的心。',factor:1,reverse:false},
  {en:'I often forget to put things back in their proper place.',zh:'我常忘記物歸原處。',factor:2,reverse:true},
  {en:'I get upset easily.',zh:'我容易感到悶悶不樂。',factor:3,reverse:true},
  {en:'I do not have a good imagination.',zh:'我想像力欠佳。',factor:4,reverse:true},
  {en:'I talk to a lot of different people at parties.',zh:'在聚會中我會跟許多不同的人說話。',factor:0,reverse:false},
  {en:'I am not really interested in others.',zh:'我對別人沒什麼興趣。',factor:1,reverse:true},
  {en:'I like order.',zh:'我喜歡井然有序。',factor:2,reverse:false},
  {en:'I change my mood a lot.',zh:'我的心情變化很大。',factor:3,reverse:true},
  {en:'I am quick to understand things.',zh:'我可以很快理解事物。',factor:4,reverse:false},
  {en:"I don't like to draw attention to myself.",zh:'我不喜歡引起別人對自己的注意。',factor:0,reverse:true},
  {en:'I take time out for others.',zh:'我總會為別人抽出時間。',factor:1,reverse:false},
  {en:'I shirk my duties.',zh:'我會推卸責任。',factor:2,reverse:true},
  {en:'I have frequent mood swings.',zh:'我的心情時常起伏不定。',factor:3,reverse:true},
  {en:'I use difficult words.',zh:'我常使用艱澀的字彙。',factor:4,reverse:false},
  {en:"I don't mind being the center of attention.",zh:'我不介意成為注目的焦點。',factor:0,reverse:false},
  {en:"I feel others' emotions.",zh:'我能感受他人的情緒。',factor:1,reverse:false},
  {en:'I follow a schedule.',zh:'我總是按照預定計畫行事。',factor:2,reverse:false},
  {en:'I get irritated easily.',zh:'我容易感到煩躁。',factor:3,reverse:true},
  {en:'I spend time reflecting on things.',zh:'我會花時間反思事物。',factor:4,reverse:false},
  {en:'I am quiet around strangers.',zh:'我和陌生人相處時顯得安靜。',factor:0,reverse:true},
  {en:'I make people feel at ease.',zh:'我能使人感到自在。',factor:1,reverse:false},
  {en:'I am exacting in my work.',zh:'我對我的工作要求嚴謹。',factor:2,reverse:false},
  {en:'I often feel blue.',zh:'我常感到鬱悶。',factor:3,reverse:true},
  {en:'I am full of ideas.',zh:'我總是充滿想法。',factor:4,reverse:false},
];

export const factorNames:Record<Locale,string[]> = {
  'zh-TW':['外向性','宜人性','盡責性','情緒穩定性','想像／智性'],
  en:['Extraversion','Agreeableness','Conscientiousness','Emotional stability','Intellect / imagination'],
};

export function scoreIpip(responses:Record<string,number>):number[]|null {
  if(ipipItems.some((_,i)=>!Number.isInteger(responses[String(i)])||responses[String(i)]<1||responses[String(i)]>5)) return null;
  const scores=[0,0,0,0,0];
  ipipItems.forEach((item,i)=>{scores[item.factor]+=item.reverse?6-responses[String(i)]:responses[String(i)];});
  return scores.map(n=>Math.round(n*10)/10);
}
