// Local-only, explainable activity suggestions. Text is never sent to a model.
const rules: Array<{id:string;terms:string[]}> = [
  {id:'work.meeting',terms:['會議','開會','meeting','sync call']},
  {id:'work.writing',terms:['寫報告','寫提案','撰寫','報告','文件','proposal','report','draft']},
  {id:'work.messages',terms:['郵件','電郵','回訊','訊息','email','inbox','messages']},
  {id:'work.deep',terms:['專注工作','深度工作','編程','程式','coding','deep work']},
  {id:'learning.reading',terms:['閱讀','看書','讀書','reading','book']},
  {id:'learning.course',terms:['上課','課程','講座','class','course','lecture']},
  {id:'home.cooking',terms:['煮飯','烹飪','備餐','cooking','cook']},
  {id:'home.cleaning',terms:['打掃','清潔','洗衣','cleaning','laundry']},
  {id:'care.child',terms:['照顧孩子','接孩子','育兒','childcare','kids']},
  {id:'health.exercise',terms:['運動','健身','跑步','游泳','exercise','workout','running']},
  {id:'health.walk',terms:['散步','走路','walking','walk']},
  {id:'rest.break',terms:['休息','放鬆','小歇','break','rest']},
  {id:'entertainment.game',terms:['打電動','遊戲','電玩','gaming','video game']},
  {id:'entertainment.video',terms:['追劇','看劇','影片','電影','netflix','movie','series']},
  {id:'entertainment.socialmedia',terms:['社群媒體','滑手機','instagram','tiktok','social media']},
  {id:'sleep.night',terms:['睡覺','睡眠','睡了','睡前','sleep','asleep']},
  {id:'travel.commute',terms:['通勤','上下班','commute']},
  {id:'travel.transit',terms:['捷運','公車','火車','地鐵','bus','train','subway']},
  {id:'life.meal',terms:['吃飯','午餐','晚餐','早餐','用餐','meal','lunch','dinner','breakfast']},
];
export function suggestActivity(text:string):{id:string;matched:string;confidence:number}|null {
  const normal=text.trim().toLowerCase();
  if(normal.length<2)return null;
  let best:{id:string;matched:string;confidence:number}|null=null;
  for(const rule of rules){
    for(const term of rule.terms){
      if(!normal.includes(term))continue;
      const confidence=Math.min(.85,.55+Math.min(term.length/normal.length,.5)*.5);
      if(!best||confidence>best.confidence)best={id:rule.id,matched:term,confidence};
    }
  }
  return best;
}
