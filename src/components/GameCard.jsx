export default function GameCard({ game }) {
  return (
    <a
      data-game-card="true"
      className="relative flex-shrink-0 select-none no-underline w-[215px] pb-5 rounded-[8px] overflow-hidden sm:w-[240px] md:w-[265px]"
      href={game.href}
      data-discover="true"
      style={{
        textDecoration: 'none',
        background: game.background,
        boxShadow: 'rgba(0, 0, 0, 0.12) 0px 16px 25px',
        transform: 'translateY(0px)',
        transition: 'transform 200ms, box-shadow 200ms',
      }}
    >
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-300 pointer-events-none"
        style={{ background: game.hoverBackground }}
      />
      <div className="relative flex items-center">
        <div className="flex-1 pb-[100%]" />
        <img
          src={game.image}
          alt={game.title}
          draggable="false"
          loading="eager"
          className="game-card-img absolute inset-0 m-auto w-[65%] object-contain drop-shadow-[0px_22px_38px_rgba(0,0,0,0.5)]"
        />
      </div>
      <div className="relative mt-2 flex flex-col items-center text-center">
        <h3 className="font-bold text-xl uppercase text-[#EEF2FB]">{game.title}</h3>
        <h4 className="text-[12px] font-semibold uppercase text-[#EEF2FB]/70">{game.subtitle}</h4>
      </div>
    </a>
  )
}
