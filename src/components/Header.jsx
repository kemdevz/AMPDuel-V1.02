import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from "../lib/router";
import LoginModal from "./LoginModal";
import AnimatedNumber from "./AnimatedNumber";
import InventoryModal from "./InventoryModal";
import GiveawayCreateModal from "./GiveawayCreateModal";
import PromoCodeModal from "./PromoCodeModal";
import { apiRequest } from "../lib/apiClient";
import { supabase } from "../lib/supabaseClient";
import ExchangeModal from "./ExchangeModal";
import { useAuth } from "../store/auth";

const COIN_ICON = "/bobux.png";
const DESKTOP_LOGO = "https://i.ibb.co/pj7hWMK3/logo-1.webp";
const MOBILE_LOGO = "https://i.ibb.co/dws0Tg8q/logo-small-4x.webp";
const AVATAR =
  "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-7E27815C7C5F72DA623094CFB3768D15-Png/420/420/AvatarHeadshot/Png/noFilter";

function ChevronDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-chevron-down h-[18px] w-[18px] shrink-0 text-[#9ca9d6]"
      aria-hidden="true"
      style={{
        transform: "rotate(0deg)",
        transition: "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "transform",
      }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 512 512" className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" aria-hidden="true">
      <path
        fill="currentColor"
        d="M64 32C28.7 32 0 60.7 0 96L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-192c0-35.3-28.7-64-64-64L72 128c-13.3 0-24-10.7-24-24S58.7 80 72 80l384 0c13.3 0 24-10.7 24-24s-10.7-24-24-24L64 32zM416 256a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 22 23" fill="none" className="h-5 w-5 md:h-6 md:w-6 text-[#6c63ff]" aria-hidden="true">
      <path
        d="M9.22322 19.287C9.16077 19.0417 9.37186 18.8333 9.62499 18.8333H12.375C12.6281 18.8333 12.8392 19.0417 12.7767 19.287C12.5748 20.0801 11.8559 20.6667 11 20.6667C10.1441 20.6667 9.42513 20.0801 9.22322 19.287Z"
        fill="currentColor"
      />
      <path
        d="M11.9207 4.16667H10.0793L9.13358 4.50688C6.95371 5.29104 5.5002 7.35861 5.5002 9.67523V10.8908C5.5002 11.5634 5.18395 12.1968 4.64636 12.601C2.7696 14.0121 3.76757 17 6.11563 17H15.8847C18.2327 17 19.2307 14.0121 17.354 12.601C16.8164 12.1968 16.5002 11.5634 16.5002 10.8908V9.67532C16.5002 7.35864 15.0466 5.29105 12.8667 4.50693L11.9207 4.16667Z"
        fill="currentColor"
      />
      <path
        d="M10.0834 3.25C10.0834 2.74374 10.4938 2.33333 11 2.33333C11.5063 2.33333 11.9167 2.74374 11.9167 3.25V4.16667H10.0834V3.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-volume2 h-5 w-5 md:h-6 md:w-6 text-[#6c63ff]"
      aria-hidden="true"
    >
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </svg>
  );
}

function SummerEventLink() {
  return (
    <NavLink
      to="/events"
      className="relative ml-3 hidden shrink-0 items-center overflow-hidden md:flex"
      style={{
        background:
          'linear-gradient(rgba(29, 32, 47, 0.88), rgba(29, 32, 47, 0.9)), url("https://i.ibb.co/Fk4DpnMQ/summer-background.webp") center center / cover',
        borderRadius: "0px",
        padding: "8px 21px",
        textDecoration: "none",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "0px",
          left: "0px",
          width: "40%",
          height: "100%",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.22) 50%, transparent 100%)",
          animation: "summerShimmer 2.4s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "0px",
          background: "radial-gradient(rgba(124, 232, 247, 0.25) 0%, transparent 65%)",
          animation: "summerGlow 2.6s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "0px",
          padding: "1px",
          background: "linear-gradient(rgb(124, 232, 247) 0%, rgba(124, 232, 247, 0) 100%)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          pointerEvents: "none",
        }}
      />

      <span
        style={{
          fontSize: "16px",
          fontWeight: 800,
          fontStyle: "italic",
          letterSpacing: "1px",
          textTransform: "uppercase",
          position: "relative",
          backgroundImage:
            "linear-gradient(rgb(251, 191, 36) 0%, rgb(253, 224, 71) 38%, rgb(125, 211, 252) 100%)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
          filter: "drop-shadow(rgba(124, 232, 247, 0.5) 0px 0px 9px)",
        }}
      >
        Summer Event
      </span>
    </NavLink>
  );
}

const getOwnerIdsForUser = async (userData) => {
  const ownerIds = [userData?.profile_id, userData?.id]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value))

  return [...new Set(ownerIds)]
}

export default function Header({ onOpenProfileModal }) {
  const [loginOpen, setLoginOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [volumePosition, setVolumePosition] = useState({ x: 0, y: 0 })
  const [volumeLevel, setVolumeLevel] = useState(100)
  const [walletOpen, setWalletOpen] = useState(false)
  const [walletPosition, setWalletPosition] = useState({ x: 0, y: 0 })
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [giveawayOpen, setGiveawayOpen] = useState(false)
  const [promoCodeOpen, setPromoCodeOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsPosition, setNotificationsPosition] = useState({ x: 0, y: 0 })
  const avatarButtonRef = useRef(null)
  const menuRef = useRef(null)
  const volumeButtonRef = useRef(null)
  const volumeMenuRef = useRef(null)
  const walletButtonRef = useRef(null)
  const walletMenuRef = useRef(null)
  const notificationsButtonRef = useRef(null)
  const notificationsMenuRef = useRef(null)

  const user = useAuth((s) => s.user)
  const balance = useAuth((s) => s.balance)
  const setBalance = useAuth((s) => s.setBalance)
  const logout = useAuth((s) => s.logout)
  const walletSelection = useAuth((s) => s.walletSelection)
  const setWalletSelection = useAuth((s) => s.setWalletSelection)
  const [inventorySummary, setInventorySummary] = useState({ count: 0, value: 0 })
  const walletDisplayAmount = walletSelection === "coins" ? Number(balance || 0) : inventorySummary.value

  useEffect(() => {
    let isMounted = true
    let inventoryChannel = null
    let refreshSequence = 0

    const refreshWalletState = async () => {
      const sequence = ++refreshSequence

      if (!user?.id && !user?.profile_id) {
        if (isMounted) {
          setInventorySummary({ count: 0, value: 0 })
          setBalance(0)
        }
        return
      }

      try {
        const uniqueOwnerIds = await getOwnerIdsForUser(user)
        const profileId = String(user?.profile_id || user?.id || '').trim()

        if (uniqueOwnerIds.length === 0) {
          if (isMounted && sequence === refreshSequence) {
            setInventorySummary({ count: 0, value: 0 })
          }
          return
        }

        const inventoryRequest = apiRequest('/api/inventory')
          .then((result) => ({ data: result?.items || [], error: null }))
          .catch((error) => ({ data: [], error }))

        const profileRequest = profileId
          ? apiRequest('/api/profile')
            .then((result) => ({ data: result?.profile || null, error: null }))
            .catch((error) => ({ data: null, error }))
          : Promise.resolve({ data: null, error: null })

        const [inventoryResult, profileResult] = await Promise.all([inventoryRequest, profileRequest])
        if (!isMounted || sequence !== refreshSequence) return

        if (!inventoryResult.error) {
          const inventoryRows = inventoryResult.data ?? []
          setInventorySummary({
            count: inventoryRows.length,
            value: inventoryRows.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
          })
        }

        if (!profileResult.error && profileResult.data?.balance != null) {
          setBalance(Number(profileResult.data.balance))
        }
      } catch (err) {
        console.warn('[Header] failed to refresh wallet totals', err)
      }
    }

    const handleWalletRefresh = () => {
      void refreshWalletState()
    }

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') void refreshWalletState()
    }

    void refreshWalletState()
    window.addEventListener('wallet:updated', handleWalletRefresh)
    window.addEventListener('focus', handleWalletRefresh)
    document.addEventListener('visibilitychange', handleVisibilityRefresh)

    if (!user?.id && !user?.profile_id) {
      return () => {
        isMounted = false
        window.removeEventListener('wallet:updated', handleWalletRefresh)
        window.removeEventListener('focus', handleWalletRefresh)
        document.removeEventListener('visibilitychange', handleVisibilityRefresh)
      }
    }

    void getOwnerIdsForUser(user).then((ownerIds) => {
      if (!isMounted) return

      const uniqueOwnerIds = [...new Set(ownerIds)]
      if (uniqueOwnerIds.length === 0) return

      const channelName = `inventory-summary-${uniqueOwnerIds.join('-')}`
      inventoryChannel = supabase.channel(channelName)
      inventoryChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
        if (isMounted) void refreshWalletState()
      })
      inventoryChannel.subscribe()
    })

    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshWalletState()
    }, 10000)

    return () => {
      isMounted = false
      window.clearInterval(refreshInterval)
      window.removeEventListener('wallet:updated', handleWalletRefresh)
      window.removeEventListener('focus', handleWalletRefresh)
      document.removeEventListener('visibilitychange', handleVisibilityRefresh)
      if (inventoryChannel) {
        supabase.removeChannel(inventoryChannel)
      }
    }
  }, [setBalance, user?.id, user?.profile_id])

  useEffect(() => {
    if (!menuOpen && !volumeOpen && !walletOpen && !notificationsOpen) return undefined

    const handleDocumentClick = (event) => {
      if (
        menuRef.current?.contains(event.target) ||
        avatarButtonRef.current?.contains(event.target) ||
        volumeMenuRef.current?.contains(event.target) ||
        volumeButtonRef.current?.contains(event.target) ||
        walletMenuRef.current?.contains(event.target) ||
        walletButtonRef.current?.contains(event.target) ||
        notificationsMenuRef.current?.contains(event.target) ||
        notificationsButtonRef.current?.contains(event.target)
      ) {
        return
      }
      setMenuOpen(false)
      setVolumeOpen(false)
      setWalletOpen(false)
      setNotificationsOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false)
        setVolumeOpen(false)
        setWalletOpen(false)
        setNotificationsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleDocumentClick)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [menuOpen, volumeOpen, walletOpen, notificationsOpen])

  const handleAvatarClick = () => {
    if (!avatarButtonRef.current) {
      return
    }

    if (menuOpen) {
      setMenuOpen(false)
      return
    }

    const rect = avatarButtonRef.current.getBoundingClientRect()
    const menuWidth = 224
    const x = Math.max(8, rect.left + rect.width - menuWidth)
    const y = rect.bottom + 8

    setMenuPosition({ x, y })
    setMenuOpen(true)
    setVolumeOpen(false)
    setNotificationsOpen(false)
  }

  const handleVolumeClick = () => {
    if (!volumeButtonRef.current) {
      return
    }

    if (volumeOpen) {
      setVolumeOpen(false)
      return
    }

    const rect = volumeButtonRef.current.getBoundingClientRect()
    const menuWidth = 224
    const x = Math.max(8, rect.right - menuWidth)
    const y = rect.bottom + 8

    setVolumePosition({ x, y })
    setVolumeOpen(true)
    setMenuOpen(false)
    setNotificationsOpen(false)
  }

  const handleWalletClick = () => {
    setInventoryOpen(true)
    setWalletOpen(false)
    setExchangeOpen(false)
    setMenuOpen(false)
    setVolumeOpen(false)
    setNotificationsOpen(false)
  }

  const handleWalletPopupClick = (event) => {
    event.stopPropagation()

    if (!walletButtonRef.current) {
      return
    }

    if (walletOpen) {
      setWalletOpen(false)
      return
    }

    const rect = walletButtonRef.current.getBoundingClientRect()
    const x = Math.max(8, rect.left)
    const y = rect.bottom + 8

    setWalletPosition({ x, y })
    setWalletOpen(true)
    setInventoryOpen(false)
    setExchangeOpen(false)
    setMenuOpen(false)
    setVolumeOpen(false)
    setNotificationsOpen(false)
  }

  const handleWalletModeToggle = (event) => {
    event.stopPropagation()
  }

  const handleWalletSelection = (selection) => {
    setWalletSelection(selection)
    setWalletOpen(false)
  }

  const handleNotificationsClick = () => {
    if (!notificationsButtonRef.current) {
      return
    }

    if (notificationsOpen) {
      setNotificationsOpen(false)
      return
    }

    const rect = notificationsButtonRef.current.getBoundingClientRect()
    const menuWidth = 320
    const x = Math.max(8, rect.right - menuWidth)
    const y = rect.bottom + 8

    setNotificationsPosition({ x, y })
    setNotificationsOpen(true)
    setMenuOpen(false)
    setVolumeOpen(false)
    setWalletOpen(false)
  }

  return (
    <header 
      className="mt-3 box-border flex h-[4.5rem] w-full items-center justify-center px-3 md:h-[5.25rem] md:px-5 lg:px-6" 
      style={{ backgroundColor: 'rgb(23, 25, 37)', paddingTop: '0rem', paddingBottom: '0.75rem' }}
    >
      <style>{`
        @keyframes summerShimmer {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(300%) skewX(-15deg); }
        }

        @keyframes summerGlow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        @keyframes menuPopupIn {
          from {
            opacity: 0;
            transform: translateY(-6px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

      <div className="flex min-w-0 flex-1 shrink items-center">
        <Link to="/">
          <img
            alt="BloxyPot Logo"
            src={MOBILE_LOGO}
            className="block aspect-auto h-auto w-[2.5rem] md:hidden"
            draggable={false}
          />
          <img
            alt="BloxyPot Logo"
            src={DESKTOP_LOGO}
            className="hidden aspect-auto h-auto w-[clamp(5.5rem,calc(2.75rem+10vw),11rem)] md:block"
            draggable={false}
          />
        </Link>

        <SummerEventLink />
      </div>

      {user ? (
        <div className="flex shrink-0 justify-center">
          <InventoryModal isOpen={inventoryOpen} onClose={() => setInventoryOpen(false)} />
          <ExchangeModal isOpen={exchangeOpen} onClose={() => setExchangeOpen(false)} />
          <div
            ref={walletButtonRef}
            className="mx-1 inline-flex max-w-full overflow-hidden rounded-[6px] text-xs font-semibold text-white sm:mx-0 sm:text-[15px]"
          >
            <button
              type="button"
              className="relative inline-flex cursor-pointer items-center gap-1.5 overflow-hidden border-0 bg-[#20222f] px-2.5 py-2 text-white transition-none hover:opacity-90 sm:gap-2.5 sm:px-4 sm:py-2.5"
              title="Open inventory"
              onClick={handleWalletClick}
            >
              <img
                src={COIN_ICON}
                alt="bobux"
                draggable={false}
                onClick={(event) => event.stopPropagation()}
                style={{ width: "18px", height: "18px", objectFit: "contain" }}
              />

              <span
                className="inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap leading-none"
                onClick={(event) => {
                  event.stopPropagation()
                  handleWalletPopupClick(event)
                }}
              >
                <span>
                  <AnimatedNumber className="hidden sm:inline" value={walletDisplayAmount} />
                  <AnimatedNumber className="sm:hidden" value={walletDisplayAmount} />
                </span>

                <span className="ml-1 h-4 w-px bg-white/10" />

                <ChevronDownIcon />
              </span>
            </button>

            <button
              type="button"
              className={walletSelection === "coins"
                ? "inline-flex min-h-[2.5rem] min-w-[2.5rem] cursor-pointer items-center justify-center gap-1 border-0 border-l border-solid border-white/10 bg-[linear-gradient(135deg,#22C55E_0%,#16A34A_100%)] px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:opacity-90 sm:min-h-[3rem] sm:min-w-[3rem] sm:px-6 sm:py-3 sm:text-[15px]"
                : "inline-flex min-h-[2.5rem] min-w-[2.5rem] cursor-pointer items-center gap-1 border-0 border-l border-solid border-white/10 bg-[linear-gradient(135deg,#6C63FF_0%,#5147D9_100%)] px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:opacity-90 sm:min-h-[3rem] sm:min-w-[3rem] sm:px-6 sm:py-3 sm:text-[15px]"
              }
              aria-label={walletSelection === "coins" ? "Exchange" : "Wallet"}
              onClick={() => {
                if (walletSelection === "coins") {
                  setExchangeOpen(true)
                } else {
                  setInventoryOpen(true)
                }
                setWalletOpen(false)
                setMenuOpen(false)
                setVolumeOpen(false)
                setNotificationsOpen(false)
              }}
            >
              {walletSelection === "coins" ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7 7h12l-2.25-2.25M19 7l-2.25 2.25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>
                  <path d="M17 17H5l2.25 2.25M5 17l2.25-2.25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              ) : (
                <WalletIcon />
              )}
            </button>
          </div>
          {walletOpen ? (
            <div
              ref={walletMenuRef}
              data-radix-popper-content-wrapper=""
              dir="ltr"
              style={{
                position: 'fixed',
                left: '0px',
                top: '0px',
                transform: `translate(${walletPosition.x}px, ${walletPosition.y}px)`,
                minWidth: 'max-content',
                zIndex: 50,
                '--radix-popper-available-width': '1261px',
                '--radix-popper-available-height': '885px',
                '--radix-popper-anchor-width': '94.046875px',
                '--radix-popper-anchor-height': '44px',
                '--radix-popper-transform-origin': '0% 0px',
              }}
            >
              <div
                data-side="bottom"
                data-align="start"
                role="menu"
                aria-orientation="vertical"
                data-state="open"
                data-radix-menu-content=""
                dir="ltr"
                className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden bg-[#1C1F2D] border border-solid border-[#252839] shadow-none rounded-[6px] p-1 w-52 mt-1 text-[#E1E4F2] animate-[menuPopupIn_180ms_ease-out_forwards]"
                tabIndex={-1}
                data-orientation="vertical"
                style={{
                  outline: 'none',
                  '--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
                  '--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
                  '--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
                  '--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
                  '--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)',
                  pointerEvents: 'auto',
                }}
              >
                <div
                  role="menuitem"
                  className={`relative flex select-none items-center gap-2 text-sm outline-none transition-colors px-3 py-2 rounded-[6px] cursor-pointer text-[#E1E4F2] ${walletSelection === "items" ? "bg-[#20222f]" : ""}`}
                  tabIndex={-1}
                  data-orientation="vertical"
                  data-radix-collection-item=""
                  onClick={() => handleWalletSelection("items")}
                >
                  <div className="flex w-full items-center gap-2">
                    <span>Items</span>
                    <div className="ml-auto flex items-center gap-2 text-[12px] text-[#9ca9d6]">
                      <img src={COIN_ICON} alt="bobux" draggable={false} style={{ width: "16px", height: "16px", objectFit: "contain" }} />
                      <AnimatedNumber className="text-white" value={inventorySummary.value} />
                    </div>
                  </div>
                </div>
                <div
                  role="menuitem"
                  className={`relative flex select-none items-center gap-2 text-sm outline-none transition-colors px-3 py-2 rounded-[6px] cursor-pointer text-[#E1E4F2] ${walletSelection === "coins" ? "bg-[#20222f]" : ""}`}
                  tabIndex={-1}
                  data-orientation="vertical"
                  data-radix-collection-item=""
                  onClick={() => handleWalletSelection("coins")}
                >
                  <div className="flex w-full items-center gap-2">
                    <span>Coins</span>
                    <div className="ml-auto flex items-center gap-2 text-[12px] text-[#9ca9d6]">
                      <img src={COIN_ICON} alt="bobux" draggable={false} style={{ width: "16px", height: "16px", objectFit: "contain" }} />
                      <AnimatedNumber className="text-white" value={balance} />
                    </div>
                  </div>
                </div>
                <div role="separator" aria-orientation="horizontal" className="-mx-1 my-1 h-px bg-[#252839]" />
                <div
                  role="menuitem"
                  className="relative flex select-none items-center gap-2 text-sm outline-none transition-colors px-3 py-2 rounded-[6px] cursor-pointer text-[#E1E4F2]"
                  tabIndex={-1}
                  data-orientation="vertical"
                  data-radix-collection-item=""
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#9ca9d6]">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 16v-4"></path>
                        <path d="M12 8h.01"></path>
                      </svg>
                    </span>
                    <span className="text-center">What is this?</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
        <div className="overflow-hidden rounded-[6px]">
          <button
            ref={notificationsButtonRef}
            type="button"
            aria-label="Notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-[6px] border-none bg-[#20222f] text-[#E1E4F2] shadow-none transition-none hover:opacity-90 active:opacity-100 md:h-12 md:w-12"
            aria-haspopup="menu"
            aria-expanded={notificationsOpen}
            data-state={notificationsOpen ? "open" : "closed"}
            onClick={handleNotificationsClick}
          >
            <BellIcon />
          </button>
        </div>

        {notificationsOpen ? (
          <div
            ref={notificationsMenuRef}
            data-radix-popper-content-wrapper=""
            dir="ltr"
            style={{
              position: 'fixed',
              left: '0px',
              top: '0px',
              transform: `translate(${notificationsPosition.x}px, ${notificationsPosition.y}px)`,
              minWidth: 'max-content',
              zIndex: 50,
              '--radix-popper-available-width': '1261px',
              '--radix-popper-available-height': '887px',
              '--radix-popper-anchor-width': '40px',
              '--radix-popper-anchor-height': '40px',
              '--radix-popper-transform-origin': '100% 0px',
            }}
          >
            <div
              data-side="bottom"
              data-align="end"
              role="menu"
              aria-orientation="vertical"
              data-state="open"
              data-radix-menu-content=""
              dir="ltr"
              id="radix-:r3:"
              aria-labelledby="radix-:r2:"
              className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden bg-[#1C1F2D] border border-solid border-[#252839] shadow-none rounded-[6px] p-1 mt-1 text-[#E1E4F2] w-80 animate-[menuPopupIn_180ms_ease-out_forwards]"
              tabIndex={-1}
              data-orientation="vertical"
              style={{
                outline: 'none',
                '--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
                '--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
                '--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
                '--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
                '--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)',
                pointerEvents: 'auto',
              }}
            >
              <div className="px-2 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-[6px] bg-[#20222f] flex items-center justify-center">
                    <svg viewBox="0 0 22 23" fill="none" className="w-4 h-4 text-[#6c63ff]">
                      <path d="M9.22322 19.287C9.16077 19.0417 9.37186 18.8333 9.62499 18.8333H12.375C12.6281 18.8333 12.8392 19.0417 12.7767 19.287C12.5748 20.0801 11.8559 20.6667 11 20.6667C10.1441 20.6667 9.42513 20.0801 9.22322 19.287Z" fill="currentColor"></path>
                      <path d="M11.9207 4.16667H10.0793L9.13358 4.50688C6.95371 5.29104 5.5002 7.35861 5.5002 9.67523V10.8908C5.5002 11.5634 5.18395 12.1968 4.64636 12.601C2.7696 14.0121 3.76757 17 6.11563 17H15.8847C18.2327 17 19.2307 14.0121 17.354 12.601C16.8164 12.1968 16.5002 11.5634 16.5002 10.8908V9.67532C16.5002 7.35864 15.0466 5.29105 12.8667 4.50693L11.9207 4.16667Z" fill="currentColor"></path>
                      <path d="M10.0834 3.25C10.0834 2.74374 10.4938 2.33333 11 2.33333C11.5063 2.33333 11.9167 2.74374 11.9167 3.25V4.16667H10.0834V3.25Z" fill="currentColor"></path>
                    </svg>
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold text-[#E1E4F2]">Notifications</div>
                    <div className="text-xs text-[#9ca9d6]">You're all caught up</div>
                  </div>
                </div>
                <button type="button" className="text-xs font-semibold px-2 py-1 rounded-[6px] border-none bg-[#2a2e44] text-[#E1E4F2] active:opacity-100 transition-none opacity-50 cursor-not-allowed hover:opacity-50" disabled aria-disabled="true">Clear all</button>
              </div>
              <div className="h-px bg-[#252839] my-1"></div>
              <div className="px-3 py-8 text-center">
                <div className="text-sm font-semibold text-[#E1E4F2]/80">No notifications</div>
                <div className="text-xs text-[#9ca9d6] mt-1">When something happens, it’ll show up here.</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="relative">
          <button
            ref={volumeButtonRef}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[6px] border-none bg-[#20222f] text-[#E1E4F2] shadow-none transition-none hover:opacity-90 active:opacity-100 md:h-12 md:w-12"
            aria-label="Volume"
            type="button"
            aria-haspopup="menu"
            aria-expanded={volumeOpen}
            data-state={volumeOpen ? "open" : "closed"}
            id="volume-button"
            onClick={handleVolumeClick}
          >
            <VolumeIcon />
          </button>
          {volumeOpen ? (
            <div
              ref={volumeMenuRef}
              data-radix-popper-content-wrapper=""
              dir="ltr"
              style={{
                position: 'fixed',
                left: '0px',
                top: '0px',
                transform: `translate(${volumePosition.x}px, ${volumePosition.y}px)`,
                minWidth: 'max-content',
                zIndex: 50,
                '--radix-popper-available-width': '1261px',
                '--radix-popper-available-height': '887px',
                '--radix-popper-anchor-width': '40px',
                '--radix-popper-anchor-height': '40px',
                '--radix-popper-transform-origin': '100% 0px',
              }}
            >
              <div
                data-side="bottom"
                data-align="end"
                role="menu"
                aria-orientation="vertical"
                data-state="open"
                data-radix-menu-content=""
                dir="ltr"
                id="volume-menu"
                aria-labelledby="volume-button"
                className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden bg-[#1C1F2D] border border-solid border-[#252839] shadow-none rounded-[6px] p-1 mt-1 text-[#E1E4F2] w-56 animate-[menuPopupIn_180ms_ease-out_forwards]"
                tabIndex={-1}
                data-orientation="vertical"
                style={{
                  outline: 'none',
                  '--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
                  '--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
                  '--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
                  '--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
                  '--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)',
                  pointerEvents: 'auto',
                }}
              >
                <div className="flex items-center justify-between mb-2 px-2 pt-1">
                  <span className="text-sm font-medium text-[#E1E4F2]">Volume</span>
                  <span className="text-sm text-[#9ca9d6]">{volumeLevel}%</span>
                </div>
                <div className="px-2 pb-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#6c63ff]"
                    value={volumeLevel}
                    onChange={(event) => setVolumeLevel(Number(event.target.value))}
                    style={{ backgroundColor: 'rgb(32, 34, 47)' }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div
                ref={avatarButtonRef}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                data-state={menuOpen ? "open" : "closed"}
                onClick={handleAvatarClick}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    handleAvatarClick()
                  }
                }}
              >
                <div
                  className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full md:h-[60px] md:w-[60px]"
                  style={{ backgroundColor: 'rgb(32, 34, 47)' }}
                >
                  <div className="relative box-border grid h-full w-full aspect-square cursor-pointer place-content-center overflow-hidden rounded-full border-4 border-solid border-[#22283F] bg-[#1C1F2E] [&>div]:h-full [&>div]:w-full [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_img]:object-center">
                    <img
                      src={user.avatar_headshot_url || user.avatar_url || AVATAR}
                      alt=""
                      className="block max-w-full rounded-[10px]"
                      height="42"
                      width="42"
                      loading="lazy"
                      draggable={false}
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.src = AVATAR
                      }}
                    />
                  </div>
                </div>
              </div>

              {menuOpen ? (
                <div
                  ref={menuRef}
                  data-radix-popper-content-wrapper=""
                  dir="ltr"
                  style={{
                    position: 'fixed',
                    left: '0px',
                    top: '0px',
                    transform: `translate(${menuPosition.x}px, ${menuPosition.y}px)`,
                    minWidth: 'max-content',
                    zIndex: 50,
                    '--radix-popper-available-width': '1261px',
                    '--radix-popper-available-height': '877px',
                    '--radix-popper-anchor-width': '60px',
                    '--radix-popper-anchor-height': '60px',
                    '--radix-popper-transform-origin': '50% 0px',
                  }}
                >
                  <div
                    data-side="bottom"
                    data-align="center"
                    role="menu"
                    aria-orientation="vertical"
                    data-state="open"
                    dir="ltr"
                    id="radix-:rr:"
                    aria-labelledby="radix-:rq:"
                    className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden bg-[#1C1F2D] border border-solid border-[#252839] shadow-none rounded-[6px] p-1 mt-1 text-[#E1E4F2] w-56 animate-[menuPopupIn_180ms_ease-out_forwards]"
                    tabIndex={-1}
                    data-orientation="vertical"
                    style={{
                      outline: 'none',
                      '--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
                      '--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
                      '--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
                      '--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
                      '--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)',
                      pointerEvents: 'auto',
                    }}
                  >
                    <div
                      role="menuitem"
                      className="relative select-none text-sm outline-none transition-colors duration-150 hover:bg-[#20222f]/70 focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-[6px] cursor-pointer text-[#E1E4F2] data-[highlighted]:bg-[#20222f] data-[highlighted]:text-[#E1E4F2]"
                      tabIndex={-1}
                      data-orientation="vertical"
                      data-radix-collection-item=""
                      onClick={() => {
                        setMenuOpen(false)
                        setVolumeOpen(false)
                        setWalletOpen(false)
                        setNotificationsOpen(false)
                        onOpenProfileModal?.()
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-user h-4 w-4 text-[#6C63FF]"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      <span>Profile</span>
                    </div>
                    <div
                      role="menuitem"
                      className="relative select-none text-sm outline-none transition-colors duration-150 hover:bg-[#20222f]/70 focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-[6px] cursor-pointer text-[#E1E4F2] data-[highlighted]:bg-[#20222f] data-[highlighted]:text-[#E1E4F2]"
                      tabIndex={-1}
                      data-orientation="vertical"
                      data-radix-collection-item=""
                      onClick={() => {
                        setMenuOpen(false)
                        setInventoryOpen(true)
                        setExchangeOpen(false)
                        setWalletOpen(false)
                        setVolumeOpen(false)
                        setNotificationsOpen(false)
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-package h-4 w-4 text-[#6c63ff]"
                      >
                        <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"></path>
                        <path d="M12 22V12"></path>
                        <polyline points="3.29 7 12 12 20.71 7"></polyline>
                        <path d="m7.5 4.27 9 5.15"></path>
                      </svg>
                      <span>Inventory</span>
                    </div>
                    <div
                      role="menuitem"
                      className="relative select-none text-sm outline-none transition-colors duration-150 hover:bg-[#20222f]/70 focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-[6px] cursor-pointer text-[#E1E4F2] data-[highlighted]:bg-[#20222f] data-[highlighted]:text-[#E1E4F2]"
                      tabIndex={-1}
                      data-orientation="vertical"
                      data-radix-collection-item=""
                      onClick={() => {
                        setMenuOpen(false)
                        setPromoCodeOpen(true)
                        setInventoryOpen(false)
                        setExchangeOpen(false)
                        setWalletOpen(false)
                        setVolumeOpen(false)
                        setNotificationsOpen(false)
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-ticket h-4 w-4 text-[#6c63ff]"
                      >
                        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>
                        <path d="M13 5v2"></path>
                        <path d="M13 17v2"></path>
                        <path d="M13 11v2"></path>
                      </svg>
                      <span>Promocodes</span>
                    </div>
                    {/* Create Giveaway menu item removed */}
                    <div role="separator" aria-orientation="horizontal" className="-mx-1 my-1 h-px bg-[#252839]" />
                    <div
                      role="menuitem"
                      className="relative select-none text-sm outline-none transition-colors duration-150 hover:bg-[#20222f]/70 focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-[6px] cursor-pointer text-[#FF4757] data-[highlighted]:bg-[#20222f] data-[highlighted]:text-[#FF4757]"
                      tabIndex={-1}
                      data-orientation="vertical"
                      data-radix-collection-item=""
                      onClick={async () => {
                        setMenuOpen(false)
                        await logout()
                      }}
                    >
                      <svg width="20" height="19" viewBox="0 0 20 19" fill="none" className="h-4 w-4">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M8.29284 0.163756C8.70343 0.0405875 9.13712 0.015108 9.55931 0.0893519C9.98149 0.163596 10.3805 0.335507 10.7244 0.591363C11.0683 0.847219 11.3477 1.17993 11.5402 1.56295C11.7327 1.94597 11.8329 2.36868 11.833 2.79734V16.2027C11.8329 16.6313 11.7327 17.054 11.5402 17.4371C11.3477 17.8201 11.0683 18.1528 10.7244 18.4086C10.3805 18.6645 9.98149 18.8364 9.55931 18.9107C9.13712 18.9849 8.70343 18.9594 8.29284 18.8363L2.79284 17.1863C2.22643 17.0163 1.72988 16.6684 1.37685 16.194C1.02382 15.7196 0.833105 15.144 0.833008 14.5527V4.44734C0.833105 3.856 1.02382 3.28043 1.37685 2.80603C1.72988 2.33163 2.22643 1.98367 2.79284 1.81376L8.29284 0.163756ZM12.7497 2.16667C12.7497 1.92356 12.8463 1.6904 13.0182 1.51849C13.1901 1.34658 13.4232 1.25001 13.6663 1.25001H16.4163C17.1457 1.25001 17.8452 1.53974 18.3609 2.05546C18.8766 2.57119 19.1663 3.27066 19.1663 4.00001V4.91667C19.1663 5.15979 19.0698 5.39295 18.8979 5.56485C18.7259 5.73676 18.4928 5.83334 18.2497 5.83334C18.0066 5.83334 17.7734 5.73676 17.6015 5.56485C17.4296 5.39295 17.333 5.15979 17.333 4.91667V4.00001C17.333 3.75689 17.2364 3.52373 17.0645 3.35183C16.8926 3.17992 16.6595 3.08334 16.4163 3.08334H13.6663C13.4232 3.08334 13.1901 2.98676 13.0182 2.81485C12.8463 2.64295 12.7497 2.40979 12.7497 2.16667ZM18.2497 13.1667C18.4928 13.1667 18.7259 13.2632 18.8979 13.4352C19.0698 13.6071 19.1663 13.8402 19.1663 14.0833V15C19.1663 15.7294 18.8766 16.4288 18.3609 16.9446C17.8452 17.4603 17.1457 17.75 16.4163 17.75H13.6663C13.4232 17.75 13.1901 17.6534 13.0182 17.4815C12.8463 17.3096 12.7497 17.0765 12.7497 16.8333C12.7497 16.5902 12.8463 16.3571 13.0182 16.1852C13.1901 16.0132 13.4232 15.9167 13.6663 15.9167H16.4163C16.6595 15.9167 16.8926 15.8201 17.0645 15.6482C17.2364 15.4763 17.333 15.2431 17.333 15V14.0833C17.333 13.8402 17.4296 13.6071 17.6015 13.4352C17.7734 13.2632 18.0066 13.1667 18.2497 13.1667ZM7.24967 8.58334C7.00656 8.58334 6.7734 8.67992 6.60149 8.85183C6.42958 9.02373 6.33301 9.25689 6.33301 9.50001C6.33301 9.74312 6.42958 9.97628 6.60149 10.1482C6.7734 10.3201 7.00656 10.4167 7.24967 10.4167H7.25059C7.49371 10.4167 7.72686 10.3201 7.89877 10.1482C8.07068 9.97628 8.16726 9.74312 8.16726 9.50001C8.16726 9.25689 8.07068 9.02373 7.89877 8.85183C7.72686 8.67992 7.49371 8.58334 7.25059 8.58334H7.24967Z"
                          fill="currentColor"
                        ></path>
                        <path
                          d="M13.666 9.50002H18.2493M18.2493 9.50002L16.416 7.66669M18.2493 9.50002L16.416 11.3334"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        ></path>
                      </svg>
                      <span>Logout</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <button
              onClick={() => setLoginOpen(true)}
              className="inline-flex items-center gap-2 rounded-[6px] border-none bg-[#20222f] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 active:opacity-100 transition-none"
              type="button"
            >
              <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                <path d="M416 448h-84c-6.6 0-12-5.4-12-12v-40c0-6.6 5.4-12 12-12h84c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32h-84c-6.6 0-12-5.4-12-12V76c0-6.6 5.4-12 12-12h84c53 0 96 43 96 96v192c0 53-43 96-96 96zm-47-201L201 79c-15-15-41-4.5-41 17v96H24c-13.3 0-24 10.7-24 24v96c0 13.3 10.7 24 24 24h136v96c0 21.5 26 32 41 17l168-168c9.3-9.4 9.3-24.6 0-34z"></path>
              </svg>
              LOGIN
            </button>
          )}
        </div>
      </div>

      <LoginModal isOpen={loginOpen && !user} onClose={() => setLoginOpen(false)} />
      <GiveawayCreateModal isOpen={giveawayOpen} onClose={() => setGiveawayOpen(false)} />
      <PromoCodeModal isOpen={promoCodeOpen} onClose={() => setPromoCodeOpen(false)} />
    </header>
  );
}
