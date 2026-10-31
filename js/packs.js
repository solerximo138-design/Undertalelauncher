export const DEFAULT_PALETTE = {
  bg: '#0b0812',
  wall: '#2a1734',
  wallDark: '#180d21',
  wallLight: '#3d234c',
  brick: '#22132d',
  floor: '#2d1c2d',
  floorDark: '#1b1020',
  floorLine: '#3b273c',
  door: '#08060d',
  doorGlow: '#7150a6',
  flower: '#ffd75e',
  flowerGlow: '#ffb347',
  npc: '#f0eaff',
  npcAccent: '#6fe7e8',
  player: '#4b3a72',
  playerAccent: '#ff3b47',
  ambient: '#b48cff'
};

const BASE_LINES = {
  ru: {
    intro: [
      '* Руины дышат прохладой. Красные листья кружатся в воздухе.',
      '* Впереди кто-то тихо напевает. Кажется, тебя ждут.'
    ],
    npc: [
      'Привет-привет! Ты выглядишь новеньким.',
      'Я Мимо. Стерегу эту маленькую комнату.',
      'Хочешь поиграть? Просто уклоняйся от звёзд. Совсем недолго!'
    ],
    battleStart: ['Лови звёзды!', 'То есть... не лови. Уклоняйся!'],
    win: [
      'Ух ты! Ты почти не упал.',
      'Держи золотую звезду. Тебе идёт.',
      '* Ты получил ЗОЛОТУЮ ДУШУ!'
    ],
    lose: [
      'Ой! Больно?',
      'Давай ещё раз. Я почти не буду жульничать.'
    ],
    flower: [
      '* Золотой цветок тихо гудит.',
      '* Ты чувствуешь себя чуть смелее.'
    ],
    door: [
      '* Дверь заперта с другой стороны.',
      '* Может, сначала закончим игру Мимо?'
    ],
    cleared: [
      'Ты уже настоящий герой Руин.',
      'Золотая душа всегда с тобой. В меню тоже!'
    ]
  },
  en: {
    intro: [
      '* The Ruins breathe cool air. Red leaves drift through the dark.',
      '* Someone is humming up ahead. It sounds like they are waiting for you.'
    ],
    npc: [
      'Hi-hi! You look new.',
      'I am Mimo. I guard this little room.',
      'Wanna play? Just dodge the stars. It will not take long!'
    ],
    battleStart: ['Catch the stars!', 'I mean... do not catch them. Dodge!'],
    win: [
      'Wow! You barely fell.',
      'Take this golden star. It suits you.',
      '* You received the GOLDEN SOUL!'
    ],
    lose: [
      'Oof! That looked painful.',
      'Let us try again. I will barely cheat this time.'
    ],
    flower: [
      '* The golden flower hums softly.',
      '* You feel a little braver.'
    ],
    door: [
      '* The door is locked from the other side.',
      '* Maybe finish Mimo\'s game first?'
    ],
    cleared: [
      'You are a true hero of the Ruins now.',
      'The golden soul stays with you. Even in the menu!'
    ]
  }
};

export const DEFAULT_PACK = {
  id: 'default',
  name: 'DEFAULT SOUL',
  author: 'UTL Studio',
  version: '1.0',
  description: {
    ru: 'Стандартная палитра Руин и оригинальные диалоги.',
    en: 'The default Ruins palette and original dialogue.'
  },
  palette: DEFAULT_PALETTE,
  lines: BASE_LINES,
  npcName: { ru: 'МИМО', en: 'MIMO' },
  roomName: { ru: 'РУИНЫ // КОМНАТА 01', en: 'RUINS // ROOM 01' },
  speed: 1,
  tempo: 1
};

const AMBER_LINES = {
  ru: {
    ...BASE_LINES.ru,
    intro: [
      '* Тёплые Руины пахнут корицей и старой бумагой.',
      '* Кто-то оставил свет в окне специально для тебя.'
    ],
    npc: [
      'О! Новый гость. Проходи, не стесняйся.',
      'Я Мимо. Здесь всегда осень, даже когда её нет.',
      'Давай сыграем? Уклоняйся от звёзд, и я подарю тебе тёплый свет.'
    ],
    win: [
      'Отлично! Даже листья аплодируют.',
      'Возьми янтарную звезду. Пусть согревает.',
      '* Ты получил ЯНТАРНУЮ ДУШУ!'
    ]
  },
  en: {
    ...BASE_LINES.en,
    intro: [
      '* The warm Ruins smell of cinnamon and old paper.',
      '* Someone left a light in the window just for you.'
    ],
    npc: [
      'Oh! A new guest. Come in, do not be shy.',
      'I am Mimo. It is always autumn here, even when it is not.',
      'Shall we play? Dodge the stars and I will give you a warm light.'
    ],
    win: [
      'Great! Even the leaves are clapping.',
      'Take this amber star. Let it keep you warm.',
      '* You received the AMBER SOUL!'
    ]
  }
};

const MONO_LINES = {
  ru: {
    ...BASE_LINES.ru,
    intro: [
      '* Экран слегка зеленеет. Мир стал проще на один цвет.',
      '* Где-то играет восьмибитная мелодия.'
    ],
    npc: [
      'ПИКСЕЛЬ! ПИКСЕЛЬ! Я тебя вижу.',
      'Я Мимо. Работаю в оттенках зелёного.',
      'Игра? Да! Уклоняйся от звёзд. Кнопки всё равно пиксельные.'
    ],
    win: [
      'ИДЕАЛЬНО! Ни одного лишнего пикселя.',
      'Держи монохромную звезду.',
      '* Ты получил МОНОХРОМНУЮ ДУШУ!'
    ]
  },
  en: {
    ...BASE_LINES.en,
    intro: [
      '* The screen turns faintly green. The world lost a color.',
      '* An eight-bit melody plays somewhere.'
    ],
    npc: [
      'PIXEL! PIXEL! I can see you.',
      'I am Mimo. I work in shades of green.',
      'A game? Yes! Dodge the stars. The buttons are pixels anyway.'
    ],
    win: [
      'PERFECT! Not a single extra pixel.',
      'Take this monochrome star.',
      '* You received the MONO SOUL!'
    ]
  }
};

const MIDNIGHT_LINES = {
  ru: {
    ...BASE_LINES.ru,
    intro: [
      '* В Руинах идёт дождь. Он падает прямо сквозь камни.',
      '* Синий свет дрожит на полу, как чужая память.'
    ],
    npc: [
      'Тш-ш. Слышишь дождь?',
      'Я Мимо. Иногда я стою здесь просто чтобы послушать.',
      'Хочешь отвлечься? Уклоняйся от звёзд, пока дождь не кончится.'
    ],
    win: [
      'Ты выстоял. Дождь тоже.',
      'Возьми полуночную звезду. Она холодная, но честная.',
      '* Ты получил ПОЛУНОЧНУЮ ДУШУ!'
    ]
  },
  en: {
    ...BASE_LINES.en,
    intro: [
      '* It is raining in the Ruins. The rain falls straight through the stone.',
      '* Blue light trembles on the floor like someone else\'s memory.'
    ],
    npc: [
      'Shh. Can you hear the rain?',
      'I am Mimo. Sometimes I stand here just to listen.',
      'Need a distraction? Dodge the stars until the rain stops.'
    ],
    win: [
      'You endured. So did the rain.',
      'Take this midnight star. Cold, but honest.',
      '* You received the MIDNIGHT SOUL!'
    ]
  }
};

export const BUILTIN_PACKS = [
  {
    ...DEFAULT_PACK,
    id: 'pack-amber',
    name: 'AMBER RUINS',
    author: 'UTL Studio',
    description: {
      ru: 'Тёплая осенняя палитра, янтарный свет и мягкие диалоги.',
      en: 'A warm autumn palette, amber light and softer dialogue.'
    },
    palette: {
      ...DEFAULT_PALETTE,
      bg: '#140b0a',
      wall: '#42241c',
      wallDark: '#28130f',
      wallLight: '#5c3626',
      brick: '#351b15',
      floor: '#40271e',
      floorDark: '#26140f',
      floorLine: '#5a3725',
      door: '#0d0605',
      doorGlow: '#ff8e3b',
      flower: '#ffcf5e',
      flowerGlow: '#ff8e3b',
      npc: '#fff1d6',
      npcAccent: '#ffb347',
      player: '#6b3f35',
      playerAccent: '#ff6b4a',
      ambient: '#ffb347'
    },
    lines: AMBER_LINES,
    npcName: { ru: 'МИМО', en: 'MIMO' },
    roomName: { ru: 'РУИНЫ // ОСЕННИЙ ЗАЛ', en: 'RUINS // AUTUMN HALL' },
    speed: 1,
    tempo: 0.92,
    builtin: true
  },
  {
    ...DEFAULT_PACK,
    id: 'pack-mono',
    name: 'MONO SOUL',
    author: '8BIT GUILD',
    description: {
      ru: 'Зелёный монохром, как на старом портативном экране. 4 оттенка, 0 компромиссов.',
      en: 'Green monochrome, like an old handheld screen. 4 shades, 0 compromises.'
    },
    palette: {
      ...DEFAULT_PALETTE,
      bg: '#08120a',
      wall: '#16351d',
      wallDark: '#0a1d0e',
      wallLight: '#245c2e',
      brick: '#102814',
      floor: '#1b3d22',
      floorDark: '#0b1c0e',
      floorLine: '#2c6136',
      door: '#050d07',
      doorGlow: '#8bff9d',
      flower: '#b6ff74',
      flowerGlow: '#69ff85',
      npc: '#d8ffd8',
      npcAccent: '#69ff85',
      player: '#2e5c36',
      playerAccent: '#b6ff74',
      ambient: '#69ff85'
    },
    lines: MONO_LINES,
    npcName: { ru: 'МИМО', en: 'MIMO' },
    roomName: { ru: 'РУИНЫ // МОНОХРОМ', en: 'RUINS // MONOCHROME' },
    speed: 1.05,
    tempo: 1.12,
    builtin: true
  },
  {
    ...DEFAULT_PACK,
    id: 'pack-midnight',
    name: 'MIDNIGHT RAIN',
    author: 'UTL Studio',
    description: {
      ru: 'Синяя ночь, дождь сквозь камни и самое спокойное подземелье.',
      en: 'A blue night, rain through the stone and the calmest underground.'
    },
    palette: {
      ...DEFAULT_PALETTE,
      bg: '#060b18',
      wall: '#152442',
      wallDark: '#0a1224',
      wallLight: '#263d69',
      brick: '#111d35',
      floor: '#1b2c4a',
      floorDark: '#0b1526',
      floorLine: '#2b446b',
      door: '#03060d',
      doorGlow: '#5ce1e6',
      flower: '#9be8ff',
      flowerGlow: '#5ce1e6',
      npc: '#e4f5ff',
      npcAccent: '#5ce1e6',
      player: '#314b73',
      playerAccent: '#5ce1e6',
      ambient: '#5ce1e6'
    },
    lines: MIDNIGHT_LINES,
    npcName: { ru: 'МИМО', en: 'MIMO' },
    roomName: { ru: 'РУИНЫ // НОЧНОЙ ДОЖДЬ', en: 'RUINS // NIGHT RAIN' },
    speed: 1,
    tempo: 0.82,
    builtin: true
  }
];

export function normalizePack(raw, fallbackName = 'IMPORTED PACK') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = String(raw.name || raw.title || fallbackName).slice(0, 64).trim() || fallbackName;
  const paletteSource = raw.palette && typeof raw.palette === 'object' ? raw.palette : null;
  if (!paletteSource) return null;
  const palette = { ...DEFAULT_PALETTE };
  for (const [key, value] of Object.entries(paletteSource)) {
    if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) && key in palette) palette[key] = value;
  }
  const lines = normalizeLines(raw.lines || raw.dialogue);
  return {
    schema: 'utmod/1',
    id: String(raw.id || `pack-${slug(name)}`).slice(0, 80),
    name,
    author: String(raw.author || raw.creator || 'COMMUNITY').slice(0, 64),
    version: String(raw.version || '1.0').slice(0, 24),
    description: raw.description && typeof raw.description === 'object'
      ? { ru: String(raw.description.ru || ''), en: String(raw.description.en || '') }
      : { ru: String(raw.description || ''), en: String(raw.description || '') },
    palette,
    lines,
    npcName: normalizeLocalized(raw.npcName, 'МИМО', 'MIMO'),
    roomName: normalizeLocalized(raw.roomName, 'РУИНЫ // КОМНАТА 01', 'RUINS // ROOM 01'),
    speed: clampNumber(raw.speed, 0.6, 1.8, 1),
    tempo: clampNumber(raw.tempo, 0.5, 1.8, 1),
    builtin: false
  };
}

function normalizeLines(raw) {
  if (!raw || typeof raw !== 'object') return BASE_LINES;
  const pick = (lang) => {
    const source = raw[lang];
    if (!source || typeof source !== 'object') return null;
    const result = { ...BASE_LINES[lang] };
    for (const key of Object.keys(BASE_LINES[lang])) {
      const value = source[key];
      if (Array.isArray(value)) {
        const lines = value.filter((line) => typeof line === 'string').map((line) => line.slice(0, 400));
        if (lines.length) result[key] = lines;
      }
    }
    return result;
  };
  const ru = pick('ru');
  const en = pick('en');
  if (ru || en) return { ru: ru || BASE_LINES.ru, en: en || BASE_LINES.en };
  const flat = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) flat[key] = value.filter((line) => typeof line === 'string');
  }
  if (Object.keys(flat).length === 0) return BASE_LINES;
  return { ru: { ...BASE_LINES.ru, ...flat }, en: { ...BASE_LINES.en, ...flat } };
}

function normalizeLocalized(value, ru, en) {
  if (value && typeof value === 'object') return { ru: String(value.ru || ru), en: String(value.en || en) };
  if (typeof value === 'string' && value.trim()) return { ru: value, en: value };
  return { ru, en };
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pack';
}

export function packLines(pack, lang) {
  const source = pack && pack.lines;
  if (!source) return BASE_LINES[lang === 'ru' ? 'ru' : 'en'];
  const lines = source[lang] || source.en || source.ru;
  if (!lines) return BASE_LINES[lang === 'ru' ? 'ru' : 'en'];
  return { ...BASE_LINES[lang === 'ru' ? 'ru' : 'en'], ...lines };
}

export function packText(value, lang) {
  if (value && typeof value === 'object') return value[lang] || value.en || value.ru || '';
  return typeof value === 'string' ? value : '';
}

export function builtinPack(id) {
  return BUILTIN_PACKS.find((p) => p.id === id) || null;
}
