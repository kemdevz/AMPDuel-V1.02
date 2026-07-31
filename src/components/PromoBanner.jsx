import { useEffect, useState } from 'react'
import { useAuth } from '../store/auth'
import { getLevelStyle } from '../lib/levelStyles'

const PROMO_IMAGE = 'https://i.ibb.co/v450phsZ/rounded-corners.png'

function HeroAvatar({ isGuest, src, name }) {
  const [hasImageError, setHasImageError] = useState(false)

  useEffect(() => {
    setHasImageError(false)
  }, [src])

  if (isGuest || !src || hasImageError) {
    return (
      <div className="heroAvatarWrap">
        <div className="heroAvatarGuest">?</div>
      </div>
    )
  }

  return (
    <div className="heroAvatarWrap">
      <img
        alt={name}
        className="heroAvatar"
        src={src}
        referrerPolicy="no-referrer"
        onError={() => setHasImageError(true)}
      />
    </div>
  )
}

export default function PromoBanner() {
  const user = useAuth((s) => s.user)
  const isGuest = !user
  const displayName = user?.username || 'Guest'
  const currentLevel = user?.level ?? 1
  const avatarSrc = user?.avatar_headshot_url || user?.avatar_url || ''
  const progressWidth = isGuest ? '4%' : `${Math.min(100, Math.max(4, currentLevel / 2))}%`

  return (
    <div className="heroWrap">
      <div className="mx-auto box-border w-full max-w-[1500px] px-4">
        <div className="heroCard">
          <div className="heroGlow" />
          <div className="heroSplit">
            <div className="heroLeft">
              <div className="heroHead">
                <HeroAvatar isGuest={isGuest} src={avatarSrc} name={displayName} />
                <div className="heroWelcome">
                  <span className="heroWelcomeMuted">Welcome back,</span>
                  <span className={`heroName ${isGuest ? 'heroNameGuest' : ''}`}>{displayName}</span>
                </div>
              </div>

              <div className="heroProgressWrap">
                <div className="heroProgressBar" data-state="closed" style={{ cursor: 'default' }}>
                  <div className="heroProgressFill" style={{ width: progressWidth }} />
                </div>
                <div className="heroLevelRow">
                  <span className="heroLevelLabel">CURRENT LEVEL</span>
                  <span
                    style={{
                      ...getLevelStyle(currentLevel),
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      padding: '1px 6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      userSelect: 'none',
                      lineHeight: '14px',
                      height: '18px',
                      minWidth: '24px',
                      boxSizing: 'border-box',
                    }}
                  >
                    {currentLevel}
                  </span>
                </div>
              </div>

              <button
                className="heroCtaFlat"
                type="button"
                disabled={isGuest}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('profile:open'))
                  }
                }}
              >
                View Profile
              </button>
            </div>

            <div className="heroRight">
              <a href="https://discord.gg/bloxypot" target="_blank" rel="noreferrer" className="heroPromoLink" aria-label="Discord Banner">
                <div className="heroBannerBox">
                  <img src={PROMO_IMAGE} alt="Discord Banner" className="heroBannerImg" loading="lazy" />
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .heroWrap {
          width: 100%;
          padding: 10px 0;
        }

        .heroCard {
          position: relative;
          overflow: hidden;
          border-radius: 12px;
          border: 0px solid #252839;
          background: #171925;
          padding: 40px;
        }

        .heroGlow {
          position: absolute;
          top: -1px;
          right: -1px;
          bottom: -1px;
          left: -1px;
          pointer-events: none;
        }

        .heroSplit {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: stretch;
          gap: 18px;
        }

        .heroLeft {
          flex: 0 0 360px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          gap: 16px;
          padding: 8px 10px;
        }

        .heroHead {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .heroAvatarWrap {
          border-radius: 9999px;
          border: 3px solid rgba(108,99,255,.35);
          padding: 3px;
        }

        .heroAvatar {
          display: block;
          width: 52px;
          height: 52px;
          border-radius: 9999px;
          object-fit: cover;
        }

        .heroAvatarGuest {
          display: grid;
          width: 52px;
          height: 52px;
          place-items: center;
          border-radius: 9999px;
          background: #1c1f2e;
          color: #9aa0b5;
          font-size: 22px;
          font-weight: 900;
          line-height: 1;
        }

        .heroWelcome {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .heroWelcomeMuted {
          color: #e1e4f2b3;
          font-size: 14px;
        }

        .heroName {
          color: #fff;
          font-weight: 700;
          font-size: 18px;
        }

        .heroNameGuest {
          color: #8E92A7;
        }

        .heroProgressWrap {
          width: 100%;
          max-width: 320px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .heroProgressBar {
          height: 14px;
          padding: 3px;
          border: 1px solid rgba(94,85,217,0.25);
          border-radius: 6px;
          background: rgba(42,46,68,0.85);
        }

        .heroProgressFill {
          height: 100%;
          border-radius: 4px;
          background: linear-gradient(135deg,#6c63ff,#5147d9);
          box-shadow: 0 2px 10px #6c63ff40;
        }

        .heroLevelRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 600;
          color: #e1e4f2cc;
        }

        .heroLevelLabel {
          color: #8E92A7;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
        }

        .heroCtaFlat {
          min-width: 96px;
          cursor: pointer;
          height: 34px;
          line-height: 34px;
          padding: 0 20px;
          font-size: 16px;
          font-weight: 600;
          border-radius: 8px;
          transition: none;
          background: #2a2e44;
          color: #e1e4f2;
          border: none;
          box-shadow: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .heroCtaFlat:hover {
          opacity: .9;
        }

        .heroCtaFlat:active {
          opacity: 1;
        }

        .heroCtaFlat:disabled {
          cursor: not-allowed;
          opacity: 0.7;
          background: #2a2e44;
        }

        .heroRight {
          position: relative;
        }

        .heroPromoLink,
        .heroBannerBox {
          display: block;
          width: 100%;
          height: 100%;
        }

        .heroBannerBox {
          width: 100%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
        }

        .heroBannerImg {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
        }

        @media (min-width: 1025px) {
          .heroRight {
            min-height: 260px;
          }

          .heroBannerBox {
            height: 260px;
          }
        }

        @media (max-width: 1024px) {
          .heroSplit {
            flex-direction: column;
          }
          
          .heroBannerBox {
            height: 220px;
          }
          
          .heroLeft {
            flex: 1 1 auto;
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
