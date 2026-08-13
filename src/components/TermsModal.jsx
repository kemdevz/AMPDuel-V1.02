import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { TermsIcon } from './icons'

const EFFECTIVE_DATE = '14 Apr 2026'

const sections = [
  {
    title: 'Welcome',
    content: (
      <div className="space-y-2">
        <p>
          Welcome to BloxDice. These Terms of Service (the <strong>Terms</strong>) govern your access to and use of the BloxDice website (the <strong>Site</strong>) and related services (the <strong>Services</strong>). By using the Site, you acknowledge that you have read, understood, and agreed to these Terms.
        </p>
        <p>
          BloxDice is an online social entertainment platform and does not provide financial services, investment products, or real-money gambling.
        </p>
      </div>
    ),
  },
  {
    title: '1. Eligibility',
    content: (
      <ul>
        <li>You must be at least 18 years old, or the age of majority in your jurisdiction, to use the Services.</li>
        <li>By using the Site, you confirm that you have the legal capacity to enter into this agreement.</li>
        <li>Your participation is voluntary and for personal entertainment purposes only.</li>
        <li>You are responsible for ensuring that your use of the Services complies with all applicable laws in your jurisdiction.</li>
      </ul>
    ),
  },
  {
    title: '2. Use of Services',
    content: (
      <ul>
        <li>BloxDice allows users to participate in randomized, game-based activities involving in-game items.</li>
        <li>Outcomes on BloxDice have no real-world financial consequence.</li>
        <li>No real-world money is wagered on the platform.</li>
        <li>All in-game items used on BloxDice have no real-world monetary value and cannot be redeemed or exchanged for real money.</li>
        <li>Users may participate using in-game items or Coins. Participation may change a user's in-game item inventory or Coin balance solely within BloxDice and without real-world financial consequence.</li>
        <li>We may suspend or terminate accounts suspected of abuse, exploitation, or violation of these Terms.</li>
        <li>We may update these Terms at any time. Continued use of the Site constitutes acceptance of any revisions.</li>
      </ul>
    ),
  },
  {
    title: '3. Account Registration',
    content: (
      <ul>
        <li>Certain features require account registration.</li>
        <li>You agree to provide accurate and complete information.</li>
        <li>You are responsible for maintaining the security of your account and all activities under it.</li>
        <li>Acceptance of registration is at our sole discretion.</li>
      </ul>
    ),
  },
  {
    title: '4. Alternate Accounts (Alts)',
    content: (
      <ul>
        <li>Alternate accounts may not be used to manipulate or exploit platform mechanics, promotions, or gameplay systems.</li>
        <li>We may suspend or terminate any account suspected of abusive multi-account behavior.</li>
      </ul>
    ),
  },
  {
    title: '5. In-Game Items & Coins',
    content: (
      <ul>
        <li>BloxDice is not affiliated with Roblox Corporation. Use of Roblox in-game items remains subject to Roblox's own terms and policies.</li>
        <li>BloxDice does not guarantee the availability, stability, or continued functionality of any in-game items or external platforms.</li>
        <li>The Coin value displayed on BloxDice is an internal, non-transferable gameplay unit used solely within the platform for scoring, balancing, and participation in gameplay activities.</li>
        <li>Coins may be used to participate in gameplay activities on BloxDice. Such use remains entirely internal to the platform and does not grant Coins independent economic value.</li>
        <li>Coins are not real currency, cryptocurrency, stored value, financial instruments, or transferable assets.</li>
        <li>Coins do not exist independently outside BloxDice and have no value outside the platform.</li>
        <li>In-game items may be converted into Coins, and Coins may be converted back into in-game items solely within BloxDice.</li>
        <li>These conversions are internal platform mechanics only and do not create ownership rights, property interests, monetary claims, or any form of real-world value.</li>
        <li>Coins cannot be deposited, withdrawn, transferred, or exchanged for real-world money or assets.</li>
        <li>All Coin balances and related displays exist solely within BloxDice for entertainment purposes.</li>
      </ul>
    ),
  },
  {
    title: '6. Bots & Platform Responsibility',
    content: (
      <ul>
        <li>BloxDice may utilize automated accounts or bots to facilitate in-game actions or trades.</li>
        <li>If a bot or host account becomes restricted or banned on Roblox or another external platform, BloxDice is not liable for lost items, delayed trades, or related inconveniences.</li>
        <li>Users are responsible for verifying official bot accounts and reviewing trade details before acceptance.</li>
      </ul>
    ),
  },
  {
    title: '7. Refund Policy',
    content: (
      <ul>
        <li>BloxDice does not provide refunds or exchanges for in-game items that have been lost, wagered, traded, or withdrawn.</li>
        <li>Any discretionary refund or adjustment does not establish an ongoing right to compensation.</li>
      </ul>
    ),
  },
  {
    title: '8. Prohibited Activities',
    content: (
      <ul>
        <li>Using the platform for unlawful purposes.</li>
        <li>Engaging in fraudulent or deceptive behavior.</li>
        <li>Attempting to exploit or manipulate platform systems.</li>
        <li>Attempting to convert real-world money into in-game items or in-game items into real-world value, including real-world trading.</li>
        <li>Abusing rewards by repeatedly claiming promotions, bonuses, or incentives without meaningful gameplay participation, or by using the platform solely to extract rewards.</li>
        <li>Creating or using accounts primarily to farm, collect, or exploit rewards, promotions, or referral systems.</li>
      </ul>
    ),
  },
  {
    title: '9. Intellectual Property',
    content: (
      <p>
        All content on the Site, including text, graphics, logos, and software, is the property of BloxDice or its licensors and is protected by applicable intellectual property laws.
      </p>
    ),
  },
  {
    title: '10. Limitation of Liability',
    content: (
      <p>
        To the fullest extent permitted by law, BloxDice shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Site or Services.
      </p>
    ),
  },
  {
    title: '11. Termination',
    content: (
      <p>
        We may suspend or terminate your access to the Site at our sole discretion for violations of these Terms or suspected abuse.
      </p>
    ),
  },
  {
    title: '12. Contact Us',
    content: (
      <p>
        If you have any questions regarding these Terms, contact us through our{' '}
        <a
          href="https://discord.gg/xcDdtcnPP2"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#8f96c8] underline decoration-[#8f96c8]/50 underline-offset-2 transition-colors hover:text-[#cbd3f2]"
        >
          official Discord server
        </a>
        .
      </p>
    ),
  },
]

export default function TermsModal({ isOpen, onClose }) {
  const dialogRef = useRef(null)
  const closeTimerRef = useRef(null)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const [closing, setClosing] = useState(false)
  onCloseRef.current = onClose

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current?.(), 200)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    closingRef.current = false
    setClosing(false)
  }, [isOpen])

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined

    const previouslyFocused = document.activeElement
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [isOpen, requestClose])

  if (!isOpen) return null

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center bg-[rgba(0,0,0,.55)] p-3 sm:p-5 ${
        closing
          ? 'animate-[termsFadeOut_.2s_ease-in_forwards]'
          : 'animate-[termsFadeIn_.2s_ease-out]'
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
        aria-describedby="terms-modal-summary"
        tabIndex={-1}
        className={`flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[680px] flex-col overflow-hidden rounded-[6px] border border-solid border-[#181a28] bg-[#131520] font-[Poppins] text-[#e1e4f2] shadow-[0_20px_80px_rgba(0,0,0,0.55)] outline-none sm:max-h-[min(760px,calc(100dvh-2.5rem))] ${
          closing
            ? 'animate-[termsModalClose_.2s_forwards]'
            : 'animate-[termsModalOpen_.25s_forwards]'
        }`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-4 sm:px-5">
          <span className="flex h-10 w-5 shrink-0 items-center justify-center text-[#8f96c8]" aria-hidden="true">
            <TermsIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="terms-modal-title" className="text-[18px] font-bold leading-[1.3] text-white sm:text-[21px]">
              Terms of Service
            </h2>
            <p id="terms-modal-summary" className="mt-0.5 text-[10px] font-semibold text-[#666d8d] sm:text-[11px]">
              Effective date: {EFFECTIVE_DATE}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Terms of Service"
            onClick={requestClose}
            className="grid h-[30px] w-[30px] shrink-0 place-content-center rounded-[5px] border-0 bg-transparent text-[#7d839f] transition-colors duration-150 hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c63ff]"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
        </header>

        <div className="terms-modal-scroll min-h-0 flex-1 overscroll-contain overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <div className="space-y-4">
            {sections.map((section) => (
              <article key={section.title}>
                <h3 className="mb-1.5 text-xs font-bold text-white sm:text-[13px]">{section.title}</h3>
                <div className="text-[11px] font-medium leading-[1.7] text-[#8f96b5] sm:text-xs [&_a]:text-[#8f96c8] [&_strong]:font-semibold [&_strong]:text-[#cdd1e3] [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4">
                  {section.content}
                </div>
              </article>
            ))}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-white/[0.06] bg-[#131520] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
          <p className="text-[10px] font-medium leading-relaxed text-[#666d8d] sm:max-w-[390px] sm:text-[11px]">
            Using the Service means you accept these Terms. Keep a copy for your records.
          </p>
          <button
            type="button"
            onClick={requestClose}
            className="h-10 shrink-0 rounded-[8px] border border-[rgba(94,85,217,0.4)] bg-[linear-gradient(135deg,#5b52e2,#4038c0)] px-5 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(108,99,255,0.2)] transition-[transform,background,opacity] duration-150 hover:bg-[linear-gradient(135deg,#6c63ff,#5147d9)] hover:opacity-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8079ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131520]"
          >
            I understand
          </button>
        </footer>
        <style>{`
          @keyframes termsFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes termsFadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
          }

          @keyframes termsModalOpen {
            from { opacity: 0; transform: scale(.93); }
            to { opacity: 1; transform: scale(1); }
          }

          @keyframes termsModalClose {
            from { opacity: 1; transform: scale(1); }
            to { opacity: 0; transform: scale(.93); }
          }

          .terms-modal-scroll {
            scrollbar-width: thin;
            scrollbar-color: #2a2e44 transparent;
          }

          .terms-modal-scroll::-webkit-scrollbar {
            width: 8px;
          }

          .terms-modal-scroll::-webkit-scrollbar-track {
            background: transparent;
          }

          .terms-modal-scroll::-webkit-scrollbar-thumb {
            border-radius: 999px;
            background: #2a2e44;
          }

          .terms-modal-scroll::-webkit-scrollbar-thumb:hover {
            background: #32385a;
          }
        `}</style>
      </section>
    </div>
  )
}
