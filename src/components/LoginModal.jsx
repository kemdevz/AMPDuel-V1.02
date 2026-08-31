import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Link2,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { apiRequest } from "../lib/apiClient";
import { HCAPTCHA_TEST_SITE_KEY, loadHcaptcha } from "../lib/hcaptcha";
import { useAuth } from "../store/auth";
import { notifications } from "./Notifications";

const LOGIN_ART = "/bloxdice-login-banner.png";
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
      "border-0 bg-[linear-gradient(135deg,#DDD2F1,#804AFF)] text-black hover:opacity-90",
    secondary:
      "border border-[#4D4A6B] bg-[#5D567D] text-white hover:opacity-90",
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
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaContainerRef = useRef(null);
  const captchaWidgetIdRef = useRef(null);

  const canStart = username.trim() && agreedTos && agreedTesting && captchaToken;
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
      setCaptchaToken("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || step !== 1 || !captchaContainerRef.current) return undefined;

    let cancelled = false;
    const bundledSitekey = import.meta.env.DEV
      ? HCAPTCHA_TEST_SITE_KEY
      : import.meta.env.VITE_HCAPTCHA_SITE_KEY || "";

    const sitekeyPromise = bundledSitekey
      ? Promise.resolve(bundledSitekey)
      : apiRequest("/api/public-config").then((config) => config?.hcaptcha_site_key || "");

    void Promise.all([sitekeyPromise, loadHcaptcha()])
      .then(([sitekey, hcaptcha]) => {
        if (cancelled || !captchaContainerRef.current) return;
        if (!sitekey) {
          setError("hCaptcha is not configured.");
          return;
        }
        captchaWidgetIdRef.current = hcaptcha.render(captchaContainerRef.current, {
          sitekey,
          theme: "dark",
          size: window.innerWidth < 380 ? "compact" : "normal",
          callback: (token) => {
            setCaptchaToken(token);
            setError("");
          },
          "expired-callback": () => setCaptchaToken(""),
          "error-callback": () => {
            setCaptchaToken("");
            setError("Verification failed. Please try again.");
          },
        });
      })
      .catch((captchaError) => {
        if (!cancelled) {
          setError(captchaError?.message || "hCaptcha failed to load.");
        }
      });

    return () => {
      cancelled = true;
      if (window.hcaptcha && captchaWidgetIdRef.current != null) {
        window.hcaptcha.reset(captchaWidgetIdRef.current);
      }
      captchaContainerRef.current?.replaceChildren();
      captchaWidgetIdRef.current = null;
    };
  }, [isOpen, step]);

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
        body: JSON.stringify({
          username: username.trim(),
          captcha_token: captchaToken,
        }),
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
      setStep(3);
    } catch (err) {
      console.error("Roblox lookup error:", err);
      setError(err.message || "Failed to find that Roblox account.");
      setCaptchaToken("");
      if (window.hcaptcha && captchaWidgetIdRef.current != null) {
        window.hcaptcha.reset(captchaWidgetIdRef.current);
      }
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
      setError(err.message || "Failed to verify Roblox profile.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes loginOverlayIn {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to { opacity: 1; backdrop-filter: blur(8px); }
        }
        @keyframes loginModalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-[rgba(3,5,9,.84)] p-4 animate-[loginOverlayIn_180ms_ease-out_forwards]"
        onClick={handleBackdropClick}
      >
        <div
          className="w-full max-w-md rounded-xl border border-white/10 bg-[#2F3049] p-6 shadow-none animate-[loginModalIn_220ms_ease-out_forwards]"
          onClick={(event) => event.stopPropagation()}
        >
          {/* Close button — single instance, same spot for every step */}
          {/* Art panel — fixed on the left for every step, height locked to the modal's fixed height so it never resizes/shifts between steps */}
          {/* Content panel — fixed height (matches modal), scrolls internally per step instead of resizing the modal */}
          <div className="flex min-h-0 w-full flex-col">
            {step === 1 ? (
              <div>
                <img
                  src={LOGIN_ART}
                  alt="BloxDice"
                  className="-mx-6 -mt-6 mb-6 block h-[240px] w-[calc(100%+3rem)] max-w-none rounded-t-xl object-cover"
                  draggable={false}
                />
                <h1 className="text-xl font-semibold text-white">Login to BloxDice</h1>
                <p className="mt-2 text-sm leading-6 text-[#969baa]">
                  Enter your Roblox username. New accounts require a Roblox account that is at least 90 days old.
                </p>

                <form onSubmit={handleLookup} className="mt-5 space-y-4">
                  <label className="flex items-center rounded-lg border border-white/10 bg-[#202134] px-4">
                    <svg
                      stroke="currentColor"
                      fill="currentColor"
                      strokeWidth="0"
                      viewBox="0 0 448 512"
                      className="text-[#8b909e]"
                      height="1em"
                      width="1em"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path d="M224 256c70.7 0 128-57.3 128-128S294.7 0 224 0 96 57.3 96 128s57.3 128 128 128zm89.6 32h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 288 0 348.2 0 422.4V464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48v-41.6c0-74.2-60.2-134.4-134.4-134.4z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Roblox username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value.slice(0, 20))}
                      className="w-full bg-transparent px-3 py-3.5 text-sm text-white outline-none placeholder:text-[#707582]"
                      autoComplete="username"
                      minLength={3}
                      maxLength={20}
                      required
                    />
                  </label>

                  <div className="flex items-start gap-3 text-xs leading-5 text-[#969baa]">
                    <label className="mt-0.5 flex cursor-pointer select-none items-center">
                      <input
                        className="sr-only"
                        type="checkbox"
                        checked={agreedTos}
                        aria-checked={agreedTos}
                        onChange={(event) => {
                          setAgreedTos(event.target.checked)
                          setAgreedTesting(event.target.checked)
                        }}
                      />
                      <span
                        aria-hidden="true"
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${agreedTos ? 'border-[#804AFF] bg-[#804AFF] text-[#202134]' : 'border-white/20 bg-[#202134] text-transparent'}`}
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
                      </span>
                    </label>
                    <span>
                      By checking this box, you confirm that you are at least 18 years old and agree to our{" "}
                      <button
                        type="button"
                        className="font-semibold text-[#804AFF] underline underline-offset-2"
                        onClick={() => window.dispatchEvent(new CustomEvent("terms:open"))}
                      >
                        Terms of Service
                      </button>
                      .
                    </span>
                  </div>

                  <div className="flex min-h-[78px] justify-center overflow-hidden">
                    <div ref={captchaContainerRef} />
                  </div>

                  {error ? <p className="text-xs font-semibold text-[#ff6b7a]">{error}</p> : null}

                  <button
                    type="submit"
                    disabled={!canStart || loading}
                    className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[linear-gradient(135deg,#DDD2F1,#804AFF)] text-sm font-semibold text-[#202134] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
                  </button>
                </form>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="flex flex-1 flex-col">
                <h2 className="mb-3 text-[20px] font-extrabold leading-tight text-white sm:text-[22px]">Verify Roblox Account</h2>

                <div className="mb-3 flex flex-col gap-1.5">
                  <label className="text-[13px] font-bold text-white">
                    Roblox Username <span className="text-[#DDD2F1]">*</span>
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
                    <div className="flex h-[108px] items-center justify-center overflow-hidden rounded-[10px] border border-white/[0.06] bg-[radial-gradient(circle_at_50%_30%,rgba(128,74,255,0.14),transparent_62%),#171b28] sm:h-[150px]">
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
                          className={`flex h-[38px] min-w-0 items-center justify-center px-2 font-extrabold text-[#DDD2F1] ${
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
              <div>
                <img
                  src={LOGIN_ART}
                  alt="Adopt Me"
                  className="-mx-6 -mt-6 mb-6 block h-[240px] w-[calc(100%+3rem)] max-w-none rounded-t-xl object-cover"
                  draggable={false}
                />
                <h1 className="text-xl font-semibold text-white">Verify your Roblox account</h1>
                <p className="mt-2 text-sm leading-6 text-[#969baa]">
                  Put these words anywhere in your Roblox About section, save it, then verify.
                </p>

                <div className="mt-5 space-y-4">
                  <div role="alert" className="flex items-center gap-2.5 rounded-lg bg-red-500/10 px-3.5 py-3 text-red-400">
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 576 512" className="shrink-0 text-sm" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M569.517 440.013C587.975 472.007 564.806 512 527.94 512H48.054c-36.937 0-59.999-40.055-41.577-71.987L246.423 23.985c18.467-32.009 64.72-31.951 83.154 0l239.94 416.028zM288 354c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z" />
                    </svg>
                    <p className="text-xs font-semibold tracking-wide">DO NOT SHARE THIS CODE WITH ANYONE</p>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-[#202134] p-4">
                    <p className="break-words text-sm font-medium leading-7 text-white">{phrase}</p>
                    <button type="button" onClick={handleCopy} className="mt-3 flex items-center gap-2 text-xs font-medium text-[#804AFF]">
                      <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M320 448v40c0 13.255-10.745 24-24 24H24c-13.255 0-24-10.745-24-24V120c0-13.255 10.745-24 24-24h72v296c0 30.879 25.121 56 56 56h168zm0-344V0H152c-13.255 0-24 10.745-24 24v368c0 13.255 10.745 24 24 24h272c13.255 0 24-10.745 24-24V128H344c-13.2 0-24-10.8-24-24zm120.971-31.029L375.029 7.029A24 24 0 0 0 358.059 0H352v96h96v-6.059a24 24 0 0 0-7.029-16.97z" />
                      </svg>
                      Copy words
                    </button>
                  </div>

                  <p className="text-xs leading-5 text-[#8b909e]">
                    Roblox may take a few seconds to update your About section. You can remove the words after verification.
                  </p>

                  {error ? <p className="text-xs font-semibold text-red-400">{error}</p> : null}

                  <button type="button" onClick={handleVerify} disabled={verifying || timeLeft <= 0} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[linear-gradient(135deg,#DDD2F1,#804AFF)] text-sm font-semibold text-[#202134] transition-opacity hover:opacity-90 disabled:opacity-50">
                    {verifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z" />
                      </svg>
                    )}
                    Verify and login
                  </button>

                  <button
                    type="button"
                    disabled={verifying}
                    onClick={() => {
                      setStep(1)
                      setUsername("")
                      setRobloxUser(null)
                      setPhrase("")
                      setChallengeToken("")
                      setCaptchaToken("")
                      setAgreedTos(false)
                      setAgreedTesting(false)
                      setError("")
                    }}
                    className="h-10 w-full text-sm font-medium text-[#969baa] hover:text-[#969baa] disabled:opacity-50"
                  >
                    Use another username
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
