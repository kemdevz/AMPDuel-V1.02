import { useMemo, useState } from 'react'

const CATEGORIES = ['Blackjack', 'Baccarat', 'Slots']

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pointer-events-none absolute left-[13px] top-1/2 h-4 w-4 -translate-y-1/2 opacity-60"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
        stroke="#E1E4F2"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SortIcon({ ascending = false }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16" aria-hidden="true">
      <path
        d={ascending
          ? 'M13 3.793V9h-2V3.864L9.914 4.95 8.5 3.536 12.036 0l3.535 3.536-1.414 1.414L13 3.793zM8 10H0V8h8v2zm6 3H0v-2h14v2zm2 3H0v-2h16v2zM6 7H0V5h6v2zM4 4H0V2h4v2z'
          : 'M13 12.208V7h-2v5.137l-1.086-1.086L8.5 12.466 12.036 16l3.535-3.535-1.414-1.415L13 12.208zM8 6H0v2h8V6zm6-3H0v2h14V3zm2-3H0v2h16V0zM6 9H0v2h6V9zm-2 3H0v2h4v-2z'}
        fillRule="evenodd"
      />
    </svg>
  )
}

export default function LiveCasino() {
  const [activeCategory, setActiveCategory] = useState('Blackjack')
  const [search, setSearch] = useState('')
  const [descending, setDescending] = useState(true)

  // The casino API will populate this collection in the next integration step.
  const games = []
  const visibleGames = useMemo(() => {
    const query = search.trim().toLowerCase()

    return games
      .filter((game) => String(game.category || '').toLowerCase() === activeCategory.toLowerCase())
      .filter((game) => !query || String(game.name || '').toLowerCase().includes(query))
      .sort((first, second) => {
        const comparison = String(first.name || '').localeCompare(String(second.name || ''))
        return descending ? -comparison : comparison
      })
  }, [activeCategory, descending, games, search])

  return (
    <div className="main-container relative z-10 h-full w-full min-w-0 max-w-full overflow-x-hidden text-[#e1e4f2] [font-family:Poppins,sans-serif]">
      <div className="relative z-[20] flex h-full w-full flex-col items-center">
        <div className="flex min-h-full w-full max-w-[1320px] flex-col items-center px-2 pb-4 pt-3 sm:px-4 sm:pt-4 xl:px-12 xl:pb-8 xl:pt-8">
          <div className="flex h-full w-full flex-col gap-4">
            <div className="h-full w-full">
              <div className="mx-auto box-border w-full px-[14px] pb-[22px] min-[1100px]:max-w-[1320px] min-[1100px]:px-[18px] min-[1100px]:pb-7 max-[840px]:px-3">
                <div className="mb-3 mt-2 box-border flex w-full flex-nowrap items-center justify-between gap-3 px-0.5 max-[840px]:flex-col max-[840px]:items-center">
                  <div className="flex shrink-0 gap-1 rounded-[6px] bg-[#131520] p-1 max-[430px]:w-full">
                    {CATEGORIES.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => {
                          setActiveCategory(category)
                          setSearch('')
                        }}
                        className={`whitespace-nowrap rounded-[4px] border-0 px-4 py-1.5 text-[13px] font-semibold transition-colors max-[430px]:min-w-0 max-[430px]:flex-1 max-[430px]:px-2 ${
                          activeCategory === category
                            ? 'bg-[#2a3048] text-[#e1e4f2]'
                            : 'bg-transparent text-[#6c7399] hover:text-[#c7cce2]'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-2 max-[840px]:ml-0 max-[840px]:w-full max-[840px]:flex-nowrap max-[840px]:justify-center">
                    <div className="relative flex max-[840px]:min-w-0 max-[840px]:flex-1">
                      <SearchIcon />
                      <input
                        type="text"
                        placeholder={`Search for ${activeCategory}...`}
                        aria-label={`Search for ${activeCategory}`}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="box-border h-10 w-[260px] rounded-[6px] border-0 bg-[#1c1f2e] py-0 pl-10 pr-[14px] text-left text-sm text-white/[.92] shadow-none outline-none placeholder:text-left placeholder:text-white/[.45] focus:border-0 focus:bg-[#1c1f2e] focus:outline-none max-[840px]:w-full"
                      />
                    </div>

                    <button
                      type="button"
                      title={descending ? 'Z to A' : 'A to Z'}
                      aria-label={descending ? 'Sort A to Z' : 'Sort Z to A'}
                      onClick={() => setDescending((value) => !value)}
                      className="inline-flex h-10 w-10 min-w-0 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-[#20222f] p-0 text-[#e1e4f2] transition-colors duration-150 hover:bg-[#2a2e44]"
                    >
                      <SortIcon ascending={!descending} />
                    </button>
                  </div>
                </div>

                {visibleGames.length > 0 ? (
                  <div
                    className="grid w-full gap-3 px-0.5"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}
                  >
                    {visibleGames.map((game) => (
                      <button
                        key={game.id}
                        type="button"
                        className="group min-h-[220px] overflow-hidden rounded-[8px] border-0 bg-[#171925] text-left text-[#e1e4f2]"
                      >
                        {game.image ? <img src={game.image} alt="" className="h-[170px] w-full object-cover" /> : null}
                        <span className="block px-3 py-2.5 text-sm font-semibold">{game.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex w-full justify-center px-0.5 py-8 text-sm text-[#8b92b8]">
                    {search.trim()
                      ? `No ${activeCategory.toLowerCase()} games match your search.`
                      : `${activeCategory} games will appear here once the live casino API is connected.`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
