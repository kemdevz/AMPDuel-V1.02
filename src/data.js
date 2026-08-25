import {
  CoinflipIcon,
  LeaderboardIcon,
  MinesIcon,
  ProfileIcon,
  TermsIcon,
} from './components/icons'

export const navSections = [
  {
    label: 'Games',
    items: [
      { name: 'Coinflip', icon: CoinflipIcon, path: 'coinflip' },
      { name: 'Mines', icon: MinesIcon, path: 'mines' },
    ],
  },
  {
    label: 'General',
    items: [
      { name: 'Profile', icon: ProfileIcon, path: 'profile' },
      { name: 'Leaderboard', icon: LeaderboardIcon, path: 'leaderboard' },
      { name: 'Terms of Service', icon: TermsIcon, path: 'tos' },
    ],
  },
]
