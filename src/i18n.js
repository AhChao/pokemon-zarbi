// 極簡 i18n：以字典 + t() 取字串，預設繁體中文，保留未來擴充多語的空間。
import { TYPE_META } from './data/typechart.js';

export const DEFAULT_LANG = 'zh';

const DICT = {
  zh: {
    'app.title': '寶可夢快問快答',
    'app.subtitle': '屬性相剋 · 隨機測驗 · 成績碼分享',
    'nav.quiz': '開始測驗',
    'nav.chart': '相剋查詢',
    'home.lead': '選一種測驗，挑戰 10 題拿成績碼，分享給朋友比拚。',
    'home.pickTitle': '選一種測驗',
    'home.openChart': '查屬性相剋表',
    'quiz.type.title': '屬性相剋',
    'quiz.type.desc': '招式打不同屬性的傷害倍率',
    'quiz.speed.title': '種族值 · 誰比較快',
    'quiz.speed.desc': '兩隻寶可夢，純比種族值速度',
    'quiz.who.title': '我是誰',
    'quiz.who.desc': '看黑影猜寶可夢，打出名字',
    'setup.title': '準備開始',
    'setup.season': '選賽季',
    'setup.pool': '選範圍',
    'setup.difficulty': '選難度',
    'setup.start': '開始測驗（10 題）',
    'difficulty.easy': '簡單',
    'difficulty.normal': '普通',
    'difficulty.medium': '中等',
    'difficulty.hard': '困難',
    'difficulty.all': '混合',
    'difficulty.easy.note': '速度差距大（20 以上），一眼就分得出來',
    'difficulty.medium.note': '速度接近（差 6～19），要稍微想一下',
    'difficulty.hard.note': '速度非常接近（差 5 以內），考驗熟練度',
    'difficulty.all.note': '不限速度差距，混合各種題目',
    'who.difficulty.easy.note': '不含 Mega，露第一個字、其餘以圈圈呈現',
    'who.difficulty.normal.note': '不含 Mega，以圈圈呈現字數',
    'who.difficulty.hard.note': '含 Mega，沒有提示，最考驗熟練度',
    'who.prompt': '這是誰？打出中文名字',
    'who.placeholder': '輸入名字…',
    'who.submit': '確認',
    'dex.title': '圖鑑',
    'dex.openBtn': '圖鑑',
    'dex.group.gen': '世代 / 地區',
    'dex.group.season': '賽制',
    'dex.type.all': '全部',
    'dex.count': '{n} 隻',
    'dex.tapHint': '點立繪看名字',
    'who.correct': '答對了！是 {name}',
    'who.wrong': '答錯了，正解是 {name}',
    'speed.prompt': '誰比較快？',
    'speed.note': '只看種族值速度，不計天氣、招式、特性',
    'speed.fasterIs': '{name} 比較快（速度 {speed}）',
    'home.thisCode': '本局題目碼（傳給朋友一起測）',
    'home.copyShare': '複製連結',
    'home.reroll': '換一份題目',
    'home.codeTitle': '用代碼挑戰',
    'home.codeHint': '貼上朋友給的成績碼或分享連結，玩同一份題目',
    'home.codePlaceholder': '貼上代碼或連結…',
    'home.codeGo': '開始挑戰',
    'home.codeBad': '代碼無效，請確認後再試一次',
    'quiz.progress': '第 {n} / {total} 題',
    'quiz.prompt': '這個招式打下去，傷害倍率是多少？',
    'quiz.attackBy': '{type} 系招式',
    'quiz.defender': '對手屬性',
    'quiz.next': '下一題',
    'quiz.finish': '看成績',
    'quiz.correct': '答對了！',
    'quiz.wrong': '答錯了，正解是 {answer}',
    'result.title': '測驗結果',
    'result.score': '你答對了 {score} / {total} 題',
    'result.yourCode': '你的成績碼',
    'result.copy': '複製分享連結',
    'result.copied': '已複製！',
    'result.retry': '再玩一次（新題目）',
    'result.review': '逐題檢討',
    'challenge.title': '有人向你下戰帖！',
    'challenge.body': '對方在這份測驗答對了 {score} / {total} 題。你能贏過嗎？',
    'challenge.start': '接受挑戰（同一份題目）',
    'challenge.coplayTitle': '一起測這份題目',
    'challenge.coplayBody': '你和朋友會拿到同一份 {total} 題，做完各自得到成績碼再比分數！',
    'challenge.coplayStart': '開始這份題目',
    'challenge.beat': '你贏了！{you} 勝 {them}',
    'challenge.tie': '平手！都是 {you} 分。',
    'challenge.lose': '差一點，{you} 對 {them}，再接再厲！',
    'chart.title': '屬性相剋查詢',
    'chart.attack': '攻擊屬性',
    'chart.defense': '防禦屬性',
    'chart.result': '傷害倍率',
    'chart.gridHint': '直排為攻擊方、橫排為防禦方；點任一格看倍率。',
    'speedline.title': '速度線表（Lv50）',
    'speedline.openBtn': '查速度線表',
    'speedline.hint': '依賽季列出每個速度種族值在 50 級的實數值，同速排一列。可左右滑動看更多欄。',
    'speedline.legend': '最速＝252努力＋加速性格、準速＝252努力無修正、無振＝0努力、減速＝0努力＋減速性格；圍巾 ×1.5、順風 ×2。',
    'speedline.search': '搜尋寶可夢（中／英、可模糊）…',
    'speedline.searchBtn': '搜尋',
    'speedline.noMatch': '這份賽季名單裡找不到這隻',
    'speedline.toTop': '回到頁頭',
    'common.back': '返回首頁',
  },
};

let lang = DEFAULT_LANG;
export function setLang(l) { if (DICT[l]) lang = l; }
export function getLang() { return lang; }

export function t(key, vars) {
  let s = (DICT[lang] && DICT[lang][key]) || key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, String(vars[k]));
  }
  return s;
}

// 屬性在地化名稱。
export function typeName(typeKey) {
  const meta = TYPE_META[typeKey];
  if (!meta) return typeKey;
  return lang === 'en' ? meta.en : meta.zh;
}
