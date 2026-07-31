import GameCard from './GameCard'

const games = [
  {
    key: 'battles',
    title: 'Battles',
    subtitle: 'Fight For All',
    href: '/battles',
    image: 'https://i.ibb.co/SXHdBN4G/battles.png',
    background:
      'linear-gradient(rgba(52, 58, 90, 0.85) 0%, rgba(38, 42, 72, 0.8) 45%, rgba(200, 60, 220, 0.1) 72%, rgba(200, 60, 220, 0.18) 100%), radial-gradient(130% 80% at 50% 115%, rgba(200, 60, 220, 0.32) 0%, rgba(22, 25, 45, 0) 100%), rgb(35, 39, 72)',
    hoverBackground:
      'radial-gradient(130% 80% at 50% 115%, rgba(200, 60, 220, 0.7) 0%, rgba(22, 25, 45, 0) 100%)',
  },
  {
    key: 'cases',
    title: 'Cases',
    subtitle: 'Unbox Pets',
    href: '/cases',
    image: 'https://i.ibb.co/9HNRcvQc/goldparty.png',
    background:
      'linear-gradient(rgba(52, 58, 90, 0.85) 0%, rgba(38, 42, 72, 0.8) 45%, rgba(255, 185, 40, 0.1) 72%, rgba(255, 185, 40, 0.18) 100%), radial-gradient(130% 80% at 50% 115%, rgba(255, 185, 40, 0.32) 0%, rgba(22, 25, 45, 0) 100%), rgb(35, 39, 72)',
    hoverBackground:
      'radial-gradient(130% 80% at 50% 115%, rgba(255, 185, 40, 0.7) 0%, rgba(22, 25, 45, 0) 100%)',
  },
  {
    key: 'coinflip',
    title: 'Coinflip',
    subtitle: 'Flip a Coin',
    href: '/coinflip',
    image: 'https://i.ibb.co/ktnM6rc/image.png',
    background:
      'linear-gradient(rgba(52, 58, 90, 0.85) 0%, rgba(38, 42, 72, 0.8) 45%, rgba(60, 200, 255, 0.1) 72%, rgba(60, 200, 255, 0.18) 100%), radial-gradient(130% 80% at 50% 115%, rgba(60, 200, 255, 0.32) 0%, rgba(22, 25, 45, 0) 100%), rgb(35, 39, 72)',
    hoverBackground:
      'radial-gradient(130% 80% at 50% 115%, rgba(60, 200, 255, 0.7) 0%, rgba(22, 25, 45, 0) 100%)',
  },
  {
    key: 'mines',
    title: 'Mines',
    subtitle: 'Avoid Mines',
    href: '/mines',
    image: 'https://i.ibb.co/bgYDGMqD/Mines-Gem-F7o544th.png',
    background:
      'linear-gradient(rgba(52, 58, 90, 0.85) 0%, rgba(38, 42, 72, 0.8) 45%, rgba(120, 80, 255, 0.1) 72%, rgba(120, 80, 255, 0.18) 100%), radial-gradient(130% 80% at 50% 115%, rgba(120, 80, 255, 0.32) 0%, rgba(22, 25, 45, 0) 100%), rgb(35, 39, 72)',
    hoverBackground:
      'radial-gradient(130% 80% at 50% 115%, rgba(120, 80, 255, 0.7) 0%, rgba(22, 25, 45, 0) 100%)',
  },
  {
    key: 'jackpot',
    title: 'Jackpot',
    subtitle: 'Take a Chance',
    href: '/jackpot',
    image: 'https://i.ibb.co/5XkQj1Jt/Chat-GPT-mage-28-Oca-2026-21-11-39.png',
    background:
      'linear-gradient(rgba(52, 58, 90, 0.85) 0%, rgba(38, 42, 72, 0.8) 45%, rgba(220, 60, 40, 0.1) 72%, rgba(220, 60, 40, 0.18) 100%), radial-gradient(130% 80% at 50% 115%, rgba(220, 60, 40, 0.32) 0%, rgba(22, 25, 45, 0) 100%), rgb(35, 39, 72)',
    hoverBackground:
      'radial-gradient(130% 80% at 50% 115%, rgba(220, 60, 40, 0.7) 0%, rgba(22, 25, 45, 0) 100%)',
  },
]

export default function TopGames() {
  return (
    <section className="mt-6">
      <div className="mx-auto w-full max-w-[1500px] box-border px-4">
        <div className="games-head mb-4">
          <div className="games-head-left">
            <span className="games-head-title">Top Games</span>
          </div>
          <div className="games-head-line" />
        </div>

        <div className="relative bg-transparent" data-games="true">
          <div
            className="hide-scrollbar overflow-x-auto overflow-y-hidden bg-transparent touch-pan-x overscroll-x-contain snap-x snap-proximity"
            style={{ scrollbarWidth: 'none' }}
          >
            <div className="flex min-w-full">
              <div className="min-w-full w-full flex-shrink-0 snap-start">
                <div className="flex w-full justify-start gap-2 pl-2 pr-2 sm:gap-3 sm:pl-0 sm:pr-0">
                  {games.map((game) => (
                    <GameCard key={game.key} game={game} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .games-head { display:flex; align-items:center; gap:12px; width:100%; }
        .games-head-left { display:flex; align-items:baseline; gap:10px; flex:0 0 auto; min-width:0; }
        .games-head-title { color:#ffffff; font-weight:800; font-size:18px; letter-spacing:.02em; white-space:nowrap; }
        .games-head-line { flex:1 1 auto; height:2px; border-radius:0px; background:linear-gradient(to left, rgba(108,99,255,0.78), rgba(108,99,255,0)); }

        @media (max-width: 768px) {
          [data-game-card] { scroll-snap-align: none !important; }
          .hide-scrollbar { scroll-snap-type: none !important; }
        }
        @media (min-width: 769px) {
          .hide-scrollbar { scroll-snap-type: x mandatory; }
        }

        [data-game-card] .game-card-img {
          transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
          transform-origin: 55% 70%;
          transition: transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1);
          will-change: transform;
          pointer-events: none;
        }
        [data-game-card]:hover .game-card-img {
          transform: translate3d(0, -14px, 0) scale(1.16) rotate(-7deg);
        }
        [data-game-card] > div:first-child {
          opacity: 0;
          transition: opacity 300ms;
        }
        [data-game-card]:hover > div:first-child {
          opacity: 1;
        }
      `}</style>
    </section>
  )
}
