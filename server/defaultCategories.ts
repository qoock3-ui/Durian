/**
 * 預設分類。使用者第一次讀取 /api/categories 時種進 categories 表,
 * 之後就以資料庫為準——改名、封存、新增都不會回頭動到這裡。
 *
 * key 一旦種下就不能改:assets.category / incomes.type / expenses.category
 * 存的就是這個字串。既有資料的 key 全部保留,新分類一律新增,不做遷移。
 *
 * sign 只對資產有意義:-1 表示計入淨資產時要減(負債、保險),
 * 讓淨資產公式跟著分類走,而不是寫死一份負債清單。
 */
export type DefaultCategory = {
  key: string;
  group: string;
  label: string;
  icon: string;
  tint: string;
  sign?: -1;
};

export const DEFAULT_ASSET_CATEGORIES: DefaultCategory[] = [
  // 現金存款
  { key: "cash_tw", group: "現金存款", label: "現金/存款(台灣)", icon: "💵", tint: "bg-p-mint" },
  { key: "cash_vn", group: "現金存款", label: "現金/存款(越南)", icon: "💵", tint: "bg-p-mint" },
  { key: "cash_other", group: "現金存款", label: "現金/存款(其他)", icon: "💴", tint: "bg-p-mint" },
  { key: "epay", group: "現金存款", label: "電子支付/儲值", icon: "📱", tint: "bg-p-mint" },

  // 金融投資
  { key: "stock_tw", group: "金融投資", label: "台股", icon: "📊", tint: "bg-p-sky" },
  { key: "stock_us", group: "金融投資", label: "美股", icon: "🗽", tint: "bg-p-sky" },
  { key: "stock_vn", group: "金融投資", label: "越南股票", icon: "🏯", tint: "bg-p-sky" },
  { key: "etf_fund", group: "金融投資", label: "ETF/基金", icon: "🧺", tint: "bg-p-sky" },
  { key: "bond", group: "金融投資", label: "債券", icon: "📜", tint: "bg-p-sky" },
  { key: "time_deposit", group: "金融投資", label: "定期存款", icon: "🏦", tint: "bg-p-sky" },
  { key: "crypto", group: "金融投資", label: "加密貨幣", icon: "🪙", tint: "bg-p-sky" },

  // 不動產/動產
  { key: "realestate_tw", group: "不動產/動產", label: "台灣房產", icon: "🏡", tint: "bg-p-lilac" },
  { key: "realestate_vn", group: "不動產/動產", label: "越南房產", icon: "🏘️", tint: "bg-p-lilac" },
  { key: "vehicle", group: "不動產/動產", label: "車輛", icon: "🚗", tint: "bg-p-lilac" },
  { key: "valuables", group: "不動產/動產", label: "貴金屬/收藏", icon: "💎", tint: "bg-p-lilac" },

  // 應收款項
  { key: "receivable", group: "應收款項", label: "借出款", icon: "🤝", tint: "bg-p-butter" },
  { key: "deposit_paid", group: "應收款項", label: "押金/保證金", icon: "🔐", tint: "bg-p-butter" },

  // 保障與退休
  { key: "pension", group: "保障與退休", label: "勞退/退休金", icon: "🏛️", tint: "bg-p-sage" },
  // 保險依原本的淨資產公式計為減項
  { key: "insurance", group: "保障與退休", label: "保險", icon: "🛡️", tint: "bg-p-sage", sign: -1 },

  // 負債
  { key: "liability", group: "負債", label: "其他負債", icon: "💳", tint: "bg-p-rose", sign: -1 },
  { key: "mortgage", group: "負債", label: "房貸", icon: "🏚️", tint: "bg-p-rose", sign: -1 },
  { key: "car_loan", group: "負債", label: "車貸", icon: "🚙", tint: "bg-p-rose", sign: -1 },
  { key: "credit_card", group: "負債", label: "信用卡未繳", icon: "💳", tint: "bg-p-rose", sign: -1 },

  // 其他
  { key: "other", group: "其他", label: "其他", icon: "📦", tint: "bg-p-stone" },
];

export const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  // 薪資獎金
  { key: "active", group: "薪資獎金", label: "薪資", icon: "💼", tint: "bg-p-mint" },
  { key: "bonus", group: "薪資獎金", label: "獎金/年終", icon: "🎁", tint: "bg-p-mint" },
  { key: "allowance", group: "薪資獎金", label: "津貼/加給", icon: "🧾", tint: "bg-p-mint" },

  // 投資收益
  { key: "investment", group: "投資收益", label: "投資收益", icon: "📊", tint: "bg-p-sky" },
  { key: "dividend", group: "投資收益", label: "股利", icon: "💹", tint: "bg-p-sky" },
  { key: "interest", group: "投資收益", label: "利息", icon: "🏦", tint: "bg-p-sky" },
  { key: "rental", group: "投資收益", label: "租金收入", icon: "🏠", tint: "bg-p-sky" },

  // 副業/營業收入
  { key: "passive", group: "副業/營業收入", label: "被動收入", icon: "🌱", tint: "bg-p-sage" },
  { key: "side_business", group: "副業/營業收入", label: "副業/接案", icon: "💻", tint: "bg-p-sage" },
  { key: "business", group: "副業/營業收入", label: "營業收入", icon: "🏪", tint: "bg-p-sage" },

  // 補助與其他所得
  { key: "subsidy", group: "補助與其他所得", label: "政府補助", icon: "🏛️", tint: "bg-p-butter" },
  { key: "tax_refund", group: "補助與其他所得", label: "退稅", icon: "🧾", tint: "bg-p-butter" },
  { key: "gift", group: "補助與其他所得", label: "禮金/紅包", icon: "🧧", tint: "bg-p-butter" },
  { key: "other", group: "補助與其他所得", label: "其他收入", icon: "✨", tint: "bg-p-butter" },
];

/**
 * 排列順序即 sort 值。「其他」刻意放在最後,前面依日常使用頻率排。
 * key 全部沿用,只是位置調整——sort 不開放使用者編輯,所以補種時
 * 可以安全地一併校正,新舊帳號看到的順序才會一致。
 */
export const DEFAULT_EXPENSE_CATEGORIES: DefaultCategory[] = [
  { key: "food", group: "支出", label: "餐飲", icon: "🍜", tint: "bg-p-peach" },
  { key: "daily", group: "支出", label: "日用品", icon: "🧴", tint: "bg-p-mint" },
  { key: "transport", group: "支出", label: "交通", icon: "🚗", tint: "bg-p-sky" },
  { key: "telecom", group: "支出", label: "通信", icon: "📱", tint: "bg-p-sky" },
  { key: "housing", group: "支出", label: "住房水電", icon: "🏠", tint: "bg-p-lilac" },
  { key: "shopping", group: "支出", label: "購物", icon: "🛍️", tint: "bg-p-butter" },
  { key: "clothing", group: "支出", label: "服飾", icon: "👕", tint: "bg-p-rose" },
  { key: "beauty", group: "支出", label: "美容", icon: "💇", tint: "bg-p-rose" },
  { key: "entertainment", group: "支出", label: "娛樂", icon: "🎮", tint: "bg-p-rose" },
  { key: "social", group: "支出", label: "社交", icon: "🥂", tint: "bg-p-peach" },
  { key: "travel", group: "支出", label: "旅行", icon: "🏖️", tint: "bg-p-sky" },
  { key: "gift", group: "支出", label: "禮物", icon: "🎁", tint: "bg-p-rose" },
  { key: "medical", group: "支出", label: "醫療健康", icon: "🏥", tint: "bg-p-mint" },
  { key: "education", group: "支出", label: "教育", icon: "🎓", tint: "bg-p-sage" },
  { key: "baby", group: "支出", label: "寶寶", icon: "🍼", tint: "bg-p-butter" },
  { key: "pet", group: "支出", label: "寵物", icon: "🐶", tint: "bg-p-butter" },
  { key: "tax", group: "支出", label: "稅金", icon: "🧾", tint: "bg-p-stone" },
  { key: "work", group: "支出", label: "工作相關", icon: "💼", tint: "bg-p-sage" },
  { key: "other", group: "支出", label: "其他", icon: "📦", tint: "bg-p-stone" },
];

export const DEFAULTS: Record<string, DefaultCategory[]> = {
  asset: DEFAULT_ASSET_CATEGORIES,
  income: DEFAULT_INCOME_CATEGORIES,
  expense: DEFAULT_EXPENSE_CATEGORIES,
};

export const CATEGORY_KINDS = ["asset", "income", "expense"] as const;

/** 供新增分類挑選的粉彩底色 */
export const TINTS = [
  "bg-p-peach", "bg-p-sky", "bg-p-lilac", "bg-p-rose",
  "bg-p-mint", "bg-p-butter", "bg-p-sage", "bg-p-stone",
] as const;
