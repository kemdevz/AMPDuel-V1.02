import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../lib/apiClient";
import { useAuth } from "../store/auth";
import { connectSocket } from "../lib/socket";
import { isUuidLike, supabase } from "../lib/supabaseClient";
import LoginModal from "./LoginModal";
import AnimatedNumber from "./AnimatedNumber";
import MiniProfileModal from "./MiniProfileModal";
import TipUserModal from "./TipUserModal";
import CoinTipModal from "./CoinTipModal";
import { notifications } from "./Notifications";
import { DiscordIcon, XIcon } from "./icons";
import { getRoleStyle } from "../lib/roleStyles";
import { loadRecaptcha, RECAPTCHA_TEST_SITE_KEY } from "../lib/recaptcha";

const COIN_ICON = "/bobux.png";
const LEGACY_CHAT_MESSAGES_STORAGE_KEY = "bloxy_chat_messages_v1";
const CHAT_SESSION_STORAGE_KEY = "bloxy_chat_session_v2";
const MAX_STORED_CHAT_MESSAGES = 20;
const MAX_CHAT_MESSAGE_LENGTH = 100;
function RainCaptchaOverlay({ isOpen, isSubmitting, error, onClose, onVerify }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const verifyRef = useRef(onVerify);
  const closeRef = useRef(onClose);
  verifyRef.current = onVerify;
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmitting) closeRef.current?.();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return undefined;

    let cancelled = false;
    const sitekey = import.meta.env.DEV
      ? RECAPTCHA_TEST_SITE_KEY
      : import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

    if (!sitekey) {
      notifications.error("reCAPTCHA is not configured.");
      closeRef.current?.();
      return undefined;
    }

    void loadRecaptcha()
      .then((grecaptcha) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = grecaptcha.render(containerRef.current, {
          sitekey,
          theme: "dark",
          size: window.innerWidth < 380 ? "compact" : "normal",
          callback: (token) => verifyRef.current?.(token),
          "error-callback": () => notifications.error("Verification failed. Please try again."),
          "expired-callback": () => {
            if (widgetIdRef.current != null) grecaptcha.reset(widgetIdRef.current);
          },
        });
      })
      .catch((loadError) => {
        if (!cancelled) {
          notifications.error(loadError?.message || "Google reCAPTCHA failed to load.");
          closeRef.current?.();
        }
      });

    return () => {
      cancelled = true;
      if (window.grecaptcha && widgetIdRef.current != null) {
        window.grecaptcha.reset(widgetIdRef.current);
      }
      if (containerRef.current) containerRef.current.replaceChildren();
      widgetIdRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!error || !window.grecaptcha || widgetIdRef.current == null) return;
    window.grecaptcha.reset(widgetIdRef.current);
  }, [error]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex animate-[rainCaptchaFadeIn_.5s_ease-out] items-center justify-center bg-black/50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose?.();
      }}
    >
      <style>{`
        @keyframes rainCaptchaFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div ref={containerRef} className="flex max-w-[calc(100vw-32px)] items-center justify-center" />
    </div>
  );
}

function normalizeStoredMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const uniqueMessages = new Map();
  for (const message of messages) {
    if (!message || typeof message !== "object" || !message.id) continue;
    uniqueMessages.set(String(message.id), message);
  }
  return [...uniqueMessages.values()].slice(-MAX_STORED_CHAT_MESSAGES);
}

function readStoredChatSession() {
  if (typeof window === "undefined") return null;
  try {
    const storedSession = JSON.parse(window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY) || "null");
    if (!storedSession?.serverId) return null;
    return {
      serverId: String(storedSession.serverId),
      messages: normalizeStoredMessages(storedSession.messages),
    };
  } catch {
    return null;
  }
}

const CUSTOM_EMOJIS = [
  { name: "peepocute", token: ":peepocute:", src: "https://i.ibb.co/svZLWLF5/fullsize-3.gif" },
  { name: "peepowriting", token: ":peepowriting:", src: "https://media.tenor.com/DCv5P2LRzbwAAAAm/pepe-peepo.webp" },
  { name: "peepojump", token: ":peepojump:", src: "https://media.tenor.com/2jyXimGaXXkAAAAm/peepo-hyperyump.webp" },
  { name: "pepehooray", token: ":pepehooray:", src: "https://media.tenor.com/ag481yU1Fq8AAAAm/pepe-hooray.webp" },
  { name: "peepodance", token: ":peepodance:", src: "https://media.tenor.com/BJRtqNO-VWAAAAAm/fortnite-pepe-the-frog.webp" },
  { name: "peepomoney", token: ":peepomoney:", src: "https://media.tenor.com/Ampe7OGwvq8AAAAm/peepo-money.webp" },
  { name: "peepomoneyrain", token: ":peepomoneyrain:", src: "https://media.tenor.com/dl3I6S8ATI8AAAAm/pepe.webp" },
  { name: "peepoban", token: ":peepoban:", src: "https://media.tenor.com/c92qA2SXFnAAAAAm/pepe-ban.webp" },
  { name: "smoge", token: ":smoge:", src: "https://media.tenor.com/aRbyq_LPNfoAAAAm/smoge.webp" },
  { name: "peeporain", token: ":peeporain:", src: "https://media.tenor.com/8DMto4GzC7MAAAAm/peeporain.webp" },
  { name: "peeporiot", token: ":peeporiot:", src: "https://media.tenor.com/aMbizWxQ8BQAAAAm/peepo-riot-peepo.webp" },
  { name: "peepogun", token: ":peepogun:", src: "https://media.tenor.com/dwRrfPj_HG8AAAAm/1.webp" },
  { name: "nopers", token: ":nopers:", src: "https://media.tenor.com/t4tEcFOYT-EAAAAi/nopers-peepo.gif" },
  { name: "cathi", token: ":cathi:", src: "https://media.tenor.com/OFkETBzqZ7IAAAAm/hi.webp" },
  { name: "cathappy", token: ":cathappy:", src: "https://i.ibb.co/chhtMNVZ/1268325149250420878.gif" },
  { name: "catkiss", token: ":catkiss:", src: "https://media.tenor.com/qF1EFfZpIo8AAAAm/cat.webp" },
  { name: "catdance", token: ":catdance:", src: "https://media.tenor.com/VS2QBT0JNN0AAAAm/cat-meme.webp" },
  { name: "gigachad", token: ":gigachad:", src: "https://i.ibb.co/1C5t348/1251534788071002113.webp" },
  { name: "topg", token: ":topg:", src: "https://i.ibb.co/4Zvq9knZ/andrew-tate-top-g.gif" },
  { name: "patrickno", token: ":patrickno:", src: "https://i.ibb.co/Kp5857qK/fullsize.gif" },
  { name: "patrickomg", token: ":patrickomg:", src: "https://i.ibb.co/xK7WsLwQ/1251534813903454231.webp" },
  { name: "patrickdownsida", token: ":patrickdownsida:", src: "https://media.tenor.com/WvAnFp76OLMAAAAm/downsida.webp" },
  { name: "speedomg", token: ":speedomg:", src: "https://media.tenor.com/fK_4h5l7fCoAAAAm/lsg.webp" },
  { name: "mymomskindahomeless", token: ":mymomskindahomeless:", src: "https://media.tenor.com/Dd2dQDlK2cAAAAAm/ishowspeed-speed.webp" },
  { name: "happy", token: ":happy:", src: "https://media.tenor.com/eq_7sVufgyUAAAAm/jupijej.webp" },
  { name: "hahaha", token: ":hahaha:", src: "https://media.tenor.com/1qp0SFaROj0AAAAm/laughing-emoji.webp" },
  { name: "blush", token: ":blush:", src: "https://media.tenor.com/Yky94ApDC0kAAAAm/innocent-face.webp" },
  { name: "zob", token: ":zob:", src: "https://media.tenor.com/0Fe-24WC1FAAAAAm/cry-emoji-cry.webp" },
  { name: "what", token: ":what:", src: "https://media.tenor.com/BnnE5xMh1e0AAAAm/what-emoji.webp" },
  { name: "nerd", token: ":nerd:", src: "https://media.tenor.com/2WSfERKMlmsAAAAm/actually.webp" },
  { name: "shrug", token: ":shrug:", src: "https://i.ibb.co/DH367K9c/image.png" },
  { name: "shocked", token: ":shocked:", src: "https://c.tenor.com/urOZqnZF9e4AAAAC/tenor.gif" },
  { name: "skull", token: ":skull:", src: "https://media.tenor.com/K4peC4sKfUwAAAAi/skull.gif" },
  { name: "explodingskull", token: ":explodingskull:", src: "https://media.tenor.com/eForqSVDBc4AAAAi/exploding-skull.gif" },
  { name: "lose", token: ":lose:", src: "https://i.ibb.co/zWpsThsZ/lose.avif" },
  { name: "clap", token: ":clap:", src: "https://i.ibb.co/LD73SffD/fullsize-1.gif" },
  { name: "duckdance", token: ":duckdance:", src: "https://i.ibb.co/bgtWZSWQ/fullsize-7.gif" },
  { name: "beewiggle", token: ":beewiggle:", src: "https://i.ibb.co/jk44Kq7m/fullsize-2.gif" },
  { name: "racoon", token: ":racoon:", src: "https://i.ibb.co/ynL2yWP8/1251534820815802388.gif" },
  { name: "volumedown", token: ":volumedown:", src: "https://i.ibb.co/4Rz82g9f/fullsize-5.gif" },
  { name: "lowcortisol", token: ":lowcortisol:", src: "https://i.ibb.co/zhDfyRG3/fullsize-4.gif" },
  { name: "highcortisol", token: ":highcortisol:", src: "https://i.ibb.co/dRWVbjv/fullsize-6.gif" },
];
const EMOJI_BY_TOKEN = new Map(CUSTOM_EMOJIS.map((emoji) => [emoji.token.toLowerCase(), emoji]));

const AVATARS = {
  incarent:
    "https://cdn.discordapp.com/avatars/1327712945572151453/f64c7b2cdee23f705b8287713a85242d.png?size=256",
  bubbleblower:
    "https://cdn.discordapp.com/avatars/1055970836013650011/a_6d91da1094a2c11322b548f32c48f838.gif?size=256",
  brain:
    "https://cdn.discordapp.com/avatars/1324037731608825927/e9d72bf5beb6ff66a6bdf60b0af31db1.png?size=256",
  king:
    "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-A698E4BE62E38E615922B59DFE99C4F8-Png/420/420/AvatarHeadshot/Png/noFilter",
  akif:
    "https://cdn.discordapp.com/avatars/1517163975018811502/e02f9426c47c95f700f9f7278a936670.png?size=256",
  riley:
    "https://cdn.discordapp.com/avatars/1490506245147328543/b0d9419c14da9aca7ef6198973dc4753.png?size=256",
  staff:
    "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-A28B97ECD6B60359D53B890B143B658E-Png/420/420/AvatarHeadshot/Png/noFilter",
  allIn:
    "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-067FB935D2683445A809EA490FB7F24C-Png/420/420/AvatarHeadshot/Png/noFilter",
};


function getChatTime(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatChatMessageTime(value) {
  const rawValue = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(rawValue)) return rawValue;

  const parsedDate = new Date(rawValue);
  return Number.isNaN(parsedDate.getTime()) ? getChatTime() : getChatTime(parsedDate);
}

function getNotificationTime(date = new Date()) {
  const period = date.getHours() >= 12 ? "PM" : "AM";
  const hours = String(date.getHours() % 12 || 12).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes} ${period}`;
}

function formatCountdown(seconds) {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const remainder = Math.max(0, seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatGiveawayTimer(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainderSeconds = total % 60;
  return `${hours}h ${minutes}m ${remainderSeconds}s`;
}

function getEmojiTrigger(text, cursorIndex) {
  const beforeCursor = text.slice(0, cursorIndex);
  const match = beforeCursor.match(/(?:^|\s):([a-zA-Z0-9_]*)$/);
  if (!match) return null;

  const query = match[1];
  return {
    query,
    start: cursorIndex - query.length - 1,
    end: cursorIndex,
  };
}

function getMatchingEmojis(query) {
  const normalizedQuery = query.toLowerCase();
  if (!normalizedQuery) return CUSTOM_EMOJIS;

  return CUSTOM_EMOJIS.filter(
    (emoji) => emoji.name.toLowerCase().includes(normalizedQuery) || emoji.token.toLowerCase().includes(normalizedQuery),
  );
}

function renderEmojiText(text) {
  return String(text || '').split(/(:[a-zA-Z0-9_]+:|@[a-zA-Z0-9_]+)/g).map((part, index) => {
    const emoji = EMOJI_BY_TOKEN.get(part.toLowerCase());
    if (emoji) {
      return (
        <img
          key={`${emoji.token}-${index}`}
          src={emoji.src}
          alt={emoji.token}
          title={emoji.token}
          className="chat-inline-emoji"
          draggable={false}
          loading="lazy"
        />
      );
    }

    if (/^@[a-zA-Z0-9_]+$/.test(part)) {
      return (
        <span
          key={`${part}-${index}`}
          style={{
            color: "rgb(157, 140, 255)",
            background: "rgba(157, 140, 255, 0.1)",
            borderRadius: "4px",
            padding: "0px 3px",
            fontWeight: 700,
          }}
        >
          {part}
        </span>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function ReplyIcon() {
  return (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="16" width="16" aria-hidden="true">
      <path fill="none" d="M0 0h24v24H0z" />
      <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
    </svg>
  );
}

function EmojiIcon() {
  return (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 496 512" height="1em" width="1em" aria-hidden="true">
      <path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm80 168c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zm-160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zm194.8 170.2C334.3 380.4 292.5 400 248 400s-86.3-19.6-114.8-53.8c-13.6-16.3 11-36.7 24.6-20.5 22.4 26.9 55.2 42.2 90.2 42.2s67.8-15.4 90.2-42.2c13.4-16.2 38.1 4.2 24.6 20.5z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="1em" width="1em" aria-hidden="true">
      <path fill="none" d="M0 0h24v24H0z" />
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function TwitchIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M391.17,103.47H352.54v109.7h38.63ZM285,103H246.37V212.75H285ZM120.83,0,24.31,91.42V420.58H140.14V512l96.53-91.42h77.25L487.69,256V0ZM449.07,237.75l-77.22,73.12H294.61l-67.6,64v-64H140.14V36.58H449.07Z" />
    </svg>
  );
}

function TipIcon() {
  return (
    <svg width="21" height="21" xmlns="http://www.w3.org/2000/svg" viewBox="0.08 0.5 19.83 17" aria-hidden="true" className="text-white">
      <path
        d="M19.3823 0.5L0.617671 0.5C0.475984 0.500077 0.340129 0.544337 0.239941 0.623059C0.139754 0.701781 0.0834259 0.80853 0.0833282 0.91986L0.0833282 5.74681C0.0834259 5.85814 0.139754 5.96489 0.239941 6.04361C0.340129 6.12233 0.475984 6.16659 0.617671 6.16667L3.72423 6.16667C3.90317 5.67178 4.21057 5.21137 4.62709 4.81443L2.45655 4.81443C2.28806 4.81454 2.12637 4.7622 2.00689 4.66886C1.8874 4.57551 1.81985 4.44877 1.81902 4.31639L1.81902 2.35028C1.81908 2.21744 1.88626 2.09005 2.00581 1.99611C2.12536 1.90218 2.28748 1.84939 2.45655 1.84934L17.4771 1.84934C17.6462 1.84939 17.8083 1.90218 17.9278 1.99611C18.0474 2.09005 18.1146 2.21744 18.1146 2.35028V4.31639C18.1138 4.44877 18.0463 4.57551 17.9268 4.66886C17.8073 4.7622 17.6456 4.81454 17.4771 4.81443H15.3729C15.7892 5.21194 16.0977 5.6721 16.2794 6.16667H19.3823C19.524 6.16659 19.6599 6.12233 19.76 6.04361C19.8602 5.96489 19.9166 5.85814 19.9167 5.74681V0.91986C19.9166 0.80853 19.8602 0.701781 19.76 0.623059C19.6599 0.544337 19.524 0.500077 19.3823 0.5Z"
        fill="currentColor"
      />
      <path d="M10 15.0431C13.7916 15.0431 16.8654 13.0561 16.8654 10.6049C16.8654 8.15372 13.7916 6.16666 10 6.16666C6.20835 6.16666 3.13461 8.15372 3.13461 10.6049C3.13461 13.0561 6.20835 15.0431 10 15.0431Z" fill="currentColor" />
      <path d="M16.8654 12.9969V13.0618C16.8654 15.515 13.7939 17.5 10 17.5C6.20609 17.5 3.13461 15.515 3.13461 13.0618V12.9969C4.43323 14.6396 7.02603 15.7636 10 15.7636C12.974 15.7636 15.5668 14.6396 16.8654 12.9969Z" fill="currentColor" />
    </svg>
  );
}

function RulesIcon() {
  return (
    <svg viewBox="0 0 17 17" fill="none" aria-hidden="true">
      <path
        d="M12.5263 4.16987e-09C13.211 -3.81352e-05 13.8698 0.261554 14.3679 0.731254C14.8661 1.20095 15.1659 1.84325 15.2061 2.52674L15.2105 2.68421V11.6316H15.8816C16.4605 11.6316 16.9374 12.0718 16.9946 12.6355L17 12.75V14.3158C17 15.0005 16.7384 15.6592 16.2687 16.1574C15.799 16.6555 15.1567 16.9554 14.4733 16.9955L14.3158 17H5.36842C4.68376 17 4.02496 16.7384 3.52682 16.2687C3.02868 15.799 2.72885 15.1567 2.68868 14.4733L2.68421 14.3158V5.36842H1.11842C0.841538 5.36855 0.57445 5.26596 0.368841 5.08052C0.163233 4.89507 0.0337213 4.63995 0.00536846 4.36453L4.16987e-09 4.25V2.68421C-3.81352e-05 1.99955 0.261554 1.34075 0.731254 0.842609C1.20095 0.344467 1.84325 0.0446406 2.52674 0.00447379L2.68421 4.16987e-09H12.5263ZM15.2105 13.4211H7.15789V14.3158C7.15789 14.6289 7.10421 14.9305 7.00579 15.2105H14.3158C14.5531 15.2105 14.7807 15.1163 14.9485 14.9485C15.1163 14.7807 15.2105 14.5531 15.2105 14.3158V13.4211ZM8.94737 8.05263H7.15789C6.92984 8.05288 6.7105 8.14021 6.54467 8.29676C6.37884 8.45331 6.27905 8.66727 6.26569 8.89493C6.25232 9.12259 6.32639 9.34676 6.47276 9.52164C6.61913 9.69652 6.82676 9.80891 7.05321 9.83584L7.15789 9.8421H8.94737C9.17542 9.84185 9.39477 9.75453 9.56059 9.59798C9.72642 9.44143 9.82621 9.22746 9.83957 8.9998C9.85294 8.77215 9.77887 8.54798 9.6325 8.3731C9.48613 8.19822 9.27851 8.08583 9.05205 8.05889L8.94737 8.05263ZM10.7368 4.47368H7.15789C6.9206 4.47368 6.69302 4.56795 6.52522 4.73575C6.35742 4.90354 6.26316 5.13112 6.26316 5.36842C6.26316 5.60572 6.35742 5.8333 6.52522 6.0011C6.69302 6.16889 6.9206 6.26316 7.15789 6.26316H10.7368C10.9741 6.26316 11.2017 6.16889 11.3695 6.0011C11.5373 5.8333 11.6316 5.60572 11.6316 5.36842C11.6316 5.13112 11.5373 4.90354 11.3695 4.73575C11.2017 4.56795 10.9741 4.47368 10.7368 4.47368ZM2.68421 1.78947C2.44691 1.78947 2.21933 1.88374 2.05154 2.05154C1.88374 2.21933 1.78947 2.44691 1.78947 2.68421V3.57895H2.68421V1.78947Z"
        fill="currentColor"
      />
    </svg>
  );
}

function RainBar({ rainSeconds, rainPool, onRainJoin, onTipOpen, hasJoined = false, joinWindowSeconds = 300, totalDurationSeconds = 1800 }) {
  const isJoinWindow = rainSeconds <= joinWindowSeconds
  const progressPercent = Math.max(0, Math.min(100, (rainSeconds / totalDurationSeconds) * 100))
  const formattedPool = Number(rainPool || 0).toLocaleString()

  return (
    <div className="flex w-full justify-center ">
      <div className="rain-card relative z-[1] w-full overflow-hidden rounded-lg border border-[hsl(231_16%_16%)] bg-[hsl(230_16%_14%/.6)]">
        <div className="relative z-[2] px-[14px] pb-3 pt-[14px]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-[14px]">
              <div className="flex min-h-[35px] min-w-[35px] items-center justify-center">
                <img src={COIN_ICON} alt="coin" className="h-[35px] w-[35px] min-w-[35px] select-none object-contain" draggable={false} />
              </div>

              <div className="flex min-w-0 flex-col">
                <div className="flex items-center">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[23px] font-bold tracking-[.2px] text-white/90">
                    <AnimatedNumber value={Number(rainPool || 0)} />
                  </span>
                </div>
                <div className="-mt-1 flex min-w-0 items-center gap-[7px]">
                  <span className="select-none whitespace-nowrap text-base font-bold text-[#ff4fa3]">
                    Rain Pool
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-[12px]">
              <button
                type="button"
                aria-label="Tip Rain"
                onClick={onTipOpen}
                className="inline-flex h-[39px] cursor-pointer select-none items-center justify-center rounded-[7px] border-0 bg-[#2a2e44] px-[14px] text-white transition-none hover:opacity-90"
              >
                <TipIcon />
              </button>

              <button
                type="button"
                disabled={rainSeconds > joinWindowSeconds || hasJoined}
                onClick={onRainJoin}
                className={`h-[39px] select-none whitespace-nowrap rounded-[7px] border-0 bg-[#ff4fa3] px-4 text-base font-bold leading-[39px] text-black shadow-none ${rainSeconds > joinWindowSeconds ? "opacity-55" : "opacity-100"}`}
              >
                {hasJoined ? "JOINED" : isJoinWindow ? "JOIN" : formatCountdown(rainSeconds)}
              </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 z-[3] h-[3px] w-full bg-white/[.05]">
          <div
            className="h-full bg-[#ff4fa3] transition-[width] duration-1000"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ReplyPreview({ reply }) {
  if (!reply) return null;

  return (
    <button
      type="button"
      className="mb-[9px] w-full rounded-[9px] border-none bg-[#161a28] px-[11px] py-[9px] text-left outline-none transition-colors hover:bg-[#1a1e2f]"
    >
      <div className="text-[0.81rem] font-semibold text-[#A6B2D3]">
        ↪ {reply.name}
        <span className="ml-[9px] text-[0.75rem] font-medium text-[#555b82]">{reply.time}</span>
      </div>
      <div className="line-clamp-2 text-[0.86rem] font-medium text-[#9793ba] [overflow-wrap:anywhere]">{renderEmojiText(reply.text)}</div>
    </button>
  );
}

function ChatMessage({ message, onProfileOpen }) {
  const roleStyle = useMemo(() => getRoleStyle(message.role), [message.role]);
  const hasRankIcon = Boolean(roleStyle.image);

  return (
    <div className="chat-message-row group animate-[msgIn_.22s_ease-out_both]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Open ${message.name || "user"} profile`}
          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-[hsl(231_16%_16%)] transition hover:border-[#ff4fa3] focus-visible:border-[#ff4fa3] focus-visible:outline-none"
          onClick={() => onProfileOpen(message)}
        >
          {message.avatar ? (
            <img
              src={message.avatar}
              className="h-full w-full rounded-full object-cover"
              loading="lazy"
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="grid h-full w-full place-items-center bg-[hsl(230_16%_14%)] font-bold text-white/50">?</span>
          )}
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="truncate text-sm font-semibold"
            style={hasRankIcon
              ? { backgroundImage: roleStyle.nameGradient, backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" }
              : { color: "white" }}
          >
            {message.name}
          </span>
          {hasRankIcon ? <img src={roleStyle.image} className="h-6 w-6 object-contain" alt="" title={roleStyle.label} /> : null}
        </div>
      </div>
      <ReplyPreview reply={message.reply} />
      <div className="mt-2 text-wrap break-words text-sm font-medium text-gray-400">
        {renderEmojiText(message.text)}
      </div>
    </div>
  );
}

function TipNotification({ message }) {
  const amount = Number(message?.amount || 0)
  const isUserTip = message?.tip_context === 'user'
  const isItemTip = isUserTip && message?.tip_type === 'items'

  return (
    <div
      className="group relative flex gap-2.5 overflow-hidden px-3 py-2 animate-[msgIn_.22s_ease-out_both]"
      style={{ backgroundColor: "rgb(28, 31, 46)", borderRadius: "8px" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_85%,rgba(255,79,163,0.22),transparent_58%)]" />
      <div className="relative flex-1 min-w-0">
        <div className="flex flex-wrap items-center mb-0.5">
          <span className="w-max text-[0.75rem] font-semibold select-none text-[#ff4fa3]">Tip Notification</span>
          <span className="ml-auto text-[0.6rem] font-medium text-[#555b82] select-none">{formatChatMessageTime(message.time)}</span>
        </div>
        {isUserTip ? (
          <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] font-medium text-[#C7CCE2] whitespace-normal break-words">
            <span className="break-words font-semibold">{message.sender_name || message.name || 'user'}</span>
            <span className="opacity-70">tipped</span>
            <span className="break-words font-semibold">{message.recipient_name || 'user'}</span>
            {isItemTip ? <span className="opacity-70">items worth</span> : null}
            <span className="inline-flex items-center gap-1 font-semibold">
              <img src={COIN_ICON} alt="Bobux" className="h-[18px] w-[18px] select-none" draggable={false} />
              <span>{amount.toLocaleString()}</span>
            </span>
          </div>
        ) : (
          <div className="inline-flex max-w-full items-center gap-x-1 overflow-hidden whitespace-nowrap text-[0.8rem] font-medium text-[#C7CCE2]">
            <span className="truncate font-semibold">{message.name || 'Guest'}</span>
            <span className="opacity-70">tipped</span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <img src={COIN_ICON} alt="Bobux" className="h-[18px] w-[18px] select-none" draggable={false} />
              <span>{amount.toLocaleString()}</span>
            </span>
            <span className="opacity-70">into the rain</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EmojiAutocomplete({ emojis, onSelect }) {
  return (
    <div className="emoji-autocomplete">
      <div className="emoji-autocomplete-panel">
        {emojis.map((emoji) => (
          <button
            key={emoji.token}
            type="button"
            className="emoji-autocomplete-item"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(emoji.token)}
          >
            <div className="emoji-autocomplete-image-wrap">
              <img src={emoji.src} alt={emoji.name} draggable={false} loading="lazy" />
            </div>
            <span>{emoji.token}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CustomEmojiPicker({ search, emojis, onSearch, onSelect }) {
  return (
    <div
      className="_emojiPickerPortal_18i9r_6 _emojiPickerOpen_18i9r_11"
      style={{
        position: "fixed",
        bottom: "78.2512px",
        right: "61.9778px",
        zIndex: 9999,
        transformOrigin: "100% 100%",
        width: "320px",
      }}
    >
      <div className="_customEmojiPicker_abrjv_49">
        <div className="_customEmojiSearchWrap_abrjv_58">
          <input
            type="text"
            placeholder="Search emojis..."
            className="_customEmojiSearch_abrjv_58"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
        <div className="_customEmojiGrid_abrjv_81">
          {emojis.map((emoji) => (
            <button
              key={emoji.token}
              type="button"
              title={emoji.token}
              className="_customEmojiBtn_abrjv_98"
              onClick={() => onSelect(emoji.token)}
            >
              <img src={emoji.src} alt={emoji.name} draggable={false} loading="lazy" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatRulesModal({ onClose }) {
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center px-3 pb-[110px]" style={{ opacity: 1 }} onMouseDown={onClose}>
      <div
        className="bg-[#171925] rounded-xl p-4 sm:p-5 w-full max-w-[320px] text-white shadow-md cursor-default"
        style={{ opacity: 1, transform: "none" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="text-base sm:text-lg font-bold text-[#ff4fa3] mb-3 text-center">Chat Rules</h2>
        <ul className="text-xs sm:text-sm leading-relaxed text-gray-200 list-disc list-inside space-y-1">
          <li>No spamming or flooding the chat.</li>
          <li>Be respectful — no hate speech or harassment.</li>
          <li>Do not advertise other websites or platforms.</li>
          <li>Keep messages in English or the main chat language.</li>
          <li>Do not impersonate staff or other users.</li>
          <li>Breaking rules may result in mute or ban.</li>
        </ul>
      </div>
    </div>
  );
}

function GiveawayAnnouncement({ giveaway }) {
  const items = Array.isArray(giveaway?.items) ? giveaway.items : [];
  const firstItem = items[0] || null;
  const entryCount = items.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity ?? 1)), 0);
  const remainingSeconds = Math.max(0, Math.floor((new Date(giveaway?.ends_at || Date.now()).getTime() - Date.now()) / 1000));
  const timerLabel = formatGiveawayTimer(remainingSeconds);

  return (
    <div className="_giveawayBar_ars74_1">
      <div className="_slideViewport_ars74_8">
        <div
          className="_giveawayWrapper_ars74_15"
          style={{
            background: "linear-gradient(rgba(54, 123, 255, 0.12), transparent)",
            "--border-bottom": "rgba(54,123,255,0.60)",
            "--border-side": "rgba(54,123,255,0.20)",
          }}
        >
          <div className="_topRow_ars74_111">
            <span className="_username_ars74_118" role="button" tabIndex={0}>
              {giveaway?.user_name || "Guest"}
            </span>
            <span className="_hostText_ars74_127">created a giveaway</span>
            <span className="_entries_ars74_136">
              <span className="_playersIcon_ars74_148" />
              {entryCount}
            </span>
          </div>
          <div className="_itemSection_ars74_158">
            <img
              src={firstItem?.image_url || COIN_ICON}
              alt={firstItem?.name || "Giveaway item"}
              className="_itemImage_ars74_165"
              draggable={false}
            />
            <div className="_itemInfo_ars74_173">
              <span className="_itemName_ars74_180">{firstItem?.name || "Mystery item"}</span>
              <div className="_itemValueWrapper_ars74_189">
                <img src={COIN_ICON} alt="bobux" className="_bobuxImage_ars74_197" draggable={false} />
                <span className="_itemValue_ars74_189">{Number(firstItem?.value || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div className="_bottomRow_ars74_252">
            <span className="_timerText_ars74_267">{timerLabel}</span>
            <button className="_joinButton_ars74_321" type="button">
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatInput({ replyTo, onCancelReply, onSend, user, onlineCount }) {
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [cursorIndex, setCursorIndex] = useState(0);
  const inputRef = useRef(null);
  const pendingCursorRef = useRef(null);
  const filteredEmojis = useMemo(() => {
    return getMatchingEmojis(emojiSearch.trim());
  }, [emojiSearch]);
  const activeEmojiTrigger = useMemo(() => getEmojiTrigger(value, cursorIndex), [value, cursorIndex]);
  const emojiSuggestions = useMemo(() => {
    if (!activeEmojiTrigger) return [];

    return getMatchingEmojis(activeEmojiTrigger.query);
  }, [activeEmojiTrigger]);
  const emojiSuggestionsOpen = Boolean(activeEmojiTrigger && !emojiPickerOpen && emojiSuggestions.length);

  useEffect(() => {
    if (pendingCursorRef.current === null) return;

    const nextCursor = pendingCursorRef.current;
    pendingCursorRef.current = null;
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    setCursorIndex(nextCursor);
  }, [value]);

  function syncCursor(event) {
    setCursorIndex(event.target.selectionStart ?? event.target.value.length);
  }

  function submit() {
    const trimmed = valueRef.current.trim();
    if (!trimmed || !user) return;

    valueRef.current = "";
    setValue("");
    onSend(trimmed);
    setCursorIndex(0);
    setEmojiPickerOpen(false);
    setEmojiSearch("");
  }

  function selectEmoji(token, trigger = activeEmojiTrigger) {
    const replacementStart = trigger?.start ?? cursorIndex;
    const replacementEnd = trigger?.end ?? cursorIndex;
    const before = value.slice(0, replacementStart);
    const after = value.slice(replacementEnd);
    const leadingSpace = !trigger && before && !/\s$/.test(before) ? " " : "";
    const trailingSpace = after && /^\s/.test(after) ? "" : " ";
    const nextValue = `${before}${leadingSpace}${token}${trailingSpace}${after}`.slice(0, MAX_CHAT_MESSAGE_LENGTH);
    const nextCursor = Math.min(
      before.length + leadingSpace.length + token.length + trailingSpace.length,
      nextValue.length,
    );

    pendingCursorRef.current = nextCursor;
    valueRef.current = nextValue;
    setValue(nextValue);
    setCursorIndex(nextCursor);
    setEmojiPickerOpen(false);
    setEmojiSearch("");
  }

  return (
    <div className="relative shrink-0">
      {replyTo && (
        <div className="mb-[9px] flex items-start gap-[9px] rounded-[9px] bg-[#1c1f2e] px-[14px] py-[9px]">
          <div className="min-w-0 flex-1">
            <div className="text-[0.81rem] font-bold leading-tight text-[#a6b2d3]">Replying to {replyTo.name}</div>
            <div className="mt-[2px] line-clamp-2 text-[0.86rem] font-semibold text-[#c7cce2] [overflow-wrap:anywhere]">{renderEmojiText(replyTo.text)}</div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="grid h-8 w-8 place-content-center rounded-[7px] border-none bg-[#171925] text-[0.95rem] text-[#a6b2d3] hover:bg-[#202235]"
          >
            ×
          </button>
        </div>
      )}

      <div className="relative">
        {emojiSuggestionsOpen && <EmojiAutocomplete emojis={emojiSuggestions} onSelect={selectEmoji} />}

        {emojiPickerOpen && (
          <CustomEmojiPicker
            search={emojiSearch}
            emojis={filteredEmojis}
            onSearch={setEmojiSearch}
            onSelect={selectEmoji}
          />
        )}

        <div className="relative">
          <input
            type="text"
            placeholder={user ? "Say something..." : "Login to chat"}
            value={value}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            ref={inputRef}
            readOnly={!user}
            aria-disabled={!user}
            onChange={(event) => {
              const nextValue = event.target.value.slice(0, MAX_CHAT_MESSAGE_LENGTH);
              valueRef.current = nextValue;
              setValue(nextValue);
              setCursorIndex(Math.min(event.target.selectionStart ?? nextValue.length, nextValue.length));
              setEmojiPickerOpen(false);
            }}
            onClick={syncCursor}
            onKeyUp={syncCursor}
            onSelect={syncCursor}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === "Tab") && emojiSuggestionsOpen) {
                event.preventDefault();
                selectEmoji(emojiSuggestions[0].token);
                return;
              }

              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className="flex h-12 w-full rounded-lg border-2 border-transparent bg-[hsl(229_17%_13%/.8)] px-3 py-2 pr-10 text-sm font-semibold text-gray-400 outline-none transition placeholder:text-white/50 focus-visible:border-white/60"
          />

          <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center">
            <button
              aria-label="Emoji Picker"
              type="button"
              aria-expanded={emojiPickerOpen}
              onClick={() => {
                setEmojiPickerOpen((current) => !current);
              }}
              className="inline-grid cursor-pointer place-content-center border-0 bg-transparent text-white/50 transition hover:text-white focus:outline-none"
            >
              <EmojiIcon />
            </button>

            <button
              aria-label="Send"
              type="button"
              onClick={submit}
              disabled={!user}
              className="hidden"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 mt-2 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!user || !value.trim()}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-[hsl(233_16%_22%)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          Send
        </button>
      </div>

    </div>
  );
}

export default function ChatPanel({ className = "", mobileOpen = false, onMobileOpenChange }) {
  const user = useAuth((s) => s.user);
  const balance = useAuth((s) => s.balance);
  const setBalance = useAuth((s) => s.setBalance);
  const isAuthModalOpen = useAuth((s) => s.isAuthModalOpen);
  const setAuthModalOpen = useAuth((s) => s.setAuthModalOpen);
  const walletSelection = useAuth((s) => s.walletSelection);
  const [replyTo, setReplyTo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatSessionId, setChatSessionId] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [chatRulesOpen, setChatRulesOpen] = useState(false);
  const [giveaways, setGiveaways] = useState([]);
  const [rainCountdown, setRainCountdown] = useState(30 * 60);
  const [rainPool, setRainPool] = useState(10000);
  const [isRainJoinModalOpen, setIsRainJoinModalOpen] = useState(false);
  const [isRainJoinSubmitting, setIsRainJoinSubmitting] = useState(false);
  const [rainJoinError, setRainJoinError] = useState("");
  const [hasJoinedRain, setHasJoinedRain] = useState(false);
  const [isTipModalOpen, setIsTipModalOpen] = useState(false);
  const [isRainTipSubmitting, setIsRainTipSubmitting] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [tipRecipient, setTipRecipient] = useState(null);
  const [isUserTipSubmitting, setIsUserTipSubmitting] = useState(false);
  const [userCoinTipAmount, setUserCoinTipAmount] = useState("");
  const [showUserCoinTipInChat, setShowUserCoinTipInChat] = useState(false);
  const mobileChatOpen = Boolean(mobileOpen);
  const setMobileChatOpen = (open) => onMobileOpenChange?.(Boolean(open));
  const RAIN_DURATION_SECONDS = 30 * 60;
  const JOIN_WINDOW_SECONDS = 5 * 60;
  const messagesEndRef = useRef(null);
  const chatSessionIdRef = useRef(null);

  useEffect(() => {
    if (!chatRulesOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setChatRulesOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chatRulesOpen]);

  const chatAuthor = useMemo(
    () => ({
      level: user?.level ?? 1,
      name: user?.username || "Guest",
      avatar: user?.avatar_headshot_url || user?.avatar_url || "",
      role: user?.role || "user",
      profileId: user?.profile_id || user?.id || null,
      robloxId: user?.roblox_id || null,
      played: user?.played ?? 0,
      won: user?.won ?? 0,
      lost: user?.lost ?? 0,
    }),
    [user],
  );

  useEffect(() => {
    if (!mobileChatOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMobileChatOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileChatOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [mobileChatOpen]);
  const visibleMessages = useMemo(() => {
    const uniqueMessages = normalizeStoredMessages(messages);
    const ignoredProfileIds = new Set(
      Array.isArray(user?.ignored_users) ? user.ignored_users.map(String) : [],
    );
    if (!ignoredProfileIds.size) return uniqueMessages;

    return uniqueMessages.filter((message) => {
      const messageProfileId = String(message?.profile_id || message?.user_id || "").trim();
      return !messageProfileId || !ignoredProfileIds.has(messageProfileId);
    });
  }, [messages, user?.ignored_users]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_CHAT_MESSAGES_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!chatSessionId) return;
    try {
      window.localStorage.setItem(
        CHAT_SESSION_STORAGE_KEY,
        JSON.stringify({
          serverId: chatSessionId,
          messages: normalizeStoredMessages(messages.filter((message) => !message._optimistic)),
        }),
      );
    } catch {}
  }, [chatSessionId, messages]);

  useEffect(() => {
    if (!isTipModalOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsTipModalOpen(false)
    }

    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isTipModalOpen])

  useEffect(() => {
    const loadGiveaways = async () => {
      try {
        const { data, error } = await supabase.from('giveaways').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(5)
        if (!error) {
          setGiveaways(data ?? [])
        }
      } catch (err) {
        console.warn('[ChatPanel] failed to load giveaways', err)
      }
    }

    const handleGiveawayCreated = (event) => {
      const nextGiveaway = event?.detail
      if (!nextGiveaway?.id) return
      setGiveaways((current) => [nextGiveaway, ...current.filter((item) => item.id !== nextGiveaway.id)].slice(0, 5))
    }

    void loadGiveaways()
    window.addEventListener('giveaway:created', handleGiveawayCreated)

    const socket = connectSocket();
    if (!socket) return undefined;

    const handleOnlineCount = (count) => setOnlineCount(typeof count === "number" ? count : Number(count) || 0);
    const handleRainPool = (pool) => setRainPool(typeof pool === "number" ? pool : Number(pool) || 0);
    const handleRainCountdown = (seconds) => {
      const nextSeconds = typeof seconds === "number" ? seconds : Number(seconds) || 0;
      setRainCountdown((currentSeconds) => {
        if (nextSeconds > currentSeconds + 5) {
          setHasJoinedRain(false);
          setIsRainJoinModalOpen(false);
          setRainJoinError("");
        }
        return nextSeconds;
      });
    };
    const handleIncomingChatMessage = (message) => {
      if (!message?.id) return;
      const normalizedMessage = {
        ...message,
        time: formatChatMessageTime(message.time),
      };
      setMessages((current) => {
        const optimisticIndex = current.findIndex((item) => (
          item?._optimistic &&
          item.id === normalizedMessage.client_message_id
        ));
        if (optimisticIndex >= 0) {
          const nextMessages = [...current];
          nextMessages[optimisticIndex] = {
            ...normalizedMessage,
            _renderKey: current[optimisticIndex]._renderKey || current[optimisticIndex].id,
          };
          return normalizeStoredMessages(nextMessages);
        }
        if (current.some((item) => item.id === normalizedMessage.id)) return current;
        return normalizeStoredMessages([...current, normalizedMessage]);
      });
    };
    const handleChatSession = (session) => {
      const serverId = String(session?.id || "").trim();
      if (!serverId || chatSessionIdRef.current === serverId) return;

      chatSessionIdRef.current = serverId;
      const storedSession = readStoredChatSession();
      setMessages((currentMessages) => (
        storedSession?.serverId === serverId
          ? normalizeStoredMessages([...storedSession.messages, ...currentMessages])
          : []
      ));
      setChatSessionId(serverId);
    };

    socket.on("online:count", handleOnlineCount);
    socket.on("rain:pool", handleRainPool);
    socket.on("rain:countdown", handleRainCountdown);
    socket.on("chat:message", handleIncomingChatMessage);
    socket.on("chat:session", handleChatSession);
    socket.emit("online:count:get", handleOnlineCount);
    socket.emit("chat:session:get", handleChatSession);
    return () => {
      window.removeEventListener('giveaway:created', handleGiveawayCreated)
      socket.off("online:count", handleOnlineCount);
      socket.off("rain:pool", handleRainPool);
      socket.off("rain:countdown", handleRainCountdown);
      socket.off("chat:message", handleIncomingChatMessage);
      socket.off("chat:session", handleChatSession);
    };
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;

    const identifyAccount = () => {
      socket.emit("online:identify", {
        account_id: user?.profile_id || user?.id || null,
      });
    };

    if (socket.connected) identifyAccount();
    socket.on("connect", identifyAccount);

    return () => {
      socket.off("connect", identifyAccount);
    };
  }, [user?.id, user?.profile_id]);

  useEffect(() => {
    if (!hasJoinedRain || !user) return undefined;

    const socket = connectSocket();
    if (!socket) return undefined;

    const handleRainSettled = async () => {
      const profileId = String(user?.profile_id || user?.id || "").trim();
      if (profileId) {
        const result = await apiRequest("/api/profile");
        if (result?.profile?.balance != null) setBalance(Number(result.profile.balance));
      }
      window.dispatchEvent(new CustomEvent("wallet:updated"));
      notifications.success("Your rain payout has been added to your balance.");
      setHasJoinedRain(false);
    };

    socket.on("rain:settled", handleRainSettled);
    return () => socket.off("rain:settled", handleRainSettled);
  }, [hasJoinedRain, setBalance, user]);

  async function handleRainJoinVerification(captchaToken) {
    if (isRainJoinSubmitting || !captchaToken) return;
    if (!user) {
      setIsRainJoinModalOpen(false);
      setAuthModalOpen(true);
      return;
    }

    // The CAPTCHA has been completed, so remove it while the join is confirmed.
    setIsRainJoinModalOpen(false);
    setIsRainJoinSubmitting(true);
    setRainJoinError("");

    try {
      const response = await fetch("/api/rain/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captcha_token: captchaToken,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Unable to join the rain.");
      }

    setHasJoinedRain(true);
    notifications.success(result.already_joined ? "You already joined this rain." : "Successfully joined the rain!");
  } catch (error) {
    const message = error?.message || "Unable to join the rain.";
    setRainJoinError(message);
    notifications.error(message);
  } finally {
      setIsRainJoinSubmitting(false);
    }
  }

  async function handleTipSubmit() {
    if (!user || isRainTipSubmitting) return

    const amount = Number(tipAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      notifications.invalidTipAmount()
      return
    }

    if (amount > (balance || 0)) {
      notifications.insufficientCoins()
      return
    }

    setIsRainTipSubmitting(true)
    try {
      const response = await fetch('/api/rain/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
        }),
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Unable to tip the rain.')
      }

      setBalance(Number(result.balance ?? balance))
      setRainPool(Number(result.pool_amount ?? rainPool))
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      setTipAmount("")
      setIsTipModalOpen(false)
      notifications.success('Successfully tipped the rain!')
    } catch (error) {
      notifications.error(error?.message || 'Unable to tip the rain.')
    } finally {
      setIsRainTipSubmitting(false)
    }
  }

  async function handleUserItemTip(items) {
    if (isUserTipSubmitting || !tipRecipient || !Array.isArray(items) || items.length === 0) return

    const recipientId = String(
      tipRecipient.profile_id ||
      tipRecipient.user_id ||
      tipRecipient.uuid ||
      tipRecipient.id ||
      "",
    ).trim()
    const senderId = String(user?.profile_id || user?.id || "").trim()
    const itemIds = items.map((item) => item.id).filter(Boolean)

    if (!isUuidLike(recipientId)) {
      notifications.error("This user's profile could not be found.")
      return
    }

    if (recipientId === senderId) {
      notifications.error("You cannot tip items to yourself.")
      return
    }

    if (itemIds.length === 0) {
      notifications.error("Select at least one item to tip.")
      return
    }

    setIsUserTipSubmitting(true)
    try {
      await apiRequest("/api/tips/items", {
        method: "POST",
        body: JSON.stringify({
          recipient_profile_id: recipientId,
          item_ids: itemIds,
          show_in_chat: false,
        }),
      })

      const username = tipRecipient.username || tipRecipient.name || "user"
      notifications.tippedUser(username)
      window.dispatchEvent(new CustomEvent("wallet:updated"))
      setTipRecipient(null)
    } catch (error) {
      console.error("[ChatPanel] failed to tip inventory items", error)
      notifications.error(error?.message || "Failed to tip items.")
    } finally {
      setIsUserTipSubmitting(false)
    }
  }

  async function handleUserCoinTip() {
    if (isUserTipSubmitting || !tipRecipient || !user) return

    const amount = Number(userCoinTipAmount)
    const recipientId = String(
      tipRecipient.profile_id ||
      tipRecipient.user_id ||
      tipRecipient.uuid ||
      tipRecipient.id ||
      "",
    ).trim()
    const senderId = String(user?.profile_id || user?.id || "").trim()

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      notifications.invalidTipAmount()
      return
    }

    if (amount > Number(balance || 0)) {
      notifications.insufficientCoins()
      return
    }

    if (!isUuidLike(recipientId)) {
      notifications.error("This user's profile could not be found.")
      return
    }

    if (recipientId === senderId) {
      notifications.error("You cannot tip coins to yourself.")
      return
    }

    setIsUserTipSubmitting(true)
    try {
      const result = await apiRequest("/api/tips/coins", {
        method: "POST",
        body: JSON.stringify({
          recipient_profile_id: recipientId,
          amount,
          show_in_chat: showUserCoinTipInChat,
        }),
      })

      useAuth.setState((state) => {
        const nextBalance = Number(result?.balance ?? (Number(state.balance || 0) - amount))
        return {
          balance: nextBalance,
          user: state.user ? { ...state.user, balance: nextBalance } : state.user,
        }
      })
      window.dispatchEvent(new CustomEvent("wallet:updated"))

      const username = tipRecipient.username || tipRecipient.name || "user"
      notifications.tippedUser(username)
      setUserCoinTipAmount("")
      setShowUserCoinTipInChat(false)
      setTipRecipient(null)
    } catch (error) {
      console.error("[ChatPanel] failed to tip coins", error)
      notifications.error(error?.message || "Failed to tip coins.")
    } finally {
      setIsUserTipSubmitting(false)
    }
  }

  async function sendMessage(text) {
    const normalized = String(text || "").slice(0, MAX_CHAT_MESSAGE_LENGTH).trim();
    if (!normalized) return;

    const tipCommand = normalized.match(/^\/tip(?:\s+(.+))?$/i);
    if (tipCommand) {
      setReplyTo(null);
      if (!user) {
        setAuthModalOpen(true);
        return;
      }

      const robloxId = String(tipCommand[1] || "").trim();
      if (!/^\d{1,20}$/.test(robloxId)) {
        notifications.error("Use /tip followed by a Roblox user ID.");
        return;
      }

      try {
        const result = await apiRequest(`/api/public-profiles?roblox_id=${encodeURIComponent(robloxId)}`);
        const recipient = Array.isArray(result?.profiles) ? result.profiles[0] || null : null;
        if (!recipient) {
          notifications.error("No BloxDice account was found for that Roblox user ID.");
          return;
        }

        const senderProfileId = String(user?.profile_id || user?.id || "").trim();
        if (String(recipient.id || "").trim() === senderProfileId || String(user?.roblox_id || "").trim() === robloxId) {
          notifications.error("You cannot tip yourself.");
          return;
        }

        setTipRecipient({ ...recipient, profile_id: recipient.id });
      } catch (error) {
        notifications.error(error?.message || "Unable to find that Roblox user.");
      }
      return;
    }

    if (normalized.toLowerCase() === "!tip") {
      setMessages((current) => normalizeStoredMessages([
        ...current,
        {
          id: `tip-${Date.now()}-${current.length}`,
          type: "tip",
          time: getNotificationTime(),
        },
      ]));
      setReplyTo(null);
      return;
    }

    if (normalized.toLowerCase() === "!rain") {
      setMessages((current) => normalizeStoredMessages([
        ...current,
        {
          id: `rain-${Date.now()}-${current.length}`,
          type: "rain",
          time: getNotificationTime(),
        },
      ]));
      setReplyTo(null);
      return;
    }

    const clientMessageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const outgoingMessage = {
      id: clientMessageId,
      type: "message",
      level: chatAuthor.level,
      name: chatAuthor.name,
      role: chatAuthor.role,
      time: getChatTime(),
      text: normalized,
      avatar: chatAuthor.avatar,
      profile_id: chatAuthor.profileId,
      roblox_id: chatAuthor.robloxId,
      played: chatAuthor.played,
      won: chatAuthor.won,
      lost: chatAuthor.lost,
      avatar_url: user?.avatar_url || null,
      avatar_headshot_url: user?.avatar_headshot_url || user?.avatar_url || null,
      discord_linked: Boolean(user?.discord_linked),
      discord_mention: user?.discord_mention || null,
      discord_username: user?.discord_username || null,
      discord_user_id: user?.discord_user_id || null,
      reply: replyTo
        ? {
            name: replyTo.name,
            time: replyTo.time,
            text: replyTo.text,
          }
        : undefined,
      _optimistic: true,
      _renderKey: clientMessageId,
    };

    setMessages((current) => normalizeStoredMessages([...current, outgoingMessage]));

    const socket = connectSocket();
    let connectTimer = null;
    let hasSent = false;

    const removePendingMessage = (message) => {
      setMessages((current) => current.filter((message) => message.id !== outgoingMessage.id));
      notifications.error(message || "Chat is disconnected. Please try again.");
    };

    const emitMessage = () => {
      if (hasSent) return;
      hasSent = true;
      if (connectTimer) window.clearTimeout(connectTimer);
      socket.off("connect", emitMessage);

      socket.timeout(10000).emit("chat:message", outgoingMessage, (timeoutError, result) => {
        if (timeoutError || !result?.ok || !result?.message) {
          removePendingMessage(result?.error || (timeoutError ? "Chat timed out. Please try again." : undefined));
          return;
        }

        const confirmedMessage = {
          ...result.message,
          time: formatChatMessageTime(result.message.time),
          _renderKey: outgoingMessage._renderKey,
        };
        setMessages((current) => normalizeStoredMessages(
          current.map((message) => (
            message.id === outgoingMessage.id ? confirmedMessage : message
          )),
        ));
      });
    };

    if (socket.connected) {
      emitMessage();
    } else {
      socket.once("connect", emitMessage);
      socket.connect();
      connectTimer = window.setTimeout(() => {
        socket.off("connect", emitMessage);
        removePendingMessage("Unable to reconnect to chat. Please check your connection.");
      }, 10000);
    }

    setReplyTo(null);
  }

  return (
    <>
      <aside className={`fixed bottom-0 top-[calc(5rem+env(safe-area-inset-top))] z-[120] flex min-h-0 w-full flex-shrink-0 flex-col overflow-visible box-border bg-[hsl(227_17%_11%)] pb-[calc(5rem+env(safe-area-inset-bottom))] transition-[right] duration-300 sm:top-20 xl:relative xl:right-auto xl:top-auto xl:z-auto xl:h-full xl:max-h-full xl:w-[22rem] xl:min-w-[22rem] xl:bg-[hsl(227_17%_11%)] xl:px-3 xl:pt-3 xl:pb-0 ${
        mobileChatOpen ? "right-0" : "-right-full"
      } ${className}`}>
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap");

        @keyframes msgIn {
          from { opacity: 0; transform: translateY(8px) scale(.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .chat-scroll::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .chat-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .chat-message-row:hover [data-reply-btn="true"] {
          opacity: 1 !important;
        }

        .chat-inline-emoji {
          display: inline-block;
          height: 1.5em;
          width: auto;
          margin: 0 1px;
          min-width: 16px;
          max-height: 24px;
          vertical-align: -0.35em;
          object-fit: contain;
          user-select: none;
        }

        .emoji-autocomplete {
          position: absolute;
          left: 0;
          right: 0;
          bottom: calc(100% + 4px);
          z-index: 130;
          pointer-events: auto;
        }

        .emoji-autocomplete-panel {
          max-height: 240px;
          overflow-y: auto;
          border: 1px solid rgb(42, 47, 69);
          border-radius: 8px;
          background: rgb(28, 31, 46);
          padding: 4px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 79, 163, 0.35) transparent;
        }

        .emoji-autocomplete-panel::-webkit-scrollbar {
          width: 6px;
        }

        .emoji-autocomplete-panel::-webkit-scrollbar-track {
          background: transparent;
        }

        .emoji-autocomplete-panel::-webkit-scrollbar-thumb {
          background: rgba(255, 79, 163, 0.35);
          border-radius: 9999px;
        }

        .emoji-autocomplete-item {
          all: unset;
          box-sizing: border-box;
          display: flex;
          width: 100%;
          cursor: pointer;
          align-items: center;
          gap: 8px;
          border-radius: 6px;
          padding: 6px 8px;
          background: transparent;
          transition: background 100ms;
        }

        .emoji-autocomplete-item:first-child,
        .emoji-autocomplete-item:hover {
          background: rgb(37, 42, 61);
        }

        .emoji-autocomplete-image-wrap {
          display: grid;
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          place-items: center;
        }

        .emoji-autocomplete-image-wrap img {
          width: 22px;
          height: 22px;
          object-fit: contain;
          user-select: none;
        }

        .emoji-autocomplete-item span {
          min-width: 0;
          flex: 1 1 0%;
          overflow: hidden;
          color: rgb(199, 204, 226);
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.75rem;
          font-weight: 600;
        }

        ._emojiPickerPortal_18i9r_6 {
          opacity: 0;
          transform: translateY(4px) scale(.98);
          transition: opacity 120ms ease, transform 120ms ease;
        }

        ._emojiPickerOpen_18i9r_11 {
          opacity: 1;
          transform: none;
        }

        ._customEmojiPicker_abrjv_49 {
          width: 100%;
          overflow: hidden;
          border: 1px solid #2a2f45;
          border-radius: 10px;
          background: #171925;
          box-shadow: 0 18px 42px rgba(0,0,0,.42);
        }

        ._customEmojiSearchWrap_abrjv_58 {
          padding: 10px;
          border-bottom: 1px solid rgba(255,255,255,.06);
          background: #161a28;
        }

        ._customEmojiSearch_abrjv_58 {
          width: 100%;
          height: 34px;
          border: none;
          border-radius: 8px;
          background: #111522;
          color: #f2f4ff;
          font-size: 13px;
          font-weight: 500;
          outline: none;
          padding: 0 10px;
        }

        ._customEmojiSearch_abrjv_58::placeholder {
          color: #6d7396;
        }

        ._customEmojiGrid_abrjv_81 {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 7px;
          max-height: 238px;
          overflow-y: auto;
          padding: 10px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        ._customEmojiGrid_abrjv_81::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        ._customEmojiBtn_abrjv_98 {
          display: grid;
          width: 38px;
          height: 38px;
          cursor: pointer;
          place-content: center;
          border: none;
          border-radius: 8px;
          background: #161a28;
          padding: 4px;
          transition: background-color 150ms ease, transform 150ms ease;
        }

        ._customEmojiBtn_abrjv_98:hover {
          background: #1f2335;
          transform: translateY(-1px);
        }

        ._customEmojiBtn_abrjv_98 img {
          width: 28px;
          height: 28px;
          object-fit: contain;
          user-select: none;
        }
        .rain-card::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 100% 100%, rgba(255,79,163,.22) 0%, rgba(255,79,163,.16) 24%, rgba(255,79,163,.09) 52%, rgba(255,79,163,.04) 68%, transparent 82%),
            radial-gradient(circle at 12% 0%, rgba(81,71,217,.18) 0%, rgba(81,71,217,.1) 26%, transparent 58%);
        }

        .rain-card::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1px;
          height: 71px;
          z-index: 1;
          pointer-events: none;
          background: linear-gradient(to bottom, rgba(27,31,46,0), rgba(27,31,46,.55) 55%, rgba(27,31,46,0));
          opacity: .9;
        }

        ._giveawayBar_ars74_1{width:100%;padding:0;box-sizing:border-box}
        ._slideViewport_ars74_8{width:100%;overflow:hidden;border-radius:6px}
        ._giveawayWrapper_ars74_15{border-radius:6px;padding:10px 12px;width:100%;min-width:0;color:#fff;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;transition:background .25s ease;position:relative;border:none}
        ._giveawayWrapper_ars74_15:before{content:"";position:absolute;top:0;right:0;bottom:0;left:0;border-radius:6px;padding:2px;background:linear-gradient(to bottom,transparent 0%,var(--border-side, rgba(255,79,163,.18)) 55%,var(--border-bottom, rgba(255,79,163,.55)) 100%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:0}
        ._giveawayWrapper_ars74_15>*{position:relative;z-index:1}
        @keyframes _slideFromTop_ars74_1{0%{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes _slideToTop_ars74_1{0%{transform:translateY(0);opacity:1}to{transform:translateY(-100%);opacity:0}}
        @keyframes _slideFromRight_ars74_1{0%{transform:translate(100%);opacity:0}to{transform:translate(0);opacity:1}}
        @keyframes _slideFromLeft_ars74_1{0%{transform:translate(-100%);opacity:0}to{transform:translate(0);opacity:1}}
        ._slideInTop_ars74_92{animation:_slideFromTop_ars74_1 .4s cubic-bezier(.25,.46,.45,.94) both}
        ._slideOutTop_ars74_97{animation:_slideToTop_ars74_1 .5s cubic-bezier(.55,.06,.68,.19) both}
        ._slideInLeft_ars74_102{animation:_slideFromRight_ars74_1 .28s cubic-bezier(.25,.46,.45,.94) both}
        ._slideInRight_ars74_106{animation:_slideFromLeft_ars74_1 .28s cubic-bezier(.25,.46,.45,.94) both}
        ._topRow_ars74_111{display:flex;align-items:center;gap:5px;min-width:0}
        ._username_ars74_118{color:#8a81ff;font-weight:600;font-size:12.5px;white-space:nowrap;cursor:pointer;flex-shrink:0}
        ._hostText_ars74_127{color:#b9bac3;font-size:12px;font-weight:600;white-space:nowrap;flex-shrink:0}
        ._entries_ars74_136{margin-left:auto;display:flex;align-items:center;gap:4px;color:#b9bac3;font-size:12px;font-weight:500;white-space:nowrap}
        ._playersIcon_ars74_148{width:13px;height:13px;display:inline-block;background-color:#b9bac3e6;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3s1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5S5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05c1.16.84 1.97 1.97 1.97 3.45V20h7v-3.5C24 14.17 19.33 13 16 13Z'/%3E%3C/svg%3E") no-repeat center / contain;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3s1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5S5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05c1.16.84 1.97 1.97 1.97 3.45V20h7v-3.5C24 14.17 19.33 13 16 13Z'/%3E%3C/svg%3E") no-repeat center / contain}
        ._itemSection_ars74_158{display:flex;align-items:center;gap:10px;min-width:0}
        ._itemImage_ars74_165{width:42px;height:42px;border-radius:7px;object-fit:contain;flex-shrink:0}
        ._itemInfo_ars74_173{display:flex;flex-direction:column;gap:3px;min-width:0}
        ._itemName_ars74_180{font-size:13.5px;font-weight:600;color:#e1e4f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        ._itemValueWrapper_ars74_189{display:flex;align-items:center;gap:4px;flex-wrap:nowrap;min-width:0}
        ._bobuxImage_ars74_197{width:14px;height:14px;flex-shrink:0}
        ._itemValue_ars74_189{font-weight:600;font-size:13px;color:#fff;white-space:nowrap}
        ._levelBadgeRow_ars74_213{display:none}
        ._navGroup_ars74_218{display:flex;flex-direction:row;align-items:center;gap:4px;flex-shrink:0}
        ._navCenter_ars74_227{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:28px}
        ._levelBadge_ars74_213{display:inline-flex;align-items:center;background:#dc26262e;border:1px solid rgba(220,38,38,.35);border-radius:4px;padding:1px 6px;font-size:10.5px;font-weight:700;color:#ff7070;letter-spacing:.2px;white-space:nowrap;user-select:none;flex-shrink:0}
        ._bottomRow_ars74_252{display:flex;align-items:center;gap:6px;min-width:0}
        ._bottomRow_ars74_252>._winnerText_ars74_259{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        ._timerText_ars74_267{font-size:13px;font-weight:600;color:#e1e4f2;white-space:nowrap}
        ._giveawayCounter_ars74_274{font-size:12px;font-weight:500;color:#9ca9d6;white-space:nowrap;margin:0 2px}
        ._navBtn_ars74_283{width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:none;background:#ffffff14;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#cfd6ff;cursor:pointer;user-select:none;flex-shrink:0;padding:0;transition:background .15s ease}
        ._navBtn_ars74_283:hover{background:#ff4fa347}
        ._navBtn_ars74_283:active{transform:scale(.9)}
        ._navBtnIcon_ars74_305{display:flex;align-items:center;justify-content:center;width:14px;height:14px;flex-shrink:0}
        ._navBtnIcon_ars74_305 svg{width:14px;height:14px;display:block}
        ._joinButton_ars74_321{background-color:#ff4fa3;border:none;border-radius:8px;padding:0 16px;font-size:12.5px;font-weight:600;color:#fff;cursor:pointer;flex-shrink:0;height:28px;display:flex;align-items:center;margin-left:auto}
        ._joinButton_ars74_321:disabled{opacity:.6;cursor:not-allowed}
        ._winnerText_ars74_259{font-size:13px;font-weight:600;color:#f4f4f4}
        @media (max-width: 480px){._giveawayWrapper_ars74_15{padding:9px 10px}._itemImage_ars74_165{width:38px;height:38px}._itemName_ars74_180{font-size:12.5px}._levelBadge_ars74_213{font-size:10.5px;padding:2px 6px}}
      `}</style>

      <style>{`
        @keyframes tipRainFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes tipRainModalOpen {
          from { opacity: 0; transform: scale(.8); }
          to { opacity: 1; transform: scale(1); }
        }

        .tipRainOverlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(0, 0, 0, .5);
          animation: tipRainFadeIn .5s ease-out;
        }

        .tipRainModal,
        .tipRainModal * {
          box-sizing: border-box;
          font-family: Poppins, sans-serif;
        }

        .tipRainModal {
          position: relative;
          display: flex;
          width: 90%;
          max-width: 380px;
          max-height: calc(100dvh - 40px);
          margin: 20px;
          padding: 28px 24px 24px;
          flex-direction: column;
          overflow-y: auto;
          border: 1px solid #1e2235;
          border-radius: 12px;
          background-color: #171925;
          color: #e1e4f2;
          scrollbar-width: none;
          animation: tipRainModalOpen .3s forwards;
        }

        .tipRainModal::-webkit-scrollbar {
          display: none;
        }

        .tipRainClose {
          position: absolute;
          top: 14px;
          right: 16px;
          z-index: 1;
          padding: 0;
          border: none;
          background: none;
          color: rgba(255, 255, 255, .5);
          font-size: 22px;
          font-weight: 400;
          line-height: 1;
          cursor: pointer;
          transition: color .2s ease;
        }

        .tipRainClose:hover {
          color: rgba(255, 255, 255, .9);
        }

        .tipRainClose:focus-visible {
          outline: 2px solid #ff69b0;
          outline-offset: 2px;
        }

        .tipRainIconHeader {
          position: relative;
          z-index: 0;
          display: flex;
          margin-bottom: 24px;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
        }

        .tipRainIconBg {
          display: flex;
          width: 60px;
          height: 60px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255, 79, 163, .12);
          color: #ff4fa3;
        }

        .tipRainIconBg svg {
          display: block;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
        }

        .tipRainTitle {
          margin: 0;
          color: #fff;
          font-size: 17.6px;
          font-weight: 700;
          line-height: 22px;
          letter-spacing: .2px;
          white-space: nowrap;
        }

        .tipRainSubtitle {
          margin: 0;
          color: rgba(255, 255, 255, .4);
          font-size: 12px;
          font-weight: 500;
          line-height: 18px;
          letter-spacing: .2px;
          white-space: nowrap;
        }

        .tipRainForm {
          display: flex;
          min-height: 0;
          margin: 0;
          flex: 1;
          flex-direction: column;
        }

        .tipRainSection {
          position: relative;
          z-index: 0;
          margin: 0;
        }

        .tipRainSectionTitle {
          display: block;
          margin: 0 0 6px;
          color: rgba(255, 255, 255, .45);
          font-size: 11px;
          font-weight: 700;
          line-height: 16px;
          letter-spacing: .7px;
          text-transform: uppercase;
        }

        .tipRainInputHolder {
          display: flex;
          width: 100%;
          max-width: 100%;
          height: 40px;
          padding: 0 14px;
          align-items: center;
          gap: 8px;
          border: none;
          border-radius: 6px;
          background: #1c1f2e;
          transition: background .15s;
        }

        .tipRainInput {
          display: block;
          width: 100%;
          max-width: 100%;
          height: 100%;
          min-width: 0;
          padding: 0;
          overflow: hidden;
          border: none;
          outline: none;
          background: transparent;
          color: #fff;
          font-size: 16px;
          font-weight: 400;
          line-height: 40px;
          text-overflow: ellipsis;
          white-space: nowrap;
          word-break: break-word;
          appearance: textfield;
        }

        .tipRainInput::placeholder {
          color: #6b7280;
          opacity: 1;
        }

        .tipRainInput::-webkit-outer-spin-button,
        .tipRainInput::-webkit-inner-spin-button {
          margin: 0;
          -webkit-appearance: none;
        }

        .tipRainFeedback {
          margin: 7px 0 0;
          overflow: hidden;
          color: #f87171;
          font-size: 12px;
          font-weight: 500;
          line-height: 17px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tipRainButtonContainer {
          position: relative;
          z-index: 0;
          margin-top: 14px;
        }

        .tipRainButton {
          position: relative;
          isolation: isolate;
          display: flex;
          width: 100%;
          min-width: 120px;
          min-height: 42px;
          padding: 0 20px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 1px solid rgba(255, 79, 163, .4);
          border-radius: 8px;
          background: linear-gradient(135deg, #ff4fa3, #f43f8f);
          box-shadow: 0 2px 8px rgba(255, 79, 163, .2);
          color: #fff;
          font-size: 14.4px;
          font-weight: 600;
          line-height: 1;
          letter-spacing: .01em;
          cursor: pointer;
          transform-origin: center;
          transition: transform .13s cubic-bezier(.22, 1, .36, 1), background .15s ease, opacity .15s ease;
        }

        .tipRainButton:hover:not(:disabled) {
          background: linear-gradient(135deg, #ff4fa3, #f43f8f);
          opacity: .95;
        }

        .tipRainButton:active:not(:disabled) {
          transform: scale(.98);
        }

        .tipRainButton:focus-visible {
          outline: 2px solid #ff69b0;
          outline-offset: 2px;
        }

        .tipRainButton:disabled {
          opacity: .6;
          cursor: not-allowed;
          transform: none;
        }

        @media (max-width: 640px) {
          .tipRainModal {
            width: 92%;
            max-width: 380px;
            max-height: calc(100dvh - 32px);
            margin: 16px;
            padding: 24px 20px 20px;
          }

          .tipRainInput {
            font-size: 15.2px;
          }
        }
      `}</style>

      <LoginModal isOpen={isAuthModalOpen && !user} onClose={() => setAuthModalOpen(false)} />
      <RainCaptchaOverlay
        isOpen={isRainJoinModalOpen}
        isSubmitting={isRainJoinSubmitting}
        error={rainJoinError}
        onClose={() => {
          if (!isRainJoinSubmitting) {
            setIsRainJoinModalOpen(false);
            setRainJoinError("");
          }
        }}
        onVerify={handleRainJoinVerification}
      />
      <MiniProfileModal
        isOpen={Boolean(selectedProfile)}
        player={selectedProfile}
        onClose={() => setSelectedProfile(null)}
        onTip={(player) => {
          if (!user) {
            setSelectedProfile(null)
            setAuthModalOpen(true)
            return
          }
          setTipRecipient(player)
          setSelectedProfile(null)
        }}
      />
      <TipUserModal
        isOpen={Boolean(tipRecipient) && walletSelection === "items"}
        recipient={tipRecipient}
        isSubmitting={isUserTipSubmitting}
        onClose={() => {
          if (!isUserTipSubmitting) setTipRecipient(null)
        }}
        onSubmit={handleUserItemTip}
      />
      <CoinTipModal
        isOpen={Boolean(tipRecipient) && walletSelection === "coins"}
        recipient={tipRecipient}
        amount={userCoinTipAmount}
        showInChat={showUserCoinTipInChat}
        isSubmitting={isUserTipSubmitting}
        onAmountChange={setUserCoinTipAmount}
        onShowInChatChange={setShowUserCoinTipInChat}
        onClose={() => {
          if (!isUserTipSubmitting) {
            setUserCoinTipAmount("")
            setShowUserCoinTipInChat(false)
            setTipRecipient(null)
          }
        }}
        onSubmit={handleUserCoinTip}
      />

      {isTipModalOpen ? (
        <div
          className="tipRainOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isRainTipSubmitting) setIsTipModalOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tip rain"
            aria-labelledby="tip-rain-title"
            className="tipRainModal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              className="tipRainClose"
              disabled={isRainTipSubmitting}
              onClick={() => setIsTipModalOpen(false)}
            >
              &times;
            </button>

            <div className="tipRainIconHeader">
              <div className="tipRainIconBg">
                <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M17.726 13.02 14 16H9v-1h4.065a.5.5 0 0 0 .416-.777l-.888-1.332A1.995 1.995 0 0 0 10.93 12H3a1 1 0 0 0-1 1v6a2 2 0 0 0 2 2h9.639a3 3 0 0 0 2.258-1.024L22 13l-1.452-.484a2.998 2.998 0 0 0-2.822.504zm1.532-5.63c.451-.465.73-1.108.73-1.818s-.279-1.353-.73-1.818A2.447 2.447 0 0 0 17.494 3S16.25 2.997 15 4.286C13.75 2.997 12.506 3 12.506 3a2.45 2.45 0 0 0-1.764.753c-.451.466-.73 1.108-.73 1.818s.279 1.354.73 1.818L15 12l4.258-4.61z" />
                </svg>
              </div>
              <h2 id="tip-rain-title" className="tipRainTitle">Tip Rain</h2>
              <p className="tipRainSubtitle">Enter an amount to add to the rain</p>
            </div>

            <form
              className="tipRainForm"
              onSubmit={(event) => {
                event.preventDefault()
                handleTipSubmit()
              }}
            >
              <div className="tipRainSection">
                <label className="tipRainSectionTitle" htmlFor="tip-rain-amount">
                  Amount
                </label>
                <div className="tipRainInputHolder">
                  <input
                    id="tip-rain-amount"
                    className="tipRainInput"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min="1"
                    step="1"
                    placeholder="Enter amount"
                    autoComplete="off"
                    value={tipAmount}
                    onChange={(event) => setTipAmount(event.target.value)}
                  />
                </div>
              </div>

              <div className="tipRainButtonContainer">
                <button type="submit" className="tipRainButton" disabled={isRainTipSubmitting}>
                  {isRainTipSubmitting ? 'Sending...' : 'Send Tip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {chatRulesOpen ? <ChatRulesModal onClose={() => setChatRulesOpen(false)} /> : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="relative box-border flex h-full min-w-0 flex-grow flex-col gap-2">
          <div className="h-0 shrink-0" aria-hidden="true" />
          <div className="flex shrink-0 items-center justify-between rounded border border-[hsl(231_16%_16%)] bg-[hsl(230_16%_14%/.6)] px-6 py-3">
            <div className="text-sm font-semibold opacity-50">Messages</div>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2" aria-label={`${onlineCount ?? 0} online`}>
                <div className="text-sm font-semibold opacity-50">{onlineCount ?? 0}</div>
                <div className={`animate-pulse rounded-full border-2 ${Number(onlineCount) > 0 ? 'border-[#20e68f]/50' : 'border-red-500/50'}`}>
                  <div className={`h-2 w-2 rounded-full ${Number(onlineCount) > 0 ? 'bg-[#20e68f]' : 'bg-red-500'}`} />
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center border-0 bg-transparent p-0 text-white/45 transition-colors hover:text-[#ff4fa3] focus-visible:text-[#ff4fa3] focus-visible:outline-none"
                aria-label="View chat rules"
                title="Chat rules"
                aria-expanded={chatRulesOpen}
                onClick={() => setChatRulesOpen((current) => !current)}
              >
                <svg viewBox="0 0 576 512" className="h-[13px] w-[13px]" fill="currentColor" aria-hidden="true">
                  <path d="M542.22 32.05c-54.8 3.11-163.72 14.43-230.96 55.59-4.64 2.84-7.27 7.89-7.27 13.17v363.87c0 11.55 12.63 18.85 23.28 13.49 69.18-34.82 169.23-44.32 218.7-46.92 16.89-.89 30.02-14.43 30.02-30.66V62.75c.01-17.71-15.35-31.74-33.77-30.7zM264.73 87.64C197.5 46.48 88.58 35.17 33.78 32.05 15.36 31.01 0 45.04 0 62.75V400.6c0 16.24 13.13 29.78 30.02 30.66 49.49 2.6 149.59 12.11 218.77 46.95 10.62 5.35 23.21-1.94 23.21-13.46V100.63c0-5.29-2.62-10.14-7.27-12.99z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="chat-scroll mb-2 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-2 pr-2">
            <div className="contents">
              {giveaways.length ? (
                <div className="space-y-[10px]">
                  {giveaways.map((giveaway) => (
                    <GiveawayAnnouncement key={giveaway.id} giveaway={giveaway} />
                  ))}
                </div>
              ) : null}
              {visibleMessages.map((message) => (
                message.type === "tip" ? (
                  <TipNotification key={message.id} message={message} />
                ) : message.type === "rain" ? (
                  null
                ) : (
                  <ChatMessage
                    key={message._renderKey || message.id}
                    message={message}
                    onProfileOpen={setSelectedProfile}
                  />
                )
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <ChatInput replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={sendMessage} user={user} onlineCount={onlineCount} />
        </div>
      </div>
      </aside>
    </>
  );
}
