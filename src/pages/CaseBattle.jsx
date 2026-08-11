import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Flag,
  Hash,
  RefreshCw,
  Trophy,
  Zap,
} from "lucide-react";
import { getInventoryItemAccent } from "../components/InventoryItemCard";
import MiniProfileModal, { preloadMiniProfile } from "../components/MiniProfileModal";
import { notifications } from "../components/Notifications";
import SortDirectionIcon from "../components/SortDirectionIcon";
import { apiRequest } from "../lib/apiClient";
import { useNavigate } from "../lib/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../store/auth";
import { formatPriceValue } from "../Utils/FormatPriceValues";

const COIN_ICON = "/bobux.png";
const PICKER_SEARCH_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAASDSURBVGhD7ZnJbh1FFIa76ibECSuww6BcJglCJthkCwRWCCkIIR4hXDACiUeI8gAskDLbeYpEUVhBYMEGkBIRxwTEEBkwg80KE7i5Xfx/53fLPdzurh7gLvxJ1j2n5K6qv+vUqaGDTSYMo99WeOeIm5cZcfyceV1m5zQS8tYgvOSC4KB1wT3WmZ6KE4TGjfC3agLz+ak5+5KKW6eWkNlBuNgLzW487PU8RLvbNlw8M9fbp6LW8OrI7GD08ZbQPgOz0UhS0Mi6T07P2UMqakzlDmEUlreE5n65rXDbumWIeVBuIyoJwVxYQyhtl5thZNyt0LqbxpnfMF9+ZFlogr4zbsaG5uGeM1PRP+aAkVnD3Llbbm1KhRSJwBv9Cm90j9xCEJZXEZZPyU3QhphCIePCCQJWTp81OwNjEO4eOGdm33C/o857VRKDJIAw69UOM6vfDHcmdlbE0IYLGIUZbxEEz+DZadRxXSUxGK0H8OI+kuvNWCHKTgkoAqlzv9zaMP2irkW5MQjh52R6kyuE6wR+EmHHcGpDxDqoay/qXJUbgQbNm4PRNble5ArhYiczJpoTLYM6Z2TGIBL2yvQiI4TbDr4ZuRFRGNSZE2WgTmY+eRFsG324KLcyGSHo7UGZMQwDma2Tl77z+lBGRgg3gDIjuNjJ7Ix0G+jDtMzK5AhJ7mK5YsvsDLSxJDNi3E66iISQ9HmCcNshszPQxi8yY/L6UkRmRNJgmH+S2RlttFEqBCQyWEd4h1KaUiHYxbayzS4CbTQ+HiSE5J2xsRVvfSFMgzYyQnzP+5kR4RlbZgTPEzI7A208JDMCfRjKrEyOkOAPmRFFh6I2YHZCG9vkRqAPmSxWRkYIZvZnMmO0ieyEYS98VmYMstgXMiuTEcIrG2wREvsqnEue5KFIbnugzq0jm9igMrRPzttX5FYmI4TwykZmDE92MlsDda7IjIGQKzK9GPuW3z7iEKqZXfB1HorkNoLhGo30BjDm4Yl5/+0JyR0RwnsnmTFbcVbAwSdzTPUlTwQJA+e9fV9nrBBsrw/hrLAsNwZi9qAjK7XmDC8fBuFqnghyedfCazK9Ke0MDjl/4sS4Q26CoXU3zszZ3E5thCmW2Sk9sdMwyVzof7/jh2OPeR8dKr3VIjFEF3RL2MX+itS5fkG3Cyv2fVzs0utEERTzYf/a1MKxA/+oqBKVw2N2MPqZVzZyO4ViPnj66+3fvLv7bxWVMnaOpOHlGebM5fQaUwdmJ/7c8bLg7ZoXrz7x1+Pv36g8kpWFECSA50+cM5b3W3UEUQDm1RWm2POYC0V1+IqpHFp58LYDPeGHnumCDz1DzJdV44JPT83bV1Uc8cjR76YOLz26xk6rKAPFVgmzRkLS1Pn0tu/ol3e9sLT/VpmYsmzWqpC6VBEDHMNxnJiJEEKaipkYIaSJGK+s1TVcBLkYFmUzYF5Ggui/dzPx8WmihBCK4cQuE3N4sf+t7IiJE0IYNkUjw091WNMStzsTNUfS5M2Zcd8bJ1oI2SimrS/A/xvcAXDTKneTTf47guBfRB/4oi5eINMAAAAASUVORK5CYII=";
const TICK_SOUND = "/tick-CkSUroeR.mp3";
const PULL_SOUND = "/pull-Ce7kkHjK.mp3";
const REEL_LENGTH = 80;
const REEL_ITEM_STRIDE = 125;
const REEL_STOP_INDEX = 60;
const INITIAL_REEL_INDEX = 20;
const REEL_INITIAL_POSITION = -2392.5;
const REEL_FINAL_POSITION = -7392.5;
const REEL_START_DELAY = 250;
const REEL_MAIN_DURATION = 4800;
const REEL_SETTLE_PAUSE = 100;
const REEL_SETTLE_DURATION = 250;
const REEL_DURATION = REEL_START_DELAY + REEL_MAIN_DURATION + REEL_SETTLE_PAUSE + REEL_SETTLE_DURATION;
const FAST_REEL_START_DELAY = 40;
const FAST_REEL_MAIN_DURATION = 1500;
const FAST_REEL_SETTLE_PAUSE = 40;
const FAST_REEL_SETTLE_DURATION = 160;
const FAST_REEL_DURATION = FAST_REEL_START_DELAY + FAST_REEL_MAIN_DURATION + FAST_REEL_SETTLE_PAUSE + FAST_REEL_SETTLE_DURATION;
const BATTLE_COUNTDOWN_DURATION = 3000;
const BATTLE_ROUND_DELAY = 850;
const FAST_BATTLE_ROUND_DELAY = 350;
const BATTLE_ROUND_CYCLE = REEL_DURATION + BATTLE_ROUND_DELAY;
const FAST_BATTLE_ROUND_CYCLE = FAST_REEL_DURATION + FAST_BATTLE_ROUND_DELAY;
const RESOLVED_BATTLE_LIFETIME_MS = 40_000;
const BATTLE_ROW_EXIT_ANIMATION_MS = 500;
const MAX_CASES = 25;
const rollNumberFormatter = new Intl.NumberFormat("en-US");

function getResolvedBattleAge(battle, now = Date.now()) {
  if (battle?.status !== "resolved") return 0;
  const resolvedAt = new Date(battle?.resolved_at || battle?.updated_at || battle?.created_at || "").getTime();
  return Number.isFinite(resolvedAt) ? Math.max(0, now - resolvedAt) : 0;
}

function isResolvedBattleExpired(battle, now = Date.now()) {
  return battle?.status === "resolved" && getResolvedBattleAge(battle, now) >= RESOLVED_BATTLE_LIFETIME_MS;
}

function getItemsWithRollRanges(items) {
  let nextRoll = 0;

  return items.map((item) => {
    const storedStart = Number(item.roll_range?.start);
    const storedEnd = Number(item.roll_range?.end);
    const hasStoredRange = Number.isInteger(storedStart) && Number.isInteger(storedEnd) && storedEnd >= storedStart;
    const rollCount = Math.round(Number(item.chance) * 1000);
    const rangeStart = hasStoredRange ? storedStart : nextRoll;
    const rangeEnd = hasStoredRange ? storedEnd : rangeStart + rollCount - 1;
    nextRoll = rangeEnd + 1;

    return {
      ...item,
      rollRange: `${rollNumberFormatter.format(rangeStart)}–${rollNumberFormatter.format(rangeEnd)}`,
    };
  });
}

function isCatalogCaseArtwork(imageUrl) {
  return String(imageUrl || "").includes("biggamesapi.io/image/");
}

function getCaseArtworkSize(caseItem) {
  const name = String(caseItem?.name || "").toLowerCase();
  if (name.includes("inferno")) return "inferno";
  if (name.includes("Cat Chaos")) return "beach";
  if (isCatalogCaseArtwork(caseItem?.image)) return "catalog";
  return "default";
}

const PLAYER_OPTIONS = [
  { id: "ffa-2", family: "ffa", label: "1v1", count: 2, color: "#6c63ff" },
  { id: "ffa-3", family: "ffa", label: "1v1v1", count: 3, color: "#6c63ff" },
  { id: "ffa-4", family: "ffa", label: "1v1v1v1", count: 4, color: "#6c63ff" },
  { id: "team-4", family: "team", label: "2v2", count: 4, teams: 2, color: "#3a89eb" },
  { id: "team-6", family: "team", label: "3v3", count: 6, teams: 2, color: "#3a89eb" },
  { id: "team-6-2v2v2", family: "team", label: "2v2v2", count: 6, teams: 3, color: "#3a89eb" },
];

function getBattleTeamCount(playerOption) {
  if (playerOption?.family !== "team") return 0;
  return Math.max(2, Number(playerOption.teams || 2));
}

const MODE_OPTIONS = [
  {
    id: "normal",
    title: "Normal",
    color: "#6c63ff",
    description: "Player or team with the biggest total value wins the battle.",
    Icon: Trophy,
  },
  {
    id: "terminal",
    title: "Terminal",
    color: "#ef4444",
    description: "The winner is decided by the last case only. What you pull before doesn't matter.",
    Icon: Flag,
  },
  {
    id: "wild",
    title: "Wild",
    color: "#22c55e",
    description: "Everything is reversed — the player or team with the lowest total value wins the battle.",
    Icon: Zap,
  },
];

const STACKABLE_MODE_IDS = new Set(["terminal", "wild"]);
const STACKABLE_MODE_ORDER = ["wild", "terminal"];

function getSelectedModeIds(mode) {
  const normalized = String(mode || "normal").toLowerCase().trim();
  const exactMode = MODE_OPTIONS.find((option) => option.id === normalized);
  if (exactMode) return [exactMode.id];

  const combinedModes = normalized
    .split("_")
    .filter((modeId) => STACKABLE_MODE_IDS.has(modeId));
  if (combinedModes.length > 1) {
    return STACKABLE_MODE_ORDER.filter((modeId) => combinedModes.includes(modeId));
  }
  return ["normal"];
}

function buildCombinedModeValue(modeIds) {
  const orderedModes = STACKABLE_MODE_ORDER.filter((modeId) => modeIds.includes(modeId));
  if (!orderedModes.length) return "normal";
  return orderedModes.length === 1 ? orderedModes[0] : orderedModes.join("_");
}

function toggleSelectedMode(currentMode, clickedMode) {
  if (!STACKABLE_MODE_IDS.has(clickedMode)) return clickedMode;

  const nextModes = new Set(getSelectedModeIds(currentMode).filter((modeId) => STACKABLE_MODE_IDS.has(modeId)));
  if (nextModes.has(clickedMode)) nextModes.delete(clickedMode);
  else nextModes.add(clickedMode);
  return buildCombinedModeValue([...nextModes]);
}

function WildModeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15.0002 9.00094L14.7 0C11.2587 1.43963 9.02616 5.76103 9.00094 8.99981L0 9.29995C1.43963 12.7413 5.76103 14.9738 8.99981 14.999L9.3 24C12.7413 22.5604 14.9738 18.239 14.9991 15.0002L24 14.7C22.5604 11.2587 18.239 9.02578 15.0002 9.00094Z" fill="currentColor" />
    </svg>
  );
}

function GroupModeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.51528 4.39065C2.10001 4.98231 2.10001 6.74098 2.10001 10.2584V11.9905C2.10001 18.1923 6.76286 21.2021 9.68842 22.48C10.482 22.8266 10.8788 23 12 23C13.1212 23 13.518 22.8266 14.3115 22.48C17.2371 21.2021 21.9 18.1923 21.9 11.9905V10.2584C21.9 6.74098 21.9 4.98231 21.4848 4.39065C21.0695 3.79899 19.4159 3.23296 16.1086 2.10087L15.4785 1.88519C13.7545 1.29506 12.8925 1 12 1C11.1075 1 10.2455 1.29506 8.5215 1.88519L7.89141 2.10087C4.58416 3.23296 2.93054 3.79899 2.51528 4.39065Z" fill="currentColor" />
      <path d="M15.3654 10.3491C15.6688 10.0092 15.6393 9.48768 15.2994 9.18421C14.9595 8.88076 14.438 8.91028 14.1346 9.25016L10.8214 12.9609L9.86544 11.8902C9.56194 11.5503 9.0404 11.5208 8.70054 11.8243C8.36066 12.1277 8.33114 12.6492 8.63459 12.9891L10.206 14.7491C10.3625 14.9244 10.5864 15.0246 10.8214 15.0246C11.0564 15.0246 11.2803 14.9244 11.4368 14.7491L15.3654 10.3491Z" fill="#161616" />
    </svg>
  );
}

function JackpotModeIcon() {
  return (
    <svg viewBox="-0.5 0 155 155" fill="currentColor" aria-hidden="true">
      <path d="M106.407 96.8913C111.542 102.976 114.23 109.624 114.119 117.272C113.966 127.809 108.553 135.741 100.947 142.254C92.0832 149.843 81.3711 153.044 69.9069 153.943C67.396 154.087 64.8793 154.095 62.3675 153.968C61.2825 153.947 60.2075 153.756 59.1817 153.401C55.071 151.912 54.4462 148.867 57.7062 146.002C60.9065 143.191 64.3602 140.658 67.443 137.729C69.8054 135.468 71.9448 132.984 73.8318 130.313C75.8297 127.501 76.0056 124.257 74.7671 120.518C72.7928 121.437 70.9019 122.169 69.1639 123.165C65.5199 125.253 63.4643 125.166 60.3381 122.422C57.3006 119.755 54.3156 117.028 51.2938 114.343C50.8442 113.992 50.3743 113.668 49.8866 113.373C48.0535 115.067 46.3496 116.757 44.523 118.301C42.1025 120.348 39.7016 120.401 38.131 118.589C36.6588 116.893 36.901 114.651 39.0282 112.471C40.5377 110.923 42.2626 109.584 43.5372 108.461C40.1098 104.278 36.6555 100.848 34.1719 96.8237C31.2696 92.1178 34.8565 87.9231 37.0979 83.3189C32.8192 83.0504 29.3006 83.8341 26.4724 86.0033C23.7734 88.1917 21.3394 90.6881 19.2199 93.4416C17.1669 95.975 15.57 98.8767 13.7474 101.599C12.0291 104.166 10.2688 106.864 6.65102 106.491C4.14644 106.233 0.654067 101.721 0.422379 98.33C-0.102691 90.599 0.881819 83.0753 4.49168 76.0867C11.1049 63.2881 21.523 54.9657 35.0947 50.5131C40.7812 48.6478 46.5098 49.2418 52.3098 51.0087C52.6314 50.6385 53.0088 50.2697 53.3107 49.8476C68.9736 27.9581 90.3183 14.0634 115.597 5.81196C124.206 3.00217 132.916 0.444402 142.093 0.21009C144.385 0.151676 146.679 -0.0235928 148.97 0.00266074C151.958 0.036134 153.448 1.09614 153.327 4.01488C153.172 9.66322 152.644 15.2951 151.744 20.8736C148.056 41.8521 137.967 59.8443 124.863 76.254C119.763 82.6415 114.02 88.5177 108.563 94.621C107.918 95.3403 107.232 96.0243 106.407 96.8913Z" />
      <path d="M55.4163 106.628C58.8292 109.34 61.3148 111.468 63.9867 113.323C64.4408 113.537 64.9369 113.646 65.4389 113.644C65.9408 113.641 66.4358 113.527 66.8877 113.308C71.1231 111.063 75.4543 108.915 79.3969 106.215C93.4392 96.5986 106.143 85.4257 116.822 72.1336C122.616 64.9224 127.917 57.3167 133.55 49.7426L100.91 19.4316C99.8323 19.9355 98.7827 20.4966 97.7652 21.1125C91.3987 25.3374 84.9081 29.3961 78.7602 33.9196C71.8687 38.9892 66.0371 45.1843 60.8311 52.0129C52.1969 63.3367 47.1136 76.5599 40.7248 89.0828C40.0895 90.3299 40.4459 92.8417 41.3464 93.9568C43.6901 96.8598 46.5925 99.3126 49.7416 102.406C54.6641 97.3035 58.9959 92.5352 63.6454 88.0938C66.324 85.689 69.196 83.5087 72.2323 81.575C73.8285 80.4907 75.8664 80.1212 77.3268 81.7864C78.8068 83.4745 77.5322 85.1277 76.4919 86.4844C75.2622 88.0169 73.9298 89.4642 72.504 90.8162C69.5505 93.7356 66.5904 96.6465 63.5476 99.4701C60.9951 101.843 58.3212 104.081 55.4163 106.628Z" />
      <path d="M147.141 6.3889C133.175 6.41712 120.848 11.6094 108.28 15.8349L108.056 16.7045L136.962 41.0731C141.915 33.2233 145.713 20.2816 147.141 6.3889Z" />
      <path d="M77.9707 141.64C89.7309 139.425 98.8422 133.46 103.962 122.528C107.375 115.232 104.991 108.423 100.968 101.949C94.1966 107.118 87.7199 112.064 81.2445 117.008C86.3449 126.009 83.7327 133.936 77.9707 141.64Z" />
      <path d="M48.698 56.4944C31.8839 53.7377 8.64104 76.4733 10.1486 92.0817C17.0146 81.239 25.8253 74.7064 39.084 77.0567L48.698 56.4944Z" />
      <path d="M14.6051 140.579C15.1033 139.678 15.6382 138.038 16.7054 136.898C20.7301 132.601 24.9024 128.441 29.0774 124.288C30.3034 123.068 31.8543 122.299 33.4499 123.601C35.1327 124.974 34.3963 126.615 33.402 127.973C29.989 132.633 26.5682 137.293 22.9616 141.802C21.8888 143.034 20.5253 143.979 18.9947 144.55C16.7225 145.446 14.5257 143.644 14.6051 140.579Z" />
      <path d="M51.9876 123.87C54.4075 123.936 56.1665 126.118 55.0901 127.808C52.3487 132.062 49.3371 136.136 46.074 140.004C44.905 141.404 42.8061 141.206 41.3214 139.866C40.6426 139.292 40.1985 138.488 40.0735 137.607C39.9485 136.727 40.1513 135.831 40.6434 135.09C41.5342 133.607 42.5933 132.232 43.7998 130.991C45.587 129.088 47.4753 127.273 49.4167 125.529C50.22 124.897 51.0807 124.342 51.9876 123.87Z" />
      <path d="M30.3682 105.409C29.9062 106.43 29.3605 107.411 28.7366 108.341C25.689 112.145 22.5946 115.911 19.4534 119.638C18.8631 120.274 18.1765 120.813 17.4187 121.234C15.8501 122.199 14.2552 122.197 12.9904 120.769C11.6836 119.294 11.9737 117.656 13.2838 116.387C17.5723 112.23 21.91 108.121 26.3337 104.109C26.912 103.584 28.1433 103.499 28.9893 103.655C29.4973 103.749 29.8465 104.705 30.3682 105.409Z" />
      <path d="M99.4671 35.7334C103.729 35.6749 107.015 37.4181 110.313 40.1649C113.732 43.0121 116.286 46.049 117.548 50.2935C120.461 60.111 114.697 67.338 105.35 68.6599C97.775 69.731 91.3495 66.6114 86.6757 60.6814C82.672 55.6 82.5638 49.6871 85.3407 44.0052C88.1407 38.2721 93.1846 35.7944 99.4671 35.7334ZM90.4707 51.4625C91.5654 53.3514 92.3511 55.7595 93.9821 57.2317C95.6715 58.7564 98.1281 59.5118 100.344 60.3545C103.255 61.4624 105.775 60.2889 107.753 58.2294C109.668 56.2374 109.739 53.7354 108.803 51.1869C107.329 47.1688 103.891 45.1524 100.438 43.3337C97.3373 41.7008 94.3949 42.6774 92.6274 45.7353C91.7262 47.2915 91.3232 49.1358 90.4707 51.4625Z" />
    </svg>
  );
}

function BackChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BattleBackIcon() {
  return (
    <svg className="bb-battle-back-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M15.5 19a1 1 0 0 1-.7-.29l-6-6a1 1 0 0 1 0-1.42l6-6a1 1 0 1 1 1.4 1.42L10.91 12l5.29 5.29A1 1 0 0 1 15.5 19z" />
    </svg>
  );
}

function FairnessShieldIcon() {
  return (
    <svg fill="#00e284" width="18" height="18" viewBox="0 0 347.971 347.971" aria-hidden="true">
      <path d="M317.309,54.367C257.933,54.367,212.445,37.403,173.98,0C135.519,37.403,90.033,54.367,30.662,54.367 c0,97.405-20.155,236.937,143.317,293.604C337.463,291.305,317.309,151.773,317.309,54.367z M162.107,225.773l-47.749-47.756 l21.379-21.378l26.37,26.376l50.121-50.122l21.378,21.378L162.107,225.773z" />
    </svg>
  );
}

function BattleShareIcon() {
  return (
    <svg fill="#4088f5" width="18" height="18" viewBox="3.63 3.2 17.16 17.16" aria-hidden="true">
      <path d="M20.3359 3.22136L3.87333 8.70889C3.56801 8.81066 3.55033 9.23586 3.84614 9.36263L9.89655 11.9557C9.96078 11.9832 10.0347 11.9752 10.0916 11.9346L16.0235 7.69749C16.2073 7.56618 16.4338 7.79266 16.3025 7.97648L12.0654 13.9084C12.0248 13.9653 12.0168 14.0392 12.0443 14.1034L14.6374 20.1539C14.7641 20.4497 15.1893 20.432 15.2911 20.1267L20.7786 3.66408C20.8698 3.39046 20.6095 3.13015 20.3359 3.22136Z" />
    </svg>
  );
}

function BattleVersusIcon() {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
      <path d="M38.121,76.102l4.08,4.081c0.892,0.891 1.393,2.1 1.393,3.361c0,1.261 -0.501,2.47 -1.393,3.361c-0.409,0.41 -0.833,0.833 -1.243,1.243c-0.891,0.892 -2.1,1.393 -3.361,1.393c-1.261,0 -2.47,-0.501 -3.361,-1.393l-6.912,-6.912l-12.222,12.223c-2.055,2.055 -5.387,2.055 -7.441,0l-1.12,-1.119c-2.055,-2.055 -2.055,-5.387 0,-7.442l12.223,-12.222l-7.184,-7.183c-0.891,-0.892 -1.392,-2.101 -1.392,-3.362c0,-1.26 0.501,-2.469 1.392,-3.361l1.243,-1.243c0.892,-0.891 2.101,-1.392 3.362,-1.392c1.26,0 2.469,0.501 3.361,1.392l4.352,4.352l40.272,-52.601c0.167,-0.218 0.414,-0.361 0.686,-0.398l28.97,-3.871c0.321,-0.043 0.642,0.066 0.871,0.295c0.228,0.228 0.337,0.55 0.294,0.87l-3.871,28.97c-0.037,0.272 -0.18,0.519 -0.398,0.686l-52.601,40.272Z" />
      <path d="M69.843,53.704l-18.609,14.248l10.645,8.15l-4.08,4.081c-0.892,0.891 -1.392,2.1 -1.392,3.361c0,1.261 0.5,2.47 1.392,3.361c0.41,0.41 0.833,0.833 1.243,1.243c0.891,0.892 2.1,1.393 3.361,1.393c1.261,0 2.47,-0.501 3.361,-1.393l6.912,-6.912l12.222,12.223c2.055,2.055 5.387,2.055 7.442,0l1.119,-1.119c2.055,-2.055 2.055,-5.387 0,-7.442l-12.222,-12.222l7.183,-7.183c0.891,-0.892 1.392,-2.101 1.392,-3.362c0,-1.26 -0.501,-2.469 -1.392,-3.361l-1.243,-1.243c-0.892,-0.891 -2.101,-1.392 -3.361,-1.392c-1.261,0 -2.47,0.501 -3.362,1.392l-4.352,4.352l-6.259,-8.175Zm-39.878,-2.103l19.178,-25.049l-13.226,-17.274c-0.167,-0.218 -0.413,-0.361 -0.686,-0.398l-28.97,-3.871c-0.32,-0.043 -0.642,0.066 -0.87,0.295c-0.229,0.228 -0.338,0.55 -0.295,0.87l3.872,28.97c0.036,0.272 0.179,0.519 0.397,0.686l20.6,15.771Z" />
    </svg>
  );
}

function AddCaseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6.667 1.333A.667.667 0 0 0 5.333 1.333V5.333H1.333A.667.667 0 0 0 1.333 6.667H5.333V10.667A.667.667 0 0 0 6.667 10.667V6.667H10.667A.667.667 0 0 0 10.667 5.333H6.667V1.333Z" fill="#6c63ff" />
    </svg>
  );
}

function PickerEyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M2 12S5.5 5 12 5s10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="white" strokeWidth="2" />
    </svg>
  );
}

function PickerSearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="bb-picker-search-icon" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.75 3.5a6.25 6.25 0 0 1 4.96 10.06l4.36 4.36a1 1 0 0 1-1.42 1.41l-4.35-4.35A6.25 6.25 0 1 1 9.75 3.5Zm0 2a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5Z"
      />
    </svg>
  );
}

function FastSpinIcon({ active }) {
  return (
    <svg width="19" height="19" viewBox="37.86 -1 428.21 511.45" fill={active ? "#ffe472" : "#ffffff"} aria-hidden="true">
      <path d="M459.866 218.346l-186.7.701c-4.619.017-7.618-4.861-5.517-8.975L370.845 8.024c3.103-6.075-4.493-11.949-9.592-7.417L39.948 286.141c-4.221 3.751-1.602 10.732 4.045 10.78l170.444 1.457c4.443.038 7.391 4.619 5.583 8.679L133.317 501.73c-2.688 6.035 4.709 11.501 9.689 7.16l320.937-279.725c4.307-3.753 1.637-10.84-4.077-10.819z" />
    </svg>
  );
}

function QuantityMinusIcon() {
  return (
    <svg viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d="M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32Z" />
    </svg>
  );
}

function QuantityPlusIcon() {
  return (
    <svg viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor" aria-hidden="true">
      <path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32Z" />
    </svg>
  );
}

function RemoveCaseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

function PlayerGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M0.136201 8.657C1.38913 7.3281 3.10261 6.5 5 6.5C6.89739 6.5 8.61087 7.3281 9.8638 8.657C10.0007 8.8022 10.0381 9.01489 9.95908 9.19812C9.88 9.38134 9.69956 9.5 9.5 9.5H0.5C0.300443 9.5 0.119995 9.38134 0.0409245 9.19812C-0.0381461 9.01489 -0.000696123 8.8022 0.136201 8.657Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M2.25 2.75C2.25 1.23122 3.48122 0 5 0C6.51878 0 7.75 1.23122 7.75 2.75C7.75 4.26878 6.51878 5.5 5 5.5C3.48122 5.5 2.25 4.26878 2.25 2.75Z" fill="currentColor" />
    </svg>
  );
}

function CrossedSwordsGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M9.75 0L7.06066 2.68934L9.31066 4.93934L12 2.25V0H9.75Z" fill="currentColor" />
      <path d="M6.96967 9.21968L5.84467 10.3447L6.90533 11.4053L8.625 9.68565L9.75172 10.8124C9.75058 10.8331 9.75 10.854 9.75 10.875C9.75 11.4963 10.2537 12 10.875 12C11.4963 12 12 11.4963 12 10.875C12 10.2537 11.4963 9.75 10.875 9.75C10.854 9.75 10.8331 9.7506 10.8124 9.75173L9.68566 8.625L11.4053 6.90533L10.3447 5.84467L9.21967 6.96967L2.25 0H0V2.25L6.96967 9.21968Z" fill="currentColor" />
      <path d="M1.12502 12.0001C1.74632 12.0001 2.25002 11.4964 2.25002 10.8751C2.25002 10.8541 2.24942 10.8331 2.24829 10.8124L4.43567 8.62506L1.65534 5.84473L0.594694 6.90539L2.31437 8.62506L1.18764 9.75178C1.16694 9.75066 1.14602 9.75006 1.12502 9.75006C0.503719 9.75006 0 10.2538 0 10.8751C0 11.4964 0.503719 12.0001 1.12502 12.0001Z" fill="currentColor" />
    </svg>
  );
}

function PlayerSlotIcons({ option, active }) {
  const color = active ? "#e1e4f2" : "#4a5070";
  const icons = [];

  if (option.family === "team") {
    const teamCount = getBattleTeamCount(option);
    const teamSize = option.count / teamCount;
    for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
      if (teamIndex > 0) icons.push(<CrossedSwordsGlyph key={`versus-${teamIndex}`} />);
      for (let index = 0; index < teamSize; index += 1) {
        icons.push(<PlayerGlyph key={`team-${teamIndex}-${index}`} />);
      }
    }
  } else {
    for (let index = 0; index < option.count; index += 1) {
      if (option.family === "ffa" && index > 0) icons.push(<CrossedSwordsGlyph key={`s${index}`} />);
      icons.push(<PlayerGlyph key={`p${index}`} />);
    }
  }

  return <span className="bb-slot-icons" style={{ color }}>{icons}</span>;
}

function NormalCreationIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21.8382 11.1263L21.609 13.5616C21.2313 17.5742 21.0425 19.5805 19.8599 20.7902C18.6773 22 16.9048 22 13.3599 22H10.6401C7.09517 22 5.32271 22 4.14009 20.7902C2.95748 19.5805 2.76865 17.5742 2.391 13.5616L2.16181 11.1263C1.9818 9.2137 1.8918 8.25739 2.21899 7.86207C2.39598 7.64823 2.63666 7.5172 2.89399 7.4946C3.36968 7.45282 3.96708 8.1329 5.16187 9.49307C5.77977 10.1965 6.08872 10.5482 6.43337 10.6027C6.62434 10.6328 6.81892 10.6018 6.99526 10.5131C7.31351 10.3529 7.5257 9.91812 7.95007 9.04852L10.1869 4.46486C10.9888 2.82162 11.3898 2 12 2C12.6102 2 13.0112 2.82162 13.8131 4.46485L16.0499 9.04851C16.4743 9.91812 16.6865 10.3529 17.0047 10.5131C17.1811 10.6018 17.3757 10.6328 17.5666 10.6027C17.9113 10.5482 18.2202 10.1965 18.8381 9.49307C20.0329 8.1329 20.6303 7.45282 21.106 7.4946C21.3633 7.5172 21.604 7.64823 21.781 7.86207C22.1082 8.25739 22.0182 9.2137 21.8382 11.1263Z" fill="currentColor" />
    </svg>
  );
}

function CoinflipCreationIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14.1666 15.7528C11.6747 17.1915 8.99424 17.9794 6.61896 17.9715C4.11651 17.9631 2.23001 17.0781 1.30697 15.4793C0.383924 13.8806 0.560679 11.8043 1.8047 9.63288C2.98544 7.57189 5.00805 5.64449 7.49991 4.20581C9.99178 2.76713 12.6723 1.97921 15.0475 1.98713C17.55 1.99548 19.4365 2.88056 20.3595 4.47931C21.2826 6.07807 21.1058 8.15437 19.8618 10.3257C18.681 12.3867 16.6584 14.3141 14.1666 15.7528Z" />
      <path d="M7.48968 19.3131C7.47976 19.2959 7.46069 19.286 7.44041 19.2873C7.14977 19.3065 6.86195 19.3163 6.57798 19.3153C5.37401 19.3113 4.28137 19.1293 3.32052 18.7734C3.27327 18.756 3.22857 18.8076 3.25347 18.8507L3.6403 19.5208C4.56334 21.1195 6.44984 22.0046 8.95233 22.0129C8.99471 22.013 9.0223 21.9676 9.00159 21.9317L7.48968 19.3131Z" />
      <path d="M19.0981 17.9775C19.9246 17.2811 20.6554 16.5291 21.267 15.7433C21.2805 15.7259 21.2823 15.7026 21.2716 15.684L19.7108 12.9806C19.6924 12.9488 19.6471 12.9456 19.6226 12.9744C18.9819 13.7302 18.244 14.4512 17.4261 15.1202C17.4056 15.137 17.3998 15.1656 17.4127 15.1879L19.0158 17.9645C19.0324 17.9932 19.072 17.9994 19.0981 17.9775Z" />
      <path d="M10.6081 21.8972C11.5944 21.7604 12.6111 21.5035 13.6274 21.1359C13.6595 21.1243 13.6739 21.087 13.6573 21.0583L12.0542 18.2816C12.0414 18.2593 12.0138 18.25 11.9889 18.2594C11.0007 18.6332 10.0073 18.9118 9.03236 19.0887C8.99513 19.0955 8.97526 19.1363 8.99366 19.1681L10.5545 21.8715C10.5652 21.8901 10.5863 21.9003 10.6081 21.8972Z" />
      <path d="M16.3134 16.0337C16.2979 16.0069 16.2623 15.9995 16.2361 16.0177C15.786 16.3305 15.3176 16.6279 14.8332 16.9075C14.3489 17.1872 13.8571 17.4441 13.3613 17.6775C13.3324 17.6911 13.3209 17.7256 13.3364 17.7524L14.9473 20.5425C14.961 20.5662 14.991 20.5754 15.0167 20.5636C15.5158 20.3327 16.0115 20.0762 16.4999 19.7943C16.9883 19.5123 17.4583 19.2113 17.9078 18.8944C17.9308 18.8782 17.9379 18.8475 17.9242 18.8238L16.3134 16.0337Z" />
      <path d="M21.0462 10.9622C20.905 11.2085 20.7526 11.4529 20.5907 11.695C20.5794 11.712 20.5784 11.7334 20.5884 11.7506L22.1002 14.3692C22.1209 14.4051 22.1741 14.404 22.1952 14.3672C23.4391 12.1958 23.6159 10.1195 22.6929 8.52076L22.306 7.85075C22.2811 7.80763 22.2141 7.82052 22.2056 7.87021C22.0333 8.88024 21.6446 9.91751 21.0462 10.9622Z" />
    </svg>
  );
}

function TerminalCreationIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 0C5.37291 0 0 5.37244 0 12C0 18.6275 5.37291 24 12 24C18.6276 24 24 18.6275 24 12C24 5.37244 18.6276 0 12 0ZM11.3753 10.918C11.5657 10.808 11.781 10.7506 11.9995 10.7506C12.4448 10.7506 12.8601 10.9897 13.0829 11.3752C13.4264 11.9722 13.2221 12.737 12.6256 13.0819C12.4353 13.191 12.2191 13.2493 12.0019 13.2493C11.5561 13.2493 11.142 13.0102 10.919 12.6246C10.5737 12.0282 10.7803 11.2629 11.3753 10.918ZM3.88875 11.8C3.79978 11.7053 3.75628 11.5781 3.76533 11.4504C3.76533 11.4504 3.75769 11.1768 3.81127 10.7976C3.96 9.74953 4.30772 8.73413 4.83675 7.81191C5.37056 6.89063 6.07659 6.08377 6.90975 5.43038C7.21111 5.19361 7.45172 5.06447 7.45172 5.06447C7.55836 4.99177 7.69041 4.96781 7.81617 4.99603C7.94194 5.02519 8.05008 5.10459 8.11416 5.21606L10.6942 9.68208C10.8099 9.88392 10.7582 10.1423 10.5727 10.2843C10.5727 10.2843 10.5785 10.2474 10.4421 10.3843C10.3053 10.5192 10.1863 10.6727 10.0882 10.8425C9.98916 11.0138 9.9165 11.1945 9.8677 11.3797C9.81792 11.5652 9.84572 11.5423 9.84572 11.5423C9.81511 11.7743 9.6195 11.9474 9.38555 11.9474H4.22831C4.09917 11.9474 3.9758 11.8947 3.88875 11.8ZM15.9289 19.0475C15.8916 19.1699 15.8035 19.2709 15.6878 19.3287C15.6878 19.3287 15.4553 19.4713 15.099 19.6147C14.117 20.0103 13.0638 20.2165 12.0005 20.2184C10.9372 20.2165 9.88341 20.0103 8.90241 19.6147C8.54602 19.4713 8.31356 19.3287 8.31356 19.3287C8.19731 19.2709 8.10933 19.1699 8.07253 19.0475C8.03424 18.9231 8.05003 18.7901 8.11411 18.6792L10.6942 14.2122C10.809 14.0099 11.0577 13.9262 11.2739 14.0166C11.2739 14.0166 11.2395 14.0281 11.4259 14.0788C11.6111 14.129 11.8043 14.1562 12.0004 14.1562C12.1961 14.1562 12.3902 14.129 12.5759 14.0788C12.7605 14.0281 12.7275 14.0166 12.7275 14.0166C12.9442 13.9262 13.1915 14.0099 13.3082 14.2122L15.8868 18.6792C15.9514 18.7901 15.9672 18.9231 15.9289 19.0475ZM20.2366 11.4504C20.2452 11.5781 20.2012 11.7053 20.1127 11.8C20.0252 11.8947 19.9022 11.9473 19.7731 11.9473H14.6159C14.382 11.9473 14.1859 11.7742 14.1553 11.5422C14.1553 11.5422 14.184 11.5652 14.1343 11.3796C14.0846 11.1945 14.0109 11.0137 13.9133 10.8425C13.8148 10.6732 13.6951 10.5191 13.5603 10.3842C13.4226 10.2474 13.4283 10.2842 13.4283 10.2842C13.2432 10.1422 13.1915 9.88387 13.3082 9.68203L15.8868 5.21602C15.9509 5.10455 16.059 5.02514 16.1843 4.99598C16.3111 4.96777 16.4426 4.99172 16.5488 5.06442C16.5488 5.06442 16.7889 5.19356 17.0912 5.43033C17.9254 6.08372 18.6304 6.89058 19.1632 7.81186C19.6932 8.73408 20.0424 9.74948 20.1893 10.7975C20.2433 11.1768 20.2366 11.4504 20.2366 11.4504Z" fill="currentColor" />
    </svg>
  );
}

function CreationModeIcon({ type }) {
  const Icon = type === "normal"
    ? NormalCreationIcon
    : type === "terminal"
      ? TerminalCreationIcon
      : WildModeIcon;
  return <span className={`bb-mode-icon bb-mode-icon-${type}`}><Icon /></span>;
}

function BattleModeIcon({ type }) {
  const Icon = type === "normal"
    ? NormalCreationIcon
    : type === "terminal"
      ? TerminalCreationIcon
      : WildModeIcon;
  const title = MODE_OPTIONS.find((option) => option.id === type)?.title || "Normal";
  return (
    <span className={`bb-row-mode-icon bb-row-mode-${type}`} title={title} aria-label={`${title} mode`}>
      <Icon />
    </span>
  );
}

const BATTLE_STYLES = String.raw`
  @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap");

  .battles-page {
    --accent: #6c63ff;
    --accent-light: #8079ff;
    --accent-dark: #5a51e6;
    --danger: #ff4d4d;
    --success: #22c55e;
    --surface-0: #131520;
    --surface-1: #1c1f2e;
    --surface-2: #1f2335;
    --surface-3: #161a28;
    --text-primary: #c7cce2;
    --text-secondary: #a6b2d3;
    --text-muted: #6c7399;
    --border: #252839;
    min-height: 100%;
    width: 100%;
    color: #e1e4f2;
    font-family: Poppins, sans-serif;
  }

  .bb-btn {
    position: relative;
    isolation: isolate;
    display: inline-flex;
    height: 42px;
    min-width: 120px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    overflow: hidden;
    box-sizing: border-box;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    color: #fff;
    font-size: .9rem;
    font-weight: 600;
    letter-spacing: .01em;
    cursor: pointer;
    transform-origin: center;
    transition: opacity .2s ease,transform .1s ease,background .25s ease;
  }

  .bb-btn:active:not(:disabled) { transform: scale(.97); }
  .bb-btn:focus-visible { outline: 2px solid #8079ff; outline-offset: 2px; }
  .bb-btn:disabled { cursor: not-allowed; opacity: .6; transform: none; filter: none; }
  .bb-btn-primary { border: 1px solid rgba(94,85,217,.4); background: linear-gradient(135deg,#5b52e2,#4038c0); box-shadow: 0 2px 8px rgba(108,99,255,.2); }
  .bb-btn-primary:hover:not(:disabled) { background: linear-gradient(135deg,#6c63ff,#5147d9); opacity: .95; }
  .bb-btn-danger { border: 1px solid rgba(224,49,49,.42); background: linear-gradient(135deg,#ff5f5f,#c92a2a); box-shadow: 0 2px 8px rgba(255,77,77,.16); }
  .bb-btn-danger:hover:not(:disabled) { background: linear-gradient(135deg,#ff6b6b,#e03131); opacity: .95; }
  .bb-btn-secondary { border: 0; background: #2a2e44; box-shadow: none; color: #e1e4f2; }
  .bb-btn-secondary:hover:not(:disabled) { background: #32385a; }

  .bb-list {
    container-type: inline-size;
    box-sizing: border-box;
    width: 100%;
    max-width: 1500px;
    margin: 0 auto;
    padding: 16px;
  }

  .bb-stats {
    display: grid;
    grid-template-columns: repeat(3,minmax(0,1fr));
    gap: 8px;
  }

  .bb-stat {
    position: relative;
    display: flex;
    min-height: 72px;
    align-items: center;
    gap: 12px;
    overflow: hidden;
    padding: 12px;
    border-radius: 8px;
    background: radial-gradient(circle at 100% 100%,rgba(108,99,255,.22) 0%,rgba(108,99,255,.16) 24%,rgba(108,99,255,.09) 52%,rgba(108,99,255,.04) 68%,transparent 82%),#1b1f2e;
  }

  .bb-stat-gold {
    background: radial-gradient(circle at 100% 100%,rgba(255,216,77,.22) 0%,rgba(255,216,77,.16) 24%,rgba(255,216,77,.09) 52%,rgba(255,216,77,.04) 68%,transparent 82%),#1b1f2e;
  }

  .bb-stat-value {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.25;
  }

  .bb-stat-value img { width: 20px; height: 20px; object-fit: contain; opacity: .95; }
  .bb-stat-label { color: #fff; font-size: 14px; line-height: 1.25; }
  .bb-list-actions { display: flex; align-items: center; margin-top: 12px; }
  .bb-create-battle-btn { white-space: nowrap; }
  .bb-battle-list { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
  .bb-battle-section { display: flex; min-width: 0; flex-direction: column; gap: 12px; }

  @keyframes bb-row-in {
    from { opacity: 0; transform: translateY(12px) scale(.985); filter: blur(4px); }
    to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  }

  @keyframes bb-row-out {
    from { opacity: 1; transform: scale(1); filter: blur(0); }
    to { opacity: 0; transform: scale(.985); filter: blur(2px); }
  }

  .bb-row-wrap { width: 100%; min-width: 0; transform: translateZ(0); will-change: opacity,transform,filter; animation: bb-row-in .7s cubic-bezier(.16,1,.3,1) both; }
  .bb-row-wrap-finished { animation-delay: 55ms; }
  .bb-row-wrap-exiting { pointer-events: none; animation: bb-row-out ${BATTLE_ROW_EXIT_ANIMATION_MS}ms cubic-bezier(.22,1,.36,1) forwards; }
  .bb-row-finished-surface {
    position: relative;
    overflow: hidden;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.06),0 10px 30px rgba(0,0,0,.25);
  }
  .bb-row-finished-overlay { position: absolute; z-index: 0; inset: 0; pointer-events: none; background: rgba(0,0,0,.35); }
  .bb-row-finished-content { position: relative; z-index: 1; opacity: .82; filter: grayscale(.18); }
  .bb-battle-divider { width: 100%; height: 1px; flex: 0 0 1px; background: linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent); }

  .bb-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(320px,auto) minmax(0,1fr) max-content;
    width: 100%;
    min-width: 0;
    align-items: center;
    column-gap: 12px;
    box-sizing: border-box;
    overflow: hidden;
    padding: 6px 8px;
    border: 1px solid #252839;
    border-radius: 8px;
    background: #1c1f2e;
    cursor: pointer;
  }

  .bb-row-left { position: relative; z-index: 2; display: flex; min-width: 0; justify-content: center; }
  .bb-row-left-inner { display: flex; width: 100%; min-width: 0; flex-direction: column; align-items: center; gap: 10px; }
  .bb-row-badges { display: flex; min-width: 0; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
  .bb-round-badge { padding: 4px 10px; color: rgba(225,228,242,.85); font-size: 14px; font-weight: 600; }
  .bb-row-players { position: relative; display: flex; width: 220px; min-width: 220px; align-items: center; justify-content: center; gap: 10px; }
  .bb-row-avatar { display: inline-flex; width: 38px; height: 38px; flex: 0 0 38px; align-items: center; justify-content: center; overflow: hidden; padding: 0; border: 2px solid rgba(255,255,255,.08); border-radius: 999px; background: #1c1f2e; }
  .bb-row-players-six { width: 330px; min-width: 330px; gap: 7px; }
  .bb-row-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 999px; }
  .bb-row-avatar-loading { display: block; width: 100%; height: 100%; }
  .bb-vs { position: absolute; top: 50%; left: 50%; padding: 5px; color: rgba(225,228,242,.78); font-size: 11px; font-weight: 900; letter-spacing: .9px; transform: translate(-50%,-50%); }
  .bb-vs-inline { position: static; flex: 0 0 auto; padding: 2px 0; transform: none; }
  .bb-row-player-before-vs { margin-right: 15px; }
  .bb-row-player-after-vs { margin-left: 15px; }
  .bb-row-mode { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
  .bb-row-mode-icon { display: inline-grid; width: 28px; height: 28px; box-sizing: border-box; flex-shrink: 0; place-items: center; padding: 5px; border-radius: 8px; line-height: 0; cursor: default; }
  .bb-row-mode-normal { color: #6c63ff; background: rgba(108,99,255,.133); }
  .bb-row-mode-wild { color: #22c55e; background: rgba(34,197,94,.133); }
  .bb-row-mode-jackpot { color: #f59e0b; background: rgba(245,158,11,.133); }
  .bb-row-mode-group { color: #2dd4bf; background: rgba(45,212,191,.133); }
  .bb-row-mode-coinflip { color: #38bdf8; background: rgba(56,189,248,.133); }
  .bb-row-mode-terminal { color: #ef4444; background: rgba(239,68,68,.133); }
  .bb-row-mode-icon svg { display: block; width: 17px; height: 17px; margin: auto; }

  .bb-row-reel {
    position: relative;
    display: flex;
    width: 100%;
    min-width: 0;
    height: 98px;
    align-items: center;
    justify-content: flex-start;
    overflow: hidden;
    padding: 4px 0;
    border-radius: 8px;
    background: rgba(20,19,35,.35);
  }

  .bb-row-reel::before,.bb-row-reel::after {
    content: "";
    position: absolute;
    z-index: 3;
    top: 0;
    bottom: 0;
    width: 80px;
    pointer-events: none;
    opacity: .75;
  }

  .bb-row-reel::before { left: 0; background: linear-gradient(90deg,rgba(20,19,35,.55),transparent); }
  .bb-row-reel::after { right: 0; background: linear-gradient(270deg,rgba(20,19,35,.55),transparent); }
  .bb-row-reel-track { z-index: 2; display: flex; width: max-content; min-width: 100%; align-items: center; gap: 8px; padding: 0 10px; }
  .bb-row-case { display: flex; width: 90px; min-width: 90px; height: 90px; align-items: center; justify-content: center; opacity: .86; cursor: pointer; }
  .bb-row-case img { width: 70px; height: 70px; object-fit: contain; pointer-events: none; }

  @keyframes bb-case-tooltip-in {
    from { opacity: 0; transform: scale(.95); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes bb-case-tooltip-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(.95); }
  }
  .bb-case-tooltip-positioner { position: fixed; z-index: 50; width: max-content; min-width: max-content; pointer-events: none; transform: translate(-50%,-100%); }
  .bb-case-tooltip {
    box-sizing: border-box;
    overflow: hidden;
    padding: 6px 12px;
    border: 1px solid #252839;
    border-radius: 6px;
    background: #171925;
    color: #fff;
    font-family: Poppins,sans-serif;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    transform-origin: 50% 100%;
    animation: bb-case-tooltip-in .15s both;
  }
  .bb-case-tooltip-closing { animation: bb-case-tooltip-out .15s both; }
  .bb-case-tooltip p { margin: 0; padding: 0; white-space: nowrap; }
  .bb-case-tooltip-price { margin-top: 4px !important; color: rgba(255,255,255,.7); }

  .bb-row-right { display: flex; width: max-content; min-width: max-content; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
  .bb-cost { display: flex; width: auto; min-width: 145px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; }
  .bb-cost-label { color: rgba(176,184,193,.7); font-size: 14px; font-weight: 700; }
  .bb-cost-value { display: flex; align-items: center; justify-content: center; gap: 6px; color: rgba(225,228,242,.95); font-size: 15px; font-weight: 600; }
  .bb-cost-value img { width: 16px; height: 16px; object-fit: contain; }
  .bb-row-view { min-width: 155px; }

  .bb-create-page { min-height: 100%; color: #e1e4f2; font-family: system-ui,sans-serif; font-weight: 450; }
  .bb-create-inner { max-width: 1100px; margin: 0 auto; padding: 28px 20px 60px; }
  .bb-create-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
  .bb-create-title-wrap { display: flex; align-items: center; gap: 10px; }
  .bb-back-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 4px; border: 0; border-radius: 6px; background: none; color: #6c7399; cursor: pointer; transition: color .15s,background .15s; }
  .bb-back-icon:hover { color: #e1e4f2; background: rgba(255,255,255,.06); }
  .bb-create-title { margin: 0; color: #e1e4f2; font-size: 22px; font-weight: 700; }
  .bb-create-header-right { display: flex; align-items: center; gap: 10px; }

  .bb-switch {
    display: inline-flex;
    height: 40px;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: #131520;
    cursor: pointer;
  }

  .bb-switch-label { color: #6c7399; font-size: 12px; font-weight: 600; white-space: nowrap; transition: color .2s; }
  .bb-switch-gold .bb-switch-label { color: #f8ad1a; }
  .bb-switch-gold img { width: 18px; height: 18px; object-fit: contain; }
  .bb-switch-track { position: relative; width: 28px; height: 16px; flex-shrink: 0; border-radius: 999px; background: #2a2e44; transition: background .2s; }
  .bb-switch-track-on { background: #6c63ff; }
  .bb-switch-gold .bb-switch-track-on { background: #f8ad1a; }
  .bb-switch-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: left .2s; }
  .bb-switch-track-on .bb-switch-knob { left: 14px; }

  .bb-header-meta { display: flex; height: 38px; align-items: center; gap: 16px; padding: 0 16px; border-radius: 8px; background: #131520; }
  .bb-header-meta-item { display: flex; align-items: center; gap: 6px; }
  .bb-header-meta-label { color: #6c7399; font-size: 12px; font-weight: 500; }
  .bb-header-meta-value { display: inline-flex; align-items: center; gap: 5px; color: #e1e4f2; font-size: 14px; font-weight: 600; }
  .bb-header-meta-value img { width: 15px; height: 15px; }
  .bb-header-meta-divider { width: 1px; height: 16px; background: #252839; }
  .bb-fast-spin { display: inline-flex; width: 38px; height: 38px; flex-shrink: 0; align-items: center; justify-content: center; padding: 0; border: 1px solid #1b1e2c; border-radius: 6px; background: #131520; color: #fff; cursor: pointer; transform-origin: center; transition: transform var(--dur-fast) var(--ease-out),opacity .15s ease; }
  .bb-fast-spin:active { transform: scale(var(--press-scale)); }
  .bb-fast-spin:focus-visible { outline: 2px solid #8079ff; outline-offset: 2px; }
  .bb-fast-spin svg { display: block; transition: fill .15s ease; }

  .bb-section { margin-bottom: 20px; }
  .bb-section-label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .bb-section-label { color: #6c7399; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; }
  .bb-players-row { display: grid; grid-template-columns: repeat(2,1fr); gap: 8px; }
  .bb-player-group { overflow: hidden; padding: 10px 12px 12px; border-radius: 8px; border-bottom: 2px solid var(--family-color); background: #131520; }
  .bb-player-group-title { margin-bottom: 8px; color: var(--family-color); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
  .bb-player-buttons { display: flex; gap: 4px; }
  .bb-player-button { display: flex; flex: 1; flex-direction: column; align-items: center; gap: 4px; padding: 6px 4px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; transition: background .15s; }
  .bb-player-button:hover { background: rgba(255,255,255,.04); }
  .bb-player-button-active-ffa { background: #1a1a2e; }
  .bb-player-button-active-team { background: #0d1a2e; }
  .bb-player-button-active-group { background: rgba(45,212,191,.08); }
  .bb-player-button-active-ffa:hover { background: #1a1a2e; }
  .bb-player-button-active-team:hover { background: #0d1a2e; }
  .bb-player-button-active-group:hover { background: rgba(45,212,191,.08); }
  .bb-slot-icons { display: flex; align-items: center; gap: 2px; }
  .bb-player-button-label { color: #4a5070; font-size: 10px; font-weight: 700; }
  .bb-player-button-active-ffa .bb-player-button-label,.bb-player-button-active-team .bb-player-button-label { color: #e1e4f2; }
  .bb-player-button-active-group .bb-player-button-label { color: #2dd4bf; }

  .bb-selected-cases { position: relative; display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,173px)); justify-content: start; gap: 8px; max-height: 340px; overflow-y: auto; overflow-x: visible; padding: 10px 10px 10px 0; scrollbar-width: thin; scrollbar-color: #252839 transparent; }
  .bb-add-case { display: flex; min-height: 230px; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 14px; border: 2px dashed #3a3f5c; border-radius: 6px; background: #131520; color: #6c7399; cursor: pointer; transition: border-color .15s; }
  .bb-add-icon { display: flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 7px; background: #1e2235; }
  .bb-add-label { font-size: 11px; font-weight: 600; }

  .bb-selected-card { position: relative; display: flex; flex-direction: column; align-items: center; overflow: hidden; padding: 14px; border-radius: 6px; background: #171925; }
  .bb-selected-card::before { content: ""; position: absolute; inset: 0; background: radial-gradient(120% 120% at 95% 95%,rgba(108,99,255,.16) 0%,rgba(108,99,255,.08) 22%,transparent 58%); opacity: .9; pointer-events: none; }
  .bb-selected-glow { position: absolute; inset: -30px; z-index: 0; width: calc(100% + 60px); height: calc(100% + 60px); object-fit: cover; opacity: .14; filter: blur(48px) saturate(110%); transform: scale(1.22); transition: opacity .18s ease,filter .22s ease,transform .22s ease; pointer-events: none; }
  .bb-selected-card:hover .bb-selected-glow { opacity: .2; filter: blur(54px) saturate(125%); transform: scale(1.28); }
  .bb-drag-handle { position: absolute; z-index: 3; top: 8px; left: 8px; color: #3a3e55; font-size: 10px; user-select: none; }
  .bb-selected-name { position: relative; z-index: 2; max-width: 180px; overflow: hidden; color: rgba(255,255,255,.9); font-size: 14px; font-weight: 600; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  .bb-selected-image-wrap { position: relative; z-index: 2; display: flex; width: 120px; height: 120px; align-items: center; justify-content: center; margin: 12px 0; }
  .bb-selected-image { width: 120px; height: 120px; object-fit: cover; filter: drop-shadow(0 10px 16px rgba(0,0,0,.45)); }
  .bb-remove-case { position: relative; z-index: 2; display: flex; width: 85%; height: 34px; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: #2a2e44; color: #e1e4f2; cursor: pointer; }
  .bb-remove-price,.bb-remove-label { display: inline-flex; align-items: center; gap: 6px; color: rgba(225,228,242,.95); font-size: 14px; font-weight: 600; }
  .bb-remove-label { display: none; color: #ef4444; font-size: 13px; }
  .bb-remove-case:hover { background: rgba(220,38,38,.18); }
  .bb-remove-case:hover .bb-remove-price { display: none; }
  .bb-remove-case:hover .bb-remove-label { display: inline-flex; }
  .bb-remove-case:active { transform: scale(.97); }
  .bb-remove-case img { width: 16px; height: 16px; }

  .bb-mode-list { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  .bb-mode-item { display: flex; align-items: flex-start; gap: 12px; padding: 14px; border: 0; border-left: 2px solid var(--mode-color); border-radius: 8px; background: #131520; text-align: left; cursor: pointer; transition: background .15s; }
  .bb-mode-item:hover { background: #171925; }
  .bb-mode-item-active { background: color-mix(in srgb,var(--mode-color) 9%,transparent); }
  .bb-mode-item-active:hover { background: color-mix(in srgb,var(--mode-color) 9%,transparent); }
  .bb-mode-icon { display: inline-flex; width: 24px; height: 24px; flex-shrink: 0; align-items: center; justify-content: center; margin-top: 1px; color: var(--mode-color); }
  .bb-mode-icon svg { display: block; width: 24px; height: 24px; }
  .bb-mode-icon-group svg,.bb-mode-icon-coinflip svg,.bb-mode-icon-jackpot svg { width: 22px; height: 22px; }
  .bb-mode-content { flex: 1; min-width: 0; }
  .bb-mode-title { display: block; margin-bottom: 3px; color: #e1e4f2; font-size: 13px; font-weight: 600; }
  .bb-mode-item-active .bb-mode-title { color: var(--mode-color); }
  .bb-mode-desc { display: block; color: #6c7399; font-size: 11px; font-weight: 500; line-height: 1.5; }
  .bb-create-header-right > .bb-btn { white-space: nowrap; }

  .bb-picker-backdrop,.bb-preview-backdrop,.bb-fairness-backdrop {
    position: fixed;
    z-index: 9999;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,.55);
    animation: bb-fade-in .18s ease-out both;
  }
  .bb-picker-backdrop { z-index: 999; }

  .bb-picker {
    position: relative;
    width: 90%;
    max-width: 1000px;
    overflow-y: auto;
    padding: 14px;
    border: 0;
    border-radius: 6px;
    background: #131520;
    color: rgba(255,255,255,.92);
    animation: bb-modal-open .18s ease-out both;
  }

  @keyframes bb-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes bb-modal-open { from { opacity: 0; transform: scale(.985); } to { opacity: 1; transform: scale(1); } }
  @keyframes bb-picker-close { to { opacity: 0; transform: scale(.98); } }
  .bb-picker-closing { animation: bb-picker-close .16s forwards; }
  .bb-modal-close { position: absolute; z-index: 50; top: 5px; right: 10px; padding: 0; border: 0; background: none; color: #fff; font-size: 24px; line-height: 1; opacity: .8; cursor: pointer; transition: opacity .3s ease,transform .2s ease; }
  .bb-modal-close:hover { opacity: 1; }
  .bb-picker-header { display: flex; width: 100%; align-items: center; justify-content: flex-start; gap: 12px; box-sizing: border-box; margin: 4px 0 12px; padding-right: 48px; }
  .bb-picker-search-row { display: flex; align-items: center; gap: 10px; }
  .bb-picker-input-wrap { position: relative; display: flex; flex-grow: 1; }
  .bb-picker-input { width: 300px; height: 40px; box-sizing: border-box; padding: 10px 18px; border: 2px solid #323240; border-radius: 5px; outline: 0; background: #1c1f2e; box-shadow: 0 10px 7.8px rgba(0,0,0,.15); color: #fff; font-size: .9rem; opacity: .9; text-align: center; }
  .bb-picker-input::placeholder { color: #cbd5e1; text-align: center; }
  .bb-picker-search-icon { position: absolute; z-index: 1; top: 50%; left: 15px; width: 20px; height: 20px; color: #cbd5e1; transform: translateY(-50%); pointer-events: none; }
  .bb-sort { display: inline-flex; width: 40px; height: 40px; min-width: 40px; flex-shrink: 0; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; background: #20222f; color: #e1e4f2; cursor: pointer; transition: background .15s; }
  .bb-sort:hover { background: #2a2e44; }
  .bb-sort:active { transform: scale(.97); }
  .bb-sort:focus-visible { outline: 2px solid #8079ff; outline-offset: 2px; }
  .bb-picker-grid-wrap { position: relative; height: 440px; overflow-x: hidden; overflow-y: auto; margin-top: 14px; padding: 12px; scrollbar-color: rgba(255,255,255,.08) transparent; }
  .bb-picker-grid-wrap::-webkit-scrollbar { width: 8px; }
  .bb-picker-grid-wrap::-webkit-scrollbar-track { background: transparent; }
  .bb-picker-grid-wrap::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255,255,255,.08); }
  .bb-picker-grid-wrap::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.12); }
  .bb-picker-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(170px,1fr)); gap: 10px; }
  .bb-picker-card { min-width: 170px; cursor: pointer; user-select: none; }
  .bb-picker-card-inner { position: relative; display: flex; flex-direction: column; align-items: center; overflow: hidden; padding: 14px; border-radius: 6px; background: #171925; }
  .bb-picker-card-inner::before { content: ""; position: absolute; inset: 0; background: radial-gradient(120% 120% at 95% 95%,rgba(108,99,255,.16) 0%,rgba(108,99,255,.08) 22%,transparent 58%); opacity: .9; pointer-events: none; }
  .bb-picker-glow { position: absolute; inset: -30px; z-index: 0; width: calc(100% + 60px); height: calc(100% + 60px); object-fit: cover; opacity: .14; filter: blur(48px) saturate(110%); transform: scale(1.22); pointer-events: none; transition: opacity .18s ease,filter .22s ease,transform .22s ease; }
  .bb-picker-card:hover .bb-picker-glow { opacity: .2; filter: blur(54px) saturate(125%); transform: scale(1.28); }
  .bb-picker-eye { position: absolute; z-index: 3; top: 8px; left: 8px; display: flex; width: 32px; height: 32px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #fff; opacity: 0; transform: translateY(-6px) scale(.98); pointer-events: none; transition: opacity .16s ease,transform .16s ease; }
  .bb-picker-card:hover .bb-picker-eye,.bb-picker-eye:focus-visible { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
  .bb-picker-name { position: relative; z-index: 2; max-width: 100%; overflow: hidden; color: rgba(255,255,255,.9); font-size: 14px; font-weight: 500; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  .bb-picker-image-wrap { position: relative; z-index: 2; display: flex; width: 120px; height: 120px; align-items: center; justify-content: center; margin: 12px 0; }
  .bb-picker-image { width: 120px; height: 120px; object-fit: cover; filter: drop-shadow(0 10px 16px rgba(0,0,0,.45)); }
  .bb-picker-price { position: relative; z-index: 2; display: flex; width: 85%; height: 34px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; background: #2a2e44; color: #e1e4f2; font-size: 14px; font-weight: 600; cursor: pointer; transition: background .25s ease,transform .1s ease; }
  .bb-picker-price:hover { background: #32385a; }
  .bb-picker-price:active { transform: scale(.97); }
  .bb-picker-price span { display: inline-flex; align-items: center; gap: 6px; }
  .bb-picker-price img { width: 16px; height: 16px; }
  .bb-picker-quantity { position: relative; z-index: 2; display: flex; width: 85%; align-items: center; justify-content: center; gap: 5px; box-sizing: border-box; margin-top: 0; padding: 3px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: #1c1f2e; }
  .bb-picker-quantity-button { display: flex; width: 22px; height: 22px; flex-shrink: 0; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 4px; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; transition: transform .1s ease,opacity .2s ease; }
  .bb-picker-quantity-button:hover { opacity: .92; }
  .bb-picker-quantity-button:active { transform: scale(.95); }
  .bb-picker-quantity-button:disabled { cursor: not-allowed; opacity: .4; }
  .bb-picker-quantity-minus { background: #ef4444; }
  .bb-picker-quantity-plus { background: #10b981; }
  .bb-picker-quantity-input { width: 40px; box-sizing: border-box; padding: 3px; border: 0; border-radius: 4px; outline: 0; background: #1c1f2e; color: #fff; font-size: .82rem; text-align: center; -moz-appearance: textfield; }
  .bb-picker-quantity-input::-webkit-outer-spin-button,.bb-picker-quantity-input::-webkit-inner-spin-button { margin: 0; -webkit-appearance: none; }
  .bb-picker-empty { display: grid; min-height: 380px; place-items: center; color: rgba(255,255,255,.55); font-size: 13px; font-weight: 600; }
  .bb-picker-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; }
  .bb-picker-stats { display: flex; align-items: center; gap: 8px; }
  .bb-picker-stat { display: flex; height: 38px; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 8px; background: #1c1f2e; }
  .bb-picker-stat-label { color: #6c7399; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; white-space: nowrap; }
  .bb-picker-stat-value { display: inline-flex; align-items: center; gap: 4px; color: #e1e4f2; font-size: 14px; font-weight: 600; white-space: nowrap; }
  .bb-picker-stat-value img { width: 13px; height: 13px; margin-right: 4px; }
  .bb-picker-footer > .bb-btn { min-width: 130px; white-space: nowrap; }

  @keyframes bb-battle-page-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .bb-battle { container-type: inline-size; min-height: 100%; padding: 18px 22px 30px; color: rgba(255,255,255,.9); background: transparent; animation: bb-battle-page-in .35s ease-out both; }
  .bb-battle-shell { max-width: 1220px; margin: 0 auto; }
  .bb-battle-top { display: flex; max-width: 1220px; align-items: center; justify-content: space-between; gap: 12px; margin: 0 auto; padding: 8px 0 14px; }
  .bb-battle-top-left { display: flex; align-items: center; gap: 10px; }
  .bb-battle-top-right { display: flex; align-items: center; gap: 8px; }
  .bb-battle-back { display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border: 0; border-radius: 10px; background: transparent; color: rgba(255,255,255,.78); font-weight: 600; cursor: pointer; }
  .bb-battle-back:hover { background: rgba(255,255,255,.06); color: rgba(255,255,255,.95); }
  .bb-battle-back-icon { color: rgba(255,255,255,.9); }
  .bb-battle-cost { display: flex; align-items: center; gap: 8px; padding: 0; border: 0; background: transparent; color: #fff; font-weight: 600; }
  .bb-battle-cost img { width: 16px; height: 16px; }
  .bb-icon-action { display: inline-flex; height: 40px; align-items: center; justify-content: center; gap: 8px; padding: 0 10px; border: 0; border-radius: 8px; outline: none; box-shadow: none; background: transparent; color: #e1e4f2; font-size: 14px; font-weight: 600; white-space: nowrap; cursor: pointer; transform-origin: center; transition: opacity .15s ease,transform .1s ease; }
  .bb-icon-action:hover { background: transparent; opacity: .75; }
  .bb-icon-action:active { transform: scale(.97); }
  .bb-icon-action:focus-visible { outline: 2px solid #8079ff; outline-offset: 2px; }

  .bb-battle-meta { position: relative; display: grid; min-height: 73px; grid-template-columns: 1fr 1fr; align-items: center; width: 100%; margin-bottom: 14px; }
  .bb-battle-meta-left { display: flex; min-width: 0; align-items: center; gap: 8px; justify-self: start; }
  .bb-mode-badges { display: inline-flex; align-items: center; gap: 4px; line-height: 1; white-space: nowrap; }
  .bb-mode-badge { display: inline-flex; width: 26px; height: 26px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 8px; color: var(--battle-mode-color); background: color-mix(in srgb,var(--battle-mode-color) 13%,transparent); cursor: default; }
  .bb-mode-badge .bb-mode-icon { width: 15px; height: 15px; margin: 0; }
  .bb-mode-badge .bb-mode-icon svg { width: 15px; height: 15px; }
  .bb-meta-divider { width: 1px; height: 14px; flex-shrink: 0; background: rgba(255,255,255,.15); }
  .bb-meta-type { color: rgba(255,255,255,.45); font-size: 13px; font-weight: 500; white-space: nowrap; }
  .bb-case-strip { position: absolute; top: 50%; left: 50%; display: block; width: 203px; min-width: 203px; max-width: 203px; height: 65px; overflow: hidden; box-sizing: border-box; margin: -32.5px 0 0 -101.5px; padding: 0; }
  .bb-case-strip-track { display: flex; width: max-content; align-items: center; padding: 0; margin: 0; transition: transform .45s cubic-bezier(.4,0,.2,1); will-change: transform; }
  .bb-strip-case { display: flex; width: 65px; min-width: 65px; max-width: 65px; height: 65px; flex-grow: 0; flex-shrink: 0; align-items: center; justify-content: center; overflow: hidden; box-sizing: border-box; margin: 0; padding: 0; border: 0; background: transparent; opacity: .35; cursor: pointer; transition: opacity .35s; }
  .bb-strip-case-active { opacity: 1; transform: scale(1); }
  .bb-strip-case img { display: block; width: 65px; height: 65px; box-sizing: border-box; object-fit: contain; padding: 0; margin: 0; cursor: pointer; }
  .bb-battle-meta-right { display: flex; min-width: 0; justify-content: flex-end; justify-self: end; color: rgba(255,255,255,.65); font-size: 12px; font-weight: 700; letter-spacing: .2px; }

  .bb-reel-box { position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,.04); border-radius: 10px; background: #131520; }
  .bb-reel-inner { position: relative; overflow: hidden; padding: 4px; border-radius: 10px; background: #131520; }
  .bb-spinner-wrap { position: relative; display: flex; width: 100%; min-height: 348px; flex-direction: column; align-items: stretch; justify-content: center; overflow: hidden; box-sizing: border-box; padding: 4px; border-radius: 10px; }
  .bb-spinner { position: relative; z-index: 1; display: flex; width: 100%; height: 340px; align-items: center; justify-content: center; overflow: hidden; box-sizing: border-box; padding: 2px; border-radius: 10px; background: #131520; }
  .bb-spinner-countdown,.bb-spinner-countdown .bb-spinner-inner,.bb-spinner-countdown .bb-spinner-column { background: #000 !important; filter: none !important; backdrop-filter: none !important; }
  .bb-spinner-countdown .bb-spinner-column::after { display: none; }
  .bb-spinner-hide-reels .bb-spinner-inner { visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
  .bb-spinner-inner { position: relative; display: flex; width: 100%; height: 100%; min-width: 0; flex: 1 1 auto; overflow: hidden; box-sizing: border-box; border-radius: 8px; background: rgba(0,0,0,.72); }
  .bb-spinner-column { position: relative; display: flex; width: auto; min-width: 0; height: 100%; flex: 1; }
  .bb-spinner-column::after { content: ""; position: absolute; z-index: 5; top: 0; right: 0; width: 1px; height: 100%; background: linear-gradient(180deg,transparent,rgba(255,255,255,.05) 18%,rgba(255,255,255,.16),rgba(255,255,255,.05) 82%,transparent); pointer-events: none; }
  .bb-spinner-column:last-child::after { display: none; }
  .bb-ready,.bb-waiting { display: flex; width: 100%; height: 100%; flex-direction: column; align-items: center; justify-content: center; }
  .bb-ready-text,.bb-waiting-text { display: flex; align-items: center; color: rgba(255,255,255,.66); font-size: 14px; font-weight: 700; }
  .bb-ready-text span { color: rgba(220,225,255,.95); }
  .bb-mini-button { height: 40px; min-width: 0; margin-top: 12px; padding: 0 14px; }
  .bb-spinner-footer { position: absolute; z-index: 50; right: 0; bottom: 14px; left: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
  .bb-spinner-footer > * { pointer-events: auto; }
  .bb-spinner-note { color: rgba(255,255,255,.6); font-size: 12px; font-weight: 700; letter-spacing: .2px; text-align: center; text-shadow: 0 1px 4px rgba(0,0,0,.6); }
  .bb-wheel { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; overflow: hidden; }
  .bb-wheel-track { width: 100%; height: 100%; backface-visibility: hidden; will-change: transform; }
  .bb-reel-item { position: relative; display: flex; width: 100%; height: 105px; align-items: center; justify-content: center; margin-bottom: 20px; opacity: .25; transition: opacity .28s cubic-bezier(.4,0,.2,1); }
  .bb-reel-item.is-active { opacity: 1; }
  .bb-reel-image { position: relative; display: flex; width: 105px; height: 105px; flex: 0 0 105px; align-items: center; justify-content: center; transition: transform .18s ease; }
  .bb-reel-image::before { content: ""; position: absolute; z-index: 0; top: 50%; left: 50%; width: 115%; height: 115%; border-radius: 50%; background: radial-gradient(ellipse at center,var(--reel-glow,rgba(108,108,108,.32)) 0%,transparent 65%); filter: blur(14px); opacity: 0; transform: translate(-50%,-50%); transition: opacity .4s cubic-bezier(.4,0,.2,1); }
  .bb-reel-image img { position: absolute; z-index: 1; top: 50%; left: 50%; width: 88px; height: 88px; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,.3)); transform: translate(-50%,-50%); transition: transform .45s cubic-bezier(.34,1.56,.64,1),filter .4s ease; }
  .bb-reel-item.is-active .bb-reel-image::before { opacity: 1; }
  .bb-reel-item.is-active .bb-reel-image img { transform: translate(-50%,-50%) scale(1.18); filter: drop-shadow(0 0 12px var(--reel-glow-shadow,rgba(108,108,108,.55))) drop-shadow(0 4px 10px rgba(0,0,0,.3)); }
  .bb-reel-result { display: flex; max-width: calc(100% - 115px); margin-left: 18px; flex-direction: column; align-items: flex-start; justify-content: center; gap: 5px; pointer-events: none; animation: bb-reel-result-in .3s cubic-bezier(.4,0,.2,1) both; }
  @keyframes bb-reel-result-in { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
  .bb-reel-result-name { width: 100%; margin-bottom: 6px; overflow: hidden; color: rgba(220,225,255,.65); font-size: 15px; font-weight: 600; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
  .bb-reel-result-value { display: flex; margin-top: 6px; align-items: center; justify-content: flex-start; gap: 8px; color: #fff; font-size: 14px; font-weight: 700; }
  .bb-reel-result-value img { width: 18px; height: 18px; object-fit: contain; }
  .bb-spinner-six-player .bb-reel-item.is-result .bb-reel-image { transform: translateY(-22px); }
  .bb-spinner-six-player .bb-reel-image { width: 72px; height: 105px; flex-basis: 72px; }
  .bb-spinner-six-player .bb-reel-image img { width: 66px; height: 66px; }
  .bb-spinner-six-player .bb-reel-item.is-active .bb-reel-image img { transform: translate(-50%,-50%) scale(1.12); }
  .bb-spinner-six-player .bb-reel-result { position: absolute; z-index: 8; top: 70px; left: 2px; width: calc(100% - 4px); max-width: none; margin-left: 0; align-items: center; gap: 0; }
  .bb-spinner-six-player .bb-reel-result-name { display: -webkit-box; width: 100%; margin: 0 0 2px; overflow: hidden; color: rgba(225,228,242,.9); font-size: 9px; line-height: 1.1; text-align: center; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .bb-spinner-six-player .bb-reel-result-value { margin-top: 1px; justify-content: center; gap: 3px; font-size: 10px; line-height: 1; white-space: nowrap; }
  .bb-spinner-six-player .bb-reel-result-value img { width: 11px; height: 11px; }

  .bb-countdown { position: absolute; z-index: 100; inset: 0; display: grid; place-items: center; background: #000 !important; opacity: 1; filter: none !important; backdrop-filter: none !important; }
  .bb-countdown-column { width: 100%; height: 100%; background: #000; }
  .bb-countdown-center { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .bb-countdown-title { margin-bottom: 8px; color: rgba(255,255,255,.32); font-size: 15px; font-weight: 500; line-height: 1; text-transform: uppercase; letter-spacing: 2.5px; }
  .bb-countdown-number { color: #fff; font-size: 68px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; animation: bb-countdown-up .38s cubic-bezier(.22,1,.36,1) both; }
  @keyframes bb-countdown-up { from { opacity: 0; transform: translateY(60%); } to { opacity: 1; transform: translateY(0); } }

  .bb-winner-overlay { position: absolute; z-index: 60; inset: 0; display: grid; place-items: center; overflow: hidden; padding: 14px; border-radius: 10px; background: rgba(0,0,0,.88); }
  .bb-winner-panel { text-align: center; animation: bb-winner-pop .36s cubic-bezier(.2,.9,.2,1) both; }
  @keyframes bb-winner-pop { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .bb-winner-title { margin-bottom: 12px; color: rgba(255,214,106,.95); font-size: 20px; font-weight: 700; letter-spacing: .2px; }
  .bb-winner-avatar-wrap { display: flex; width: auto; height: auto; align-items: center; justify-content: center; margin: 0 auto 8px; padding: 0; border-radius: 0; background: none; }
  .bb-winner-avatar-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; }
  .bb-winner-avatar { display: flex; width: 46px; height: 46px; align-items: center; justify-content: center; overflow: hidden; padding: 0; border: 2px solid #22283f; border-radius: 999px; background: #1c1f2e; cursor: pointer; }
  .bb-winner-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .bb-winner-name { max-width: 260px; overflow: hidden; margin: 0 auto 6px; color: rgba(255,255,255,.92); font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .bb-winner-amount { display: flex; align-items: center; justify-content: center; gap: 6px; color: rgba(255,255,255,.92); font-weight: 700; }
  .bb-winner-amount img { width: 16px; height: 16px; opacity: .95; }
  .bb-winner-sub { margin-top: 6px; color: rgba(255,255,255,.62); font-size: 12px; font-weight: 700; }
  .bb-winner-tie-note { margin-top: 8px; opacity: .85; }
  .bb-recreate { margin-top: 16px; padding: 0 18px; font-size: 13px; letter-spacing: .4px; }

  .bb-bottom-box { position: relative; overflow: hidden; margin-top: 14px; padding: 14px; border-radius: 6px; background: #1c1f2e; }
  .bb-players-scroller-outer { position: relative; z-index: 3; width: 100%; overflow: hidden; border-radius: 10px; }
  .bb-players-scroller { display: grid; width: 100%; grid-template-columns: repeat(var(--player-cols),minmax(0,1fr)); align-items: start; justify-items: stretch; gap: 18px; box-sizing: border-box; overflow: hidden; padding: 10px; border-radius: 10px; background: #181b27; isolation: isolate; }
  .bb-player-card-wrap { width: 100%; min-width: 0; overflow: hidden; box-sizing: border-box; }
  .bb-player-card { width: 100%; min-width: 0; overflow: hidden; box-sizing: border-box; padding: 14px; border-radius: 6px; background: #131520; }
  .bb-player-top { position: relative; display: flex; min-height: 108px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 8px 6px 12px; }
  .bb-player-avatar { width: 60px; height: 60px; overflow: hidden; padding: 0; border: 3.5px solid rgba(255,255,255,.1); border-radius: 999px; background: rgba(255,255,255,.05); }
  .bb-player-avatar:disabled { cursor: default; opacity: .75; }
  .bb-player-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 999px; }
  .bb-player-meta { display: flex; width: 100%; min-width: 0; flex-direction: column; align-items: center; gap: 8px; }
  .bb-player-name { display: block; max-width: 240px; overflow: hidden; color: rgba(255,255,255,.9); font-size: 14px; font-weight: 700; letter-spacing: .2px; text-overflow: ellipsis; white-space: nowrap; }
  .bb-player-total { position: relative; display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 8px; overflow: hidden; padding: 0 14px; border: 0 solid rgba(255,255,255,.08); border-radius: 6px; background: rgba(12,12,22,.62); color: rgba(255,255,255,.85); font-size: 13px; font-weight: 600; }
  .bb-player-total-glow { position: absolute; inset: 0; opacity: .2; pointer-events: none; }
  .bb-player-total img { width: 14px; height: 14px; object-fit: contain; opacity: .95; }
  .bb-player-total > img,.bb-player-total > span:not(.bb-player-total-glow) { position: relative; z-index: 1; }
  .bb-player-results { display: grid; min-width: 0; gap: 6px; overflow: hidden; }
  .bb-waiting-item { display: grid; height: 92px; place-items: center; border: 1px solid rgba(255,255,255,.06); border-radius: 10px; background: rgba(12,12,22,.55); color: rgba(255,255,255,.55); font-weight: 700; letter-spacing: .3px; }
  .bb-result-item { display: flex; width: 100%; min-width: 0; align-items: center; overflow: hidden; box-sizing: border-box; padding: 10px; border: 1px solid #1e2235; border-bottom: 3px solid rgb(var(--rarity)); border-radius: 8px; background: #151723; animation: bb-item-in .32s cubic-bezier(.2,0,.2,1) both; }
  @keyframes bb-item-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  .bb-result-image-wrap { position: relative; width: 38px; height: 38px; flex-shrink: 0; margin-right: 8px; }
  .bb-result-blur { position: absolute; z-index: 0; inset: 0; width: 100%; height: 100%; border-radius: 8px; object-fit: contain; opacity: .6; filter: blur(9px); }
  .bb-result-image { position: relative; z-index: 1; width: 100%; height: 100%; border-radius: 8px; object-fit: contain; }
  .bb-result-details { display: flex; min-width: 0; flex: 1; flex-direction: column; overflow: hidden; }
  .bb-result-name { display: block; max-width: 100%; overflow: hidden; color: rgba(255,255,255,.85); font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .bb-result-value { display: inline-flex; align-items: center; gap: 6px; color: rgb(var(--rarity)); font-size: 16px; font-weight: 700; white-space: nowrap; }
  .bb-result-value img { width: 14px; height: 14px; flex: 0 0 auto; margin: 0; }
  .bb-vs-overlay { position: absolute; z-index: 50; inset: 0; pointer-events: none; }
  .bb-vs-badge { position: absolute; top: 88px; display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid rgba(108,99,255,.85); border-radius: 10px; background: rgba(24,27,39,.78); backdrop-filter: blur(6px); box-shadow: 0 0 0 1px rgba(108,99,255,.2),0 0 28px rgba(108,99,255,.4); transform: translate(-50%,-50%) rotate(45deg); }
  .bb-vs-badge::before { content: ""; position: absolute; z-index: 0; inset: -5px; border-radius: 50px; background: radial-gradient(100% 100% at 75% 75%,rgba(108,99,255,.55) 50%,rgba(108,99,255,.1) 45%,rgba(108,99,255,0)); filter: blur(8px); opacity: .9; }
  .bb-vs-icon { position: relative; z-index: 1; width: 18px; height: 18px; opacity: .95; transform: rotate(-45deg); }
  .bb-vs-icon svg { display: block; width: 100%; height: 100%; }

  .bb-fairness-backdrop { z-index: 2147483100; padding: 20px; box-sizing: border-box; background: rgba(0,0,0,.58); transition: opacity 180ms ease; }
  .bb-fairness-backdrop.is-closing { opacity: 0; }
  .bb-fairness-modal { position: relative; box-sizing: border-box; width: 90%; max-width: 600px; max-height: 90vh; margin: 0; padding: 2rem; overflow-x: hidden; overflow-y: auto; border: 1px solid #181a28; border-radius: 5px; background: #131520; color: #e1e4f2; box-shadow: 0 20px 80px #0000008c; font-family: Poppins,sans-serif; animation: bb-fairness-modal-in .3s ease-out both; transition: opacity 180ms ease,transform 180ms ease; }
  .bb-fairness-modal.is-closing { opacity: 0; transform: scale(.97) translateY(6px); }
  .bb-fairness-close { position: absolute; top: 12px; right: 14px; display: grid; width: 34px; height: 34px; place-items: center; padding: 0; border: 0; background: transparent; color: rgba(255,255,255,.76); font-size: 25px; line-height: 1; cursor: pointer; transition: color 140ms ease,transform 140ms ease; }
  .bb-fairness-close:hover { color: #fff; }
  .bb-fairness-close:active { transform: scale(.92); }
  .bb-fairness-header { margin: 0 38px 12px 0; color: #fff; font-size: 24px; font-weight: 700; line-height: 1.25; }
  .bb-fairness-hint { margin: 0 0 22px; color: #a6b2d3; font-size: 12px; font-weight: 500; line-height: 1.65; }
  .bb-fairness-section + .bb-fairness-section { margin-top: 19px; }
  .bb-fairness-section-title { display: block; margin-bottom: 8px; color: rgba(255,255,255,.68); font-size: 13px; font-weight: 600; }
  .bb-fairness-input { display: flex; min-width: 0; min-height: 42px; box-sizing: border-box; align-items: center; gap: 10px; padding: 12px 13px; border: 0; border-radius: 6px; background: #1c1f2e; }
  .bb-fairness-value { display: block; min-width: 0; flex: 1; overflow: hidden; color: rgba(255,255,255,.88); font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size: 13px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; user-select: text; }
  .bb-fairness-copy { display: inline-flex; width: 18px; height: 18px; flex: 0 0 18px; align-items: center; justify-content: center; margin: 0; padding: 0; border: 0; outline: none; background: transparent; color: #fff; cursor: pointer; transition: color 140ms ease; }
  .bb-fairness-copy svg { width: 18px; height: 18px; }
  .bb-fairness-copy:hover { color: rgba(255,255,255,.72); }
  .bb-fairness-copy:active { transform: scale(.93); }
  .bb-fairness-copy:focus-visible { outline: 2px solid #8079ff; outline-offset: 3px; }
  .bb-fairness-pending { margin: 12px 0 0; color: #6c7399; font-size: 11px; font-weight: 500; line-height: 1.55; text-align: center; }
  @keyframes bb-fairness-modal-in { from { opacity: 0; transform: scale(.96) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

  @keyframes case-preview-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes case-preview-fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @keyframes case-preview-open {
    from { transform: scale(.8); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  @keyframes case-preview-close {
    from { transform: scale(1); opacity: 1; }
    to { transform: scale(.8); opacity: 0; }
  }

  .case-preview-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, .5);
    animation: case-preview-fade-in .5s ease-out;
  }

  .case-preview-backdrop-closing {
    animation: case-preview-fade-out .2s ease-out forwards;
  }

  .case-preview-modal {
    position: relative;
    width: 90%;
    max-width: 750px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 15px;
    box-sizing: border-box;
    border: 1px solid #181a28;
    border-radius: 10px;
    background: #131520;
    color: #fff;
    font-family: Poppins, sans-serif;
    animation: case-preview-open .3s forwards;
    scrollbar-width: thin;
    scrollbar-color: #6c63ff transparent;
  }

  .case-preview-modal::-webkit-scrollbar,
  .case-preview-items-wrapper::-webkit-scrollbar {
    width: 4px !important;
    background-color: transparent;
  }

  .case-preview-modal::-webkit-scrollbar-track,
  .case-preview-items-wrapper::-webkit-scrollbar-track {
    border-radius: 10px;
    background-color: transparent;
  }

  .case-preview-modal::-webkit-scrollbar-thumb,
  .case-preview-items-wrapper::-webkit-scrollbar-thumb {
    border-radius: 50px;
    background-color: #6c63ff;
    opacity: .6;
  }

  .case-preview-modal-closing {
    animation: case-preview-close .2s forwards;
  }

  .case-preview-modal::before {
    display: none;
    content: "";
  }

  .case-preview-close {
    position: absolute;
    top: 5px;
    right: 10px;
    z-index: 10;
    padding: 0;
    border: none;
    background: none;
    color: #fff;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    opacity: .8;
    transition: opacity .3s ease, transform .2s ease;
  }

  .case-preview-close:hover,
  .case-preview-close:focus-visible {
    opacity: 1;
  }

  .case-preview-close:focus-visible {
    outline: 2px solid #6c63ff;
    outline-offset: 2px;
  }

  .case-preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 12px;
    margin-top: 5px;
    margin-bottom: 10px;
  }

  .case-preview-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .case-preview-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    overflow: hidden;
    flex-shrink: 0;
    border-radius: 8px;
    background: transparent;
  }

  .case-preview-thumb img {
    width: 72px;
    height: 72px;
    object-fit: contain;
  }

  .case-preview-thumb .case-preview-thumb-image-catalog {
    transform: scale(1.3);
  }

  .case-preview-thumb .case-preview-thumb-image-inferno {
    transform: translateY(3px) scale(1.105);
  }

  .case-preview-thumb .case-preview-thumb-image-beach {
    transform: scale(0.95);
  }

  .case-preview-texts {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .case-preview-name {
    overflow: hidden;
    color: #e1e4f2;
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .case-preview-price-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    padding: 3px 8px;
    border-radius: 6px;
    background: #1c1f2e;
  }

  .case-preview-price {
    color: #e1e4f2;
    font-size: 13px;
    font-weight: 700;
  }

  .case-preview-items-wrapper {
    position: relative;
    height: 350px;
    margin-top: 15px;
    padding: 12px;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    border-radius: 6px;
    background: #1c1f2e;
    scrollbar-width: thin;
    scrollbar-color: #6c63ff transparent;
  }

  .case-preview-items-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
  }

  .case-preview-item {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    height: 170px;
    padding: 8px;
    box-sizing: border-box;
    border: none;
    border-radius: 6px;
    cursor: default;
    overflow: hidden;
    transition: transform .2s ease;
  }

  .case-preview-item::before {
    position: absolute;
    inset: 0;
    z-index: 0;
    padding: 2px;
    border-radius: 6px;
    background: linear-gradient(to bottom, transparent 0%, var(--item-border-side, rgba(108, 99, 255, .25)) 55%, var(--item-border-bottom, rgba(108, 99, 255, .7)) 100%);
    content: "";
    pointer-events: none;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }

  .case-preview-item:hover {
    transform: scale(1.03);
  }

  .case-preview-chance-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 5;
    padding: 3px 7px;
    border: 1px solid #252839;
    border-radius: 6px;
    background: #20222f;
    color: rgba(225, 228, 242, .9);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
  }

  .case-preview-chance {
    display: inline;
  }

  .case-preview-range {
    display: none;
  }

  .case-preview-item:hover .case-preview-chance {
    display: none;
  }

  .case-preview-item:hover .case-preview-range {
    display: inline;
  }

  .case-preview-item-blur {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 0;
    width: 80%;
    height: 80%;
    opacity: .35;
    object-fit: contain;
    filter: blur(18px);
    transform: translate(-50%, -60%);
    pointer-events: none;
  }

  .case-preview-image-wrapper {
    position: relative;
    width: 100%;
    height: 118px;
    overflow: hidden;
    flex: 0 0 118px;
    border-radius: 8px;
  }

  .case-preview-item-image {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    border-radius: 8px;
    object-fit: contain;
  }

  .case-preview-item-details {
    position: relative;
    z-index: 2;
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 32px;
    min-height: 32px;
    margin-top: 4px;
    flex: 0 0 32px;
    gap: 1px;
    overflow: hidden;
    text-align: center;
  }

  .case-preview-item-name,
  .case-preview-item-price {
    margin: 0;
  }

  .case-preview-item-name {
    display: block;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    color: #ccd9fa;
    font-size: 12px;
    font-weight: 600;
    line-height: 14px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .case-preview-item-price {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    line-height: 15px;
    white-space: nowrap;
  }

  .case-preview-item-price > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    vertical-align: middle;
  }

  .case-preview-item-price img {
    width: 15px;
    height: 15px;
    margin-right: 6px;
    flex-shrink: 0;
    object-fit: contain;
  }

  .case-preview-item-price > span > span {
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

  @media (max-width: 840px) {
    .case-preview-modal {
      width: 95%;
      max-height: 90vh;
    }
  }

  @media (max-width: 600px) {
    .case-preview-backdrop {
      align-items: flex-end;
      justify-content: flex-end;
      padding: 0;
    }

    .case-preview-modal {
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 100%;
      height: 100dvh;
      max-height: 100dvh;
      padding: 12px 12px 16px;
      overflow: hidden;
      border: none;
      border-radius: 0;
    }

    .case-preview-modal::before {
      display: block;
      width: 36px;
      height: 4px;
      margin: 0 auto 12px;
      flex-shrink: 0;
      border-radius: 2px;
      background: #2a2e44;
    }

    .case-preview-close {
      top: 8px;
      right: 12px;
      font-size: 20px;
    }

    .case-preview-header {
      flex-shrink: 0;
      flex-direction: row;
      gap: 8px;
      margin-top: 8px;
      margin-bottom: 8px;
      padding-right: 36px;
    }

    .case-preview-items-wrapper {
      width: 100%;
      height: auto;
      min-height: 0;
      margin-top: 0;
      padding: 10px;
      flex: 1;
      overflow-y: auto;
      border-radius: 8px;
      -webkit-overflow-scrolling: touch;
    }

    .case-preview-items-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }

    .case-preview-item {
      height: 170px;
      padding: 8px;
    }
  }

  @media (max-width: 1200px) {
    .bb-row { display: flex; flex-wrap: wrap; justify-content: space-around; gap: 12px; padding: 10px; }
    .bb-row-reel { width: 100%; order: 3; }
  }

  @media (max-width: 900px) {
    .bb-battle-meta { grid-template-columns: 1fr; gap: 10px; }
    .bb-case-strip { position: relative; top: auto; left: auto; grid-row: 2; margin: 0 auto; transform: none; }
    .bb-battle-meta-right { justify-self: start; }
  }

  @media (max-width: 840px) {
    .bb-picker { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; box-sizing: border-box; padding: 0 10px 10px; overflow-x: hidden; border: 0; border-radius: 0; }
    .bb-picker-header { flex-direction: column; gap: 12px; padding-right: 0; }
    .bb-picker-search-row,.bb-picker-input-wrap { width: 100%; }
    .bb-picker-input { width: 100%; }
    .bb-picker .bb-modal-close { top: 10px; right: 10px; width: 36px; height: 36px; }
    .bb-picker-grid-wrap { left: 50%; width: 95%; height: auto; min-height: 0; box-sizing: border-box; padding: 10px; flex: 1; overflow-y: auto; transform: translateX(-50%); -webkit-overflow-scrolling: touch; }
    .bb-picker-footer { width: 100%; padding-top: 10px; flex-shrink: 0; }
    .bb-picker-footer > .bb-btn { width: 100%; min-width: 0; }
  }

  @media (max-width: 768px) {
    .bb-row-left { width: 100%; order: 1; }
    .bb-row-reel { height: 92px; order: 2; }
    .bb-row-case { width: 88px; min-width: 88px; height: 88px; }
    .bb-row-case img { width: 68px; height: 68px; }
    .bb-row-right { width: 100%; min-width: 0; order: 3; }
    .bb-cost { width: 100%; min-width: 0; flex-direction: row; }
    .bb-row-view { width: 100%; height: 42px; min-width: 0; }
    .bb-players-scroller { grid-template-columns: repeat(2,minmax(0,1fr)); }
  }

  @media (max-width: 640px) {
    .bb-fairness-backdrop { padding: 8px; }
    .bb-fairness-modal { width: 100%; max-height: calc(100dvh - 16px); padding: 1.25rem; }
    .bb-fairness-header { font-size: 20px; }
    .bb-stats { grid-template-columns: 1fr; }
    .bb-create-inner { padding: 14px 10px 36px; }
    .bb-create-header { gap: 10px; margin-bottom: 16px; }
    .bb-create-title-wrap { width: 100%; }
    .bb-create-title { min-width: 0; flex: 1; font-size: 19px; }
    .bb-create-header-right { display: grid; width: 100%; grid-template-columns: auto minmax(0,1fr) auto; gap: 8px; }
    .bb-create-header-right > .bb-btn { height: 38px; min-width: 92px; padding-inline: 12px; }
    .bb-header-meta { width: 100%; min-width: 0; justify-content: center; box-sizing: border-box; gap: 10px; padding-inline: 10px; }
    .bb-section { margin-bottom: 14px; }
    .bb-selected-cases { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; max-height: none; padding: 6px 0; }
    .bb-add-case { min-height: 190px; padding: 10px; }
    .bb-selected-card { min-width: 0; padding: 9px; }
    .bb-selected-name { width: 100%; font-size: 12px; }
    .bb-selected-image-wrap { width: 92px; height: 92px; margin: 9px 0; }
    .bb-selected-image { width: 92px; height: 92px; }
    .bb-remove-case { width: 100%; }
    .bb-mode-item { gap: 8px; padding: 10px; }
    .bb-mode-list { grid-template-columns: repeat(2,1fr); }
    .bb-picker-card { min-width: 0; }
    .bb-picker-stats { min-width: 0; flex-wrap: wrap; }
    .bb-picker-stat { padding-inline: 9px; }
    .bb-battle { padding: 12px 10px 24px; }
    .bb-battle-top { align-items: flex-start; }
    .bb-battle-top-right { flex-wrap: wrap; justify-content: flex-end; }
    .bb-players-scroller { grid-template-columns: 1fr; }
    .bb-players-scroller-six { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; padding: 8px; }
    .bb-players-scroller-six .bb-player-card { padding: 8px; }
    .bb-players-scroller-six .bb-player-top { min-height: 88px; gap: 5px; padding: 4px 2px 8px; }
    .bb-players-scroller-six .bb-player-avatar { width: 46px; height: 46px; border-width: 2px; }
    .bb-players-scroller-six .bb-player-name { max-width: 100%; font-size: 11px; }
    .bb-players-scroller-six .bb-player-meta { gap: 5px; }
    .bb-players-scroller-six .bb-player-total { min-height: 26px; gap: 4px; padding: 0 7px; font-size: 10px; }
    .bb-players-scroller-six .bb-player-total img { width: 11px; height: 11px; }
    .bb-players-scroller-six .bb-result-item { padding: 6px; }
    .bb-players-scroller-six .bb-result-image-wrap { width: 30px; height: 30px; margin-right: 5px; }
    .bb-players-scroller-six .bb-result-name { font-size: 9px; }
    .bb-players-scroller-six .bb-result-value { gap: 3px; font-size: 10px; }
    .bb-players-scroller-six .bb-result-value img { width: 10px; height: 10px; }
    .bb-players-scroller-six .bb-waiting-item { height: 70px; font-size: 10px; text-align: center; }
    .bb-vs-badge { display: none; }
    .bb-reel-image { width: 75px; height: 105px; flex-basis: 75px; }
    .bb-reel-image img { width: 62px; height: 62px; }
    .bb-reel-item.is-active .bb-reel-image img { transform: translate(-50%,-50%) scale(1.15); }
    .bb-reel-image::before { width: 90%; height: 70%; filter: blur(10px); }
    .bb-reel-item.is-result .bb-reel-image { transform: translateY(-25px); }
    .bb-reel-result { position: absolute; z-index: 8; top: 73px; left: 2px; width: calc(100% - 4px); max-width: none; margin-left: 0; align-items: center; gap: 0; }
    .bb-reel-result-name { display: -webkit-box; width: 100%; margin-bottom: 2px; overflow: hidden; color: rgba(225,228,242,.9); font-size: 10px; line-height: 1.15; text-align: center; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .bb-reel-result-value { margin-top: 1px; justify-content: center; gap: 3px; font-size: 11px; line-height: 1; white-space: nowrap; }
    .bb-reel-result-value img { width: 13px; height: 13px; }
    .bb-spinner-six-player .bb-reel-image { width: 48px; height: 105px; flex-basis: 48px; }
    .bb-spinner-six-player .bb-reel-image img { width: 43px; height: 43px; }
    .bb-spinner-six-player .bb-reel-result { top: 66px; }
    .bb-spinner-six-player .bb-reel-result-name { font-size: 8px; }
    .bb-spinner-six-player .bb-reel-result-value { gap: 2px; font-size: 8px; }
    .bb-spinner-six-player .bb-reel-result-value img { width: 9px; height: 9px; }
    .bb-spinner-six-player .bb-ready-text,.bb-spinner-six-player .bb-waiting-text { padding-inline: 2px; font-size: 8px; line-height: 1.2; text-align: center; }
    .bb-spinner-six-player .bb-mini-button { height: 30px; margin-top: 8px; padding: 0 4px; font-size: 9px; }
    .bb-countdown-title { font-size: 12px; letter-spacing: 2px; }
    .bb-countdown-number { font-size: 50px; }
  }

  @media (max-width: 540px) {
    .bb-players-row { grid-template-columns: 1fr; }
    .bb-picker-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; }
    .bb-picker-card-inner { padding: 8px; }
    .bb-picker-name { font-size: 12px; }
    .bb-picker-image-wrap { width: 90px; height: 90px; margin: 8px 0; }
    .bb-picker-image { width: 90px; height: 90px; }
    .bb-picker-price,.bb-picker-quantity { width: 100%; }
  }

  @media (max-width: 420px) {
    .bb-list { padding: 10px; }
    .bb-row-players { width: 210px; min-width: 210px; gap: 8px; }
    .bb-row-avatar { width: 34px; height: 34px; flex-basis: 34px; }
    .bb-row-players-six { width: 278px; min-width: 278px; gap: 3px; }
    .bb-row-players-six .bb-row-player-before-vs { margin-right: 6px; }
    .bb-row-players-six .bb-row-player-after-vs { margin-left: 6px; }
    .bb-picker-footer { align-items: stretch; flex-direction: column; }
    .bb-picker-stats { width: 100%; }
    .bb-picker-stat { flex: 1; justify-content: center; }
    .bb-picker-footer .bb-btn { width: 100%; }
    .bb-reel-image { width: 64px; }
    .bb-reel-image img { width: 54px; height: 54px; }
  }

  @media (max-width: 400px) {
    .bb-selected-cases { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .bb-mode-list { grid-template-columns: 1fr; }
  }

  @media (prefers-reduced-motion: reduce) {
    .bb-battle,.bb-row-wrap,.bb-case-tooltip,.bb-picker,.bb-picker-backdrop,.case-preview-backdrop,.case-preview-modal,.case-preview-item,.bb-result-item,.bb-countdown-number,.bb-winner-panel { animation: none; transition: none; }
    .bb-wheel-track { transition-duration: .01ms !important; }
  }
`;

function normalizeCase(row) {
  const caseId = String(row?.uuid || row?.id || "");
  const items = Array.isArray(row?.items) ? row.items : [];

  return {
    ...row,
    id: caseId,
    image: row?.image_url || row?.image || "",
    price: Number(row?.price || 0),
    community: Boolean(row?.community),
    items: items.map((item, index) => {
      const normalized = {
        ...item,
        id: String(item?.item_id || item?.id || caseId + "-item-" + index),
        image: item?.image_url || item?.image || "",
        value: Number(item?.value || 0),
        chance: Number(item?.chance || 0),
      };
      return { ...normalized, accent: getInventoryItemAccent(normalized) };
    }),
  };
}

function countBattleResultItems(results) {
  if (!Array.isArray(results)) return -1;
  return results.reduce((count, items) => count + (Array.isArray(items) ? items.length : 0), 0);
}

function getMostCompleteBattleResults(...candidates) {
  return candidates.reduce((best, candidate) => (
    countBattleResultItems(candidate) > countBattleResultItems(best) ? candidate : best
  ), null);
}

function normalizeBattleGame(row, previous = null) {
  if (!row) return null;
  // Never carry animation/result state across battle identities. React can
  // receive the next battle before the previous route finishes unmounting.
  if (previous && String(previous.id || "") !== String(row.id || "")) previous = null;
  const completeResults = getMostCompleteBattleResults(
    row.results,
    row.outcomeResults,
    previous?.outcomeResults,
    previous?.results,
  );
  const source = previous ? {
    ...previous,
    ...row,
    cases: row.cases ?? previous.cases,
    players: row.players ?? previous.players,
    results: completeResults ?? row.results ?? previous.outcomeResults ?? previous.results,
    outcomeResults: completeResults ?? row.outcomeResults ?? previous.outcomeResults,
    modes: row.modes ?? previous.modes,
  } : {
    ...row,
    results: completeResults ?? row.results,
    outcomeResults: completeResults ?? row.outcomeResults,
  };
  if (previous?.serverResolved && source.status !== "resolved") {
    source.status = "resolved";
    source.server_seed = previous.server_seed || source.server_seed;
    source.resolved_at = previous.resolved_at || source.resolved_at;
  }
  const playerOption = PLAYER_OPTIONS.find((option) => option.id === source.player_option)
    || PLAYER_OPTIONS.find((option) => option.id === "ffa-2");
  const maxPlayers = Math.max(2, Math.min(6, Number(source.max_players || playerOption.count)));
  const players = Array.from({ length: maxPlayers }, () => null);
  const previousPlayersById = new Map((Array.isArray(previous?.players) ? previous.players : [])
    .filter(Boolean)
    .map((player) => [String(player?.profile_id || player?.id || ""), player]));
  (Array.isArray(source.players) ? source.players : []).forEach((player, index) => {
    if (!player) return;
    const slotIndex = Number.isInteger(Number(player?.slot_index)) ? Number(player.slot_index) : index;
    if (slotIndex < 0 || slotIndex >= maxPlayers) return;
    const profileId = String(player?.profile_id || player?.id || "");
    const previousPlayer = previousPlayersById.get(profileId) || null;
    players[slotIndex] = {
      ...previousPlayer,
      id: profileId,
      profile_id: profileId,
      type: player?.profile_type === "bot" || player?.type === "bot" ? "bot" : "user",
      name: String(player?.username || player?.name || "Player"),
      avatar: player?.avatar_headshot_url || player?.avatar_url || player?.avatar || null,
      role: player?.role ?? previousPlayer?.role ?? null,
      level: Number(player?.level ?? previousPlayer?.level) || 1,
      played: Number(player?.played ?? previousPlayer?.played) || 0,
      won: Number(player?.won ?? previousPlayer?.won) || 0,
      lost: Number(player?.lost ?? previousPlayer?.lost) || 0,
    };
  });
  const cases = (Array.isArray(source.cases) ? source.cases : []).map(normalizeCase);
  const providedServerNow = new Date(row?.server_now || "").getTime();
  const providedServerClockOffset = Number(row?.serverClockOffset);
  const inheritedServerClockOffset = Number(previous?.serverClockOffset);
  const serverClockOffset = Number.isFinite(providedServerClockOffset)
    ? providedServerClockOffset
    : Number.isFinite(providedServerNow)
      ? providedServerNow - Date.now()
      : Number.isFinite(inheritedServerClockOffset) ? inheritedServerClockOffset : 0;
  const timelineNow = Date.now() + serverClockOffset;
  const timelineStatus = source.status;
  const storedResults = timelineStatus === "active" && Array.isArray(source.outcomeResults)
    ? source.outcomeResults
    : Array.isArray(source.results) ? source.results : [];
  const authoritativeResults = Array.from({ length: maxPlayers }, (_, index) => (
    Array.isArray(storedResults[index]) ? storedResults[index].map((item) => {
      const normalized = {
        ...item,
        id: String(item?.item_id || item?.id || `${source.id}-result-${index}`),
        image: item?.image_url || item?.image || "",
        value: Number(item?.value || 0),
      };
      return { ...normalized, accent: getInventoryItemAccent(normalized) };
    }) : []
  ));
  const requestedModes = Array.isArray(source.modes) ? source.modes : [];
  const modes = requestedModes.filter((mode) => MODE_OPTIONS.some((option) => option.id === mode));
  if (!modes.length) modes.push("normal");
  const fastSpin = Boolean(source.fast_spin ?? source.fastSpin ?? source.gold_spin);
  const reelDuration = fastSpin ? FAST_REEL_DURATION : REEL_DURATION;
  const roundDelay = fastSpin ? FAST_BATTLE_ROUND_DELAY : BATTLE_ROUND_DELAY;
  const roundCycle = fastSpin ? FAST_BATTLE_ROUND_CYCLE : BATTLE_ROUND_CYCLE;
  const startedAt = new Date(source.started_at || 0).getTime();
  // Every viewer derives playback from the same server-authored boundary.
  // Reopening a battle therefore resumes the countdown/spin/round delay at
  // the real current position instead of restarting or inheriting list state.
  const countdownStartedAt = startedAt;
  const activeElapsed = timelineStatus === "active" && Number.isFinite(countdownStartedAt) && countdownStartedAt > 0
    ? Math.max(0, timelineNow - countdownStartedAt)
    : 0;
  let phase = ["waiting", "ready"].includes(timelineStatus) ? "waiting" : timelineStatus === "resolved" ? "finished" : "waiting";
  let currentRound = timelineStatus === "resolved"
    ? Math.max(0, cases.length - 1)
    : Math.max(0, Number(source.current_round ?? source.currentRound ?? 0));
  let countdown = 3;
  let resumeCountdownMs = 1000;
  let resumeSpinMs = 0;
  let resumeDelayMs = 0;
  let visibleRoundCount = timelineStatus === "resolved" ? cases.length : 0;

  if (timelineStatus === "active") {
    if (activeElapsed < BATTLE_COUNTDOWN_DURATION) {
      phase = "countdown";
      const timeUntilStart = Math.max(0, startedAt - timelineNow);
      const countdownRemaining = BATTLE_COUNTDOWN_DURATION - activeElapsed;
      countdown = Math.max(1, Math.ceil(countdownRemaining / 1000));
      resumeCountdownMs = timeUntilStart + Math.max(20, countdownRemaining - (countdown - 1) * 1000);
    } else {
      const roundElapsed = activeElapsed - BATTLE_COUNTDOWN_DURATION;
      currentRound = Math.min(cases.length, Math.floor(roundElapsed / roundCycle));
      if (currentRound >= cases.length) {
        currentRound = Math.max(0, cases.length - 1);
        visibleRoundCount = cases.length;
        phase = "finished";
      } else {
        const withinRound = roundElapsed % roundCycle;
        if (withinRound < reelDuration) {
          phase = "spinning";
          resumeSpinMs = withinRound;
          visibleRoundCount = currentRound;
        } else {
          phase = "round-delay";
          resumeDelayMs = withinRound - reelDuration;
          visibleRoundCount = currentRound + 1;
        }
      }
    }
  }
  const visibleResults = authoritativeResults.map((items) => items.slice(0, visibleRoundCount));
  const activeReels = timelineStatus === "active" && phase === "spinning"
    ? players.map((_, index) => buildReel(cases[currentRound] || cases[0], authoritativeResults[index]?.[currentRound] || null))
    : source.reels;

  return {
    ...source,
    id: String(source.id),
    cases,
    caseCount: Number(source.case_count ?? source.caseCount ?? cases.length),
    cost: Number(source.cost_per_player ?? source.cost ?? 0),
    playerOption,
    players,
    results: timelineStatus === "active" ? visibleResults : authoritativeResults,
    outcomeResults: authoritativeResults,
    reels: activeReels,
    modes,
    mode: modes.length === 1 ? modes[0] : buildCombinedModeValue(modes),
    fastSpin,
    deferResolution: false,
    serverResolved: source.status === "resolved",
    animationLocked: timelineStatus === "active" && phase !== "finished",
    animationComplete: phase === "finished",
    phase,
    currentRound,
    countdown,
    countdownStartedAt,
    serverClockOffset,
    resumeCountdownMs,
    resumeSpinMs,
    resumeDelayMs,
    revealedRoundCount: visibleRoundCount,
    demoWaiting: true,
    serverManaged: true,
    versus: playerOption.family === "team",
    finished: timelineStatus === "resolved",
    winnerIndex: Array.isArray(source.winner_profile_ids) && source.winner_profile_ids.length
      ? players.findIndex((player) => player && String(player.id) === String(source.winner_profile_ids[0]))
      : undefined,
  };
}

function normalizeBotProfile(row) {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    type: "bot",
    name: String(row.username || "Bot"),
    avatar: row.avatar_headshot_url || row.avatar_url || null,
  };
}

function getCaseItems(caseItem) {
  const items = Array.isArray(caseItem?.items) ? caseItem.items.filter((item) => item.image) : [];
  if (items.length) return items;

  const fallback = {
    id: caseItem?.id + "-fallback",
    name: caseItem?.name || "Mystery Pull",
    image: caseItem?.image || "",
    value: Number(caseItem?.price || 0),
    chance: 100,
  };
  return [{ ...fallback, accent: getInventoryItemAccent(fallback) }];
}

function chooseItem(caseItem) {
  const items = getCaseItems(caseItem);
  const totalChance = items.reduce((sum, item) => sum + Math.max(0, Number(item.chance || 0)), 0);
  if (!totalChance) return items[Math.floor(Math.random() * items.length)];
  let roll = Math.random() * totalChance;
  for (const item of items) {
    roll -= Math.max(0, Number(item.chance || 0));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function buildReel(caseItem, forcedItem = null) {
  const items = getCaseItems(caseItem);
  const reel = Array.from({ length: REEL_LENGTH }, () => items[Math.floor(Math.random() * items.length)]);
  reel[REEL_STOP_INDEX] = forcedItem || chooseItem(caseItem);
  return reel.map((item, index) => ({ ...item, reelKey: String(item.id) + "-" + index }));
}

function getPlayerTotal(results) {
  return (results || []).reduce((sum, item) => sum + Number(item?.value || 0), 0);
}

function playSound(path, volume = 0.4) {
  if (!path) return;
  try {
    const sound = new Audio(path);
    sound.volume = volume;
    void sound.play().catch(() => undefined);
  } catch {
    // Sound is optional; ignore unsupported sources and autoplay restrictions.
  }
}

function handleCaseImageError(event) {
  const image = event.currentTarget;
  image.style.display = "none";
}

function handleItemImageError(event) {
  const image = event.currentTarget;
  image.style.display = "none";
}

function CasePreview({ item, onClose }) {
  const [closing, setClosing] = useState(false);
  const items = useMemo(() => getItemsWithRollRanges(item.items || []), [item.items]);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 200);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  return createPortal(
    <div
      className={`case-preview-backdrop${closing ? " case-preview-backdrop-closing" : ""}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className={`case-preview-modal${closing ? " case-preview-modal-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" aria-label="Close" className="case-preview-close" onClick={requestClose}>×</button>

        <header className="case-preview-header">
          <div className="case-preview-header-left">
            <div className="case-preview-thumb">
              <img
                src={item.image}
                alt={item.name}
                className={`case-preview-thumb-image-${getCaseArtworkSize(item)}`}
                draggable={false}
              />
            </div>
            <div className="case-preview-texts">
              <div id="case-preview-title" className="case-preview-name">{item.name}</div>
              <div className="case-preview-price-pill">
                <img src={COIN_ICON} alt="Bobux" width="14" height="14" draggable={false} />
                <span className="case-preview-price">{formatPriceValue(item.price, { compactNumbers: false })}</span>
              </div>
            </div>
          </div>
        </header>
        <div className="case-preview-items-wrapper">
          <div className="case-preview-items-grid">
            {items.map((reward) => (
              <article
                key={reward.id}
                className="case-preview-item"
                style={{
                  background: `linear-gradient(to top, rgba(${reward.accent}, 0.18) 0%, rgba(${reward.accent}, 0) 100%), rgb(39, 45, 70)`,
                  "--item-border-bottom": `rgba(${reward.accent}, 0.7)`,
                  "--item-border-side": `rgba(${reward.accent}, 0.25)`,
                }}
              >
                <div className="case-preview-chance-badge" title={`Roll range: ${reward.rollRange} (0–99,999)`}>
                  <span className="case-preview-chance">%{reward.chance}</span>
                  <span className="case-preview-range">{reward.rollRange}</span>
                </div>

                <img src={reward.image} alt="" className="case-preview-item-blur" draggable={false} />
                <div className="case-preview-image-wrapper">
                  <img src={reward.image} alt={reward.name} className="case-preview-item-image" draggable={false} />
                </div>

                <div className="case-preview-item-details">
                  <p className="case-preview-item-name">{reward.name}</p>
                  <p className="case-preview-item-price">
                    <span>
                      <img src={COIN_ICON} alt="Bobux" width="15" height="15" draggable={false} />
                      <span>{formatPriceValue(reward.value, { compactNumbers: false })}</span>
                    </span>
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function CasePicker({ cases, casesLoading, casesError, selectedCases, onAdd, onRemove, onSetQuantity, onClose, onPreview }) {
  const [tab, setTab] = useState("Official");
  const [search, setSearch] = useState("");
  const [descending, setDescending] = useState(true);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [onClose]);

  const visibleCases = useMemo(() => {
    return cases
      .filter((item) => (tab === "Community" ? item.community : !item.community))
      .filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => descending ? b.price - a.price : a.price - b.price);
  }, [cases, descending, search, tab]);

  const total = selectedCases.reduce((sum, item) => sum + Number(item.price || 0), 0);

  return createPortal(
    <div className="bb-picker-backdrop" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <section className={"bb-picker" + (closing ? " bb-picker-closing" : "")} role="dialog" aria-modal="true" aria-label="Add cases">
        <button type="button" className="bb-modal-close" onClick={onClose} aria-label="Close">×</button>
        <header className="bb-picker-header">
          <div className="flex shrink-0 gap-1 rounded-[6px] bg-[#0f111a] p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,.025)]">
            {["Official", "Community"].map((label) => (
              <button
                type="button"
                key={label}
                className={`whitespace-nowrap rounded-[4px] border-0 px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                  tab === label
                    ? "bg-[#2a3048] text-[#e1e4f2]"
                    : "bg-transparent text-[#6c7399] hover:text-[#c7cce2]"
                }`}
                onClick={() => setTab(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="bb-picker-search-row">
            <div className="bb-picker-input-wrap">
              <PickerSearchIcon />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="bb-picker-input"
                placeholder="Search for a case..."
              />
            </div>
            <button
              type="button"
              className="bb-sort"
              onClick={() => setDescending((value) => !value)}
              title={descending ? "Price Descending" : "Price Ascending"}
            >
              <SortDirectionIcon ascending={!descending} />
            </button>
          </div>
        </header>
        <div className="bb-picker-grid-wrap">
          {casesLoading ? (
            <div className="bb-picker-empty">Loading cases from Supabase...</div>
          ) : casesError ? (
            <div className="bb-picker-empty">{casesError}</div>
          ) : visibleCases.length ? (
            <div className="bb-picker-grid">
              {visibleCases.map((caseItem) => {
                const quantity = selectedCases.reduce((count, item) => count + (item.id === caseItem.id ? 1 : 0), 0);
                return (
                <div
                  key={caseItem.id}
                  className="bb-picker-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => selectedCases.length < MAX_CASES && onAdd(caseItem)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (selectedCases.length < MAX_CASES) onAdd(caseItem);
                    }
                  }}
                >
                  <div className="bb-picker-card-inner">
                    <img src={caseItem.image} alt="" className="bb-picker-glow" draggable={false} onError={handleCaseImageError} />
                    <button
                      type="button"
                      className="bb-picker-eye"
                      aria-label={"Preview " + caseItem.name}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPreview(caseItem);
                      }}
                    >
                      <PickerEyeIcon />
                    </button>
                    <p className="bb-picker-name">{caseItem.name}</p>
                    <div className="bb-picker-image-wrap">
                      <img src={caseItem.image} alt={caseItem.name} className="bb-picker-image" draggable={false} onError={handleCaseImageError} />
                    </div>
                    {quantity > 0 ? (
                      <div className="bb-picker-quantity" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="bb-picker-quantity-button bb-picker-quantity-minus" onClick={() => onRemove(caseItem.id)} aria-label={`Remove one ${caseItem.name}`}><QuantityMinusIcon /></button>
                        <input
                          className="bb-picker-quantity-input"
                          type="number"
                          min="0"
                          max={MAX_CASES}
                          value={quantity}
                          aria-label={`${caseItem.name} quantity`}
                          onChange={(event) => onSetQuantity(caseItem, Number(event.target.value))}
                        />
                        <button type="button" className="bb-picker-quantity-button bb-picker-quantity-plus" disabled={selectedCases.length >= MAX_CASES} onClick={() => onAdd(caseItem)} aria-label={`Add one ${caseItem.name}`}><QuantityPlusIcon /></button>
                      </div>
                    ) : (
                      <button type="button" className="bb-picker-price" tabIndex={-1}>
                        <span><img src={COIN_ICON} alt="" />{formatPriceValue(caseItem.price, { compactNumbers: false })}</span>
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className="bb-picker-empty">No more cases match this selection.</div>
          )}
        </div>
        <footer className="bb-picker-footer">
          <div className="bb-picker-stats">
            <div className="bb-picker-stat">
              <span className="bb-picker-stat-label">Cases</span>
              <span className="bb-picker-stat-value">{selectedCases.length} / {MAX_CASES}</span>
            </div>
            <div className="bb-picker-stat">
              <span className="bb-picker-stat-label">Total</span>
              <span className="bb-picker-stat-value">
                <img src={COIN_ICON} alt="" />
                {formatPriceValue(total, { compactNumbers: false })}
              </span>
            </div>
          </div>
          <button type="button" className="bb-btn bb-btn-primary" onClick={requestClose}>Done</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function BattleCasePreview({ caseItem, onPreview }) {
  const triggerRef = useRef(null);
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState(null);

  const readPosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      left: rect.left + rect.width / 2,
      top: rect.top - 8,
    };
  };

  const showTooltip = (delay = 120) => {
    window.clearTimeout(closeTimerRef.current);
    window.clearTimeout(openTimerRef.current);
    if (tooltip) {
      setTooltip((current) => current ? { ...current, closing: false } : current);
      return;
    }
    openTimerRef.current = window.setTimeout(() => {
      const position = readPosition();
      if (position) setTooltip({ ...position, closing: false });
    }, delay);
  };

  const hideTooltip = () => {
    window.clearTimeout(openTimerRef.current);
    if (!tooltip) return;
    setTooltip((current) => current ? { ...current, closing: true } : current);
    closeTimerRef.current = window.setTimeout(() => setTooltip(null), 150);
  };

  const openPreview = (event) => {
    event.stopPropagation();
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
    setTooltip(null);
    onPreview(caseItem);
  };

  useEffect(() => {
    if (!tooltip) return undefined;
    const updatePosition = () => {
      const position = readPosition();
      if (position) setTooltip((current) => current ? { ...current, ...position } : current);
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [Boolean(tooltip)]);

  useEffect(() => () => {
    window.clearTimeout(openTimerRef.current);
    window.clearTimeout(closeTimerRef.current);
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        className="bb-row-case"
        role="button"
        tabIndex={0}
        aria-describedby={tooltip ? tooltipId : undefined}
        onPointerEnter={() => showTooltip(120)}
        onPointerLeave={hideTooltip}
        onFocus={() => showTooltip(0)}
        onBlur={hideTooltip}
        onClick={openPreview}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPreview(event);
          }
        }}
      >
        <img src={caseItem.image} alt={caseItem.name} draggable={false} onError={handleCaseImageError} />
      </div>
      {tooltip && createPortal(
        <div
          className="bb-case-tooltip-positioner"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <div
            id={tooltipId}
            role="tooltip"
            data-side="top"
            data-align="center"
            data-state={tooltip.closing ? "closed" : "instant-open"}
            className={`bb-case-tooltip${tooltip.closing ? " bb-case-tooltip-closing" : ""}`}
          >
            <p>{caseItem.name}</p>
            <p className="bb-case-tooltip-price">Price: {formatPriceValue(caseItem.price)}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function BattleRow({ battle, finished = false, onView, onPreview, onProfileOpen }) {
  const viewer = useAuth((state) => state.user);
  const viewerProfileId = String(viewer?.profile_id || viewer?.id || "");
  const viewerUsername = String(viewer?.username || "").trim().toLowerCase();
  const creatorProfileId = String(battle.creator_profile_id || battle.players[0]?.id || "");
  const creatorUsername = String(battle.creator_username || battle.players[0]?.name || "").trim().toLowerCase();
  const viewerAlreadyJoined = Boolean(viewerProfileId) && battle.players.some((player) => player?.type === "user" && String(player.id) === viewerProfileId);
  const viewerIsCreator = Boolean(
    battle.ownedByViewer
    || (viewerProfileId && viewerProfileId === creatorProfileId)
    || (viewerUsername && creatorUsername && viewerUsername === creatorUsername),
  );
  const rowCanJoin = !finished
    && battle.status === "waiting"
    && battle.players.some((player) => !player)
    && !viewerIsCreator
    && !viewerAlreadyJoined;
  const shownCases = battle.cases.slice(0, 20);
  const teamCount = getBattleTeamCount(battle.playerOption);
  const teamSize = teamCount ? battle.players.length / teamCount : 0;
  const row = (
    <article className="bb-row" role="button" tabIndex={0} onClick={onView} onKeyDown={(event) => event.key === "Enter" && onView()}>
        <div className="bb-row-left">
          <div className="bb-row-left-inner">
            <div className="bb-row-badges">
              <span className="bb-round-badge">{battle.caseCount} {battle.caseCount === 1 ? "Case" : "Cases"}</span>
            </div>
            <div className={`bb-row-players${battle.players.length === 6 ? " bb-row-players-six" : ""}`}>
              {battle.players.map((player, index) => (
                <Fragment key={player?.id || `open-${index}`}>
                  {battle.versus && index > 0 && index % teamSize === 0 && <span className="bb-vs bb-vs-inline">VS</span>}
                  <button
                    type="button"
                    className="bb-row-avatar"
                    disabled={!player || player.type !== "user"}
                    aria-label={player?.type === "user" ? `Open ${player.name || "player"} profile` : undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (player?.type === "user") onProfileOpen?.(player);
                    }}
                  >
                    {player?.avatar ? (
                      <img loading="lazy" src={player.avatar} alt={player.name || "Player"} draggable={false} />
                    ) : (
                      <svg viewBox="0 0 64 64" className="bb-row-avatar-loading" aria-label="Waiting for player" role="img">
                        <circle cx="32" cy="32" r="32" fill="#1c1f2e" />
                        <circle cx="22" cy="32" r="4" fill="#6C63FF">
                          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0s" />
                        </circle>
                        <circle cx="32" cy="32" r="4" fill="#6C63FF">
                          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0.4s" />
                        </circle>
                        <circle cx="42" cy="32" r="4" fill="#6C63FF">
                          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0.8s" />
                        </circle>
                      </svg>
                    )}
                  </button>
                </Fragment>
              ))}
            </div>
            <div className="bb-row-mode">
              {battle.modes.map((mode) => <BattleModeIcon type={mode} key={mode} />)}
            </div>
          </div>
        </div>
        <div className="bb-row-reel">
          <div className="bb-row-reel-track">
            {shownCases.map((caseItem, index) => (
              <BattleCasePreview caseItem={caseItem} onPreview={onPreview} key={caseItem.id + index} />
            ))}
          </div>
        </div>
        <div className="bb-row-right">
          <div className="bb-cost">
            <span className="bb-cost-label">Battle Cost</span>
            <span className="bb-cost-value">
              <img src={COIN_ICON} alt="" />
              {formatPriceValue(battle.cost)}
            </span>
          </div>
          <button
            type="button"
            className={`bb-btn ${rowCanJoin ? "bb-btn-primary" : "bb-btn-secondary"} bb-row-view`}
            onClick={(event) => {
              event.stopPropagation();
              onView();
            }}
          >
            {rowCanJoin ? "Join" : "View"}
          </button>
        </div>
      </article>
  );

  return (
    <div className={`bb-row-wrap${finished ? " bb-row-wrap-finished" : ""}${battle.isExiting ? " bb-row-wrap-exiting" : ""}`}>
      {finished ? (
        <div className="bb-row-finished-surface">
          <div className="bb-row-finished-overlay" />
          <div className="bb-row-finished-content">{row}</div>
        </div>
      ) : row}
    </div>
  );
}

function BattlesList({ battles, loading, error, onCreate, onView, onPreview, onProfileOpen }) {
  const activeBattles = battles.filter((battle) => ["waiting", "ready", "active"].includes(battle.status));
  const resolvedBattles = battles.filter((battle) => battle.status === "resolved");
  const totalValue = activeBattles.reduce((sum, battle) => sum + Number(battle.cost || 0), 0);
  const totalCases = activeBattles.reduce((sum, battle) => sum + Number(battle.caseCount || 0), 0);
  return (
    <div className="bb-list">
      <div className="bb-stats">
        <div className="bb-stat">
          <div>
            <span className="bb-stat-value">{activeBattles.length}</span>
            <span className="bb-stat-label">Active Battles</span>
          </div>
        </div>
        <div className="bb-stat bb-stat-gold">
          <div>
            <span className="bb-stat-value"><img src={COIN_ICON} alt="" />{formatPriceValue(totalValue, { compactNumbers: false })}</span>
            <span className="bb-stat-label">Total Value</span>
          </div>
        </div>
        <div className="bb-stat">
          <div>
            <span className="bb-stat-value">{totalCases}</span>
            <span className="bb-stat-label">Total Cases</span>
          </div>
        </div>
      </div>
      <div className="bb-list-actions">
        <button type="button" className="bb-btn bb-btn-primary bb-create-battle-btn" onClick={onCreate}>Create Battle</button>
      </div>
      <div className="bb-battle-list">
        {loading ? <div className="bb-picker-empty">Loading Case Battles...</div> : null}
        {!loading && error ? <div className="bb-picker-empty">{error}</div> : null}
        {!loading && !error && activeBattles.length > 0 ? (
          <div className="bb-battle-section">
            {activeBattles.map((battle) => (
              <BattleRow key={battle.id} battle={battle} onView={() => onView(battle)} onPreview={onPreview} onProfileOpen={onProfileOpen} />
            ))}
          </div>
        ) : null}
        {!loading && !error && activeBattles.length > 0 && resolvedBattles.length > 0
          ? <div className="bb-battle-divider" aria-hidden="true" />
          : null}
        {!loading && !error && resolvedBattles.length > 0 ? (
          <div className="bb-battle-section">
            {resolvedBattles.map((battle) => (
              <BattleRow key={battle.id} battle={battle} finished onView={() => onView(battle)} onPreview={onPreview} onProfileOpen={onProfileOpen} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlayerSelector({ selected, onSelect }) {
  const groups = [
    { id: "ffa", title: "Free For All", color: "#6c63ff" },
    { id: "team", title: "Teams", color: "#3a89eb" },
  ];

  return (
    <div className="bb-players-row">
      {groups.map((group) => (
        <div className={`bb-player-group bb-player-group-${group.id}`} key={group.id} style={{ "--family-color": group.color }}>
          <div className="bb-player-group-title">{group.title}</div>
          <div className="bb-player-buttons">
            {PLAYER_OPTIONS.filter((option) => option.family === group.id).map((option) => {
              const active = selected.id === option.id;
              return (
                <button
                  type="button"
                  className={"bb-player-button" + (active ? ` bb-player-button-active-${group.id}` : "")}
                  key={option.id}
                  onClick={() => onSelect(option)}
                >
                  <PlayerSlotIcons option={option} active={active} />
                  <span className="bb-player-button-label">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreationPage({
  cases,
  casesLoading,
  casesError,
  selectedCases,
  setSelectedCases,
  playerOption,
  setPlayerOption,
  selectedMode,
  setSelectedMode,
  fastSpin,
  setFastSpin,
  onBack,
  onCreate,
  onPreview,
  creating = false,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const total = selectedCases.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const activeModeIds = getSelectedModeIds(selectedMode);

  return (
    <div className="bb-create-page">
      <div className="bb-create-inner">
        <header className="bb-create-header">
          <div className="bb-create-title-wrap">
            <button type="button" className="bb-back-icon" onClick={onBack} aria-label="Back to Battles">
              <BackChevronIcon />
            </button>
            <h1 className="bb-create-title">Battle Creation</h1>
          </div>
          <div className="bb-create-header-right">
            <button
              type="button"
              className="bb-fast-spin"
              aria-pressed={fastSpin}
              aria-label="Fast spin"
              title={fastSpin ? "Fast spin enabled" : "Enable fast spin"}
              onClick={() => setFastSpin((active) => !active)}
            >
              <FastSpinIcon active={fastSpin} />
            </button>
            <div className="bb-header-meta">
              <div className="bb-header-meta-item">
                <span className="bb-header-meta-label">Cases</span>
                <span className="bb-header-meta-value">{selectedCases.length}/{MAX_CASES}</span>
              </div>
              <span className="bb-header-meta-divider" />
              <div className="bb-header-meta-item">
                <span className="bb-header-meta-value">
                  <img src={COIN_ICON} alt="" />
                  {formatPriceValue(total, { compactNumbers: false })}
                </span>
              </div>
            </div>
            <button type="button" className="bb-btn bb-btn-primary" disabled={!selectedCases.length || creating} onClick={onCreate}>
              {creating ? "Creating..." : "Create Battle"}
            </button>
          </div>
        </header>

        <section className="bb-section">
          <div className="bb-section-label-row"><span className="bb-section-label">Players</span></div>
          <PlayerSelector selected={playerOption} onSelect={setPlayerOption} />
        </section>

        <div className="bb-section-label-row"><span className="bb-section-label">Cases</span></div>
        <section className="bb-section">
          <div className="bb-selected-cases">
            <button type="button" className="bb-add-case" onClick={() => setPickerOpen(true)}>
              <span className="bb-add-icon"><AddCaseIcon /></span>
              <span className="bb-add-label">Add Cases</span>
            </button>
            {selectedCases.map((caseItem, caseIndex) => (
              <article className="bb-selected-card" key={`${caseItem.id}-${caseIndex}`}>
                <img src={caseItem.image} alt="" className="bb-selected-glow" draggable={false} onError={handleCaseImageError} />
                <div className="bb-drag-handle" aria-hidden="true">⠿</div>
                <p className="bb-selected-name">{caseItem.name}</p>
                <div className="bb-selected-image-wrap">
                  <img src={caseItem.image} alt={caseItem.name} className="bb-selected-image" draggable={false} onError={handleCaseImageError} />
                </div>
                <button
                  type="button"
                  className="bb-remove-case"
                  onClick={() => setSelectedCases((items) => items.filter((_, itemIndex) => itemIndex !== caseIndex))}
                >
                  <span className="bb-remove-price"><img src={COIN_ICON} alt="" />{formatPriceValue(caseItem.price, { compactNumbers: false })}</span>
                  <span className="bb-remove-label"><RemoveCaseIcon />Remove</span>
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="bb-section">
          <div className="bb-section-label-row"><span className="bb-section-label">Mode</span></div>
          <div className="bb-mode-list">
            {MODE_OPTIONS.map(({ id, title, color, description }) => {
              const active = activeModeIds.includes(id);
              return (
                <button
                  type="button"
                  key={id}
                  className={"bb-mode-item" + (active ? " bb-mode-item-active" : "")}
                  style={{ "--mode-color": color }}
                  onClick={() => setSelectedMode((currentMode) => toggleSelectedMode(currentMode, id))}
                >
                  <CreationModeIcon type={id} />
                  <span className="bb-mode-content">
                    <span className="bb-mode-title">{title}</span>
                    <span className="bb-mode-desc">{description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      {pickerOpen && (
        <CasePicker
          cases={cases}
          casesLoading={casesLoading}
          casesError={casesError}
          selectedCases={selectedCases}
          onAdd={(caseItem) => setSelectedCases((items) => items.length < MAX_CASES ? items.concat(caseItem) : items)}
          onRemove={(caseId) => setSelectedCases((items) => {
            const removeIndex = items.findLastIndex((item) => item.id === caseId);
            return removeIndex < 0 ? items : items.filter((_, itemIndex) => itemIndex !== removeIndex);
          })}
          onSetQuantity={(caseItem, requestedQuantity) => setSelectedCases((items) => {
            const otherItems = items.filter((item) => item.id !== caseItem.id);
            const quantity = Math.max(0, Math.min(MAX_CASES - otherItems.length, Number.isFinite(requestedQuantity) ? Math.trunc(requestedQuantity) : 0));
            return otherItems.concat(Array.from({ length: quantity }, () => caseItem));
          })}
          onClose={() => setPickerOpen(false)}
          onPreview={onPreview}
        />
      )}
    </div>
  );
}

function BattleFairnessCopy({ label, value }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      notifications.success(`${label} copied to clipboard!`);
    } catch {
      notifications.error("Unable to copy to clipboard.");
    }
  };

  return (
    <button type="button" className="bb-fairness-copy" aria-label={`Copy ${label}`} onClick={() => { void copy(); }}>
      <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
}

function FairnessModal({ battle, onClose }) {
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);
  const requestClose = () => {
    if (closeTimerRef.current) return;
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

  const resolved = battle?.status === "resolved" && Boolean(battle?.server_seed);
  const fields = [
    ["Game ID", battle?.id || "Unavailable"],
    ...(resolved ? [
      ["Hashed Server Seed", battle?.server_seed_hash || "Unavailable"],
      ["Random Seed", battle?.server_seed || "Unavailable"],
    ] : []),
  ];

  return createPortal(
    <div className={`bb-fairness-backdrop${closing ? " is-closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <section className={`bb-fairness-modal${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-labelledby="battle-fairness-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="bb-fairness-close" onClick={requestClose} aria-label="Close Battle Fairness">×</button>
        <h1 id="battle-fairness-title" className="bb-fairness-header">Battle Fairness</h1>
        <p className="bb-fairness-hint">A server seed commitment is locked before the battle begins. The seed details remain hidden while the battle is active and are revealed after resolution so the result can be verified.</p>

        {fields.map(([label, value]) => (
          <div className="bb-fairness-section" key={label}>
            <span className="bb-fairness-section-title">{label}</span>
            <div className="bb-fairness-input">
              <span className="bb-fairness-value" title={String(value)}>{String(value)}</span>
              <BattleFairnessCopy label={label} value={value} />
            </div>
          </div>
        ))}

        {!resolved && (
          <p className="bb-fairness-pending">The server seed remains hidden until this battle is resolved.</p>
        )}
      </section>
    </div>,
    document.body,
  );
}

function BattlePlayerCard({ player, results, onProfileOpen }) {
  const total = getPlayerTotal(results);
  const highestValueResult = (Array.isArray(results) ? results : []).reduce((highest, item) => (
    !highest || Number(item?.value || 0) > Number(highest?.value || 0) ? item : highest
  ), null);
  const totalAccent = highestValueResult
    ? (highestValueResult.accent || getInventoryItemAccent(highestValueResult))
    : "108,108,108";

  return (
    <article className="bb-player-card">
      <div className="bb-player-top">
        <button
          type="button"
          className="bb-player-avatar"
          disabled={!player || player.type !== "user"}
          aria-label={player?.type === "user" ? `Open ${player.name || "player"} profile` : undefined}
          onClick={() => player?.type === "user" && onProfileOpen?.(player)}
        >
          {player?.avatar && <img src={player.avatar} alt="" draggable={false} />}
        </button>
        <div className="bb-player-meta">
          <span className="bb-player-name">{player?.name || "Awaiting player"}</span>
          {player && total > 0 && (
            <span className="bb-player-total">
              <span className="bb-player-total-glow" style={{ background: `radial-gradient(90% 85% at 100% 100%,rgb(${totalAccent}) 0%,rgba(26,29,0,0) 100%)` }} />
              <img src={COIN_ICON} alt="" />
              <span style={{ color: `rgb(${totalAccent})` }}>{formatPriceValue(total, { compactNumbers: false })}</span>
            </span>
          )}
        </div>
      </div>
      <div className="bb-player-results">
        {results?.length ? results.map((item, roundIndex) => ({ item, roundIndex })).reverse().map(({ item, roundIndex }) => {
          const accent = item.accent || getInventoryItemAccent(item);
          return (
            <div className="bb-result-item" key={`${String(item.id)}-round-${roundIndex}`} style={{ "--rarity": accent }}>
              <div className="bb-result-image-wrap">
                <img src={item.image} alt="" className="bb-result-blur" draggable={false} onError={handleItemImageError} />
                <img src={item.image} alt={item.name} className="bb-result-image" draggable={false} onError={handleItemImageError} />
              </div>
              <div className="bb-result-details">
                <span className="bb-result-name">{item.name}</span>
                <span className="bb-result-value"><img src={COIN_ICON} alt="" />{formatPriceValue(item.value, { compactNumbers: false })}</span>
              </div>
            </div>
          );
        }) : (
          <div className="bb-waiting-item">WAITING...</div>
        )}
      </div>
    </article>
  );
}

function BattleView({ battle, setBattle, botProfiles, onBack, onCancel, onRecreate, onPreview, onProfileOpen }) {
  const viewer = useAuth((state) => state.user);
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen);
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [reelPosition, setReelPosition] = useState(REEL_INITIAL_POSITION);
  const [reelTransition, setReelTransition] = useState("none");
  const [activeReelIndex, setActiveReelIndex] = useState(INITIAL_REEL_INDEX);
  const [hasSpinResult, setHasSpinResult] = useState(false);
  const [winnerVisible, setWinnerVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [callingBotSlot, setCallingBotSlot] = useState(null);
  const [joiningSlot, setJoiningSlot] = useState(null);
  const spinnerInnerRef = useRef(null);
  const firstWheelTrackRef = useRef(null);
  const modeIds = getSelectedModeIds(battle.mode);
  const battleInstanceId = String(battle.id || "");
  const displayedRound = (battle.status === "resolved" && !battle.deferResolution) || battle.finished || battle.phase === "finished"
    ? Math.max(0, battle.cases.length - 1)
    : Math.max(0, Number(battle.currentRound || 0));
  const currentCase = battle.cases[displayedRound] || battle.cases[0];
  const calculatedCost = battle.cases.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const totalCost = Number(battle.cost_per_player ?? battle.cost ?? calculatedCost) || calculatedCost;
  const allJoined = battle.players.every(Boolean);
  const isWaitingForPlayers = ["waiting", "ready"].includes(battle.status) || battle.phase === "waiting";
  const viewerProfileId = String(viewer?.profile_id || viewer?.id || "");
  const viewerUsername = String(viewer?.username || "").trim().toLowerCase();
  const creatorProfileId = String(battle.creator_profile_id || battle.players[0]?.id || "");
  const creatorUsername = String(battle.creator_username || battle.players[0]?.name || "").trim().toLowerCase();
  const viewerSlotIndex = viewerProfileId
    ? battle.players.findIndex((player) => player?.type === "user" && String(player.id) === viewerProfileId)
    : -1;
  const canManageBattle = Boolean(
    battle.ownedByViewer
    || (viewerProfileId && (viewerProfileId === creatorProfileId || viewerSlotIndex === 0))
    || (viewerUsername && creatorUsername && viewerUsername === creatorUsername),
  );
  const viewerAlreadyJoined = viewerSlotIndex >= 0;
  const canJoinBattle = !allJoined && !canManageBattle && !viewerAlreadyJoined;
  const participantCount = Math.max(
    Number(battle.player_count || 0),
    battle.players.filter(Boolean).length,
  );
  const canCancelBattle = canManageBattle && battle.status === "waiting" && participantCount === 1;
  const reelTiming = battle.fastSpin ? {
    startDelay: FAST_REEL_START_DELAY,
    mainDuration: FAST_REEL_MAIN_DURATION,
    settlePause: FAST_REEL_SETTLE_PAUSE,
    settleDuration: FAST_REEL_SETTLE_DURATION,
    duration: FAST_REEL_DURATION,
    roundDelay: FAST_BATTLE_ROUND_DELAY,
  } : {
    startDelay: REEL_START_DELAY,
    mainDuration: REEL_MAIN_DURATION,
    settlePause: REEL_SETTLE_PAUSE,
    settleDuration: REEL_SETTLE_DURATION,
    duration: REEL_DURATION,
    roundDelay: BATTLE_ROUND_DELAY,
  };

  useEffect(() => {
    if (battle.phase !== "waiting" || !allJoined || battle.demoWaiting || battle.serverManaged) return undefined;
    const timer = window.setTimeout(() => setBattle((state) => String(state?.id || "") === battleInstanceId
      ? { ...state, phase: "countdown", countdown: 3 }
      : state), 450);
    return () => window.clearTimeout(timer);
  }, [allJoined, battle.demoWaiting, battle.phase, battle.serverManaged, battleInstanceId, setBattle]);

  useEffect(() => {
    if (battle.phase !== "countdown") return undefined;
    if (battle.countdown <= 1) {
      if (battle.serverManaged && battle.status !== "active" && !battle.deferResolution) return undefined;
      const timer = window.setTimeout(() => {
        setBattle((state) => ({
          ...(String(state?.id || "") === battleInstanceId ? {
            ...state,
            phase: "spinning",
            resumeSpinMs: 0,
            reels: state.players.map((_, index) => buildReel(
              state.cases[state.currentRound] || state.cases[0],
              state.outcomeResults?.[index]?.[state.currentRound] || null,
            )),
          } : state),
        }));
      }, Math.min(1000, Math.max(20, Number(battle.resumeCountdownMs || 1000))));
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setBattle((state) => String(state?.id || "") === battleInstanceId
      ? { ...state, countdown: state.countdown - 1, resumeCountdownMs: 1000 }
      : state), Math.max(20, Number(battle.resumeCountdownMs || 1000)));
    return () => window.clearTimeout(timer);
  }, [battle.countdown, battle.phase, battle.resumeCountdownMs, battleInstanceId, setBattle]);

  useEffect(() => {
    if (battle.phase !== "spinning") return undefined;

    const resumeOffset = Math.max(0, Math.min(reelTiming.duration - 1, Number(battle.resumeSpinMs || 0)));
    const resumedProgress = resumeOffset / reelTiming.duration;
    setReelTransition("none");
    setReelPosition(resumeOffset > 0
      ? REEL_INITIAL_POSITION + (REEL_FINAL_POSITION - REEL_INITIAL_POSITION) * resumedProgress
      : REEL_INITIAL_POSITION);
    setHasSpinResult(false);
    setActiveReelIndex(INITIAL_REEL_INDEX);
    const jitter = 13.125 * (Math.floor(Math.random() * 7) + 1);
    let trackingFrame = null;
    let ticksEnabled = false;
    let lastTrackedIndex = INITIAL_REEL_INDEX;
    const followCenteredItem = () => {
      const viewport = spinnerInnerRef.current?.getBoundingClientRect();
      const firstItem = firstWheelTrackRef.current?.firstElementChild?.getBoundingClientRect();
      if (viewport && firstItem) {
        const nextIndex = Math.max(0, Math.min(
          REEL_LENGTH - 1,
          Math.round((viewport.top + viewport.height / 2 - firstItem.top - 52.5) / REEL_ITEM_STRIDE),
        ));
        if (nextIndex !== lastTrackedIndex) {
          if (ticksEnabled) playSound(TICK_SOUND, 0.3);
          lastTrackedIndex = nextIndex;
        }
        setActiveReelIndex((current) => current === nextIndex ? current : nextIndex);
      }
      trackingFrame = window.requestAnimationFrame(followCenteredItem);
    };
    trackingFrame = window.requestAnimationFrame(followCenteredItem);
    let mainTimer;
    let settleTimer;
    if (resumeOffset > 0) {
      mainTimer = window.setTimeout(() => {
        ticksEnabled = true;
        setReelTransition(`transform ${Math.max(1, reelTiming.duration - resumeOffset)}ms cubic-bezier(.1,0,.2,1)`);
        setReelPosition(REEL_FINAL_POSITION);
      }, 20);
    } else {
      mainTimer = window.setTimeout(() => {
        ticksEnabled = true;
        setReelTransition(`transform ${reelTiming.mainDuration}ms cubic-bezier(.1,0,.2,1)`);
        setReelPosition(REEL_FINAL_POSITION - jitter + 52.5);
      }, reelTiming.startDelay);
      settleTimer = window.setTimeout(() => {
        setReelTransition(`transform ${reelTiming.settleDuration}ms cubic-bezier(.1,0,.2,1)`);
        setReelPosition(REEL_FINAL_POSITION);
      }, reelTiming.startDelay + reelTiming.mainDuration + reelTiming.settlePause);
    }
    const finishTimer = window.setTimeout(() => {
      ticksEnabled = false;
      if (trackingFrame) window.cancelAnimationFrame(trackingFrame);
      setActiveReelIndex(REEL_STOP_INDEX);
      setHasSpinResult(true);
      playSound(PULL_SOUND, 0.34);
      setBattle((state) => {
        if (String(state?.id || "") !== battleInstanceId) return state;
        const winningItems = state.reels.map((reel) => reel[REEL_STOP_INDEX]);
        const results = state.results.map((items, index) => items.concat(winningItems[index]));
        const finalRound = state.currentRound >= state.cases.length - 1;
        return {
          ...state,
          results,
          phase: finalRound ? "finished" : "round-delay",
          deferResolution: finalRound ? false : state.deferResolution,
          finished: finalRound ? Boolean(state.serverResolved || state.finished) : state.finished,
          animationLocked: finalRound ? false : state.animationLocked,
          animationComplete: finalRound ? true : state.animationComplete,
          resumeDelayMs: 0,
          revealedRoundCount: Math.max(Number(state.revealedRoundCount || 0), state.currentRound + 1),
        };
      });
    }, Math.max(5, reelTiming.duration - resumeOffset + 5));

    return () => {
      if (trackingFrame) window.cancelAnimationFrame(trackingFrame);
      window.clearTimeout(mainTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(finishTimer);
    };
  }, [battle.fastSpin, battle.phase, battle.resumeSpinMs, battleInstanceId, reelTiming.duration, reelTiming.mainDuration, reelTiming.settleDuration, reelTiming.settlePause, reelTiming.startDelay, setBattle]);

  useEffect(() => {
    if (battle.phase !== "round-delay") return undefined;
    const timer = window.setTimeout(() => {
      setBattle((state) => ({
        ...(String(state?.id || "") === battleInstanceId ? {
          ...state,
          currentRound: state.currentRound + 1,
          phase: "spinning",
          resumeSpinMs: 0,
          resumeDelayMs: 0,
          reels: state.players.map((_, index) => buildReel(
            state.cases[state.currentRound + 1] || state.cases[0],
            state.outcomeResults?.[index]?.[state.currentRound + 1] || null,
          )),
        } : state),
      }));
    }, Math.max(0, reelTiming.roundDelay - Number(battle.resumeDelayMs || 0)));
    return () => window.clearTimeout(timer);
  }, [battle.phase, battle.resumeDelayMs, battleInstanceId, reelTiming.roundDelay, setBattle]);

  useEffect(() => {
    if (battle.phase !== "finished") {
      setWinnerVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setWinnerVisible(true), 850);
    return () => window.clearTimeout(timer);
  }, [battle.phase]);

  useEffect(() => {
    if (!battle.serverResolved) return;
    // Settlement and the resolved row are committed in the same transaction.
    // Refresh the displayed wallet even if this browser missed the socket
    // notification while the battle animation was running.
    window.dispatchEvent(new CustomEvent("wallet:updated"));
  }, [battle.serverResolved]);

  const completeResultMatrix = Array.from({ length: battle.players.length }, (_, index) => {
    const visibleItems = Array.isArray(battle.results?.[index]) ? battle.results[index] : [];
    const outcomeItems = Array.isArray(battle.outcomeResults?.[index]) ? battle.outcomeResults[index] : [];
    return outcomeItems.length > visibleItems.length ? outcomeItems : visibleItems;
  });
  const revealedResultCount = Math.max(
    Number(battle.revealedRoundCount || 0),
    ...battle.results.map((items) => Array.isArray(items) ? items.length : 0),
  );
  const displayedResults = battle.status === "active" || battle.deferResolution
    ? completeResultMatrix.map((items) => items.slice(0, revealedResultCount))
    : completeResultMatrix;
  const totals = displayedResults.map(getPlayerTotal);
  const hasWildMode = modeIds.includes("wild");
  const hasTerminalMode = modeIds.includes("terminal");
  let winnerIndex = 0;
  let winnerIndices = [0];
  const storedWinnerIndices = (Array.isArray(battle.winner_profile_ids) ? battle.winner_profile_ids : [])
    .map((profileId) => battle.players.findIndex((player) => player && String(player.id) === String(profileId)))
    .filter((index) => index >= 0);
  if (battle.serverManaged && storedWinnerIndices.length) {
    winnerIndices = storedWinnerIndices;
    winnerIndex = storedWinnerIndices[0];
  } else {
    const scores = hasTerminalMode
      ? displayedResults.map((items) => Number(items[items.length - 1]?.value || 0))
      : totals;
    if (battle.playerOption.family === "team") {
      const teamCount = getBattleTeamCount(battle.playerOption);
      const teamSize = battle.players.length / teamCount;
      const teamTotals = Array.from({ length: teamCount }, (_, teamIndex) => (
        scores.slice(teamIndex * teamSize, (teamIndex + 1) * teamSize).reduce((sum, value) => sum + value, 0)
      ));
      const winningTeamTotal = hasWildMode ? Math.min(...teamTotals) : Math.max(...teamTotals);
      winnerIndices = teamTotals.flatMap((value, teamIndex) => (
        value === winningTeamTotal
          ? Array.from({ length: teamSize }, (_, index) => teamIndex * teamSize + index)
          : []
      ));
    } else {
      const winningTotal = hasWildMode ? Math.min(...scores) : Math.max(...scores);
      winnerIndices = scores.map((value, index) => value === winningTotal ? index : -1).filter((index) => index >= 0);
    }
    winnerIndex = winnerIndices[0] ?? 0;
  }
  const winner = battle.players[winnerIndex] || battle.players[0];
  const winners = winnerIndices.map((index) => battle.players[index]).filter(Boolean);
  const teamCount = getBattleTeamCount(battle.playerOption);
  const teamSize = teamCount ? battle.players.length / teamCount : 0;
  const isTeamWin = battle.phase === "finished" && teamSize > 0 && winners.length === teamSize;
  const isTeamTie = battle.phase === "finished" && teamSize > 0 && winners.length > teamSize;
  const isIndividualTie = battle.phase === "finished" && teamSize === 0 && winners.length > 1;
  const isTie = isTeamTie || isIndividualTie;
  const isSplitPayout = battle.phase === "finished" && winners.length > 1;
  const calculatedPotValue = totals.reduce((sum, value) => sum + value, 0);
  const potValue = Number(battle.payout_value || calculatedPotValue);
  const storedWinnerPayouts = Array.isArray(battle.payouts)
    ? battle.payouts.filter((payout) => winnerIndices.some((index) => String(battle.players[index]?.id) === String(payout?.profile_id)))
    : [];
  const tieShare = isSplitPayout
    ? Number(storedWinnerPayouts[0]?.amount ?? potValue / Math.max(1, winners.length))
    : Number(storedWinnerPayouts[0]?.amount ?? potValue);
  const splitPayoutAmounts = storedWinnerPayouts.length
    ? storedWinnerPayouts.map((payout) => Number(payout?.amount || 0))
    : [Math.floor(tieShare)];
  const smallestSplitPayout = Math.min(...splitPayoutAmounts);
  const splitPayoutText = formatPriceValue(smallestSplitPayout, { compactNumbers: false });

  const callBot = async (index) => {
    if (callingBotSlot !== null) return;
    const usedBotIds = new Set(battle.players.filter(Boolean).map((player) => String(player.id)));
    const availableBots = botProfiles.filter((bot) => !usedBotIds.has(String(bot.id)));
    const optimisticBot = availableBots[Math.floor(Math.random() * availableBots.length)] || null;
    const previousBattle = battle;
    setCallingBotSlot(index);
    if (optimisticBot) {
      setBattle((current) => {
        if (!current || current.id !== battle.id || current.players[index]) return current;
        const players = [...current.players];
        players[index] = optimisticBot;
        return {
          ...current,
          players,
        };
      });
    }
    try {
      const response = await apiRequest(`/api/case-battles/${encodeURIComponent(battle.id)}/call-bot`, {
        method: "POST",
        body: JSON.stringify({ slot_index: index, bot_profile_id: optimisticBot?.id || undefined }),
      });
      if (response?.battle) {
        setBattle((current) => normalizeBattleGame(response.battle, current || previousBattle));
      }
    } catch (error) {
      if (optimisticBot) {
        setBattle((current) => current?.id === previousBattle.id ? previousBattle : current);
      }
      notifications.error(error?.message || "Unable to call a bot.");
    } finally {
      setCallingBotSlot(null);
    }
  };

  const joinBattle = async (index) => {
    if (joiningSlot !== null || callingBotSlot !== null || !canJoinBattle) return;
    if (!viewerProfileId) {
      setAuthModalOpen(true);
      return;
    }
    const previousBattle = battle;
    setJoiningSlot(index);
    setBattle((current) => {
      if (!current || current.id !== battle.id || current.players[index]) return current;
      const players = [...current.players];
      players[index] = {
        id: viewerProfileId,
        type: "user",
        name: String(viewer?.username || "Player"),
        avatar: viewer?.avatar_headshot_url || viewer?.avatar_url || null,
      };
      return {
        ...current,
        players,
      };
    });
    try {
      const response = await apiRequest(`/api/case-battles/${encodeURIComponent(battle.id)}/join`, {
        method: "POST",
        body: JSON.stringify({ slot_index: index }),
      });
      if (response?.battle) {
        setBattle((current) => normalizeBattleGame(response.battle, current || previousBattle));
      }
    } catch (error) {
      setBattle((current) => current?.id === previousBattle.id ? previousBattle : current);
      notifications.error(error?.message || "Unable to join this Case Battle.");
    } finally {
      setJoiningSlot(null);
    }
  };

  const shareBattle = async () => {
    try {
      const battleUrl = new URL(`/battles/${encodeURIComponent(battle.id)}`, window.location.origin).href;
      await navigator.clipboard.writeText(battleUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="bb-battle">
      <div className="bb-battle-shell">
        <header className="bb-battle-top">
          <div className="bb-battle-top-left">
            <button type="button" className="bb-battle-back" onClick={onBack} aria-label="Go back"><BattleBackIcon /></button>
            <button type="button" className="bb-battle-cost" title="Battle total"><img src={COIN_ICON} alt="" /><span>{formatPriceValue(totalCost, { compactNumbers: false })}</span></button>
          </div>
          <div className="bb-battle-top-right">
            <button type="button" className="bb-icon-action" title="Open fairness info" onClick={() => setFairnessOpen(true)}><FairnessShieldIcon />Fairness</button>
            <button type="button" className="bb-icon-action" title="Copy battle link" onClick={shareBattle}>{copied ? <Check size={18} color="#4088f5" /> : <BattleShareIcon />}{copied ? "Copied" : "Share"}</button>
          </div>
        </header>

        <div className="bb-battle-meta">
          <div className="bb-battle-meta-left">
            <span className="bb-mode-badges">
              {modeIds.map((modeId) => {
                const modeOption = MODE_OPTIONS.find((option) => option.id === modeId) || MODE_OPTIONS[0];
                return (
                  <span className="bb-mode-badge" style={{ "--battle-mode-color": modeOption.color }} title={modeOption.title} key={modeId}>
                    <CreationModeIcon type={modeId} />
                  </span>
                );
              })}
            </span>
            <span className="bb-meta-divider" />
            <span className="bb-meta-type">{battle.playerOption.label}</span>
          </div>
          <div className="bb-case-strip">
            <div className="bb-case-strip-track" style={{ transform: `translate3d(${69 - displayedRound * 65}px,0,0)` }}>
              {battle.cases.map((caseItem, actualIndex) => (
                  <button
                    type="button"
                    key={caseItem.id + actualIndex}
                    className={"bb-strip-case" + (actualIndex === displayedRound ? " bb-strip-case-active" : "")}
                    onClick={() => onPreview(caseItem)}
                    title="Open case content"
                  >
                    <img src={caseItem.image} alt="case-img" draggable={false} onError={handleCaseImageError} />
                  </button>
              ))}
            </div>
          </div>
          <div className="bb-battle-meta-right">Case {Math.min(displayedRound + 1, battle.cases.length)} of {battle.cases.length}</div>
        </div>

        <div className="bb-reel-box">
          <div className="bb-reel-inner">
            <div className="bb-spinner-wrap">
              <div className={`bb-spinner${battle.players.length === 6 ? " bb-spinner-six-player" : ""}${winnerVisible ? " bb-spinner-hide-reels" : ""}${battle.phase === "countdown" ? " bb-spinner-countdown" : ""}`}>
                <div className="bb-spinner-inner" ref={spinnerInnerRef}>
                  {battle.players.map((player, index) => (
                    <div className="bb-spinner-column" key={index}>
                      {isWaitingForPlayers ? (
                        player ? (
                          <div className="bb-ready">
                            <div className="bb-ready-text"><span>READY TO START</span></div>
                            {index === 0 && canCancelBattle && (
                              <button type="button" className="bb-btn bb-btn-danger bb-mini-button" onClick={onCancel}>Cancel</button>
                            )}
                          </div>
                        ) : (
                          <div className="bb-waiting">
                            <div className="bb-waiting-text">WAITING FOR PLAYER</div>
                            {canManageBattle ? (
                              <button type="button" className="bb-btn bb-btn-secondary bb-mini-button" disabled={callingBotSlot !== null || joiningSlot !== null} onClick={() => callBot(index)}>{callingBotSlot === index ? "Calling..." : "Call Bot"}</button>
                            ) : (
                              <button type="button" className="bb-btn bb-btn-primary bb-mini-button" disabled={viewerAlreadyJoined || joiningSlot !== null} onClick={() => joinBattle(index)}>{viewerAlreadyJoined ? "Joined" : joiningSlot === index ? "Joining..." : "Join"}</button>
                            )}
                          </div>
                        )
                      ) : battle.phase === "countdown" ? (
                        <div className="bb-countdown-column" aria-hidden="true" />
                      ) : (
                        <div className="bb-wheel">
                          <div
                            className="bb-wheel-track"
                            ref={index === 0 ? firstWheelTrackRef : undefined}
                            style={{
                              transform: `translate3d(0,${reelPosition}px,0)`,
                              transition: reelTransition,
                            }}
                          >
                            {(battle.reels?.[index] || buildReel(currentCase)).map((item, reelIndex) => {
                              const accent = item.accent || getInventoryItemAccent(item);
                              const active = reelIndex === activeReelIndex;
                              const showResult = hasSpinResult && reelIndex === REEL_STOP_INDEX;
                              return (
                                <div className={`bb-reel-item${active ? " is-active" : ""}${showResult ? " is-result" : ""}`} key={item.reelKey}>
                                  <div
                                    className="bb-reel-image"
                                    style={{
                                      "--reel-glow": "rgba(" + accent + ",.5)",
                                      "--reel-glow-shadow": "rgba(" + accent + ",.7)",
                                    }}
                                  >
                                    <img src={item.image} alt={item.name} draggable={false} onError={handleItemImageError} />
                                  </div>
                                  {showResult && (
                                    <div className="bb-reel-result">
                                      <div className="bb-reel-result-name" title={item.name}>{item.name}</div>
                                      <div className="bb-reel-result-value">
                                        <img src={COIN_ICON} alt="" />
                                        <span>{formatPriceValue(item.value, { compactNumbers: false })}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {battle.phase === "countdown" && (
                  <div className="bb-countdown">
                    <div className="bb-countdown-center">
                      <div className="bb-countdown-title">Battle starts in</div>
                      <div className="bb-countdown-number" key={battle.countdown}>{battle.countdown}</div>
                    </div>
                  </div>
                )}

                {battle.phase === "finished" && winnerVisible && (
                  <div className="bb-winner-overlay">
                    <div className="bb-winner-panel">
                      <div className="bb-winner-title">{isTie ? "That's a Tie!" : isTeamWin ? "Battle Winners" : "Battle Winner"}</div>
                      <div className="bb-winner-avatar-wrap">
                        <div className="bb-winner-avatar-row">
                          {(isSplitPayout ? winners : [winner]).map((winningPlayer, index) => (
                            <div className="bb-winner-avatar" title={winningPlayer?.name || "Winner"} key={(winningPlayer?.name || "winner") + index}>
                              <img src={winningPlayer?.avatar || "/login.png"} alt={winningPlayer?.name || "Winner"} />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bb-winner-name">{isTeamWin ? "Winning Team" : isTeamTie ? "Split between tied teams" : isIndividualTie ? `Split between ${winners.length} tied winners` : (winner?.name || "Winner")}</div>
                      <div className="bb-winner-amount"><img src={COIN_ICON} alt="" /><span>{formatPriceValue(potValue, { compactNumbers: false })}</span></div>
                      <div className="bb-winner-sub">{isSplitPayout ? <>Each gets <span style={{ fontWeight: 700 }}>{splitPayoutText}</span></> : "Won this battle"}</div>
                      {isIndividualTie && <div className="bb-winner-sub bb-winner-tie-note">Split between tied winners</div>}
                      <button type="button" className="bb-btn bb-btn-primary bb-recreate" onClick={onRecreate}><RefreshCw size={14} strokeWidth={2.5} />Recreate this Battle</button>
                    </div>
                  </div>
                )}
              </div>
              {isWaitingForPlayers && (
                <div className="bb-spinner-footer"><div className="bb-spinner-note">{allJoined ? "Battle ready to start." : "Waiting for others to join..."}</div></div>
              )}
            </div>
          </div>
        </div>

        <div className="bb-bottom-box">
          <div className="bb-players-scroller-outer">
            <div className={`bb-players-scroller${battle.players.length === 6 ? " bb-players-scroller-six" : ""}`} style={{ "--player-cols": battle.players.length }}>
              {battle.players.map((player, index) => (
                <div className="bb-player-card-wrap" key={(player?.name || "awaiting") + index}>
                  <BattlePlayerCard player={player} results={displayedResults[index]} onProfileOpen={onProfileOpen} />
                </div>
              ))}
            </div>
            {battle.players.length > 1 && (
              <div className="bb-vs-overlay" aria-hidden="true">
                {(battle.playerOption.family === "ffa"
                  ? battle.players.slice(0, -1).map((_, index) => index + 1)
                  : Array.from({ length: Math.max(0, teamCount - 1) }, (_, index) => (index + 1) * teamSize)
                ).map((boundary) => (
                <div
                  className="bb-vs-badge"
                  style={{
                    left: `calc(${(boundary / battle.players.length) * 100}% + ${1 - (2 * boundary) / battle.players.length}px)`,
                    top: battle.results.some((items) => items.length > 0) ? "98.5px" : "88px",
                  }}
                  key={boundary}
                >
                    <span className="bb-vs-icon"><BattleVersusIcon /></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {fairnessOpen && <FairnessModal battle={battle} onClose={() => setFairnessOpen(false)} />}
    </div>
  );
}

export default function CaseBattles({ battleId = "" }) {
  const user = useAuth((state) => state.user);
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen);
  const navigate = useNavigate();
  const [screen, setScreen] = useState(battleId ? "battle" : "list");
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState("");
  const [botProfiles, setBotProfiles] = useState([]);
  const [battles, setBattles] = useState([]);
  const [battlesLoading, setBattlesLoading] = useState(true);
  const [battlesError, setBattlesError] = useState("");
  const [creatingBattle, setCreatingBattle] = useState(false);
  const [selectedCases, setSelectedCases] = useState([]);
  const [playerOption, setPlayerOption] = useState(PLAYER_OPTIONS.find((item) => item.id === "ffa-2"));
  const [selectedMode, setSelectedMode] = useState("normal");
  const [fastSpin, setFastSpin] = useState(false);
  const [previewCase, setPreviewCase] = useState(null);
  const [battle, setBattle] = useState(null);
  const [directBattleError, setDirectBattleError] = useState("");
  const [selectedProfile, setSelectedProfile] = useState(null);
  const pendingCreateIdRef = useRef(null);
  const ownedBattleIdsRef = useRef(new Set());

  const normalizeBattleRow = (row, previous = null) => {
    if (!row?.id) return normalizeBattleGame(row, previous);
    const battleId = String(row.id);
    const normalized = normalizeBattleGame(row, previous);
    if (normalized) {
      const activeProfileId = String(user?.profile_id || user?.id || "");
      const activeUsername = String(user?.username || "").trim().toLowerCase();
      const creatorProfileId = String(normalized.creator_profile_id || normalized.players?.[0]?.id || "");
      const creatorUsername = String(normalized.creator_username || normalized.players?.[0]?.name || "").trim().toLowerCase();
      normalized.ownedByViewer = Boolean(
        previous?.ownedByViewer
        || row?.ownedByViewer
        || ownedBattleIdsRef.current.has(battleId)
        || (activeProfileId && activeProfileId === creatorProfileId)
        || (activeUsername && creatorUsername && activeUsername === creatorUsername),
      );
      if (normalized.ownedByViewer) ownedBattleIdsRef.current.add(battleId);
    }
    return normalized;
  };

  useEffect(() => {
    const selectedId = String(battleId || "").trim();
    if (!selectedId) {
      setDirectBattleError("");
      return undefined;
    }

    let mounted = true;
    setScreen("battle");
    setDirectBattleError("");
    setBattle((current) => current?.id === selectedId ? current : null);
    void apiRequest(`/api/case-battles/${encodeURIComponent(selectedId)}`)
      .then((response) => {
        if (!mounted) return;
        if (!response?.battle) throw new Error("This Case Battle could not be loaded.");
        setBattle((current) => normalizeBattleRow(
          response.battle,
          current?.id === selectedId ? current : null,
        ));
      })
      .catch((error) => {
        if (!mounted) return;
        setBattle(null);
        setDirectBattleError(error?.message || "This Case Battle could not be loaded.");
      });

    return () => { mounted = false; };
  }, [battleId]);

  useEffect(() => {
    let mounted = true;
    const loadCases = async () => {
      setCasesLoading(true);
      setCasesError("");
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("active", true)
        .order("price", { ascending: false });
      if (!mounted) return;
      if (error) {
        setCases([]);
        setCasesError("Unable to load cases right now.");
      } else {
        setCases((data || []).map(normalizeCase));
      }
      setCasesLoading(false);
    };
    void loadCases();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    const applyBattleRow = (row) => {
      setBattles((current) => {
        const previous = current.find((item) => item.id === String(row.id)) || null;
        const normalized = normalizeBattleRow(row, previous);
        if (!normalized) return current;
        if (normalized.status === "cancelled") return current.filter((item) => item.id !== normalized.id);
        if (isResolvedBattleExpired(normalized)) return current.filter((item) => item.id !== normalized.id);
        const exists = current.some((item) => item.id === normalized.id);
        const next = exists
          ? current.map((item) => item.id === normalized.id ? normalized : item)
          : [normalized, ...current];
        return next.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      });
      setBattle((current) => current?.id === String(row.id) ? normalizeBattleRow(row, current) : current);
    };
    const loadBattles = async () => {
      setBattlesLoading(true);
      setBattlesError("");
      try {
        const response = await apiRequest("/api/case-battles");
        if (!mounted) return;
        const now = Date.now();
        setBattles((Array.isArray(response?.battles) ? response.battles : [])
          .map((row) => normalizeBattleRow(row))
          .filter((loadedBattle) => loadedBattle && !isResolvedBattleExpired(loadedBattle, now)));
      } catch (error) {
        if (!mounted) return;
        setBattles([]);
        setBattlesError(error?.message || "Unable to load Case Battles.");
      } finally {
        if (mounted) setBattlesLoading(false);
      }
    };
    void loadBattles();

    const channel = supabase
      .channel("case-battle-games-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "case_battle_games" }, (payload) => {
        const row = payload.new || payload.old;
        if (!row) return;
        if (payload.eventType === "DELETE") {
          setBattles((current) => current.filter((item) => item.id !== String(row.id)));
          return;
        }
        applyBattleRow(row);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const timers = [];

    battles.forEach((listedBattle) => {
      if (listedBattle?.status !== "resolved") return;

      if (listedBattle.isExiting) {
        timers.push(window.setTimeout(() => {
          setBattles((current) => current.filter((item) => item.id !== listedBattle.id));
        }, BATTLE_ROW_EXIT_ANIMATION_MS));
        return;
      }

      const remaining = Math.max(
        0,
        RESOLVED_BATTLE_LIFETIME_MS - getResolvedBattleAge(listedBattle),
      );
      timers.push(window.setTimeout(() => {
        setBattles((current) => current.map((item) => (
          item.id === listedBattle.id ? { ...item, isExiting: true } : item
        )));
      }, remaining));
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [battles]);

  useEffect(() => {
    let mounted = true;
    const loadBots = async () => {
      const { data, error } = await supabase
        .from("bot_profiles")
        .select("id,username,avatar_url,avatar_headshot_url")
        .order("username", { ascending: true });
      if (!mounted || error) return;
      setBotProfiles((data || []).map(normalizeBotProfile).filter(Boolean));
    };
    void loadBots();
    return () => { mounted = false; };
  }, []);

  const createBattle = async () => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    if (creatingBattle || selectedCases.length < 1) return;
    setCreatingBattle(true);
    const requestId = pendingCreateIdRef.current || window.crypto.randomUUID();
    pendingCreateIdRef.current = requestId;
    try {
      const response = await apiRequest("/api/case-battles", {
        method: "POST",
        body: JSON.stringify({
          request_id: requestId,
          case_ids: selectedCases.map((caseItem) => caseItem.id),
          player_option: playerOption.id,
          modes: getSelectedModeIds(selectedMode),
          fast_spin: fastSpin,
        }),
      });
      const createdBattle = normalizeBattleRow(response?.battle);
      if (!createdBattle) throw new Error("The created Case Battle could not be loaded.");
      createdBattle.ownedByViewer = true;
      ownedBattleIdsRef.current.add(createdBattle.id);
      pendingCreateIdRef.current = null;
      setBattles((current) => [createdBattle, ...current.filter((item) => item.id !== createdBattle.id)]);
      setBattle(createdBattle);
      setScreen("battle");
      navigate(`/battles/${encodeURIComponent(createdBattle.id)}`);
      notifications.success("Case Battle Created!");
    } catch (error) {
      if (error?.status && error.status < 500) pendingCreateIdRef.current = null;
      notifications.error(error?.message || "Unable to create this Case Battle.");
    } finally {
      setCreatingBattle(false);
    }
  };

  const cancelBattle = async () => {
    if (!battle?.id) return;
    try {
      await apiRequest(`/api/case-battles/${encodeURIComponent(battle.id)}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setBattles((current) => current.filter((item) => item.id !== battle.id));
      setBattle(null);
      setScreen("list");
      navigate("/battles", { replace: true });
    } catch (error) {
      notifications.error(error?.message || "Unable to cancel this Case Battle.");
    }
  };

  const openCreation = () => {
    setSelectedCases([]);
    setPlayerOption(PLAYER_OPTIONS.find((item) => item.id === "ffa-2"));
    setSelectedMode("normal");
    setFastSpin(false);
    setScreen("create");
  };

  const leaveBattle = () => {
    if (battle?.id) {
      setBattles((current) => current.map((item) => item.id === battle.id ? { ...item, ...battle } : item));
    }
    setScreen("list");
    setBattle(null);
    navigate("/battles");
  };

  const openBattle = (selectedBattle) => {
    const selectedId = String(selectedBattle?.id || "");
    if (!selectedId) return;
    setBattle(normalizeBattleRow(selectedBattle, selectedBattle));
    setScreen("battle");
    navigate(`/battles/${encodeURIComponent(selectedId)}`);
    void apiRequest(`/api/case-battles/${encodeURIComponent(selectedId)}`)
      .then((response) => {
        setBattle((current) => current?.id === selectedId
          ? normalizeBattleRow(response?.battle, current)
          : current);
      })
      .catch(() => undefined);
  };

  const openMiniProfile = (player) => {
    if (!player || player.type !== "user") return;
    const profileCandidate = {
      ...player,
      id: player.id,
      profile_id: player.id,
      username: player.name,
      avatar_url: player.avatar,
      avatar_headshot_url: player.avatar,
    };
    setSelectedProfile(profileCandidate);
    void preloadMiniProfile(profileCandidate).then((loadedProfile) => {
      setSelectedProfile((current) => current?.profile_id === profileCandidate.profile_id
        ? { ...profileCandidate, ...(loadedProfile || {}) }
        : current);
    });
  };

  return (
    <div className="battles-page">
      <style>{BATTLE_STYLES}</style>
      {screen === "list" && (
        <BattlesList battles={battles} loading={battlesLoading} error={battlesError} onCreate={openCreation} onView={openBattle} onPreview={setPreviewCase} onProfileOpen={openMiniProfile} />
      )}
      {screen === "create" && (
        <CreationPage
          cases={cases}
          casesLoading={casesLoading}
          casesError={casesError}
          selectedCases={selectedCases}
          setSelectedCases={setSelectedCases}
          playerOption={playerOption}
          setPlayerOption={setPlayerOption}
          selectedMode={selectedMode}
          setSelectedMode={setSelectedMode}
          fastSpin={fastSpin}
          setFastSpin={setFastSpin}
          onBack={() => setScreen("list")}
          onCreate={createBattle}
          onPreview={setPreviewCase}
          creating={creatingBattle}
        />
      )}
      {screen === "battle" && battle && (
        <BattleView
          key={battle.id}
          battle={battle}
          setBattle={setBattle}
          botProfiles={botProfiles}
          onBack={leaveBattle}
          onCancel={cancelBattle}
          onRecreate={() => {
            setSelectedCases(battle.cases);
            setPlayerOption(battle.playerOption);
            setSelectedMode(battle.mode);
            setFastSpin(Boolean(battle.fastSpin));
            setScreen("create");
            navigate("/battles");
          }}
          onPreview={setPreviewCase}
          onProfileOpen={openMiniProfile}
        />
      )}
      {screen === "battle" && !battle && (
        <div className="bb-picker-empty">{directBattleError || "Loading Case Battle..."}</div>
      )}
      {previewCase && <CasePreview item={previewCase} onClose={() => setPreviewCase(null)} />}
      <MiniProfileModal isOpen={Boolean(selectedProfile)} player={selectedProfile} onClose={() => setSelectedProfile(null)} />
    </div>
  );
}
