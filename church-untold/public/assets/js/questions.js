export const QUESTIONS = [
  {
    id: "q1",
    number: "01",
    type: "single",
    title: "最怕被临时点名做什么？",
    options: ["祷告", "读经", "分享", "上台服事", "其实都怕", "都不怕"],
    hasOther: true,
  },
  {
    id: "q2",
    number: "02",
    type: "multiple",
    title: "服事最容易令人崩溃的是什么？",
    note: "最多选两项",
    options: ["事情太多", "意见太多", "找不到人", "加入后很难退出", "沟通太绕", "没服事过 / 不确定"],
    hasOther: true,
  },
  {
    id: "q3",
    number: "03",
    type: "text",
    title: "小时候在教会，最让我无语的一件小事是＿＿＿。",
    placeholder: "散会后爸妈聊天半小时，我只能在走廊等。",
  },
  {
    id: "q4",
    number: "04",
    type: "text",
    title: "从小在教会长大的人，有什么“教会模式”是外人看不懂的？",
    placeholder: "听见“有没有人愿意”就自动低头。",
  },
  {
    id: "q5",
    number: "05",
    type: "text",
    title: "如果今天让我当一天主日学负责人，我第一条要改的是＿＿＿。",
    placeholder: "不要再临时抓人背经文或带祷告。",
  },
];

export const MAX_TEXT_LENGTH = 60;
export const AI_ANSWERS = Object.freeze({
  q3: Object.freeze([
    "散会后爸妈总要聊很久，我只能在门口等。",
    "背不出金句时假装突然很忙。",
    "每次表演都被分到同一件天使袍。",
    "主日学老师永远记得我小时候的糗事。",
    "想去厕所却怕错过点名，只好一直忍着。",
    "圣诞节总要演一遍已经背熟的故事。",
    "聚会结束说再见以后，还要再聊四十分钟。",
  ]),
  q4: Object.freeze([
    "一听见“有没有人愿意”，大家立刻低头看圣经。",
    "祷告结束后会自动一起说阿们。",
    "饭前不祷告总觉得少了一个步骤。",
    "听见熟悉的前奏就知道要站起来。",
    "别人说代祷事项时会自动切换认真表情。",
    "翻圣经很快，却不一定记得刚才读了什么。",
    "听到“最后一点”就知道至少还有三点。",
  ]),
  q5: Object.freeze([
    "所有临时点名都至少提前一周通知。",
    "先问孩子想学什么，再安排课程。",
    "取消每周都要上台表演。",
    "不再用零食奖励背经文。",
    "每堂课至少留十分钟让大家自由提问。",
    "不要临时抓人背经文或带祷告。",
    "允许孩子诚实说今天不想参加游戏。",
  ]),
});
export const VIDEO_URL = "https://www.youtube.com/watch?v=XtkqxW8IARI&t=112s";
