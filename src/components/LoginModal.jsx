import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Link2,
  Loader2,
  MoreHorizontal,
  X,
} from "lucide-react";
import { apiRequest } from "../lib/apiClient";
import { useAuth } from "../store/auth";
import { notifications } from "./Notifications";

const LOGO = "/logo.png";
const LOGIN_ART = "/login.png";
const FALLBACK_AVATAR =
  "https://tr.rbxcdn.com/38c6edcb50633730ff4cf39ac8859840/420/420/Avatar/Png";

function formatTime(seconds) {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const remainingSeconds = Math.max(0, seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function ModalButton({ children, className = "", variant = "primary", ...props }) {
  const base =
    "inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45";
  const variants = {
    primary:
      "border-0 bg-[#ff4fa3] text-black hover:opacity-90",
    secondary:
      "border border-[hsl(231_16%_16%)] bg-[hsl(233_16%_22%)] text-white hover:opacity-90",
  };

  return (
    <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export default function LoginModal({ isOpen, onClose }) {
  const setAuthenticatedUser = useAuth((s) => s.setAuthenticatedUser);

  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [agreedTos, setAgreedTos] = useState(false);
  const [agreedTesting, setAgreedTesting] = useState(false);
  const [robloxUser, setRobloxUser] = useState(null);
  const [phrase, setPhrase] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const canStart = username.trim() && agreedTos && agreedTesting;
  const profileUrl = robloxUser?.id ? `https://www.roblox.com/users/${robloxUser.id}/profile` : "#";
  const timerText = useMemo(() => formatTime(timeLeft), [timeLeft]);
  const displayNameIsLong = (robloxUser?.displayName || "").length > 12;
  const usernameIsLong = (robloxUser?.username || "").length > 13;

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setUsername("");
      setAgreedTos(false);
      setAgreedTesting(false);
      setRobloxUser(null);
      setPhrase("");
      setChallengeToken("");
      setTimeLeft(15 * 60);
      setLoading(false);
      setConfirming(false);
      setVerifying(false);
      setCopied(false);
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (step !== 3 || timeLeft <= 0) return undefined;

    const timer = window.setInterval(() => {
      setTimeLeft((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step, timeLeft]);

  if (!isOpen) return null;

  const close = () => {
    if (loading || confirming || verifying) return;
    onClose();
  };

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) close();
  };

  const handleLookup = async (event) => {
    event.preventDefault();
    if (!canStart || loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await apiRequest("/api/auth/roblox/challenge", {
        method: "POST",
        body: JSON.stringify({ username: username.trim() }),
      });
      const foundUser = result?.user;
      const fetchedUsername = foundUser?.username || username.trim();
      const fetchedDisplayName = foundUser?.displayName || fetchedUsername;
      const avatarUrl = foundUser?.avatarUrl || FALLBACK_AVATAR;
      const headshotUrl = foundUser?.headshotUrl || avatarUrl;

      setUsername(fetchedUsername);
      setRobloxUser({
        id: foundUser?.id,
        username: fetchedUsername,
        displayName: fetchedDisplayName,
        avatarUrl,
        headshotUrl,
      });
      setPhrase(result?.phrase || "");
      setChallengeToken(result?.challenge_token || "");
      setTimeLeft(Number(result?.expires_in || 15 * 60));
      setStep(2);
    } catch (err) {
      console.error("Roblox lookup error:", err);
      notifications.error(err.message || "Failed to find that Roblox account.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAccount = () => {
    if (confirming) return;
    setConfirming(true);
    window.setTimeout(() => {
      setConfirming(false);
      setStep(3);
    }, 700);
  };

  const handleCopy = async () => {
    if (!phrase) return;

    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
      notifications.error("Copy failed. Highlight the phrase and copy it manually.");
    }
  };

  const handleVerify = async () => {
    if (!robloxUser || verifying || timeLeft <= 0) {
      if (timeLeft <= 0) notifications.error("The phrase expired. Go back and create a new one.");
      return;
    }

    setVerifying(true);
    setError("");

    try {
      const result = await apiRequest("/api/auth/roblox/verify", {
        method: "POST",
        body: JSON.stringify({
          challenge_token: challengeToken,
        }),
      });
      await setAuthenticatedUser(result.user);
      notifications.success("Successfully signed in!");
      onClose();
    } catch (err) {
      console.error("Roblox verify error:", err);
      notifications.error(err.message || "Failed to verify Roblox profile.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes loginOverlayIn {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to { opacity: 1; backdrop-filter: blur(5px); }
        }
        @keyframes loginModalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center overflow-hidden bg-[hsl(228_17%_12%/.72)] p-0 animate-[loginOverlayIn_180ms_ease-out_forwards] sm:p-5"
        onClick={handleBackdropClick}
      >
        <div
          className="reference-login-modal relative flex h-[100dvh] max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-none border border-[hsl(231_16%_16%)] bg-[hsl(227_17%_11%)] shadow-lg animate-[loginModalIn_220ms_ease-out_forwards] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg"
          onClick={(event) => event.stopPropagation()}
        >
          {/* Close button — single instance, same spot for every step */}
          <button
            type="button"
            onClick={close}
            disabled={loading || confirming || verifying}
            className="absolute right-4 top-4 z-20 grid h-8 w-8 place-content-center rounded-sm text-white/60 opacity-70 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Art panel — fixed on the left for every step, height locked to the modal's fixed height so it never resizes/shifts between steps */}
          <div className="hidden">
            <img src={LOGIN_ART} alt="" className="h-full w-full object-cover" draggable={false} />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,11,19,0.05)_0%,rgba(8,11,19,0.35)_55%,rgba(8,11,19,0.92)_100%)]" />
            <div className="pointer-events-none absolute bottom-8 left-0 right-0 z-10 flex justify-center px-6">
              <img
                src={LOGO}
                alt="BloxyPot"
                draggable={false}
                className="h-auto w-[170px] max-w-full select-none drop-shadow-[0_16px_28px_rgba(0,0,0,0.5)]"
              />
            </div>
          </div>

          {/* Content panel — fixed height (matches modal), scrolls internally per step instead of resizing the modal */}
          <div className="no-scrollbar flex min-h-0 w-full flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-8 pb-8 pt-14 sm:px-12">
            {/* Mobile-only logo since the art panel is hidden below md */}
            <img src={LOGO} alt="BloxyBattles" draggable={false} className="hidden" />

            {step === 1 ? (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1.5 text-start">
                  <h1 className="text-lg font-semibold leading-none tracking-tight text-white">Welcome to BloxyBattles</h1>

                  <p className="text-sm leading-relaxed text-[#717171]">
                  By logging in, you acknowledge that you are at least 18 years of age, that any items you wager are not stolen, and that you agree to our{" "}
                  <a
                    href="/tos"
                    className="text-[#ff4fa3] hover:underline"
                    onClick={(event) => {
                      event.preventDefault()
                      window.dispatchEvent(new CustomEvent('terms:open'))
                    }}
                  >
                  Terms of Use
                  </a>
                  .
                  </p>
                </div>

                <form onSubmit={handleLookup} className="flex flex-col">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-white">Roblox Username</label>
                    <div
                      className="mt-2 h-12 rounded-lg border border-[hsl(231_16%_16%)] bg-[hsl(228_17%_12%)] p-4 transition-colors focus-within:border-white/60"
                    >
                      <input
                        type="text"
                        placeholder="Enter your Username..."
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        className="w-full bg-transparent text-sm text-white outline-none placeholder:opacity-50"
                        autoComplete="username"
                      />
                    </div>
                    {error ? <p className="text-sm font-semibold text-[#ff6b7a]">{error}</p> : null}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <label className="flex cursor-pointer select-none items-center gap-2">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={agreedTos}
                        data-state={agreedTos ? "checked" : "unchecked"}
                        onClick={() => {
                          const next = !agreedTos
                          setAgreedTos(next)
                          setAgreedTesting(next)
                        }}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-[#ff4fa3] transition-colors ${agreedTos ? 'bg-[#ff4fa3] text-black' : 'bg-transparent text-transparent'}`}
                      >
                        {agreedTos ? (
                          <svg viewBox="0 0 12 12" className="h-3 w-3">
                            <path
                              d="M2 6l2.5 2.5L10 3"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </button>
                      <span className="text-sm font-medium text-white">
                        By checking this box you agree to{" "}
                        <a
                          href="/tos"
                          className="text-[#ff4fa3] hover:underline"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            window.dispatchEvent(new CustomEvent('terms:open'))
                          }}
                        >
                          our terms and service
                        </a>
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={!canStart || loading}
                    className="mt-4 flex h-10 w-full items-center justify-center rounded-md border-0 bg-[#ff4fa3] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Login"}
                  </button>
                </form>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="flex flex-1 flex-col">
                <h2 className="mb-3 text-[20px] font-extrabold leading-tight text-white sm:text-[22px]">Verify Roblox Account</h2>

                <div className="mb-3 flex flex-col gap-1.5">
                  <label className="text-[13px] font-bold text-white">
                    Roblox Username <span className="text-[#ff69b0]">*</span>
                  </label>
                  <div className="flex h-[44px] items-center rounded-[8px] border border-[#2a2f45] bg-[#0c101b] px-4">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">{username.trim()}</span>
                    <span className="ml-3 grid h-6 w-6 place-content-center rounded-[5px] bg-white/[0.08] text-[#aeb4dd]">
                      <MoreHorizontal className="h-4 w-4" />
                    </span>
                  </div>
                </div>

                <div className="mb-3 rounded-[12px] border border-[#2a2f45] bg-[#111827]/70 p-3">
                  <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 sm:grid-cols-[140px_1fr]">
                    <div className="flex h-[108px] items-center justify-center overflow-hidden rounded-[10px] border border-white/[0.06] bg-[radial-gradient(circle_at_50%_30%,rgba(255,79,163,0.14),transparent_62%),#171b28] sm:h-[150px]">
                      <img
                        src={robloxUser?.avatarUrl || FALLBACK_AVATAR}
                        alt={`${robloxUser?.username || "Roblox"} avatar`}
                        className="h-full max-h-[108px] w-full object-contain sm:max-h-[150px]"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.src = FALLBACK_AVATAR;
                        }}
                      />
                    </div>

                    <div className="rounded-[10px] border border-white/[0.05] bg-[#0c101b] p-3.5">
                      <h3 className="mb-2 text-[15px] font-extrabold text-white">Is this your Roblox account?</h3>
                      <div className="mb-2.5 grid min-w-0 grid-cols-1 overflow-hidden rounded-[8px] border border-[#2a2f45] sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
                        <div
                          className={`flex h-[38px] min-w-0 items-center justify-center border-b border-[#2a2f45] px-3 font-extrabold text-white sm:border-b-0 sm:border-r ${
                            displayNameIsLong ? "text-[12px]" : "text-[14px]"
                          }`}
                          title={robloxUser?.displayName || ""}
                        >
                          <span className="block min-w-0 max-w-full truncate">{robloxUser?.displayName}</span>
                        </div>
                        <div
                          className={`flex h-[38px] min-w-0 items-center justify-center px-2 font-extrabold text-[#ff69b0] ${
                            usernameIsLong ? "text-[12px]" : "text-[13px]"
                          }`}
                          title={robloxUser?.username ? `@${robloxUser.username}` : ""}
                        >
                          <span className="block min-w-0 max-w-full truncate">@{robloxUser?.username}</span>
                        </div>
                      </div>
                      <p className="text-[12.5px] font-semibold leading-[1.4] text-[#aeb4dd]">
                        Please continue if this is your account. If not, go back and try finding your account again.
                      </p>
                    </div>
                  </div>
                </div>

                {error ? <p className="mb-3 text-sm font-semibold text-[#ff6b7a]">{error}</p> : null}

                <div className="mt-auto grid grid-cols-2 gap-3">
                  <ModalButton variant="secondary" onClick={() => setStep(1)} disabled={confirming}>
                    Back
                  </ModalButton>
                  <ModalButton onClick={handleConfirmAccount} disabled={confirming}>
                    {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
                  </ModalButton>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="flex flex-1 flex-col">
                <h2 className="mb-3 text-[20px] font-extrabold leading-tight text-white sm:text-[22px]">Add phrase to profile</h2>

                <div className="mb-3 rounded-[12px] border border-[#2a2f45] bg-[#111827]/70 p-3">
                  <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 sm:grid-cols-[140px_1fr]">
                    <div className="flex h-[108px] items-center justify-center overflow-hidden rounded-[10px] border border-white/[0.05] bg-[radial-gradient(circle_at_50%_30%,rgba(255,79,163,0.12),transparent_64%),#171b28] sm:h-[150px]">
                      <img
                        src={robloxUser?.avatarUrl || FALLBACK_AVATAR}
                        alt={`${robloxUser?.username || "Roblox"} avatar`}
                        className="h-full max-h-[108px] w-full object-contain sm:max-h-[150px]"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.src = FALLBACK_AVATAR;
                        }}
                      />
                    </div>

                    <div className="flex min-w-0 flex-col justify-center">
                      <p className="mb-2 text-[13px] font-bold leading-[1.3] text-white">Add this full line to your Roblox description:</p>

                      <button
                        type="button"
                        onClick={handleCopy}
                        className="group relative break-all rounded-[9px] border border-[#2a2f45] bg-[#0c101b] p-3 pr-10 text-left text-[12px] font-semibold leading-[1.4] text-[#e1e4f2] transition-colors hover:border-[#ff4fa3]/50 sm:text-[13px]"
                      >
                        {phrase}
                        <span className="absolute right-2.5 top-2.5 grid h-6 w-6 place-content-center rounded-[5px] bg-white/[0.08] text-[#aeb4dd] opacity-0 transition-opacity group-hover:opacity-100">
                          {copied ? <Check className="h-3.5 w-3.5 text-[#ff69b0]" /> : <Copy className="h-3.5 w-3.5" />}
                        </span>
                      </button>

                      <div className="mt-2 flex h-[40px] items-center justify-center gap-2 rounded-[9px] bg-[linear-gradient(135deg,rgba(54,123,255,0.18),rgba(255,79,163,0.14))] px-3 text-[13px] font-extrabold text-white">
                        <Clock className="h-4 w-4 text-[#ff69b0]" />
                        Expires in {timerText}
                      </div>

                      <div className="mt-2 flex items-start gap-2 rounded-[9px] border border-[#7f1d2d]/40 bg-[#24131d] p-2.5 text-[11.5px] font-semibold leading-[1.35] text-[#ff6b7a]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Never share this phrase. Anyone who asks for it may be trying to steal your account.</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-3">
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-[48px] items-center justify-center gap-2 rounded-[8px] border border-[#2a2f45] bg-[#111827] text-[15px] font-bold text-white transition-colors hover:border-[#3a4160] hover:bg-[#171d2c]"
                  >
                    <Link2 className="h-4 w-4 text-[#ff69b0]" />
                    Profile Link
                  </a>
                  <ModalButton variant="secondary" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4 text-[#ff69b0]" /> : <Copy className="h-4 w-4 text-[#ff69b0]" />}
                    {copied ? "Copied!" : "Copy Phrase"}
                  </ModalButton>
                </div>

                {error ? <p className="mb-3 text-sm font-semibold text-[#ff6b7a]">{error}</p> : null}

                <div className="mt-auto grid grid-cols-2 gap-3">
                  <ModalButton variant="secondary" onClick={() => setStep(2)} disabled={verifying}>
                    Back
                  </ModalButton>
                  <ModalButton onClick={handleVerify} disabled={verifying || timeLeft <= 0}>
                    {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify"}
                  </ModalButton>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
