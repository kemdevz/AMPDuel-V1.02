import {
  BattlesIcon,
  CasesIcon,
  CoinflipIcon,
  UpgraderIcon,
  MinesIcon,
  RollIcon,
  JackpotIcon,
  ProfileIcon,
  LeaderboardIcon,
  TermsIcon,
  FairnessIcon,
} from './components/icons'

// ----- Sidebar navigation -----------------------------------------------------
export const navSections = [
  {
    label: 'Games',
    items: [
      { name: 'Case Battles', icon: BattlesIcon, path: 'battles' },
      { name: 'Cases', icon: CasesIcon, path: 'cases' },
      { name: 'Coinflip', icon: CoinflipIcon, path: 'coinflip' },
      { name: 'Upgrader', icon: UpgraderIcon, path: 'upgrader' },
      { name: 'Mines', icon: MinesIcon, path: 'mines' },
      { name: 'Roll', icon: RollIcon, path: 'roll' },
      { name: 'Jackpot', icon: JackpotIcon, path: 'jackpot' },
    ],
  },
  {
    label: 'General',
    items: [
      { name: 'Profile', icon: ProfileIcon, path: 'profile' },
      { name: 'Leaderboard', icon: LeaderboardIcon, path: 'leaderboard' },
      { name: 'Terms of Service', icon: TermsIcon, path: 'tos' },
      { name: 'Fairness', icon: FairnessIcon, path: 'fairness' },
    ],
  },
]

// ----- Top Games cards --------------------------------------------------------
// `art` is rendered by <GameArt> in icons.jsx; each card has its own footer
// gradient + ambient glow colour — BloxyBattles theme.
export const games = [
  {
    key: 'battles',
    title: 'Battles',
    subtitle: 'Fight For All',
    art: 'battles',
    glow: 'rgba(0,181,178,0.55)',
    footer: 'from-[#003d3a] via-[#007370] to-[#00a8a5]',
  },
  {
    key: 'cases',
    title: 'Cases',
    subtitle: 'Unbox Pets',
    art: 'cases',
    glow: 'rgba(245,197,24,0.5)',
    footer: 'from-[#5a4418] via-[#8a6c24] to-[#caa23e]',
  },
  {
    key: 'coinflip',
    title: 'Coinflip',
    subtitle: 'Flip A Coin',
    art: 'coinflip',
    glow: 'rgba(34,211,238,0.5)',
    footer: 'from-[#0a3d45] via-[#1a7a92] to-[#2db3d4]',
  },
  {
    key: 'mines',
    title: 'Mines',
    subtitle: 'Avoid Mines',
    art: 'mines',
    glow: 'rgba(168,85,247,0.5)',
    footer: 'from-[#3d1f5c] via-[#6a3aa8] to-[#9d4fdb]',
  },
  {
    key: 'jackpot',
    title: 'Jackpot',
    subtitle: 'Take A Chance',
    art: 'jackpot',
    glow: 'rgba(236,72,153,0.5)',
    footer: 'from-[#5a1e3f] via-[#9a2d60] to-[#d94878]',
  },
]

// ----- Live feed --------------------------------------------------------------
export const liveFeed = [
  {
    user: 'deanzapper2022',
    time: '10s ago',
    game: 'Mines',
    amount: '11,111',
    mult: 'x8.59',
    win: '95,443',
    avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-CD1D1A7071137D011815CEDDB70AC5FA-Png/420/420/AvatarHeadshot/Png/noFilter',
  },
  {
    user: 'deanzapper2022',
    time: '44s ago',
    game: 'Mines',
    amount: '11,111',
    mult: 'x2.70',
    win: '29,999',
    avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-CD1D1A7071137D011815CEDDB70AC5FA-Png/420/420/AvatarHeadshot/Png/noFilter',
  },
  {
    user: 'MexicanTravis_Scott',
    time: '2m ago',
    game: 'Upgrader',
    amount: '20,000',
    mult: 'x3.00',
    win: '60,000',
    avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-4A2AEBC1024BCF622CAA069C82B06E7F-Png/420/420/AvatarHeadshot/Png/noFilter',
  },
  {
    user: 'MexicanTravis_Scott',
    time: '8m ago',
    game: 'Mines',
    amount: '39,000',
    mult: 'x1.82',
    win: '70,980',
    avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-4A2AEBC1024BCF622CAA069C82B06E7F-Png/420/420/AvatarHeadshot/Png/noFilter',
  },
  {
    user: 'larpsky3',
    time: '12m ago',
    game: 'Upgrader',
    amount: '250,000',
    mult: 'x4.20',
    win: '1,050,000',
    avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-D517857E5CC51E2FF93E63E20241169E-Png/420/420/AvatarHeadshot/Png/noFilter',
  },
  {
    user: 'klerp1234',
    time: '12m ago',
    game: 'Upgrader',
    amount: '75,000',
    mult: 'x14.67',
    win: '1,100,000',
    avatar: 'https://cdn.discordapp.com/avatars/1150869004664180778/a_b676c8829653ad331b21956472f03741.gif?size=256',
  },
  {
    user: 'larpsky3',
    time: '13m ago',
    game: 'Case Battles',
    amount: '212,582',
    mult: 'x4.53',
    win: '962,469',
    avatar: 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-D517857E5CC51E2FF93E63E20241169E-Png/420/420/AvatarHeadshot/Png/noFilter',
  },
]

// ----- Chat -------------------------------------------------------------------
// Badge / accent colour map for chat tones
export const toneStyles = {
  purple: { badge: 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-400/30', name: 'text-slate-100' },
  amber: { badge: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30', name: 'text-slate-100' },
  teal: { badge: 'bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/30', name: 'text-slate-100' },
  rose: { badge: 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30', name: 'text-slate-100' },
  red: { badge: 'bg-red-500/20 text-red-300 ring-1 ring-red-400/30', name: 'text-slate-100' },
}

// ----- Misc values pulled from the screenshot --------------------------------
export const balance = '12,450,800'
export const poolAmount = '15,200'
export const poolTimer = '04:38'
export const currentLevel = 28
export const username = 'battlemaster99'
