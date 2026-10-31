/* SOUL LINK — static catalog, palettes and dialogue. */
(function () {
  'use strict';

  const GB_GAME_ID = 5506;
  const GB_GAME_URL = 'https://gamebanana.com/games/' + GB_GAME_ID;

  /* Curated real GameBanana records. Used as an offline/cached fallback and for
     the home showcase while the live API is still loading. */
  const FALLBACK_MODS = [
    {
      id: 669734,
      name: 'SOULGRIND - WATERFALL',
      author: 'Story_Of_Undertale',
      category: 'game files',
      version: 'v0.5',
      likes: 7,
      views: 7196,
      downloads: 499,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6ae4cd97c5ca4.jpg',
      url: 'https://gamebanana.com/mods/669734',
      ts: 1776259280,
      source: 'gamebanana'
    },
    {
      id: 723076,
      name: "Mark's mod menu",
      author: 'El_Markas',
      category: 'gameplay',
      version: '2.0.5',
      likes: 6,
      views: 3853,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6ae0756f38c5d.jpg',
      url: 'https://gamebanana.com/mods/723076',
      ts: 1790937140,
      source: 'gamebanana'
    },
    {
      id: 705459,
      name: 'Undertale Aqua',
      author: 'PixelHeart2763',
      category: 'skins',
      version: '7',
      likes: 17,
      views: 8227,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6a94f623d8e79.jpg',
      url: 'https://gamebanana.com/mods/705459',
      ts: 0,
      source: 'gamebanana'
    },
    {
      id: 706634,
      name: 'UNDERTALE - SPELL BASE',
      author: 'Story_Of_Undertale',
      category: 'game files',
      version: 'v1.2',
      likes: 4,
      views: 3042,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6a85ddcd739cb.jpg',
      url: 'https://gamebanana.com/mods/706634',
      ts: 0,
      source: 'gamebanana'
    },
    {
      id: 717442,
      name: '"High Quality" Tale',
      author: 'Soulshot',
      category: 'game files',
      version: '-9.99',
      likes: 9,
      views: 3683,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6aa8fcfe39270.jpg',
      url: 'https://gamebanana.com/mods/717442',
      ts: 0,
      source: 'gamebanana'
    },
    {
      id: 620410,
      name: 'UnderQuark',
      author: 'SomeChileanGuy',
      category: 'game files',
      version: '1.2',
      likes: 2,
      views: 3638,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/68c84f03ce72f.jpg',
      url: 'https://gamebanana.com/mods/620410',
      ts: 0,
      source: 'gamebanana'
    },
    {
      id: 714538,
      name: "Crazy's Ultimate Undertale Randomizer",
      author: 'crazy_invader135',
      category: 'gameplay',
      version: '2',
      likes: 7,
      views: 4244,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6a9de4c75c32e.jpg',
      url: 'https://gamebanana.com/mods/714538',
      ts: 0,
      source: 'gamebanana'
    },
    {
      id: 722490,
      name: 'Undertale Build Mode',
      author: 'aklsaz',
      category: 'gameplay',
      version: '02',
      likes: 2,
      views: 1182,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6abce1fd1190a.jpg',
      url: 'https://gamebanana.com/mods/722490',
      ts: 0,
      source: 'gamebanana'
    },
    {
      id: 721489,
      name: 'Undertale But your UI is a RC Car',
      author: 'DrSpinLlama',
      category: 'text changes',
      version: 'BETA',
      likes: 0,
      views: 998,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6ab94e793f1cf.jpg',
      url: 'https://gamebanana.com/mods/721489',
      ts: 0,
      source: 'gamebanana'
    },
    {
      id: 732102,
      name: 'Undertale Restored',
      author: 'tyler118',
      category: 'gameplay',
      version: '',
      likes: 1,
      views: 567,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6ade048003a1b.jpg',
      url: 'https://gamebanana.com/mods/732102',
      ts: 0,
      source: 'gamebanana'
    },
    {
      id: 650146,
      name: 'UndertaleHR',
      author: 'MarvinDarwin',
      category: 'translations',
      version: 'v1.2',
      likes: 0,
      views: 3803,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/697fb5df00ceb.jpg',
      url: 'https://gamebanana.com/mods/650146',
      ts: 0,
      source: 'gamebanana'
    },
    {
      id: 718476,
      name: "undertale but you're aqua",
      author: 'cool_epic_username123',
      category: 'gameplay',
      version: '',
      likes: 4,
      views: 2304,
      downloads: 0,
      thumb: 'https://images.gamebanana.com/img/ss/mods/6aadac6f98cf7.jpg',
      url: 'https://gamebanana.com/mods/718476',
      ts: 0,
      source: 'gamebanana'
    }
  ];

  const CATEGORY_LABELS = {
    'game files': { ru: 'ИГРОВЫЕ ФАЙЛЫ', en: 'GAME FILES' },
    gameplay: { ru: 'ГЕЙМПЛЕЙ', en: 'GAMEPLAY' },
    skins: { ru: 'СКИНЫ', en: 'SKINS' },
    audio: { ru: 'АУДИО', en: 'AUDIO' },
    'text changes': { ru: 'ТЕКСТ', en: 'TEXT' },
    translations: { ru: 'ПЕРЕВОДЫ', en: 'TRANSLATIONS' },
    'game files / skins': { ru: 'ФАЙЛЫ / СКИНЫ', en: 'FILES / SKINS' },
    ui: { ru: 'ИНТЕРФЕЙС', en: 'UI' },
    other: { ru: 'ДРУГОЕ', en: 'OTHER' }
  };

  const PALETTES = [
    {
      id: 'determination',
      label: 'DETERMINATION',
      accent: '#ff3355',
      accent2: '#ffd75e',
      glow: 'rgba(255, 51, 85, 0.28)',
      bg0: '#08060f',
      bg1: '#120c1e',
      bg2: '#1c122c',
      floor: '#171126',
      floorAlt: '#1d1631',
      wall: '#281c40',
      wallAlt: '#342451',
      wallEdge: '#4a3568',
      player: '#e9dcc6',
      playerAlt: '#b7a58d',
      scarf: '#ff3355',
      skin: '#f2d8b0',
      npc: '#d9f2ff',
      npcShade: '#8fc6df',
      gold: '#ffd75e',
      danger: '#ff3355',
      gate: '#9b6bff',
      gateGlow: '#7de3ff',
      grass: '#294c44',
      grassAlt: '#386356'
    },
    {
      id: 'waterfall',
      label: 'WATERFALL',
      accent: '#7de3ff',
      accent2: '#a88bff',
      glow: 'rgba(125, 227, 255, 0.26)',
      bg0: '#061019',
      bg1: '#0a1a28',
      bg2: '#0f2638',
      floor: '#0d1e2d',
      floorAlt: '#112638',
      wall: '#17374c',
      wallAlt: '#1d4762',
      wallEdge: '#2d6382',
      player: '#e1f2f4',
      playerAlt: '#a7c4cc',
      scarf: '#54d9ff',
      skin: '#f2d8b0',
      npc: '#d4f8ff',
      npcShade: '#7fc7de',
      gold: '#ffe27a',
      danger: '#ff5b7f',
      gate: '#79c7ff',
      gateGlow: '#b8f2ff',
      grass: '#315b58',
      grassAlt: '#427a70'
    },
    {
      id: 'golden-bloom',
      label: 'GOLDEN BLOOM',
      accent: '#ffd75e',
      accent2: '#ff9d5c',
      glow: 'rgba(255, 215, 94, 0.24)',
      bg0: '#0e0a07',
      bg1: '#1c140d',
      bg2: '#2a1d11',
      floor: '#21170f',
      floorAlt: '#2a1d13',
      wall: '#3a2a1a',
      wallAlt: '#4b3621',
      wallEdge: '#6b4b2a',
      player: '#f0e2c8',
      playerAlt: '#c0a982',
      scarf: '#ffb347',
      skin: '#f2d8b0',
      npc: '#fff1c9',
      npcShade: '#d7b97a',
      gold: '#ffe27a',
      danger: '#ff6a4d',
      gate: '#ffcf5c',
      gateGlow: '#fff1b8',
      grass: '#4b5531',
      grassAlt: '#66703f'
    },
    {
      id: 'echo-ember',
      label: 'ECHO EMBER',
      accent: '#ff9d5c',
      accent2: '#ff3355',
      glow: 'rgba(255, 157, 92, 0.25)',
      bg0: '#100706',
      bg1: '#21100c',
      bg2: '#311710',
      floor: '#251310',
      floorAlt: '#2f1813',
      wall: '#43231a',
      wallAlt: '#572e21',
      wallEdge: '#7c422d',
      player: '#f2e2cd',
      playerAlt: '#c2a78c',
      scarf: '#ff784f',
      skin: '#f2d8b0',
      npc: '#ffe2cf',
      npcShade: '#d9a07d',
      gold: '#ffd166',
      danger: '#ff4b4b',
      gate: '#ff8b5c',
      gateGlow: '#ffd0a8',
      grass: '#5a4631',
      grassAlt: '#775d3f'
    },
    {
      id: 'verdant',
      label: 'VERDANT',
      accent: '#6dffa8',
      accent2: '#7de3ff',
      glow: 'rgba(109, 255, 168, 0.22)',
      bg0: '#06100b',
      bg1: '#0b1e14',
      bg2: '#102a1b',
      floor: '#0d2117',
      floorAlt: '#112a1d',
      wall: '#183c28',
      wallAlt: '#205033',
      wallEdge: '#2f7049',
      player: '#e5f2dc',
      playerAlt: '#aec4a4',
      scarf: '#6dffa8',
      skin: '#f2d8b0',
      npc: '#dfffdc',
      npcShade: '#8fd49b',
      gold: '#ffe27a',
      danger: '#ff5773',
      gate: '#7dffb0',
      gateGlow: '#c6ffdc',
      grass: '#2f5a3c',
      grassAlt: '#447a50'
    },
    {
      id: 'monochrome',
      label: 'MONOCHROME',
      accent: '#e9e4f2',
      accent2: '#9b8db9',
      glow: 'rgba(233, 228, 242, 0.18)',
      bg0: '#09090c',
      bg1: '#15151b',
      bg2: '#202027',
      floor: '#19191f',
      floorAlt: '#1f1f27',
      wall: '#2b2b35',
      wallAlt: '#383843',
      wallEdge: '#555564',
      player: '#f3f0f5',
      playerAlt: '#bdb6c7',
      scarf: '#d8d2e2',
      skin: '#e6d9c5',
      npc: '#f4f4f8',
      npcShade: '#b9b9c6',
      gold: '#f2ecd8',
      danger: '#ff6b7d',
      gate: '#c9c2d8',
      gateGlow: '#f4f0ff',
      grass: '#3b3b45',
      grassAlt: '#53535f'
    },
    {
      id: 'violet-static',
      label: 'VIOLET STATIC',
      accent: '#b78bff',
      accent2: '#ff6bd5',
      glow: 'rgba(183, 139, 255, 0.24)',
      bg0: '#0b0713',
      bg1: '#171026',
      bg2: '#231539',
      floor: '#1b122c',
      floorAlt: '#231735',
      wall: '#321f4d',
      wallAlt: '#412a62',
      wallEdge: '#62418c',
      player: '#eee3fa',
      playerAlt: '#b7a4ca',
      scarf: '#b78bff',
      skin: '#f2d8b0',
      npc: '#f2e4ff',
      npcShade: '#b391d4',
      gold: '#ffd75e',
      danger: '#ff4f86',
      gate: '#c79bff',
      gateGlow: '#efd8ff',
      grass: '#493a63',
      grassAlt: '#645080'
    },
    {
      id: 'crimson',
      label: 'CRIMSON',
      accent: '#ff2e4d',
      accent2: '#ff9d5c',
      glow: 'rgba(255, 46, 77, 0.3)',
      bg0: '#0d0507',
      bg1: '#1b0a0f',
      bg2: '#291017',
      floor: '#210d12',
      floorAlt: '#2b1218',
      wall: '#3d1a22',
      wallAlt: '#50232d',
      wallEdge: '#763343',
      player: '#f0dada',
      playerAlt: '#c2a1a1',
      scarf: '#ff2e4d',
      skin: '#f2d8b0',
      npc: '#ffe1e6',
      npcShade: '#d99aa8',
      gold: '#ffd75e',
      danger: '#ff2e4d',
      gate: '#ff5c6e',
      gateGlow: '#ffb8c4',
      grass: '#512e36',
      grassAlt: '#6c3d47'
    }
  ];

  const DIALOGUES = {
    ru: {
      intro: [
        { name: '???', text: 'Ты просыпаешься под корнями, которых не помнишь.' },
        { name: '???', text: 'Три эхо-лепестка сорваны с ветвей. Без них врата не откроются.' },
        { name: 'PIP', text: 'Эй... ты слышишь? Я — Пип. Врата молчат уже давно. Найди три лепестка — и мы попробуем пройти вместе.' }
      ],
      pipHint: [
        { name: 'PIP', text: 'Лепестки светятся золотом. Один у воды, один у старых корней, один — прямо под носом у эха.' },
        { name: 'PIP', text: 'Если станет слишком тихо — коснись звезды. Она помнит, как быть смелым.' }
      ],
      pipDone: [
        { name: 'PIP', text: 'Ты собрал их все... Смотри, врата просыпаются.' },
        { name: 'PIP', text: 'Но что-то ещё смотрит. Не оборачивайся. Просто выживиешь.' }
      ],
      battleStart: [
        { name: 'ЭХО', text: 'Ты оставил здесь имя. Я всего лишь хочу его вернуть.' }
      ],
      battleSurvived: [
        { name: 'ЭХО', text: '...ладно. Оно всё ещё твоё.' },
        { name: 'PIP', text: 'Врата открыты. Иди. Я найду тебя, если понадобится.' }
      ],
      gateLocked: [
        { name: 'ВРАТА', text: 'Три лепестка. Три воспоминания. Не хватает хотя бы одного.' }
      ],
      saved: [
        { name: 'ЗВЕЗДА', text: 'Ты чувствуешь, как решимость возвращается в грудь.' }
      ],
      fullHp: [
        { name: 'ЗВЕЗДА', text: 'Ты и так полон решимости.' }
      ],
      complete: [
        { name: 'PIP', text: 'Ты сделал это. Не забудь, откуда ты пришёл.' }
      ]
    },
    en: {
      intro: [
        { name: '???', text: 'You wake beneath roots you do not remember.' },
        { name: '???', text: 'Three echo petals have been torn from the branches. The gate will not open without them.' },
        { name: 'PIP', text: 'Hey... can you hear me? I am Pip. The gate has been silent for a long time. Find three petals and we will try to pass together.' }
      ],
      pipHint: [
        { name: 'PIP', text: 'The petals glow gold. One by the water, one by the old roots, one right under the echo’s nose.' },
        { name: 'PIP', text: 'If it gets too quiet, touch the star. It remembers how to be brave.' }
      ],
      pipDone: [
        { name: 'PIP', text: 'You found them all... Look, the gate is waking up.' },
        { name: 'PIP', text: 'But something else is watching. Do not turn around. Just survive.' }
      ],
      battleStart: [
        { name: 'ECHO', text: 'You left a name here. I only want it back.' }
      ],
      battleSurvived: [
        { name: 'ECHO', text: '...fine. It is still yours.' },
        { name: 'PIP', text: 'The gate is open. Go. I will find you if you need me.' }
      ],
      gateLocked: [
        { name: 'GATE', text: 'Three petals. Three memories. One is still missing.' }
      ],
      saved: [
        { name: 'STAR', text: 'You feel determination return to your chest.' }
      ],
      fullHp: [
        { name: 'STAR', text: 'You are already full of determination.' }
      ],
      complete: [
        { name: 'PIP', text: 'You did it. Do not forget where you came from.' }
      ]
    }
  };

  const DEFAULT_SETTINGS = {
    master: 72,
    music: 35,
    sfx: 68,
    muted: false,
    scanlines: true,
    shake: true,
    reduceMotion: false,
    pixelPerfect: true,
    touchAlways: true,
    lefty: false,
    haptics: true
  };

  window.SL = window.SL || {};
  SL.data = {
    GB_GAME_ID: GB_GAME_ID,
    GB_GAME_URL: GB_GAME_URL,
    FALLBACK_MODS: FALLBACK_MODS,
    CATEGORY_LABELS: CATEGORY_LABELS,
    PALETTES: PALETTES,
    DIALOGUES: DIALOGUES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS
  };
})();
