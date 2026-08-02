import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatPriceValue } from "../Utils/FormatPriceValues";
import { apiRequest } from "../lib/apiClient";
import { useAuth } from "../store/auth";
import { notifications } from "./Notifications";

const COIN_ICON = "/bobux.png";
const REEL_LENGTH = 80;
const REEL_ITEM_STRIDE = 130;
const MULTI_ITEM_STRIDE = 125;
const REEL_STOP_INDEX = 60;
const INITIAL_REEL_INDEX = 20;
const SINGLE_INITIAL_POSITION = -(INITIAL_REEL_INDEX * REEL_ITEM_STRIDE + 52.5);
const SINGLE_FINAL_POSITION = -(REEL_STOP_INDEX * REEL_ITEM_STRIDE + 52.5);
const MULTI_INITIAL_POSITION = -2392.5;
const MULTI_FINAL_POSITION = -7392.5;

const rollFormatter = new Intl.NumberFormat("en-US");

function priceToNumber(price) {
  return Number(String(price).replaceAll(",", ""));
}

function isCatalogCaseArtwork(imageUrl) {
  return String(imageUrl || "").includes("biggamesapi.io/image/");
}

function getCaseArtworkSize(caseItem) {
  if (String(caseItem?.name || "").toLowerCase().includes("inferno")) return "inferno";
  if (isCatalogCaseArtwork(caseItem?.image)) return "catalog";
  return "default";
}

function getItemsWithRollRanges(items) {
  let nextRoll = 0;

  return items.map((item, index) => {
    const storedStart = Number(item.roll_range?.start);
    const storedEnd = Number(item.roll_range?.end);
    const hasStoredRange = Number.isInteger(storedStart) && Number.isInteger(storedEnd) && storedEnd >= storedStart;
    const rangeStart = hasStoredRange ? storedStart : nextRoll;
    const rangeEnd = hasStoredRange
      ? storedEnd
      : index === items.length - 1
        ? 99_999
        : rangeStart + Math.round(Number(item.chance) * 1000) - 1;
    nextRoll = rangeEnd + 1;

    return {
      ...item,
      rollRange: `${rollFormatter.format(rangeStart)} - ${rollFormatter.format(rangeEnd)}`,
    };
  });
}

function createReel(items, winner = null) {
  const reel = Array.from({ length: REEL_LENGTH }, () => items[Math.floor(Math.random() * items.length)]);
  if (winner) reel[REEL_STOP_INDEX] = winner;
  return reel;
}

function selectWeightedItem(items) {
  const total = items.reduce((sum, item) => sum + Number(item.chance), 0);
  let roll = Math.random() * total;

  for (const item of items) {
    roll -= Number(item.chance);
    if (roll <= 0) return item;
  }

  return items[items.length - 1];
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M15.5 19a1 1 0 0 1-.7-.29l-6-6a1 1 0 0 1 0-1.42l6-6a1 1 0 1 1 1.4 1.42L10.91 12l5.29 5.29A1 1 0 0 1 15.5 19z" />
    </svg>
  );
}

function FairnessIcon() {
  return (
    <svg fill="#00e284" width="14" height="14" viewBox="0 0 347.971 347.971" aria-hidden="true">
      <path d="M317.309,54.367C257.933,54.367,212.445,37.403,173.98,0C135.519,37.403,90.033,54.367,30.662,54.367c0,97.405-20.155,236.937,143.317,293.604C337.463,291.305,317.309,151.773,317.309,54.367zM162.107,225.773l-47.749-47.756l21.379-21.378l26.37,26.376l50.121-50.122l21.378,21.378L162.107,225.773z" />
    </svg>
  );
}

function CaseFairnessCopyIcon({ label, onCopy }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="case-fairness-copy"
      aria-label={label}
      role="button"
      tabIndex={0}
      onClick={onCopy}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCopy();
        }
      }}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function createRandomClientSeed(length = 12) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomValues = new Uint32Array(length);
  window.crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
}

function CasesFairnessModal({ serverSeedHash, clientSeed, nonce, gameActive, onSave, onClose }) {
  const [draftSeed, setDraftSeed] = useState(clientSeed);
  const [activeClientSeed, setActiveClientSeed] = useState(clientSeed);
  const [revealedSeed, setRevealedSeed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);

  const requestClose = () => {
    if (closing || closeTimerRef.current) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 180);
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setDraftSeed(clientSeed);
    setActiveClientSeed(clientSeed);
  }, [clientSeed]);

  const copyValue = async (value, label) => {
    if (!value || value === "Unavailable") return;
    try {
      await navigator.clipboard.writeText(String(value));
      notifications.success(`${label} copied to clipboard!`);
    } catch {
      notifications.error("Unable to copy to clipboard.");
    }
  };

  const saveSeed = async () => {
    if (gameActive || saving) return;
    const nextSeed = draftSeed.trim();
    if (!nextSeed) {
      notifications.error("Enter a client seed first.");
      return;
    }
    setSaving(true);
    try {
      const rotation = await onSave(nextSeed);
      setRevealedSeed({
        value: rotation?.previousServerSeed || "Unavailable",
        clientSeed: rotation?.previousClientSeed || activeClientSeed,
        nonce: Number(rotation?.previousNonce ?? nonce),
      });
      setActiveClientSeed(nextSeed);
    } catch {
      // The parent reports the server error and keeps the modal open for retrying.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`case-fairness-backdrop${closing ? " is-closing" : ""}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className={`case-fairness-surface${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cases-fairness-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="case-fairness-close" type="button" onClick={requestClose} aria-label="Close Cases Fairness">
          ×
        </button>
        <h1 id="cases-fairness-title" className="case-fairness-header">Cases Fairness</h1>
        <p className="case-fairness-hint">
          Single-player house games use a separate provably-fair system that keeps you in full control, the active server seed stays hidden, only its hash is shown. Changing your client seed generates a brand-new server seed and reveals the previous one, so you can verify all your past games.
        </p>

        <div className="case-fairness-section">
          <span className="case-fairness-section-title">Hashed Server Seed</span>
          <div className="case-fairness-input-holder">
            <span className="case-fairness-value" title={serverSeedHash}>{serverSeedHash}</span>
            <CaseFairnessCopyIcon
              label="Copy hashed server seed"
              onCopy={() => copyValue(serverSeedHash, "Hashed Server Seed")}
            />
          </div>
        </div>

        <div className="case-fairness-section">
          <span className="case-fairness-section-title">Client Seed</span>
          <div className="case-fairness-seed-row">
            <input
              type="text"
              className="case-fairness-seed-input"
              maxLength={128}
              placeholder="Your client seed"
              autoComplete="off"
              spellCheck={false}
              value={draftSeed}
              disabled={gameActive || saving}
              onChange={(event) => setDraftSeed(event.target.value)}
            />
            <button
              type="button"
              className="case-fairness-random"
              title="Generate a random 12-character seed"
              disabled={gameActive || saving}
              onClick={() => setDraftSeed(createRandomClientSeed())}
            >
              Random
            </button>
          </div>
        </div>

        <div className="case-fairness-section">
          <span className="case-fairness-section-title">Nonce</span>
          <div className="case-fairness-input-holder">
            <span className="case-fairness-value">{nonce}</span>
            <CaseFairnessCopyIcon label="Copy nonce" onCopy={() => copyValue(nonce, "Nonce")} />
          </div>
        </div>

        <button
          type="button"
          className="case-fairness-save"
          disabled={gameActive || saving || !draftSeed.trim()}
          onClick={() => { void saveSeed(); }}
        >
          {saving ? "Changing Seed..." : "Change Seed"}
        </button>
        <p className="case-fairness-note">
          Entering the same client seed still rotates the server seed (and reveals the old one). You can&apos;t change it while a game is active.
        </p>

        {revealedSeed && (
          <div className="case-fairness-reveal-box">
            <span className="case-fairness-reveal-title">Previous Server Seed</span>
            <span className="case-fairness-reveal-description">
              This seed is now retired. Use it together with the client seed, nonce below to verify your past games.
            </span>
            <div className="case-fairness-input-holder case-fairness-reveal-value">
              <span className="case-fairness-value" title={revealedSeed.value}>{revealedSeed.value}</span>
              <CaseFairnessCopyIcon
                label="Copy revealed server seed"
                onCopy={() => copyValue(revealedSeed.value, "Previous Server Seed")}
              />
            </div>
            <div className="case-fairness-reveal-meta">
              <span>Client Seed: <b>{revealedSeed.clientSeed}</b></span>
              <span>Nonce: <b>{revealedSeed.nonce}</b></span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function FastIcon({ active }) {
  return (
    <svg width="19" height="19" viewBox="37.86 -1 428.21 511.45" fill={active ? "#ffe472" : "#ffffff"} aria-hidden="true">
      <path d="M459.866 218.346l-186.7.701c-4.619.017-7.618-4.861-5.517-8.975L370.845 8.024c3.103-6.075-4.493-11.949-9.592-7.417L39.948 286.141c-4.221 3.751-1.602 10.732 4.045 10.78l170.444 1.457c4.443.038 7.391 4.619 5.583 8.679L133.317 501.73c-2.688 6.035 4.709 11.501 9.689 7.16l320.937-279.725c4.307-3.753 1.637-10.84-4.077-10.819z" />
    </svg>
  );
}

export default function CaseOpeningView({ item, onBack }) {
  const user = useAuth((state) => state.user);
  const setBalance = useAuth((state) => state.setBalance);
  const applyProfileUpdate = useAuth((state) => state.applyProfileUpdate);
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen);
  const drops = useMemo(() => getItemsWithRollRanges(item.items || []), [item.items]);
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [fairness, setFairness] = useState(null);
  const [clientSeed, setClientSeed] = useState(() => {
    const storedSeed = window.localStorage.getItem("bloxybattles-case-client-seed");
    return storedSeed || createRandomClientSeed();
  });
  const [quantity, setQuantity] = useState(1);
  const [fastSpin, setFastSpin] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [activeReelIndex, setActiveReelIndex] = useState(INITIAL_REEL_INDEX);
  const [reel, setReel] = useState(() => createReel(item.items));
  const [reelPosition, setReelPosition] = useState(SINGLE_INITIAL_POSITION);
  const [reelTransition, setReelTransition] = useState("none");
  const [multiReels, setMultiReels] = useState([]);
  const [multiPositions, setMultiPositions] = useState([]);
  const [multiTransitions, setMultiTransitions] = useState([]);
  const spinnerRef = useRef(null);
  const reelTrackRef = useRef(null);
  const multiSpinnerRef = useRef(null);
  const multiWheelRefs = useRef([]);
  const timersRef = useRef([]);
  const frameRef = useRef(null);
  const pendingOpeningIdRef = useRef(null);
  const pendingBalanceRef = useRef(null);

  const totalPrice = priceToNumber(item.price) * quantity;
  const serverSeedHash = String(fairness?.server_seed_hash || "Unavailable");

  const saveClientSeed = async (nextSeed) => {
    if (!user) {
      setAuthModalOpen(true);
      throw new Error("Sign in to change your case seed.");
    }
    try {
      const response = await apiRequest("/api/cases/fairness/rotate", {
        method: "POST",
        body: JSON.stringify({ client_seed: nextSeed }),
      });
      const nextFairness = response?.fairness || {};
      setFairness(nextFairness);
      setClientSeed(nextFairness.client_seed || nextSeed);
      window.localStorage.setItem("bloxybattles-case-client-seed", nextFairness.client_seed || nextSeed);
      notifications.success("Client seed updated and previous server seed revealed.");
      return {
        previousServerSeed: nextFairness.previous_server_seed,
        previousClientSeed: nextFairness.previous_client_seed,
        previousNonce: nextFairness.previous_nonce,
      };
    } catch (error) {
      notifications.error(error?.message || "Unable to change case seed.");
      throw error;
    }
  };

  const clearAnimationWork = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  useEffect(() => () => {
    clearAnimationWork();
    if (pendingBalanceRef.current !== null) {
      setBalance(pendingBalanceRef.current);
      pendingBalanceRef.current = null;
    }
  }, [setBalance]);

  useEffect(() => {
    if (!user) {
      setFairness(null);
      return undefined;
    }

    let cancelled = false;
    apiRequest("/api/cases/fairness")
      .then((response) => {
        if (cancelled) return;
        const nextFairness = response?.fairness || null;
        setFairness(nextFairness);
        if (nextFairness?.client_seed) {
          setClientSeed(nextFairness.client_seed);
          window.localStorage.setItem("bloxybattles-case-client-seed", nextFairness.client_seed);
        }
      })
      .catch((error) => {
        if (!cancelled) notifications.error(error?.message || "Unable to load case fairness.");
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!spinning) return undefined;

    const followCenteredItem = () => {
      let nextIndex = INITIAL_REEL_INDEX;

      if (quantity === 1) {
        const viewport = spinnerRef.current?.getBoundingClientRect();
        const firstItem = reelTrackRef.current?.firstElementChild?.getBoundingClientRect();
        if (viewport && firstItem) {
          nextIndex = Math.round((viewport.left + viewport.width / 2 - firstItem.left - 52.5) / REEL_ITEM_STRIDE);
        }
      } else {
        const viewport = multiSpinnerRef.current?.getBoundingClientRect();
        const firstItem = multiWheelRefs.current[0]?.firstElementChild?.firstElementChild?.getBoundingClientRect();
        if (viewport && firstItem) {
          nextIndex = Math.round((viewport.top + viewport.height / 2 - firstItem.top - 52.5) / MULTI_ITEM_STRIDE);
        }
      }

      nextIndex = Math.max(0, Math.min(REEL_LENGTH - 1, nextIndex));
      setActiveReelIndex((current) => current === nextIndex ? current : nextIndex);
      frameRef.current = window.requestAnimationFrame(followCenteredItem);
    };

    frameRef.current = window.requestAnimationFrame(followCenteredItem);
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [quantity, spinning]);

  const changeQuantity = (count) => {
    if (spinning || count === quantity) return;

    clearAnimationWork();
    setQuantity(count);
    setHasResult(false);
    setActiveReelIndex(INITIAL_REEL_INDEX);

    if (count === 1) {
      setReel(createReel(item.items));
      setReelPosition(SINGLE_INITIAL_POSITION);
      setReelTransition("none");
      return;
    }

    setMultiReels(Array.from({ length: count }, () => createReel(item.items)));
    setMultiPositions(Array(count).fill(MULTI_INITIAL_POSITION));
    setMultiTransitions(Array(count).fill("none"));
  };

  const finishSpin = () => {
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (pendingBalanceRef.current !== null) {
      setBalance(pendingBalanceRef.current);
      pendingBalanceRef.current = null;
    }
    setHasResult(true);
    setActiveReelIndex(REEL_STOP_INDEX);
    setSpinning(false);
  };

  const runSpinAnimation = (selected) => {
    setActiveReelIndex(INITIAL_REEL_INDEX);

    if (quantity === 1) {
      setReel(createReel(item.items, selected[0]));
      setReelTransition("none");
      setReelPosition(SINGLE_INITIAL_POSITION);

      const mainDuration = fastSpin ? 1400 : 4800;
      const startDelay = fastSpin ? 40 : 250;
      const settleDuration = fastSpin ? 160 : 250;
      const settlePause = fastSpin ? 40 : 100;
      const jitter = 13.125 * (Math.floor(Math.random() * 7) + 1);

      timersRef.current.push(window.setTimeout(() => {
        setReelTransition(`transform ${mainDuration}ms cubic-bezier(.1, 0, .2, 1)`);
        setReelPosition(SINGLE_FINAL_POSITION - jitter + 52.5);
      }, startDelay));

      timersRef.current.push(window.setTimeout(() => {
        setReelTransition(`transform ${settleDuration}ms cubic-bezier(.1, 0, .2, 1)`);
        setReelPosition(SINGLE_FINAL_POSITION);
      }, startDelay + mainDuration + settlePause));

      timersRef.current.push(window.setTimeout(
        finishSpin,
        startDelay + mainDuration + settlePause + settleDuration + 5,
      ));
      return;
    }

    setMultiReels(selected.map((winner) => createReel(item.items, winner)));
    setMultiPositions(Array(quantity).fill(MULTI_INITIAL_POSITION));
    setMultiTransitions(Array(quantity).fill("none"));

    const totalDuration = fastSpin ? 2000 : 5400;
    const startDelay = 250;
    const settleDuration = fastSpin ? 200 : 380;
    const mainDuration = Math.max(0, totalDuration - (startDelay + settleDuration + 100));
    const overshoots = Array.from(
      { length: quantity },
      () => -(7340 + MULTI_ITEM_STRIDE / 8 * (Math.floor(Math.random() * 7) + 1)),
    );

    timersRef.current.push(window.setTimeout(() => {
      setMultiTransitions(Array(quantity).fill(`transform ${mainDuration}ms cubic-bezier(.15, .55, .2, 1)`));
      setMultiPositions(overshoots);
    }, startDelay));

    timersRef.current.push(window.setTimeout(() => {
      setMultiTransitions(Array(quantity).fill(`transform ${settleDuration}ms cubic-bezier(.18, .85, .3, 1.05)`));
      setMultiPositions(Array(quantity).fill(MULTI_FINAL_POSITION));
    }, startDelay + mainDuration + 100));

    timersRef.current.push(window.setTimeout(
      finishSpin,
      startDelay + mainDuration + 100 + settleDuration + 5,
    ));
  };

  const spin = async (demo = false) => {
    if (spinning || !item.items?.length) return;
    if (!demo && !user) {
      setAuthModalOpen(true);
      return;
    }
    if (!demo && !fairness) {
      notifications.error("Case fairness is still loading. Please try again.");
      return;
    }

    clearAnimationWork();
    setHasResult(false);
    setSpinning(true);
    try {
      if (demo) {
        runSpinAnimation(Array.from({ length: quantity }, () => selectWeightedItem(item.items)));
        return;
      }

      const requestId = pendingOpeningIdRef.current || window.crypto.randomUUID();
      pendingOpeningIdRef.current = requestId;
      const response = await apiRequest("/api/cases/open", {
        method: "POST",
        body: JSON.stringify({ case_id: item.id, quantity, request_id: requestId }),
      });
      pendingOpeningIdRef.current = null;

      const selected = (response?.results || []).map((result) => {
        const catalogItem = item.items.find((candidate) =>
          String(candidate.id || candidate.item_id) === String(result.item_id)
          || candidate.name === result.name);
        return {
          ...(catalogItem || {}),
          ...result,
          id: String(result.item_id || catalogItem?.id || result.opening_id),
          image: result.image_url || catalogItem?.image || "",
        };
      });
      if (selected.length !== quantity) throw new Error("The server returned an incomplete case result.");

      const finalBalance = Number(response.balance || 0);
      const totalPayout = selected.reduce((total, result) => total + Number(result.value || 0), 0);
      setBalance(Math.max(0, finalBalance - totalPayout));
      pendingBalanceRef.current = finalBalance;
      if (response.stats) applyProfileUpdate(response.stats);
      if (response.fairness) {
        setFairness(response.fairness);
        setClientSeed(response.fairness.client_seed || clientSeed);
      }
      runSpinAnimation(selected);
    } catch (error) {
      if (error?.status) pendingOpeningIdRef.current = null;
      setSpinning(false);
      if (error?.status === 401) setAuthModalOpen(true);
      notifications.error(error?.message || "Unable to open this case.");
    }
  };

  return (
    <div className="case-open-root main-container">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap");

        @keyframes case-open-page-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes case-open-info-in {
          from { opacity: 0; transform: translate(-50%, 7px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        @keyframes case-fairness-backdrop-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes case-fairness-modal-in {
          from { opacity: 0; transform: scale(.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .case-open-root {
          --accent: #6c63ff;
          --accent-light: #8079ff;
          --accent-dark: #5a51e6;
          --accent-gradient: linear-gradient(180deg, var(--accent-light) 0%, var(--accent) 45%, var(--accent-dark) 100%);
          --surface-2: #1f2335;
          --btn-secondary-bg: #2a3048;
          --btn-secondary-light: #353d5b;
          --btn-secondary-dark: #212538;
          --btn-secondary-gradient: linear-gradient(180deg, var(--btn-secondary-light) 0%, var(--btn-secondary-bg) 45%, var(--btn-secondary-dark) 100%);
          --text-primary: #c7cce2;
          --radius-sm: 8px;
          --font-size-btn: .9rem;
          --font-weight-btn: 600;
          --btn-height: 42px;
          --btn-min-width: 120px;
          --dur-fast: .13s;
          --dur-base: .14s;
          --ease-out: cubic-bezier(.22, 1, .36, 1);
          --press-scale: .98;
          min-height: 100%;
          width: 100%;
          min-width: 0;
          overflow-x: hidden;
          color: rgba(225, 228, 242, .92);
          font-family: Poppins, sans-serif;
        }

        .case-open-shell {
          box-sizing: border-box;
          width: 100%;
          min-height: 100%;
          padding: 18px 22px 30px;
          animation: case-open-page-in .35s ease-out both;
        }

        .case-open-topbar,
        .case-open-header,
        .case-open-spinner,
        .case-open-controls,
        .case-open-drops {
          width: 100%;
          max-width: 1220px;
          margin-left: auto;
          margin-right: auto;
        }

        .case-open-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 0 14px;
        }

        .case-open-back,
        .case-open-fairness {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: rgba(225, 228, 242, .78);
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
        }

        .case-open-back { padding: 8px 10px; }
        .case-open-fairness { padding: 8px 12px; }
        .case-open-back:hover { color: rgba(225, 228, 242, .95); }

        .case-open-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .case-open-case-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .case-open-thumb {
          display: flex;
          width: 56px;
          height: 56px;
          flex: 0 0 56px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 10px;
        }

        .case-open-thumb img {
          width: 56px;
          height: 56px;
          object-fit: contain;
        }

        .case-open-thumb .case-open-thumb-image-catalog {
          transform: scale(1.3);
        }

        .case-open-thumb .case-open-thumb-image-inferno {
          transform: translateY(3px) scale(1.105);
        }

        .case-open-meta-copy {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 6px;
        }

        .case-open-name {
          overflow: hidden;
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .case-open-price {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: rgba(225, 228, 242, .92);
          font-size: 13px;
          font-weight: 650;
        }

        .case-open-price img { width: 16px; height: 16px; object-fit: contain; }

        .case-open-spinner {
          position: relative;
          z-index: 20;
          box-sizing: border-box;
          height: 226px;
          margin-top: 10px;
          margin-bottom: 14px;
          padding: 10px;
          overflow: visible;
          border-radius: 8px;
          background: #1a1f2e;
        }

        .case-open-spinner-inner {
          display: flex;
          width: 100%;
          height: 100%;
          border-radius: 8px;
          background: #171925;
        }

        .case-open-wheel {
          position: relative;
          display: flex;
          width: 100%;
          height: 100%;
          align-items: center;
          justify-content: center;
          overflow-x: hidden;
          overflow-y: visible;
        }

        .case-open-reel-track {
          position: absolute;
          left: 50%;
          display: flex;
          height: 100%;
          align-items: center;
          will-change: transform;
        }

        .case-open-reel-item {
          position: relative;
          display: flex;
          width: 105px;
          height: 105px;
          margin-right: 25px;
          flex: 0 0 105px;
          align-items: center;
          justify-content: center;
          opacity: .25;
          transition: opacity .28s cubic-bezier(.4, 0, .2, 1);
        }

        .case-open-reel-item:last-child { margin-right: 0; }

        .case-open-reel-image {
          position: relative;
          display: flex;
          width: 105px;
          height: 105px;
          align-items: center;
          justify-content: center;
          border: 0;
          background: transparent;
          transition: transform .18s ease;
        }

        .case-open-reel-image::before {
          position: absolute;
          top: 50%;
          left: 50%;
          z-index: 0;
          width: 115%;
          height: 115%;
          border-radius: 50%;
          background: radial-gradient(ellipse at center, var(--reel-glow) 0%, transparent 65%);
          content: "";
          filter: blur(14px);
          opacity: 0;
          pointer-events: none;
          transform: translate(-50%, -50%);
          transition: opacity .4s cubic-bezier(.4, 0, .2, 1);
        }

        .case-open-reel-image img {
          position: absolute;
          top: 50%;
          left: 50%;
          z-index: 1;
          width: 88px;
          height: 88px;
          object-fit: contain;
          filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .3));
          transform: translate(-50%, -50%);
          transition: transform .45s cubic-bezier(.34, 1.56, .64, 1), filter .4s ease;
        }

        .case-open-reel-item.is-active { opacity: 1; }
        .case-open-reel-item.is-result .case-open-reel-image { transform: translateY(-26px); }
        .case-open-reel-item.is-active .case-open-reel-image::before { opacity: 1; }
        .case-open-reel-item.is-active .case-open-reel-image img {
          filter: drop-shadow(0 0 12px var(--reel-glow-shadow)) drop-shadow(0 4px 10px rgba(0, 0, 0, .3));
          transform: translate(-50%, -50%) scale(1.18);
        }

        .case-open-result {
          position: absolute;
          top: calc(75% + 15px);
          left: 50%;
          z-index: 999;
          display: flex;
          width: 280px;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          pointer-events: none;
          animation: case-open-info-in .3s cubic-bezier(.4, 0, .2, 1) both;
        }

        .case-open-result-name {
          max-width: 260px;
          overflow: hidden;
          color: rgba(225, 228, 242, .78);
          font-size: 15px;
          font-weight: 600;
          text-align: center;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .case-open-result-value { display: flex; align-items: center; }
        .case-open-result-value img { width: 18px; height: 18px; margin-right: 8px; object-fit: contain; }
        .case-open-result-value span { color: #fff; font-size: 14px; font-weight: 700; }

        .case-open-pointer {
          position: absolute;
          top: 6px;
          left: 50%;
          width: 0;
          height: 0;
          border-top: 12px solid rgba(108, 99, 255, .9);
          border-right: 10px solid transparent;
          border-left: 10px solid transparent;
          transform: translateX(-50%);
        }

        .case-open-multi-spinner {
          position: relative;
          z-index: 1;
          display: flex;
          box-sizing: border-box;
          width: 100%;
          max-width: 1220px;
          height: 340px;
          margin: 10px auto 14px;
          padding: 10px;
          overflow: hidden;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: #1a1f2e;
        }

        .case-open-multi-inner {
          position: relative;
          display: flex;
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          min-width: 0;
          overflow: hidden;
          flex: 1 1 auto;
          border-radius: 8px;
          background: #171925;
        }

        .case-open-multi-column {
          position: relative;
          display: flex;
          width: auto;
          height: 100%;
          min-width: 0;
          overflow: hidden;
          flex: 1;
          align-items: center;
          justify-content: center;
        }

        .case-open-multi-wheel {
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          backface-visibility: hidden;
          will-change: transform;
        }

        .case-open-multi-reel {
          display: flex;
          width: 100%;
          height: 100%;
          flex-direction: column;
          align-items: center;
        }

        .case-open-multi-item {
          position: relative;
          display: flex;
          width: 100%;
          height: 105px;
          margin-bottom: 20px;
          flex: 0 0 105px;
          align-items: center;
          justify-content: center;
          opacity: .25;
          transition: opacity .28s cubic-bezier(.4, 0, .2, 1);
        }

        .case-open-multi-item:last-child { margin-bottom: 0; }
        .case-open-multi-item.is-active { opacity: 1; }

        .case-open-multi-image {
          position: relative;
          display: flex;
          width: 105px;
          height: 105px;
          flex: 0 0 105px;
          align-items: center;
          justify-content: center;
        }

        .case-open-multi-image::before {
          position: absolute;
          top: 50%;
          left: 50%;
          z-index: 0;
          width: 115%;
          height: 115%;
          border-radius: 50%;
          background: radial-gradient(ellipse at center, var(--reel-glow) 0%, transparent 65%);
          content: "";
          filter: blur(14px);
          opacity: 0;
          pointer-events: none;
          transform: translate(-50%, -50%);
          transition: opacity .4s cubic-bezier(.4, 0, .2, 1);
        }

        .case-open-multi-image img {
          position: absolute;
          top: 50%;
          left: 50%;
          z-index: 1;
          width: 88px;
          height: 88px;
          object-fit: contain;
          filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .3));
          transform: translate(-50%, -50%);
          transition: transform .45s cubic-bezier(.34, 1.56, .64, 1), filter .4s ease;
        }

        .case-open-multi-item.is-active .case-open-multi-image::before { opacity: 1; }
        .case-open-multi-item.is-active .case-open-multi-image img {
          filter: drop-shadow(0 0 12px var(--reel-glow-shadow)) drop-shadow(0 4px 10px rgba(0, 0, 0, .3));
          transform: translate(-50%, -50%) scale(1.18);
        }

        .case-open-multi-info {
          display: flex;
          max-width: calc(100% - 115px);
          margin-left: 18px;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          animation: case-open-info-in-multi .3s cubic-bezier(.4, 0, .2, 1) both;
        }

        @keyframes case-open-info-in-multi {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .case-open-multi-name {
          width: 100%;
          margin-bottom: 6px;
          overflow: hidden;
          color: rgba(220, 225, 255, .65);
          font-size: 15px;
          font-weight: 600;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .case-open-multi-value {
          display: flex;
          margin-top: 6px;
          align-items: center;
          justify-content: flex-start;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
        }

        .case-open-multi-value img { width: 18px; height: 18px; margin-right: 8px; object-fit: contain; }

        .case-open-multi-pointer-left,
        .case-open-multi-pointer-right {
          position: absolute;
          top: 50%;
          z-index: 50;
          width: 0;
          height: 0;
          border-top: 10px solid transparent;
          border-bottom: 10px solid transparent;
          pointer-events: none;
          transform: translateY(-50%);
        }

        .case-open-multi-pointer-left {
          left: 6px;
          border-left: 12px solid rgba(108, 99, 255, .9);
        }

        .case-open-multi-pointer-right {
          right: 6px;
          border-right: 12px solid rgba(108, 99, 255, .9);
        }

        .case-open-controls {
          position: relative;
          z-index: 25;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .case-open-qty {
          display: inline-flex;
          box-sizing: border-box;
          height: var(--btn-height);
          padding: 3px;
          flex-shrink: 0;
          align-items: center;
          border: 1px solid #252839;
          border-radius: var(--radius-sm);
          background: #20222f;
        }

        .case-open-qty button {
          display: inline-flex;
          height: 100%;
          min-width: 34px;
          padding: 0 10px;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 4px;
          background: transparent;
          color: rgba(225, 228, 242, .7);
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: background .15s ease, color .15s ease;
        }

        .case-open-qty button:hover:not(:disabled):not(.is-active) { background: rgba(255, 255, 255, .05); color: rgba(225, 228, 242, .95); }
        .case-open-qty button.is-active {
          background: linear-gradient(135deg, #5b52e2, #4038c0);
          color: #fff;
          box-shadow: 0 2px 8px rgba(108, 99, 255, .2);
        }
        .case-open-qty button:disabled { opacity: .4; cursor: not-allowed; }

        .case-open-primary,
        .case-open-secondary,
        .case-open-fast {
          display: flex;
          box-sizing: border-box;
          height: var(--btn-height);
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: var(--radius-sm);
          color: #fff;
          font-family: inherit;
          font-size: var(--font-size-btn);
          font-weight: var(--font-weight-btn);
          cursor: pointer;
          transform-origin: center;
          transition: transform var(--dur-fast) var(--ease-out), background .15s ease, border-color .15s ease, color .15s ease, opacity .15s ease;
        }

        .case-open-primary {
          min-width: var(--btn-min-width);
          padding: 0 18px;
          gap: 8px;
          border: 1px solid rgba(94, 85, 217, .4);
          background: linear-gradient(135deg, #5b52e2, #4038c0);
          box-shadow: 0 2px 8px rgba(108, 99, 255, .2);
          letter-spacing: .01em;
          white-space: nowrap;
        }

        .case-open-secondary {
          min-width: 0;
          padding: 0 20px;
          background: #2a2e44;
          color: #e1e4f2;
          white-space: nowrap;
        }

        .case-open-fast {
          width: var(--btn-height);
          min-width: 0;
          padding: 0;
          flex-shrink: 0;
          border: 1px solid #252839;
          background: #20222f;
          color: #8b92b8;
        }

        .case-open-primary:hover:not(:disabled) { background: linear-gradient(135deg, #6c63ff, #5147d9); }
        .case-open-secondary:hover:not(:disabled) { background: #32385a; }
        .case-open-fast:hover:not(:disabled) { background: #252839; color: #e1e4f2; }
        .case-open-primary:active:not(:disabled), .case-open-secondary:active:not(:disabled), .case-open-fast:active:not(:disabled) { transform: scale(var(--press-scale)); }
        .case-open-primary:disabled, .case-open-secondary:disabled, .case-open-fast:disabled { opacity: .6; cursor: not-allowed; transform: none; }

        .case-open-cost {
          display: inline-flex;
          padding: 2px 8px;
          flex-shrink: 0;
          align-items: center;
          gap: 4px;
          border-radius: 4px;
          background: rgba(0, 0, 0, .25);
          font-size: 11px;
          font-weight: 700;
        }

        .case-open-cost img { width: 12px; height: 12px; object-fit: contain; }

        .case-open-drops {
          position: relative;
          z-index: 1;
          margin-top: 16px;
        }

        .case-open-drops-title {
          margin-bottom: 8px;
          padding: 0 2px;
          color: rgba(225, 228, 242, .9);
          font-size: 13px;
          font-weight: 600;
        }

        .case-open-drops-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 8px;
        }

        .case-open-drop {
          position: relative;
          display: flex;
          box-sizing: border-box;
          height: 170px;
          padding: 8px;
          flex-direction: column;
          justify-content: flex-start;
          overflow: hidden;
          border: 0;
          border-radius: 6px;
          transform: translateZ(0);
          transition: transform .22s cubic-bezier(.22, 1, .36, 1);
          will-change: transform;
        }

        .case-open-drop::before {
          position: absolute;
          inset: 0;
          z-index: 0;
          padding: 2px;
          border-radius: 6px;
          background: linear-gradient(to bottom, transparent 0%, var(--item-border-side) 55%, var(--item-border-bottom) 100%);
          content: "";
          pointer-events: none;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
        }

        .case-open-drop:hover { transform: translateZ(0) scale(1.03); }

        .case-open-chance {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 5;
          display: inline-flex;
          padding: 4px 8px;
          align-items: center;
          border: 1px solid #252839;
          border-radius: 8px;
          background: #1f2335;
          color: rgba(225, 228, 242, .95);
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          pointer-events: none;
        }

        .case-open-chance-range { display: none; }
        .case-open-drop:hover .case-open-chance-percent { display: none; }
        .case-open-drop:hover .case-open-chance-range { display: inline; }

        .case-open-drop-blur {
          position: absolute;
          top: 50%;
          left: 50%;
          z-index: 0;
          width: 80%;
          height: 80%;
          object-fit: contain;
          opacity: .35;
          filter: blur(18px);
          pointer-events: none;
          transform: translate(-50%, -60%);
        }

        .case-open-drop-image-wrap {
          position: relative;
          width: 100%;
          height: 118px;
          overflow: hidden;
          flex: 0 0 118px;
          border-radius: 8px;
        }

        .case-open-drop-image {
          position: absolute;
          top: 0;
          left: 0;
          z-index: 1;
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 8px;
        }

        .case-open-drop-details {
          position: relative;
          z-index: 2;
          display: flex;
          width: 100%;
          height: 32px;
          min-height: 32px;
          margin-top: 4px;
          overflow: hidden;
          flex: 0 0 32px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
          text-align: center;
        }

        .case-open-drop-name {
          display: block;
          width: 100%;
          max-width: 100%;
          margin: 0;
          overflow: hidden;
          color: #ccd9fa;
          font-size: 12px;
          font-weight: 600;
          line-height: 14px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .case-open-drop-price {
          display: flex;
          width: 100%;
          max-width: 100%;
          margin: 0;
          overflow: hidden;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          line-height: 15px;
          white-space: nowrap;
        }

        .case-open-drop-price-inner {
          display: inline-flex;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          align-items: center;
          justify-content: center;
          vertical-align: middle;
        }

        .case-open-drop-price-inner img {
          width: 15px;
          height: 15px;
          margin-right: 6px;
          flex-shrink: 0;
          object-fit: contain;
        }

        .case-open-drop-price-amount {
          display: inline-block;
          min-width: 0;
          overflow: hidden;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          line-height: 15px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .case-fairness-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(0, 0, 0, .58);
          animation: case-fairness-backdrop-in 180ms ease-out both;
          transition: opacity 180ms ease;
        }

        .case-fairness-backdrop.is-closing { opacity: 0; }

        .case-fairness-surface {
          position: relative;
          box-sizing: border-box;
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          margin: 0;
          padding: 2rem;
          overflow-x: hidden;
          overflow-y: auto;
          border: 1px solid #181a28;
          border-radius: 5px;
          background: #131520;
          color: #e1e4f2;
          box-shadow: 0 20px 80px #0000008c;
          font-family: Poppins, sans-serif;
          animation: case-fairness-modal-in .3s ease-out both;
          transition: opacity 180ms ease, transform 180ms ease;
        }

        .case-fairness-surface.is-closing {
          opacity: 0;
          transform: scale(.97) translateY(6px);
        }

        .case-fairness-close {
          position: absolute;
          top: 12px;
          right: 14px;
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          padding: 0;
          border: 0;
          background: transparent;
          color: rgba(255, 255, 255, .76);
          font-size: 25px;
          line-height: 1;
          cursor: pointer;
          transition: color 140ms ease, transform 140ms ease;
        }

        .case-fairness-close:hover { color: #fff; }
        .case-fairness-close:active { transform: scale(.92); }

        .case-fairness-header {
          margin: 0 38px 12px 0;
          color: #fff;
          font-size: 24px;
          font-weight: 700;
          line-height: 1.25;
        }

        .case-fairness-hint {
          margin: 0 0 22px;
          color: #a6b2d3;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.65;
        }

        .case-fairness-section + .case-fairness-section { margin-top: 19px; }

        .case-fairness-section-title {
          display: block;
          margin-bottom: 8px;
          color: rgba(255, 255, 255, .68);
          font-size: 13px;
          font-weight: 600;
        }

        .case-fairness-input-holder,
        .case-fairness-seed-input {
          box-sizing: border-box;
          min-height: 42px;
          border: 0;
          border-radius: 6px;
          background: #1c1f2e;
        }

        .case-fairness-input-holder {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 10px;
          padding: 12px 13px;
        }

        .case-fairness-value {
          display: block;
          min-width: 0;
          flex: 1;
          overflow: hidden;
          color: rgba(255, 255, 255, .88);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13px;
          line-height: 1.45;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .case-fairness-copy {
          width: 18px;
          height: 18px;
          flex: 0 0 18px;
          border: 0;
          outline: none;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
          color: #fff;
          cursor: pointer;
          transition: color 140ms ease;
          -webkit-tap-highlight-color: transparent;
        }

        .case-fairness-copy:hover { color: rgba(255, 255, 255, .72); }
        .case-fairness-copy:focus-visible { outline: 2px solid #8079ff; outline-offset: 3px; }

        .case-fairness-seed-row {
          display: flex;
          align-items: stretch;
          gap: 10px;
        }

        .case-fairness-seed-input {
          width: 100%;
          min-width: 0;
          padding: 0 13px;
          outline: none;
          color: rgba(255, 255, 255, .9);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13px;
          transition: box-shadow 140ms ease, background 140ms ease;
        }

        .case-fairness-seed-input:focus {
          background: #1f2335;
          box-shadow: inset 0 0 0 1px rgba(108, 99, 255, .55);
        }

        .case-fairness-seed-input:disabled,
        .case-fairness-random:disabled,
        .case-fairness-save:disabled {
          cursor: not-allowed;
          opacity: .55;
        }

        .case-fairness-random,
        .case-fairness-save {
          min-height: 42px;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: transform .13s cubic-bezier(.22, 1, .36, 1), background .15s ease, opacity .15s ease;
        }

        .case-fairness-random {
          min-width: 108px;
          padding: 0 18px;
          border: 0;
          background: #2a2e44;
        }

        .case-fairness-random:hover:not(:disabled) { background: #32385a; }

        .case-fairness-save {
          width: 100%;
          margin-top: 22px;
          padding: 0 20px;
          border: 1px solid rgba(94, 85, 217, .4);
          background: linear-gradient(135deg, #5b52e2, #4038c0);
          box-shadow: 0 2px 8px rgba(108, 99, 255, .2);
        }

        .case-fairness-save:hover:not(:disabled) {
          background: linear-gradient(135deg, #6c63ff, #5147d9);
          opacity: .95;
        }

        .case-fairness-random:active:not(:disabled),
        .case-fairness-save:active:not(:disabled) { transform: scale(.98); }

        .case-fairness-note {
          margin: 12px 0 0;
          color: #6c7399;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.55;
          text-align: center;
        }

        .case-fairness-reveal-box {
          margin-top: 1.4rem;
          padding: 1rem;
          border: 0 solid rgba(108, 99, 255, .4);
          border-radius: 6px;
          background: rgba(108, 99, 255, .06);
          animation: case-fairness-modal-in .24s ease-out both;
        }

        .case-fairness-reveal-title {
          display: block;
          color: #e1e4f2;
          font-size: 13px;
          font-weight: 700;
        }

        .case-fairness-reveal-description {
          display: block;
          margin-top: 5px;
          color: #a6b2d3;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.55;
        }

        .case-fairness-reveal-value {
          margin-top: .6rem;
          margin-bottom: 0;
        }

        .case-fairness-reveal-meta {
          display: flex;
          margin-top: 9px;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 6px 14px;
          color: #6c7399;
          font-size: 11px;
          font-weight: 500;
        }

        .case-fairness-reveal-meta b {
          color: #a6b2d3;
          font-weight: 700;
        }

        @media (max-width: 900px) {
          .case-open-header { flex-direction: column; align-items: flex-start; }
        }

        @media (max-width: 600px) {
          .case-open-shell { padding: 10px 12px 24px; }
          .case-open-topbar { padding-top: 4px; }
          .case-open-spinner { height: 210px; }
          .case-open-multi-image { width: 75px; height: 105px; flex-basis: 75px; }
          .case-open-multi-image img { width: 62px; height: 62px; }
          .case-open-multi-item.is-active .case-open-multi-image img { transform: translate(-50%, -50%) scale(1.15); }
          .case-open-multi-image::before { width: 90%; height: 70%; filter: blur(10px); }
          .case-open-multi-item.is-result .case-open-multi-image { transform: translateY(-25px); }
          .case-open-multi-info {
            position: absolute;
            top: 73px;
            left: 2px;
            z-index: 5;
            width: calc(100% - 4px);
            max-width: none;
            margin-left: 0;
            align-items: center;
          }
          .case-open-multi-name {
            display: -webkit-box;
            width: 100%;
            margin-bottom: 2px;
            overflow: hidden;
            color: rgba(225, 228, 242, .9);
            font-size: 10px;
            line-height: 1.15;
            text-align: center;
            text-overflow: clip;
            white-space: normal;
            overflow-wrap: anywhere;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }
          .case-open-multi-value {
            margin-top: 1px;
            justify-content: center;
            font-size: 11px;
            line-height: 1;
            white-space: nowrap;
          }
          .case-open-multi-value img { width: 13px; height: 13px; margin-right: 3px; }
          .case-open-controls { gap: 8px; }
          .case-open-qty { width: 100%; }
          .case-open-qty button { flex: 1; }
          .case-open-primary { flex: 1; }
          .case-open-drops-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .case-fairness-backdrop { padding: 12px; }
          .case-fairness-surface { width: 100%; max-height: calc(100dvh - 24px); padding: 1.25rem; }
          .case-fairness-seed-row { flex-direction: column; }
          .case-fairness-random { width: 100%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .case-open-shell, .case-open-result, .case-open-drop,
          .case-fairness-backdrop, .case-fairness-surface { animation: none; transition: none; }
        }
      `}</style>

      <div className="case-open-shell">
        <div className="case-open-topbar">
          <button type="button" className="case-open-back" onClick={onBack}>
            <BackIcon />
            Back
          </button>
          <button
            type="button"
            className="case-open-fairness"
            title="Provably fair"
            onClick={() => setFairnessOpen(true)}
          >
            <FairnessIcon />
            Fairness
          </button>
        </div>

        <div className="case-open-header">
          <div className="case-open-case-meta">
            <div className="case-open-thumb">
              <img
                src={item.image}
                alt={item.name}
                className={`case-open-thumb-image-${getCaseArtworkSize(item)}`}
                draggable={false}
              />
            </div>
            <div className="case-open-meta-copy">
              <div className="case-open-name">{item.name}</div>
              <div className="case-open-price">
                <img src={COIN_ICON} alt="coin" draggable={false} />
                <span>{formatPriceValue(item.price, { compactNumbers: false })}</span>
              </div>
            </div>
          </div>
        </div>

        {quantity === 1 ? (
          <div ref={spinnerRef} className="case-open-spinner">
            <div className="case-open-spinner-inner">
              <div className="case-open-wheel">
                <div
                  ref={reelTrackRef}
                  className="case-open-reel-track"
                  style={{ transform: `translateX(${reelPosition}px)`, transition: reelTransition }}
                >
                  {reel.map((reelItem, index) => {
                    const active = index === activeReelIndex;
                    const showResult = hasResult && index === REEL_STOP_INDEX;
                    return (
                      <div
                        key={`${reelItem.id}-${index}`}
                        className={`case-open-reel-item${active ? " is-active" : ""}${showResult ? " is-result" : ""}`}
                      >
                        <div
                          className="case-open-reel-image"
                          style={{
                            "--reel-glow": `rgba(${reelItem.accent}, .5)`,
                            "--reel-glow-shadow": `rgba(${reelItem.accent}, .7)`,
                          }}
                        >
                          <img src={reelItem.image} alt={reelItem.name} draggable={false} />
                        </div>
                        {showResult ? (
                          <div className="case-open-result">
                            <div className="case-open-result-name">{reelItem.name}</div>
                            <div className="case-open-result-value">
                              <img src={COIN_ICON} alt="Bobux" draggable={false} />
                              <span>{formatPriceValue(reelItem.value, { compactNumbers: false })}</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="case-open-pointer" />
              </div>
            </div>
          </div>
        ) : (
          <div ref={multiSpinnerRef} className="case-open-multi-spinner">
            <div className="case-open-multi-inner">
              {multiReels.map((column, columnIndex) => (
                <div key={columnIndex} className="case-open-multi-column">
                  <div
                    ref={(node) => { multiWheelRefs.current[columnIndex] = node; }}
                    className="case-open-multi-wheel"
                    style={{
                      transform: `translateY(${multiPositions[columnIndex] ?? MULTI_INITIAL_POSITION}px)`,
                      transition: multiTransitions[columnIndex] || "none",
                    }}
                  >
                    <div className="case-open-multi-reel" data-multireel={columnIndex}>
                      {column.map((reelItem, index) => {
                        const active = index === activeReelIndex;
                        const showResult = hasResult && index === REEL_STOP_INDEX;
                        return (
                          <div
                            key={`${columnIndex}-${reelItem.id}-${index}`}
                            className={`case-open-multi-item${active ? " is-active" : ""}${showResult ? " is-result" : ""}`}
                          >
                            <div
                              className="case-open-multi-image"
                              style={{
                                "--reel-glow": `rgba(${reelItem.accent}, .5)`,
                                "--reel-glow-shadow": `rgba(${reelItem.accent}, .7)`,
                              }}
                            >
                              <img src={reelItem.image} alt={reelItem.name} draggable={false} />
                            </div>
                            {showResult ? (
                              <div className="case-open-multi-info">
                                <span className="case-open-multi-name" title={reelItem.name}>{reelItem.name}</span>
                                <div className="case-open-multi-value">
                                  <img src={COIN_ICON} alt="coin" draggable={false} />
                                  <span>{formatPriceValue(reelItem.value, { compactNumbers: false })}</span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="case-open-multi-pointer-left" />
            <div className="case-open-multi-pointer-right" />
          </div>
        )}

        <div className="case-open-controls">
          <div className="case-open-qty" role="radiogroup" aria-label="Number of cases to open">
            {[1, 2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                className={quantity === count ? "is-active" : ""}
                aria-pressed={quantity === count}
                disabled={spinning}
                onClick={() => changeQuantity(count)}
              >
                {count}x
              </button>
            ))}
          </div>

          <button type="button" className="case-open-primary" disabled={spinning || Boolean(user && !fairness)} onClick={() => { void spin(false); }}>
            Open Case
            <span className="case-open-cost">
              <img src={COIN_ICON} alt="" draggable={false} />
              {formatPriceValue(totalPrice, { compactNumbers: false })}
            </span>
          </button>

          <button type="button" className="case-open-secondary" disabled={spinning} onClick={() => { void spin(true); }}>Demo</button>
          <button
            type="button"
            className={`case-open-fast${fastSpin ? " is-active" : ""}`}
            aria-pressed={fastSpin}
            aria-label="Fast spinning"
            title="Fast spin"
            disabled={spinning}
            onClick={() => setFastSpin((active) => !active)}
          >
            <FastIcon active={fastSpin} />
          </button>
        </div>

        <div className="case-open-drops">
          <div className="case-open-drops-title">Possible Drops</div>
          <div className="case-open-drops-grid">
            {drops.map((drop) => (
              <article
                key={drop.id}
                className="case-open-drop"
                style={{
                  background: `linear-gradient(to top, rgba(${drop.accent}, .18) 0%, rgba(${drop.accent}, 0) 100%), rgb(39, 45, 70)`,
                  "--item-border-bottom": `rgba(${drop.accent}, .7)`,
                  "--item-border-side": `rgba(${drop.accent}, .25)`,
                }}
              >
                <div className="case-open-chance" title={`Drop range: ${drop.rollRange}`}>
                  <span className="case-open-chance-percent">{drop.chance}%</span>
                  <span className="case-open-chance-range">{drop.rollRange}</span>
                </div>
                <img src={drop.image} alt="" className="case-open-drop-blur" draggable={false} />
                <div className="case-open-drop-image-wrap">
                  <img src={drop.image} alt={drop.name} className="case-open-drop-image" draggable={false} />
                </div>
                <div className="case-open-drop-details">
                  <p className="case-open-drop-name">{drop.name}</p>
                  <p className="case-open-drop-price">
                    <span className="case-open-drop-price-inner">
                      <img src={COIN_ICON} alt="Bobux" draggable={false} />
                      <span className="case-open-drop-price-amount">{formatPriceValue(drop.value, { compactNumbers: false })}</span>
                    </span>
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
      {fairnessOpen && createPortal(
        <CasesFairnessModal
          serverSeedHash={serverSeedHash}
          clientSeed={clientSeed}
          nonce={Number(fairness?.nonce || 0)}
          gameActive={spinning}
          onSave={saveClientSeed}
          onClose={() => setFairnessOpen(false)}
        />,
        document.body,
      )}
    </div>
  );
}
