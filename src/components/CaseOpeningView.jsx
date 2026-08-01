import { useEffect, useMemo, useRef, useState } from "react";
import { formatPriceValue } from "../Utils/FormatPriceValues";

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

function shouldEnlargeCaseArtwork(caseItem) {
  return isCatalogCaseArtwork(caseItem?.image)
    || String(caseItem?.name || "").toLowerCase().includes("inferno");
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

function FastIcon({ active }) {
  return (
    <svg width="19" height="19" viewBox="37.86 -1 428.21 511.45" fill={active ? "#ffe472" : "#ffffff"} aria-hidden="true">
      <path d="M459.866 218.346l-186.7.701c-4.619.017-7.618-4.861-5.517-8.975L370.845 8.024c3.103-6.075-4.493-11.949-9.592-7.417L39.948 286.141c-4.221 3.751-1.602 10.732 4.045 10.78l170.444 1.457c4.443.038 7.391 4.619 5.583 8.679L133.317 501.73c-2.688 6.035 4.709 11.501 9.689 7.16l320.937-279.725c4.307-3.753 1.637-10.84-4.077-10.819z" />
    </svg>
  );
}

export default function CaseOpeningView({ item, onBack }) {
  const drops = useMemo(() => getItemsWithRollRanges(item.items || []), [item.items]);
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

  const totalPrice = priceToNumber(item.price) * quantity;

  const clearAnimationWork = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  useEffect(() => () => clearAnimationWork(), []);

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

  const finishSpin = (selected) => {
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setHasResult(true);
    setActiveReelIndex(REEL_STOP_INDEX);
    setSpinning(false);
  };

  const spin = () => {
    if (spinning || !item.items?.length) return;

    clearAnimationWork();
    const selected = Array.from({ length: quantity }, () => selectWeightedItem(item.items));
    setHasResult(false);
    setSpinning(true);
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
        () => finishSpin(selected),
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
      () => finishSpin(selected),
      startDelay + mainDuration + 100 + settleDuration + 5,
    ));
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
          min-height: 100vh;
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

        .case-open-thumb .case-open-thumb-image-enlarged {
          transform: scale(1.3);
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
          .case-open-multi-info { max-width: calc(100% - 85px); margin-left: 10px; }
          .case-open-multi-name { font-size: 13px; }
          .case-open-multi-value { font-size: 12px; }
          .case-open-controls { gap: 8px; }
          .case-open-qty { width: 100%; }
          .case-open-qty button { flex: 1; }
          .case-open-primary { flex: 1; }
          .case-open-drops-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (prefers-reduced-motion: reduce) {
          .case-open-shell, .case-open-result, .case-open-drop { animation: none; transition: none; }
        }
      `}</style>

      <div className="case-open-shell">
        <div className="case-open-topbar">
          <button type="button" className="case-open-back" onClick={onBack}>
            <BackIcon />
            Back
          </button>
          <button type="button" className="case-open-fairness" title="Provably fair">
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
                className={shouldEnlargeCaseArtwork(item) ? "case-open-thumb-image-enlarged" : ""}
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
                            className={`case-open-multi-item${active ? " is-active" : ""}`}
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

          <button type="button" className="case-open-primary" disabled={spinning} onClick={spin}>
            Open Case
            <span className="case-open-cost">
              <img src={COIN_ICON} alt="" draggable={false} />
              {formatPriceValue(totalPrice, { compactNumbers: false })}
            </span>
          </button>

          <button type="button" className="case-open-secondary" disabled={spinning} onClick={spin}>Demo</button>
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
    </div>
  );
}
