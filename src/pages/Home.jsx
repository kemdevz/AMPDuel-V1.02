import PromoBanner from '../components/PromoBanner'
import TopGames from '../components/TopGames'
import LiveFeed from '../components/LiveFeed'

export default function Home() {
  return (
    <div className="main-container relative z-10">
      <div className="px-4 py-4 md:px-6">
        <section className="sr-only" aria-hidden="false">
          <h1>BloxyPot - Upcoming In-Game Item Site</h1>
          <p>Play a Variety of Exciting Games and Win In-Game Items.</p>
        </section>

        <PromoBanner />
        <TopGames />
        <LiveFeed />

        <div dir="ltr" data-orientation="horizontal" className="mt-10">
          <div
            role="tablist"
            aria-orientation="horizontal"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground"
            tabIndex={-1}
            data-orientation="horizontal"
            style={{ outline: 'none' }}
          />
          <div
            data-state="active"
            data-orientation="horizontal"
            role="tabpanel"
            tabIndex={0}
            className="mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ animationDuration: '0s' }}
          />
        </div>
      </div>
    </div>
  )
}
