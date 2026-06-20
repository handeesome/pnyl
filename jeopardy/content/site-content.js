window.ACTIVITY_CONTENT = {
  storageKey: "fellowship-jeopardy-state:v1",

  site: {
    documentTitle: "认识团契的弟兄姊妹",
    brandTitle: "认识团契的弟兄姊妹",
    brandSubtitle: "Fellowship Night"
  },

  stages: [
    { id: "home", label: "首页" },
    { id: "game1", label: "游戏一" },
    { id: "jeopardy", label: "Jeopardy" }
  ],

  home: {
    eyebrow: "Tonight's Theme",
    title: "在团契中重新认识彼此",
    lede: "今晚的活动不是为了制造热闹，而是创造一个更容易开口、聆听和彼此关心的空间。通过座位、问题和团队游戏，我们练习在熟悉的人中看见新的故事，也把认识带进更具体的代祷与陪伴。",
    points: [
      {
        title: "看见生活处境",
        body: "从轻松的问题开始，听见彼此最近真实经历的喜乐、压力和感谢。"
      },
      {
        title: "练习主动聆听",
        body: "让回答不只是轮到谁说话，也成为大家彼此观察和回应的机会。"
      },
      {
        title: "把认识带入代祷",
        body: "把今晚听见的故事变成更具体的关心，也带到之后的祷告里。"
      }
    ],
    primaryAction: { label: "进入游戏一", stage: "game1" },
    secondaryAction: { label: "先添加人员" },
    participantPanelTitle: "参与人员",
    participantPanelDescription: "当前 {count} 人。名单会用于座位、分组和随机抽人。",
    emptyParticipants: "还没有添加人员。点击“添加人员”，输入 nickname 即可开始。"
  },

  gameOne: {
    eyebrow: "Game One",
    title: "M&M 糖果问题",
    description: "每个人轮流拿一颗糖，按颜色回答一个问题。结束后，为自己右手边的人祷告。",
    nextAction: { label: "进入 Jeopardy", stage: "jeopardy" },
    seatActionLabel: "分配座位",
    lateParticipantActionLabel: "添加迟到人员",
    statusNote: "后续添加人员不会自动改变座位图，需要时可以重新分配。",
    seatingTitle: "U 型座位",
    seatingEmptyDescription: "点击“分配座位”后，会把名单随机打散并排成 U 型。",
    seatingReadyDescription: "这是当前随机座位图。",
    emptySeating: "还没有座位图。当前名单有 {count} 人。",
    tableLabel: "桌面",
    rules: [
      { color: "红色", hex: "#b94b3f", prompt: "这周一个开心瞬间" },
      { color: "黄色", hex: "#d9ad3f", prompt: "最近一个想感谢的人" },
      { color: "蓝色", hex: "#3d6f9f", prompt: "最近一个小压力" },
      { color: "绿色", hex: "#4d8a59", prompt: "如果这周可以休息一天，你想怎么过" },
      { color: "橙色", hex: "#d98236", prompt: "最近一个让你觉得被照顾或被鼓励的瞬间" },
      { color: "棕色", hex: "#7a5138", prompt: "最近一个神可能在提醒你的地方" }
    ]
  },

  jeopardy: {
    eyebrow: "Game Two",
    title: "Jeopardy",
    description: "点击类别查看规则，点击分值进入两张隐藏卡。分数由主持人手动加减。",
    regroupActionLabel: "重新随机分组",
    setupEmpty: "进入 Jeopardy 前需要先随机分组。点击下方按钮即可打开分组窗口。",
    setupActionLabel: "开始分组"
  }
};
