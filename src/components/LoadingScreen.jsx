const LOGO = '/logo.png'

export default function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-label="Loading BloxyPot">
      <div className="loading-screen__content">
        <img
          src={LOGO}
          alt="BloxyPot"
          className="loading-screen__logo"
          draggable={false}
        />
        <div className="loading-screen__bar" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  )
}
