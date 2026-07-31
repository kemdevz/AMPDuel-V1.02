import { useEffect, useState } from "react";
import { apiRequest } from "../lib/apiClient";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../store/auth";
import SummerRaffleTicketModal from "../components/SummerRaffleTicketModal";

const PEARL_ICON = "https://i.ibb.co/TD9YY4Lg/pearl.png";
const COIN_ICON = "/bobux.png";
const TICKET_ICON = "https://i.ibb.co/vxyJzkJ2/ticket.png";

const tabs = [
  {
    key: "how",
    title: "How it works",
    desc: "Learn how to earn Pearls and claim your event rewards.",
    image: "https://i.ibb.co/1f5PFD0w/question-mark-1.png",
    bg: "linear-gradient(to top right, rgba(59, 130, 246, .10), #131520)",
    accent: "#3B82F6",
    titleBg:
      "repeating-linear-gradient(15deg, #3b82f6 0, #3b82f6 12px, #60a5fa 12px, #60a5fa 24px)",
  },
  {
    key: "cases",
    title: "Event Cases",
    desc: "Collect Pearls and open Free Event Cases.",
    image: "https://i.ibb.co/7tzR4gKL/tropical-1.png",
    bg: "linear-gradient(to top right, rgba(124, 232, 247, .10), #131520)",
    accent: "#7CE8F7",
    titleBg:
      "repeating-linear-gradient(15deg, #7ce8f7 0, #7ce8f7 12px, #b3f1fb 12px, #b3f1fb 24px)",
  },
  {
    key: "raffles",
    title: "Summer Raffles",
    desc: "Spend Pearls for Raffle Tickets and win prizes!",
    image: TICKET_ICON,
    bg: "linear-gradient(to top right, rgba(250, 204, 21, .10), #131520)",
    accent: "#FACC15",
    titleBg:
      "repeating-linear-gradient(15deg, #facc15 0, #facc15 12px, #fde047 12px, #fde047 24px)",
  },
];

const eventCases = [
  {
    name: "Beachside",
    price: "10",
    image: "https://i.ibb.co/1fdMZwrD/case.png",
  },
  {
    name: "Seal Paradise",
    price: "100",
    image: "https://i.ibb.co/qL099z2X/casebeach.png",
  },
  {
    name: "Tropical",
    price: "500",
    image: "https://i.ibb.co/LXD2hbFz/case1.png",
  },
  {
    name: "Summer Lagoon",
    price: "1,000",
    image: "https://i.ibb.co/Kx2X7Vjh/summercase.png",
  },
  {
    name: "Summer Heaven",
    price: "2,000",
    image: "https://i.ibb.co/gMJSsjmP/casesummer.png",
  },
];

const leaderboard = [
  {
    rank: "#1",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#facc15]",
    avatar: "",
  },
  {
    rank: "#2",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#cbd5e1]",
    avatar: "",
  },
  {
    rank: "#3",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#d8924e]",
    avatar: "",
  },
  {
    rank: "#4",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#8b93ad]",
    avatar: "",
  },
  {
    rank: "#5",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#8b93ad]",
    avatar: "",
  },
  {
    rank: "#6",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#8b93ad]",
    avatar: "",
  },
  {
    rank: "#7",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#8b93ad]",
    avatar: "",
  },
  {
    rank: "#8",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#8b93ad]",
    avatar: "",
  },
  {
    rank: "#9",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#8b93ad]",
    avatar: "",
  },
  {
    rank: "#10",
    name: "Waiting..",
    tickets: "0",
    rankClass: "text-[#8b93ad]",
    avatar: "",
  },
];

function GameIcon({ name, className = "h-5 w-5" }) {
  if (name === "swords") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path fill="none" d="M0 0h24v24H0z" />
        <path d="M7.05 13.406l3.534 3.536-1.413 1.414 1.415 1.415-1.414 1.414-2.475-2.475-2.829 2.829-1.414-1.414 2.829-2.83-2.475-2.474 1.414-1.414 1.414 1.413 1.413-1.414zM3 3l3.546.003 11.817 11.818 1.415-1.414 1.414 1.414-2.474 2.475 2.828 2.829-1.414 1.414-2.829-2.829-2.475 2.475-1.414-1.414 1.414-1.415L3.003 6.531 3 3zm14.457 0L21 3.003l.002 3.523-4.053 4.052-3.536-3.535L17.457 3z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="m16.965 7.502 1.95 2.723c.091.13.113.292.06.44a.514.514 0 0 1-.332.311l-6.365 2a.543.543 0 0 1-.605-.196l-1.671-2.377L8.33 12.78a.543.543 0 0 1-.606.197l-6.364-2a.514.514 0 0 1-.333-.313.479.479 0 0 1 .06-.44l1.95-2.722-1.95-2.723a.479.479 0 0 1-.06-.44.514.514 0 0 1 .333-.312l6.364-2a.54.54 0 0 1 .606.196L10 4.6l1.672-2.377a.54.54 0 0 1 .605-.196l6.365 2a.514.514 0 0 1 .332.312c.053.148.031.31-.06.44l-1.95 2.723Zm-11.625 0 4.662 1.473 4.662-1.473-4.662-1.474L5.34 7.502Z"
      />
      <path d="M10.795 13.335c.403.573 1.153.802 1.817.59l4.247-1.342v2.92a.503.503 0 0 1-.36.474l-6.328 2a.641.641 0 0 1-.17.026.58.58 0 0 1-.11-.011h-.002a.503.503 0 0 1-.057-.016l-6.326-1.999a.503.503 0 0 1-.36-.474v-2.92l4.243 1.341c.668.214 1.418-.018 1.82-.59l.793-1.127.793 1.127Z" />
    </svg>
  );
}

function EventTab({ tab, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      aria-controls="event-panel"
      className="group relative isolate flex min-h-[132px] w-full cursor-pointer items-center justify-between overflow-hidden rounded-[8px] border border-[#20222f] p-6 text-left text-white transition-colors hover:border-white/15"
      style={{ background: tab.bg }}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        style={{ boxShadow: `inset 0 0 0 1.5px ${tab.accent}55` }}
      />
      <div className="relative z-[2] flex flex-col items-start justify-center gap-[5px]">
        <span
          className="bg-clip-text text-[21px] font-bold leading-[1.1] tracking-[.2px] text-transparent sm:text-[25px]"
          style={{ backgroundImage: tab.titleBg }}
        >
          {tab.title}
        </span>
        <span className="max-w-[62%] text-[13px] font-medium text-white">{tab.desc}</span>
      </div>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-3.5 top-3.5 z-[4] text-[13px] leading-none text-[#9aa3c4] transition-transform ${
          active ? "rotate-180" : ""
        }`}
      >
        ▾
      </span>
      <img
        className="pointer-events-none absolute -bottom-7 -right-2 z-[1] h-[140px] w-[140px] rotate-[6deg] select-none object-contain transition duration-300 group-hover:rotate-0 group-hover:scale-105 group-hover:brightness-125 sm:h-[168px] sm:w-[168px]"
        src={tab.image}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </button>
  );
}

function Hero() {
  return (
    <section
      aria-label="Summer Event"
      className="relative isolate mx-auto h-[clamp(140px,40vw,190px)] w-full max-w-[1180px] overflow-hidden sm:h-[clamp(160px,22vw,250px)]"
    >
      <div
        className="event-glow pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(50%_110%_at_50%_100%,rgba(124,232,247,.38),rgba(124,232,247,.016))]"
        aria-hidden="true"
      />

      <img
        src="https://i.ibb.co/XxPLyWTN/summerpalmtree.png"
        className="pointer-events-none absolute -bottom-3 -left-3.5 z-[2] h-[clamp(92px,28vw,150px)] w-auto scale-x-[-1] select-none drop-shadow-[0_8px_20px_rgba(0,0,0,.45)] sm:-bottom-[22px] sm:left-[clamp(6px,4vw,64px)] sm:h-[clamp(120px,20vw,230px)]"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        src="https://i.ibb.co/XxPLyWTN/summerpalmtree.png"
        className="pointer-events-none absolute -bottom-3 -right-3.5 z-[2] h-[clamp(92px,28vw,150px)] w-auto select-none drop-shadow-[0_8px_20px_rgba(0,0,0,.45)] sm:-bottom-[22px] sm:right-[clamp(6px,4vw,64px)] sm:h-[clamp(120px,20vw,230px)]"
        alt=""
        aria-hidden="true"
        draggable={false}
      />

      <div className="absolute left-1/2 top-1/2 z-[4] flex w-max max-w-[88%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2.5 sm:gap-3.5">
        <div className="relative inline-block leading-none">
          <img
            src="https://png.pngtree.com/png-clipart/20240506/ourmid/pngtree-simple-cartoon-sun-yellow-orange-png-image_12348743.png"
            className="sun-spin pointer-events-none absolute -left-7 -top-[22px] z-0 h-[42px] w-[42px] select-none sm:-left-[66px] sm:-top-8 sm:h-14 sm:w-14"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <div className="relative z-[1] flex select-none flex-col items-stretch whitespace-nowrap font-[900] uppercase italic tracking-[.5px]">
            <span
              className="block self-start bg-clip-text text-[clamp(36px,8vw,58px)] leading-none text-transparent"
              style={{
                transform: "translate(-.14em)",
                backgroundImage: "linear-gradient(to bottom, #fff7b0, #ffd92b 40%, #ffb300 75%, #ff8a00)",
                filter:
                  "drop-shadow(0 2px 4px rgba(80,40,0,.35)) drop-shadow(0 0 16px rgba(255,184,24,.42))",
              }}
            >
              Summer
            </span>
            <span
              className="-mt-[.1em] block self-end bg-clip-text text-[clamp(36px,8vw,58px)] leading-none text-transparent"
              style={{
                transform: "translate(.22em)",
                backgroundImage: "linear-gradient(to bottom, #d6f4ff, #5bcbff 40%, #12a6f2 75%, #0086e0)",
                filter:
                  "drop-shadow(0 2px 4px rgba(0,30,60,.35)) drop-shadow(0 0 16px rgba(36,178,255,.5))",
              }}
            >
              Event
            </span>
          </div>
          <img
            src="https://i.ibb.co/PGtV5hZb/summer-cocktail.webp"
            className="cocktail-float pointer-events-none absolute -bottom-[22px] -right-6 z-0 h-[46px] w-[46px] rotate-[16deg] select-none object-contain sm:-bottom-8 sm:-right-16 sm:h-[60px] sm:w-[60px]"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 z-[3] h-[2px] bg-[linear-gradient(to_right,rgba(124,232,247,0),rgba(124,232,247,0)_14%,rgba(124,232,247,.9),rgba(124,232,247,0)_86%,rgba(124,232,247,0))] before:pointer-events-none before:absolute before:-bottom-1 before:left-0 before:right-0 before:h-2 before:bg-[linear-gradient(to_right,rgba(124,232,247,0),rgba(124,232,247,0)_20%,rgba(124,232,247,.45),rgba(124,232,247,0)_80%,rgba(124,232,247,0))] before:blur-[5px] sm:before:h-2.5 sm:before:blur-md"
        aria-hidden="true"
      />
    </section>
  );
}

function PearlBalance() {
  const user = useAuth((state) => state.user);
  const [pearls, setPearls] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const profileId = user?.profile_id || user?.id;
    if (!profileId) {
      setPearls(0);
      return;
    }

    const loadPearls = async () => {
      let data = null;
      let error = null;
      try {
        const result = await apiRequest("/api/profile");
        data = result?.profile || null;
      } catch (requestError) {
        error = requestError;
      }

      if (!isMounted) return;
      if (error || !data) {
        console.warn("Failed to load user pearls:", error);
        setPearls(0);
      } else {
        setPearls(Number(data.pearls ?? 0));
      }
    };

    void loadPearls();

    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.profile_id]);

  return (
    <div className="relative mx-auto mt-2.5 flex w-full max-w-[1180px] items-center justify-center sm:mt-3.5">
      <div className="inline-flex items-center gap-2 sm:gap-2.5">
        <div className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-[#161925] px-2.5 py-1.5 text-[12.5px] font-semibold tracking-[.2px] sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm">
          <span className="text-white/50">You have</span>
          <img src={PEARL_ICON} alt="" className="h-[17px] w-[17px] shrink-0 object-contain sm:h-5 sm:w-5" draggable={false} />
          <span className="font-bold text-white">{pearls.toLocaleString()}</span>
          <span className="text-white/50">Pearls</span>
        </div>
      </div>
    </div>
  );
}

function HowItWorksPanel() {
  return (
    <section
      id="event-panel"
      aria-label="How the Summer Event works"
      className="how-panel mx-auto mt-4 box-border w-full max-w-[1180px] bg-transparent px-4 pb-5 pt-[18px] sm:px-6 sm:pb-6 sm:pt-[22px]"
    >
      <p className="m-0 text-center text-sm leading-[1.65] text-[#c7cce0]">
        During the Summer Event, playing <strong className="font-bold text-white">Case Battles</strong> and{" "}
        <strong className="font-bold text-white">Cases</strong> rewards you with <strong className="font-bold text-white">Pearls</strong>.
        Collect them, spend them to open <strong className="font-bold text-white">Event Cases</strong>, and every Pearl you spend
        opening a case adds one entry to the <strong className="font-bold text-white">Summer Raffles</strong>. When the Raffle ends,
        winners are drawn <strong className="font-bold text-white">at random</strong>, every Ticket is one chance, so the more Tickets
        you hold, the higher your odds (holding the most never guarantees a win). Group mode in Case Battles does not count.
      </p>

      <div className="mt-[18px] grid grid-cols-1 gap-3 min-[880px]:grid-cols-3">
        <div className="flex flex-col items-start rounded-[8px] border border-[#20222f] bg-[#161925] p-4">
          <span className="mb-2.5 inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#7ce8f7,#38bdf8)] text-[13px] font-extrabold text-[#08252e]">
            1
          </span>
          <span className="text-[13px] leading-normal text-[#c7cce0]">
            Play <strong className="font-semibold text-white">Case Battles</strong> and <strong className="font-semibold text-white">Cases</strong> and earn{" "}
            <strong className="font-semibold text-white">1 Pearl for every 100K Coins</strong>.
          </span>
        </div>
        <div className="flex flex-col items-start rounded-[8px] border border-[#20222f] bg-[#161925] p-4">
          <span className="mb-2.5 inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#7ce8f7,#38bdf8)] text-[13px] font-extrabold text-[#08252e]">
            2
          </span>
          <span className="text-[13px] leading-normal text-[#c7cce0]">
            Spend your Pearls in <strong className="font-semibold text-white">Event Cases</strong> to open cases.
          </span>
        </div>
        <div className="flex flex-col items-start rounded-[8px] border border-[#20222f] bg-[#161925] p-4">
          <span className="mb-2.5 inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#7ce8f7,#38bdf8)] text-[13px] font-extrabold text-[#08252e]">
            3
          </span>
          <span className="text-[13px] leading-normal text-[#c7cce0]">
            Every spent Pearl grants <strong className="font-semibold text-white">1 Summer Raffle entry</strong>. Winners are drawn{" "}
            <strong className="font-semibold text-white">at random</strong>, so more Tickets mean higher odds.
          </span>
        </div>
      </div>

      <h3 className="mb-3 mt-[22px] text-[15px] font-bold text-white">Included Games and Requirements</h3>
      <div className="grid grid-cols-1 gap-2.5 min-[880px]:grid-cols-2">
        <div className="flex items-center gap-3 rounded-[8px] border border-[#20222f] bg-[#161925] px-3.5 py-[11px]">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center text-[#cbd3f2]">
            <GameIcon name="swords" className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[13.5px] font-semibold text-white">Case Battles</span>
            <span className="text-[12.5px] text-[#9aa3c4]">Earns 1 Pearl per 100K Coins Played. Group mode does not count.</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-[8px] border border-[#20222f] bg-[#161925] px-3.5 py-[11px]">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center text-[#cbd3f2]">
            <GameIcon name="box" className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[13.5px] font-semibold text-white">Cases</span>
            <span className="text-[12.5px] text-[#9aa3c4]">All Games Count, Earns 1 Pearl per 100K Coins Played.</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function EventCasesPanel() {
  return (
    <section
      id="event-panel"
      aria-label="Event Cases"
      className="how-panel mx-auto mt-4 box-border w-full max-w-[1180px] bg-transparent px-4 pb-5 pt-[18px] sm:px-6 sm:pb-6 sm:pt-[22px]"
    >
      <div className="mx-auto mb-4 flex max-w-[1180px] items-center gap-3 rounded-[8px] bg-[#161925] p-3.5 sm:gap-[18px] sm:px-[18px] sm:py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[10px] bg-transparent">
            <img src={PEARL_ICON} alt="" className="h-[30px] w-[30px] object-contain" draggable={false} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[15px] font-bold text-white">Open cases with Pearls</span>
            <span className="text-[12.5px] font-medium leading-normal text-white/55">
              Earn <strong className="font-bold text-white/85">1 Pearl per 100K Coins</strong> played in Cases &amp; Battles (excluding
              Group mode). Spend Pearls here to open Event Cases. Every Pearl spent grants{" "}
              <strong className="font-bold text-white/85">1 Raffle Ticket</strong>.
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {eventCases.map((item) => (
          <div key={item.name} className="group w-[184px] flex-none cursor-pointer select-none">
            <div className="relative flex flex-col items-center overflow-hidden rounded-[6px] bg-[#171925] p-3.5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_95%_95%,rgba(108,99,255,.16)_0%,rgba(108,99,255,.08)_22%,transparent_58%)] opacity-90"
              />
              <img
                src={item.image}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="pointer-events-none absolute -inset-[30px] z-0 h-[calc(100%+60px)] w-[calc(100%+60px)] scale-[1.22] object-cover opacity-[.14] blur-[48px] saturate-[1.1] transition duration-200 group-hover:scale-[1.28] group-hover:opacity-20 group-hover:blur-[54px] group-hover:saturate-[1.25]"
              />
              <div className="relative z-[2] flex w-full justify-center">
                <p className="m-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-sm font-medium text-white/90">
                  {item.name}
                </p>
              </div>
              <div className="relative z-[2] my-3 flex h-[120px] w-[120px] items-center justify-center">
                <div className="relative h-[120px] w-[120px]">
                  <img
                    src={item.image}
                    alt={item.name}
                    width="120"
                    height="120"
                    className="h-[120px] w-[120px] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,.45)]"
                    draggable={false}
                  />
                </div>
              </div>
              <button
                type="button"
                className="relative z-[2] flex h-10 w-[85%] cursor-pointer items-center justify-center gap-2 rounded-[8px] border-0 bg-[#1c1f2e] transition-colors hover:bg-[#202235]"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#e1e4f2f2]">
                  <img src={PEARL_ICON} alt="" width="16" height="16" className="h-4 w-4 object-contain" draggable={false} />
                  <span className="leading-none">{item.price}</span>
                </span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CountdownDigit({ children }) {
  return (
    <span className="inline-block h-[1.15em] w-[.64em] overflow-hidden text-center leading-[1.15em] align-top">
      <span className="cd-drop block leading-[1.15em]">{children}</span>
    </span>
  );
}

function RafflePanel() {
  const user = useAuth((state) => state.user);
  const [eventEndAt, setEventEndAt] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [totalTickets, setTotalTickets] = useState(0);
  const [yourTickets, setYourTickets] = useState(0);
  const [leaderboardRows, setLeaderboardRows] = useState([]);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let eventChannel = null;
    const eventId = "summer_event_main";
    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

    const ensureEventEndsAt = async (row) => {
      const parsed = row?.ends_at ? new Date(row.ends_at) : null;
      if (parsed && !Number.isNaN(parsed.getTime())) return parsed;

      const fallback = row?.created_at
        ? new Date(new Date(row.created_at).getTime() + TEN_DAYS_MS)
        : new Date(Date.now() + TEN_DAYS_MS);
      return fallback;
    };

    const loadEventData = async () => {
      let data = null;
      let error = null;
      let leaderboardFromServer = [];
      try {
        const result = await apiRequest("/api/summer-event");
        data = result?.event || null;
        leaderboardFromServer = result?.leaderboard || [];
      } catch (requestError) {
        error = requestError;
      }

      if (!isMounted) return;
      if (error) {
        console.warn("Failed to load summer event:", error);
        return;
      }

      const eventData = data;

      if (!eventData) return;

      const endAt = await ensureEventEndsAt(eventData);
      if (!isMounted) return;
      setEventEndAt(endAt);
      setRemainingSeconds(Math.max(0, Math.round((endAt.getTime() - Date.now()) / 1000)));

      const profileTotalTickets = Number(eventData.total_tickets ?? 0);

      setTotalTickets(profileTotalTickets);

      const leaderboardData = leaderboardFromServer;
      const leaderboardError = null;

      if (!isMounted) return;
      if (leaderboardError) {
        console.warn("Failed to load summer event leaderboard:", leaderboardError);
        setLeaderboardRows([]);
      } else {
        setLeaderboardRows((leaderboardData ?? []).filter((row) => Number(row?.summer_tickets ?? 0) > 0));
      }

      if (user?.id) {
        let profileData = null;
        let profileError = null;
        try {
          const profileResult = await apiRequest("/api/profile");
          profileData = profileResult?.profile || null;
        } catch (requestError) {
          profileError = requestError;
        }

        if (!isMounted) return;
        if (profileError) {
          console.warn("Failed to load user summer tickets:", profileError);
          setYourTickets(0);
        } else {
          setYourTickets(profileData?.summer_tickets ?? 0);
        }
      } else {
        setYourTickets(0);
      }
    };

    void loadEventData();

    eventChannel = supabase
      .channel("summer-event")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "summer_event", filter: `id=eq.${eventId}` },
        () => {
          if (isMounted) {
            void loadEventData();
          }
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      if (eventChannel) supabase.removeChannel(eventChannel);
    };
  }, [user?.id, user?.profile_id]);

  useEffect(() => {
    if (!eventEndAt) return;

    const updateRemaining = () => {
      const now = Date.now();
      setRemainingSeconds(Math.max(0, Math.round((eventEndAt.getTime() - now) / 1000)));
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [eventEndAt]);

  const displayedSeconds = remainingSeconds ?? 0;
  const days = Math.floor(displayedSeconds / 86400);
  const hours = Math.floor((displayedSeconds % 86400) / 3600);
  const minutes = Math.floor((displayedSeconds % 3600) / 60);
  const seconds = displayedSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");

  const displayedLeaderboard = leaderboard.map((placeholder, index) => {
    const row = leaderboardRows[index];
    if (!row) {
      return placeholder;
    }

    return {
      ...placeholder,
      name: row.username || placeholder.name,
      tickets: row.summer_tickets ?? placeholder.tickets,
      avatar: row.avatar_headshot_url || row.avatar_url || placeholder.avatar,
    };
  });

  return (
    <section
      id="event-panel"
      aria-label="Summer Raffles"
      className="how-panel mx-auto mt-4 box-border w-full max-w-[1180px] bg-transparent px-4 pb-5 pt-[18px] sm:px-6 sm:pb-6 sm:pt-[22px]"
    >
      {/* The uploaded Summer_Raffles HTML contains Top Ticket Holders, Total tickets, and View your Tickets. It does not contain Prize Pool, Pearls Spent, 1st/2nd/3rd prize rows, or View Raffle Tickets text, so those were not invented. */}
      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.05fr_.95fr]">
        <div className="flex flex-col">
          <p className="mb-3.5 mt-0 text-left text-sm leading-[1.65] text-[#c7cce0]">
            Every Pearl you spend opening an <strong className="font-bold text-white">Event Case</strong> becomes one{" "}
            <strong className="font-bold text-white">Raffle Ticket</strong>. When the Raffle ends, winners are drawn , and each
            Ticket is one chance, so the more Tickets you hold, the higher your chance of winning. Holding the most Tickets boosts
            your odds but never guarantees a win.
          </p>

          <div className="mb-2 flex flex-col items-center gap-1.5 rounded-[8px] border border-[#20222f] bg-[#161925] px-3.5 py-4">
            <span className="text-[9px] font-bold uppercase tracking-[.08em] text-white/35">Total prize</span>
            <span className="inline-flex items-center gap-2 text-[28px] font-extrabold leading-[1.1] text-white">
              <img src={COIN_ICON} alt="" className="h-[26px] w-[26px] shrink-0 object-contain" draggable={false} />
              50,000,000
            </span>
            <span className="inline-flex items-center gap-[5px] text-xs font-semibold text-white/50">
              5 Winners,
              <img src={COIN_ICON} alt="" className="h-[13px] w-[13px] shrink-0 object-contain" draggable={false} />
              10,000,000 Each
            </span>
          </div>

          <div className="mb-2 flex flex-col items-center gap-2 rounded-[8px] border border-[#20222f] bg-[#161925] px-3.5 py-4">
            <span className="text-[9px] font-bold uppercase tracking-[.08em] text-white/35">Ends in</span>
            <span className="inline-flex items-center gap-px text-[26px] font-bold leading-[1.15] text-white [font-variant-numeric:tabular-nums]">
              {[...pad(days)].map((digit, idx) => (
                <CountdownDigit key={`day-${idx}`}>{digit}</CountdownDigit>
              ))}
              <span className="px-[3px] font-bold text-white/30">:</span>
              {[...pad(hours)].map((digit, idx) => (
                <CountdownDigit key={`hour-${idx}`}>{digit}</CountdownDigit>
              ))}
              <span className="px-[3px] font-bold text-white/30">:</span>
              {[...pad(minutes)].map((digit, idx) => (
                <CountdownDigit key={`minute-${idx}`}>{digit}</CountdownDigit>
              ))}
              <span className="px-[3px] font-bold text-white/30">:</span>
              {[...pad(seconds)].map((digit, idx) => (
                <CountdownDigit key={`second-${idx}`}>{digit}</CountdownDigit>
              ))}
            </span>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center gap-1 rounded-[8px] border border-[#20222f] bg-[#161925] px-3.5 py-3">
              <span className="text-[9px] font-bold uppercase tracking-[.08em] text-white/40">Your tickets</span>
              <span className="text-lg font-extrabold text-[#e1e4f2]">{yourTickets ?? 0}</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-[8px] border border-[#20222f] bg-[#161925] px-3.5 py-3">
              <span className="text-[9px] font-bold uppercase tracking-[.08em] text-white/40">Total tickets</span>
              <span className="text-lg font-extrabold text-[#e1e4f2]">{totalTickets ?? 0}</span>
            </div>
          </div>

          <div className="mb-3.5 rounded-[8px] bg-[#60a5fa1f] px-3.5 py-2.5 text-center text-xs font-semibold leading-normal text-[#93c5fd]">
            When the Raffle Ends, Winning Ticket Numbers will be Rolled Live on our{" "}
            <a
              className="font-bold text-[#60a5fa] underline underline-offset-2 transition-colors hover:text-[#93c5fd]"
              href="https://discord.gg/bloxypot"
              rel="noopener noreferrer"
              target="_blank"
            >
              Discord Server
            </a>
          </div>

          <button
            type="button"
            className="inline-flex h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[rgba(94,85,217,.4)] bg-[linear-gradient(135deg,#6c63ff,#5147d9)] text-sm font-semibold text-white shadow-[0_2px_12px_rgba(108,99,255,.3)] transition-opacity hover:opacity-90"
            onClick={() => setTicketModalOpen(true)}
          >
            View your Tickets
          </button>
        </div>

        <div className="overflow-hidden rounded-[8px] border border-[#20222f] bg-[#161925]">
          <div className="flex items-center justify-between border-b border-[#20222f] px-4 py-[13px]">
            <span className="text-sm font-bold text-white">Top Ticket Holders</span>
          </div>
          <div className="flex flex-col">
            {displayedLeaderboard.map((user, index) => (
              <div
                key={`${user.rank}-${user.name}`}
                className={`flex items-center gap-2.5 border-b border-[rgba(32,34,47,.55)] px-4 py-2.5 last:border-b-0 ${
                  index > 7 ? "max-[420px]:hidden" : ""
                }`}
              >
                <span className={`w-[26px] shrink-0 text-center text-[13px] font-extrabold ${user.rankClass}`}>{user.rank}</span>
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    className="h-[30px] w-[30px] shrink-0 cursor-pointer rounded-full border-2 border-white/[.06] bg-[#1c1f2e] object-cover transition duration-150 hover:scale-105 hover:border-[#6c63ffa6] hover:brightness-110"
                    draggable={false}
                  />
                ) : (
                  <div className="h-[30px] w-[30px] shrink-0 rounded-full border-2 border-white/[.06] bg-[#1c1f2e]" />
                )}
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold text-white">
                  {user.name}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-[#facc15]">
                  <img src={TICKET_ICON} alt="" width="14" height="14" className="h-3.5 w-3.5 object-contain" draggable={false} />
                  {user.tickets}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <SummerRaffleTicketModal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
      />
    </section>
  );
}

export default function SummerEvent() {
  const [activeTab, setActiveTab] = useState("how");

  return (
    <div
      className="relative h-full min-h-0 w-full overflow-auto bg-cover bg-center bg-no-repeat text-white/90 [font-family:Poppins,sans-serif]"
      style={{
        background:
          "linear-gradient(rgba(29, 32, 47, 0.88), rgb(29, 32, 47)), url('https://i.ibb.co/v4wP9pPK/summer-bg.png') center / cover",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap');


        html,
        body,
        #root,
        .scroll-cool,
        .no-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        html::-webkit-scrollbar,
        body::-webkit-scrollbar,
        #root::-webkit-scrollbar,
        .scroll-cool::-webkit-scrollbar,
        .no-scrollbar::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .summer-page-in {
          animation: pageSlideIn .15s ease-out both;
        }

        .how-panel {
          animation: howIn .28s ease;
        }

        .cd-drop {
          animation: cdDrop .4s cubic-bezier(.2,.8,.2,1);
        }

        @media (prefers-reduced-motion: no-preference) {
          .event-glow { animation: eventsGlowPulse 6s ease-in-out infinite; }
          .sun-spin { animation: sunSpin 24s linear infinite; }
          .cocktail-float { animation: cocktailFloat 3.2s ease-in-out infinite; }
        }

        @keyframes pageSlideIn {
          from { opacity: .5; transform: translateY(-2.5rem); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes eventsGlowPulse {
          0%, 100% { opacity: .92; }
          50% { opacity: 1; }
        }

        @keyframes sunSpin {
          to { transform: rotate(360deg); }
        }

        @keyframes cocktailFloat {
          0%, 100% { transform: translateY(0) rotate(16deg); }
          50% { transform: translateY(-6px) rotate(16deg); }
        }

        @keyframes howIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: none; }
        }

        @keyframes cdDrop {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div className="summer-page-in relative z-10 box-border h-full min-h-0 overflow-visible px-[22px] pb-10 pt-7">
        <Hero />
        <PearlBalance />

        <div className="mx-auto mt-4 grid w-full max-w-[1180px] grid-cols-1 gap-3.5 md:grid-cols-3 xl:mt-[22px] xl:gap-[18px]">
          {tabs.map((tab) => (
            <EventTab key={tab.key} tab={tab} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} />
          ))}
        </div>

        <div className={activeTab === "how" ? "" : "hidden"}>
          <HowItWorksPanel />
        </div>
        <div className={activeTab === "cases" ? "" : "hidden"}>
          <EventCasesPanel />
        </div>
        <div className={activeTab === "raffles" ? "" : "hidden"}>
          <RafflePanel />
        </div>
      </div>
    </div>
  );
}
