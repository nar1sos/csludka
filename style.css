const DEFAULT_RARITIES = [
  {
    id: 'covert',
    name: 'Тайное',
    color: '#eb4b4b',
    bg: '#1b1114',
    gradientColors: ['#eb4b4b', '#1b1114'],
    order: 5,
    weight: 4,
    packWeight: 4,
    effect: 'glow'
  },
  {
    id: 'classified',
    name: 'Засекреченное',
    color: '#d32ce6',
    bg: '#19101d',
    gradientColors: ['#d32ce6', '#19101d'],
    order: 4,
    weight: 10,
    packWeight: 10,
    effect: 'none'
  },
  {
    id: 'restricted',
    name: 'Запрещённое',
    color: '#8847ff',
    bg: '#151221',
    gradientColors: ['#8847ff', '#151221'],
    order: 3,
    weight: 22,
    packWeight: 22,
    effect: 'none'
  },
  {
    id: 'milspec',
    name: 'Армейское',
    color: '#4b69ff',
    bg: '#111524',
    gradientColors: ['#4b69ff', '#111524'],
    order: 2,
    weight: 64,
    packWeight: 64,
    effect: 'none'
  }
];

const DEFAULT_WEARS = [
  { code: 'FN', label: 'Factory New', priceMult: 1.0, weight: 18 },
  { code: 'MW', label: 'Minimal Wear', priceMult: 0.78, weight: 24 },
  { code: 'FT', label: 'Field-Tested', priceMult: 0.56, weight: 30 },
  { code: 'WW', label: 'Well-Worn', priceMult: 0.38, weight: 16 },
  { code: 'BS', label: 'Battle-Scarred', priceMult: 0.24, weight: 12 }
];

const DEFAULT_CARDS = [
  {
    id: 's_ak_redline',
    weapon: 'AK-47',
    name: 'Redline',
    rarity: 'classified',
    price: 4500,
    hasStatTrak: true,
    hasSouvenir: false,
    img: 'https://placehold.co/320x200/1c1923/eb4b4b?text=AK-47+%7C+Redline'
  },
  {
    id: 's_awp_asiimov',
    weapon: 'AWP',
    name: 'Asiimov',
    rarity: 'covert',
    price: 12000,
    hasStatTrak: true,
    hasSouvenir: false,
    img: 'https://placehold.co/320x200/1e1b18/f97316?text=AWP+%7C+Asiimov'
  },
  {
    id: 's_m4a4_desolate',
    weapon: 'M4A4',
    name: 'Desolate Space',
    rarity: 'classified',
    price: 3600,
    hasStatTrak: true,
    hasSouvenir: false,
    img: 'https://placehold.co/320x200/121829/38bdf8?text=M4A4+%7C+Desolate+Space'
  },
  {
    id: 's_desert_blaze',
    weapon: 'Desert Eagle',
    name: 'Blaze',
    rarity: 'restricted',
    price: 6800,
    hasStatTrak: false,
    hasSouvenir: true,
    img: 'https://placehold.co/320x200/24130c/facc15?text=Deagle+%7C+Blaze'
  },
  {
    id: 's_usp_kill',
    weapon: 'USP-S',
    name: 'Kill Confirmed',
    rarity: 'covert',
    price: 9200,
    hasStatTrak: true,
    hasSouvenir: false,
    img: 'https://placehold.co/320x200/231115/ef4444?text=USP-S+%7C+Kill+Confirmed'
  },
  {
    id: 's_glock_water',
    weapon: 'Glock-18',
    name: 'Water Elemental',
    rarity: 'restricted',
    price: 1400,
    hasStatTrak: true,
    hasSouvenir: true,
    img: 'https://placehold.co/320x200/0f1f2c/22d3ee?text=Glock-18+%7C+Water+Elemental'
  },
  {
    id: 's_ak_slate',
    weapon: 'AK-47',
    name: 'Slate',
    rarity: 'restricted',
    price: 1100,
    hasStatTrak: true,
    hasSouvenir: true,
    img: 'https://placehold.co/320x200/15171c/94a3b8?text=AK-47+%7C+Slate'
  },
  {
    id: 's_p90_asiimov',
    weapon: 'P90',
    name: 'Asiimov',
    rarity: 'classified',
    price: 1900,
    hasStatTrak: true,
    hasSouvenir: true,
    img: 'https://placehold.co/320x200/1d1916/fb923c?text=P90+%7C+Asiimov'
  },
  {
    id: 's_mp9_food',
    weapon: 'MP9',
    name: 'Food Chain',
    rarity: 'restricted',
    price: 950,
    hasStatTrak: true,
    hasSouvenir: false,
    img: 'https://placehold.co/320x200/142219/4ade80?text=MP9+%7C+Food+Chain'
  },
  {
    id: 's_mac10_neon',
    weapon: 'MAC-10',
    name: 'Neon Rider',
    rarity: 'classified',
    price: 2200,
    hasStatTrak: true,
    hasSouvenir: true,
    img: 'https://placehold.co/320x200/211028/e879f9?text=MAC-10+%7C+Neon+Rider'
  },
  {
    id: 's_famas_roll',
    weapon: 'FAMAS',
    name: 'Roll Cage',
    rarity: 'milspec',
    price: 600,
    hasStatTrak: true,
    hasSouvenir: false,
    img: 'https://placehold.co/320x200/141824/60a5fa?text=FAMAS+%7C+Roll+Cage'
  },
  {
    id: 's_five_monkey',
    weapon: 'Five-SeveN',
    name: 'Monkey Business',
    rarity: 'milspec',
    price: 500,
    hasStatTrak: true,
    hasSouvenir: true,
    img: 'https://placehold.co/320x200/241b11/fbbf24?text=Five-SeveN+%7C+Monkey+Business'
  }
];

const DEFAULT_CASES = [
  {
    id: 'case_starter_cs',
    name: 'Starter Weapon Case',
    price: 800,
    categoryId: 'cat_featured',
    img: 'https://placehold.co/320x180/181c26/f5b915?text=STARTER+CASE',
    cardIds: ['s_ak_slate', 's_famas_roll', 's_five_monkey', 's_glock_water', 's_mp9_food', 's_ak_redline']
  },
  {
    id: 'case_covert_cs',
    name: 'Covert & Souvenir Case',
    price: 2500,
    categoryId: 'cat_featured',
    img: 'https://placehold.co/320x180/241219/eb4b4b?text=COVERT+CASE',
    cardIds: ['s_ak_redline', 's_awp_asiimov', 's_m4a4_desolate', 's_desert_blaze', 's_usp_kill', 's_p90_asiimov', 's_mac10_neon']
  }
];
