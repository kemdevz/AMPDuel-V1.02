import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CaseOpeningView from "../components/CaseOpeningView";
import { getInventoryItemAccent } from "../components/InventoryItemCard";
import { useNavigate } from "../lib/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../store/auth";
import { formatPriceValue } from "../Utils/FormatPriceValues";

const COIN_ICON = "/bobux.png";
const TABS = ["Official", "Community", "Your Cases"];

const rollNumberFormatter = new Intl.NumberFormat("en-US");

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

function priceToNumber(price) {
  return Number(String(price ?? 0).replaceAll(",", ""));
}

function isCatalogCaseArtwork(imageUrl) {
  return String(imageUrl || "").includes("biggamesapi.io/image/");
}

function getCaseArtworkSize(caseItem) {
  const caseName = String(caseItem?.name || "").toLowerCase();
  if (caseName.includes("inferno")) return "inferno";
  if (caseName.includes("winter")) return "winter";
  if (isCatalogCaseArtwork(caseItem?.image)) return "catalog";
  return "default";
}

function getCaseSlug(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCase(row) {
  const caseId = String(row?.uuid || row?.id || "");
  const items = Array.isArray(row?.items) ? row.items : [];

  return {
    ...row,
    id: caseId,
    slug: getCaseSlug(row?.name),
    image: row?.image_url || row?.image || "",
    price: Number(row?.price ?? 0),
    active: row?.active !== false,
    community: Boolean(row?.community),
    items: items.map((item, index) => {
      const rollStart = Number(item?.roll_range?.start);
      const rollEnd = Number(item?.roll_range?.end);
      const rangeChance = Number.isInteger(rollStart) && Number.isInteger(rollEnd) && rollEnd >= rollStart
        ? (rollEnd - rollStart + 1) / 1000
        : 0;
      const normalizedItem = {
        ...item,
        id: String(item?.item_id || item?.id || `${caseId}-item-${index}`),
        image: item?.image_url || item?.image || "",
        value: Number(item?.value ?? 0),
        chance: Number(item?.chance ?? rangeChance),
      };

      return {
        ...normalizedItem,
        accent: getInventoryItemAccent(normalizedItem),
      };
    }),
  };
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pointer-events-none absolute left-[13px] top-1/2 h-4 w-4 -translate-y-1/2 opacity-60"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
        stroke="#E1E4F2"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SortIcon({ ascending = false }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path
        d={ascending ? "M13 3.793V9h-2V3.864L9.914 4.95 8.5 3.536 12.036 0l3.535 3.536-1.414 1.414L13 3.793zM8 10H0V8h8v2zm6 3H0v-2h14v2zm2 3H0v-2h16v2zM6 7H0V5h6v2zM4 4H0V2h4v2z" : "M13 12.208V7h-2v5.137l-1.086-1.086L8.5 12.466 12.036 16l3.535-3.535-1.414-1.415L13 12.208zM8 6H0v2h8V6zm6-3H0v2h14V3zm2-3H0v2h16V0zM6 9H0v2h6V9zm-2 3H0v2h4v-2z"}
        fillRule="evenodd"
      />
    </svg>
  );
}

function ViewIcon({ caseName, onClick }) {
  return (
    <button
      type="button"
      className="pointer-events-none absolute left-2 top-2 z-[3] flex h-8 w-8 translate-y-[-6px] scale-[.98] cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent p-0 text-white opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:translate-y-0 focus-visible:scale-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6c63ff]"
      aria-label={`Preview ${caseName}`}
      title={`Preview ${caseName}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="white" strokeWidth="2" />
      </svg>
    </button>
  );
}

function CasePreviewModal({ item, onClose }) {
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

function CaseCard({ item, onPreview, onOpen }) {
  const artworkSize = getCaseArtworkSize(item);

  return (
    <div
      className="group min-w-[170px] cursor-pointer select-none rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6c63ff] focus-visible:outline-offset-2"
      role="button"
      tabIndex={0}
      aria-label={`Preview ${item.name}`}
      onClick={() => onPreview(item)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview(item);
        }
      }}
    >
      <div className="relative flex flex-col items-center overflow-hidden rounded-[6px] bg-[#171925] p-[14px]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(120% 120% at 95% 95%, rgba(108,99,255,.16) 0%, rgba(108,99,255,.08) 22%, transparent 58%)",
          }}
        />

        <ViewIcon caseName={item.name} onClick={() => onPreview(item)} />

        <img
          alt=""
          src={item.image}
          className="pointer-events-none absolute -inset-[30px] z-0 h-[calc(100%+60px)] w-[calc(100%+60px)] scale-[1.22] object-cover opacity-[.14] blur-[48px] saturate-[1.1] transition duration-200 group-hover:scale-[1.28] group-hover:opacity-20 group-hover:blur-[54px] group-hover:saturate-[1.25]"
          loading="lazy"
          decoding="async"
          draggable={false}
        />

        <div className="relative z-[2] flex w-full justify-center">
          <p className="m-0 max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-center text-sm font-medium text-white/90">
            {item.name}
          </p>
        </div>

        <div className="relative z-[2] my-3 flex max-h-[120px] min-h-[120px] min-w-[120px] max-w-[120px] items-center justify-center">
          <div className="relative h-[120px] w-[120px]">
            <img
              src={item.image}
              alt={item.name}
              width="120"
              height="120"
              className={`h-[120px] w-[120px] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,.45)] ${artworkSize === "winter" ? "scale-[1.326]" : artworkSize === "catalog" ? "scale-[1.3]" : artworkSize === "inferno" ? "translate-y-[4px] scale-[1.105]" : ""}`}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </div>
        </div>

        <button
          type="button"
          title="Open case page"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(item);
          }}
          className="relative z-[2] flex h-10 w-[85%] cursor-pointer select-none items-center justify-center gap-2 rounded-[8px] border-0 bg-[#1c1f2e] transition-colors hover:bg-[#202235]"
        >
          <span className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#e1e4f2f2]">
            <img
              src={COIN_ICON}
              alt="coin"
              width="16"
              height="16"
              className="h-4 w-4 text-[#6c63ff]"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            <span className="leading-none">{formatPriceValue(item.price, { compactNumbers: false })}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

export default function CasesPage({ caseSlug = null }) {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const [activeTab, setActiveTab] = useState("Official");
  const [search, setSearch] = useState("");
  const [descending, setDescending] = useState(true);
  const [previewCase, setPreviewCase] = useState(null);
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadCases = async () => {
      setCasesLoading(true);
      setCasesError("");

      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("active", true)
        .order("price", { ascending: false });

      if (!isMounted) return;
      if (error) {
        console.error("[Cases] failed to load cases", error);
        setCases([]);
        setCasesError("Unable to load cases right now.");
      } else {
        setCases((data || []).map(normalizeCase));
      }
      setCasesLoading(false);
    };

    void loadCases();

    const casesChannel = supabase
      .channel("cases-page-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, () => {
        void loadCases();
      })
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(casesChannel);
    };
  }, []);

  const visibleCases = useMemo(() => {
    const currentUserId = String(user?.profile_id || user?.id || "");
    const tabCases = cases.filter((item) => {
      if (activeTab === "Official") return !item.community;
      if (activeTab === "Community") return item.community;
      return item.community && currentUserId && String(item.owner_user_id || "") === currentUserId;
    });

    return tabCases.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => {
      const diff = priceToNumber(a.price) - priceToNumber(b.price);
      return descending ? -diff : diff;
    });
  }, [activeTab, cases, descending, search, user?.id, user?.profile_id]);

  const activeCase = useMemo(
    () => cases.find((item) => item.slug === String(caseSlug || "").toLowerCase()) || null,
    [caseSlug, cases],
  );

  if (activeCase) {
    return <CaseOpeningView item={activeCase} onBack={() => navigate("/cases")} />;
  }

  if (caseSlug) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center px-4 text-[#e1e4f2] [font-family:Poppins,sans-serif]">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="m-0 text-sm text-[#8b92b8]">
            {casesLoading ? "Loading case..." : casesError || "This case is unavailable."}
          </p>
          {!casesLoading && (
            <button
              type="button"
              onClick={() => navigate("/cases")}
              className="h-[42px] cursor-pointer rounded-[8px] border border-[rgba(94,85,217,.4)] bg-[linear-gradient(135deg,#5b52e2,#4038c0)] px-5 font-semibold text-white shadow-[0_2px_8px_rgba(108,99,255,.2)] hover:bg-[linear-gradient(135deg,#6c63ff,#5147d9)]"
            >
              Back to Cases
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="main-container relative z-10 h-full w-full min-w-0 max-w-full overflow-x-hidden text-[#e1e4f2] [font-family:Poppins,sans-serif]">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap");

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

        .case-preview-thumb .case-preview-thumb-image-winter {
          transform: scale(1.326);
        }

        .case-preview-thumb .case-preview-thumb-image-inferno {
          transform: translateY(3px) scale(1.105);
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

        @media (prefers-reduced-motion: reduce) {
          .case-preview-backdrop,
          .case-preview-modal,
          .case-preview-item {
            animation: none;
            transition: none;
          }
        }
      `}</style>

      <div className="relative z-[20] flex h-full w-full flex-col items-center">
        <div className="flex min-h-screen w-full max-w-[1320px] flex-col items-center px-4 pb-4 pt-4 xl:px-12 xl:pb-8 xl:pt-8">
          <div className="flex h-full w-full flex-col gap-4">
            <div className="h-full w-full">
              <div className="mx-auto box-border w-full px-[14px] pb-[22px] min-[1100px]:max-w-[1320px] min-[1100px]:px-[18px] min-[1100px]:pb-7 max-[840px]:px-3">
                <div className="mb-3 mt-2 box-border flex w-full flex-nowrap items-center justify-between gap-3 px-0.5 max-[840px]:flex-col max-[840px]:items-center">
                  <div className="flex shrink-0 gap-1 rounded-[6px] bg-[#131520] p-1">
                    {TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`whitespace-nowrap rounded-[4px] border-0 px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                          activeTab === tab
                            ? "bg-[#2a3048] text-[#e1e4f2]"
                            : "bg-transparent text-[#6c7399] hover:text-[#c7cce2]"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-2 max-[840px]:ml-0 max-[840px]:w-full max-[840px]:flex-nowrap max-[840px]:justify-center">
                    <div className="relative flex max-[840px]:min-w-0 max-[840px]:flex-1">
                      <SearchIcon />
                      <input
                        type="text"
                        placeholder="Search for a case..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="box-border h-10 w-[260px] rounded-[6px] border-0 bg-[#1c1f2e] py-0 pl-10 pr-[14px] text-left text-sm text-white/[.92] shadow-none outline-none placeholder:text-left placeholder:text-white/[.45] focus:border-0 focus:bg-[#1c1f2e] focus:outline-none max-[840px]:w-full"
                      />
                    </div>

              <button
                type="button"
                title={descending ? "Highest to Lowest" : "Lowest to Highest"}
                aria-label={descending ? "Sort lowest to highest" : "Sort highest to lowest"}
                onClick={() => setDescending((value) => !value)}
                className="inline-flex h-10 w-10 min-w-0 shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-0 bg-[#20222f] p-0 text-[#e1e4f2] transition-colors duration-150 hover:bg-[#2a2e44]"
              >
                <SortIcon ascending={!descending} />
              </button>
                  </div>

                </div>

                {casesLoading ? (
                  <div className="flex w-full justify-center px-0.5 py-8 text-sm text-[#8b92b8]">
                    Loading cases...
                  </div>
                ) : casesError ? (
                  <div className="flex w-full justify-center px-0.5 py-8 text-sm text-[#ff7b87]">
                    {casesError}
                  </div>
                ) : visibleCases.length > 0 ? (
                  <div
                    className="grid w-full gap-3 px-0.5"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}
                  >
                    {visibleCases.map((item) => (
                      <CaseCard
                        key={item.id}
                        item={item}
                        onPreview={setPreviewCase}
                        onOpen={(selectedCase) => navigate(`/cases/${selectedCase.slug}`)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex w-full justify-center px-0.5 py-8 text-sm text-[#8b92b8]">
                    {activeTab === "Your Cases" && !user
                      ? "Sign in to view your cases."
                      : `No ${activeTab.toLowerCase()} cases found.`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {previewCase ? <CasePreviewModal item={previewCase} onClose={() => setPreviewCase(null)} /> : null}
    </div>
  );
}
