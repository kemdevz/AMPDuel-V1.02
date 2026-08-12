import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CaseOpeningView from "../components/CaseOpeningView";
import { getInventoryItemAccent, getInventoryItemCardStyle } from "../components/InventoryItemCard";
import { notifications } from "../components/Notifications";
import SortDirectionIcon from "../components/SortDirectionIcon";
import { apiRequest } from "../lib/apiClient";
import { useNavigate } from "../lib/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../store/auth";
import { formatPriceValue } from "../Utils/FormatPriceValues";

const COIN_ICON = "/bobux.png";
const TABS = ["Official", "Community", "Your Cases"];
const MAX_COMMUNITY_CASE_PRICE = 1_000_000;
const MIN_COMMUNITY_CASE_CREATOR_PLAYED = 5_000_000;
const MIN_COMMUNITY_CASE_ITEM_CHANCE = 0.1;
const MAX_COMMUNITY_CASES_PER_USER = 5;
const CASE_IMAGE_OPTIONS = [
  { id: "case-image-1", label: "Image 1", imageUrl: "" },
  { id: "case-image-2", label: "Image 2", imageUrl: "" },
  { id: "case-image-3", label: "Image 3", imageUrl: "" },
  { id: "case-image-4", label: "Image 4", imageUrl: "" },
  { id: "case-image-5", label: "Image 5", imageUrl: "" },
];
const rollNumberFormatter = new Intl.NumberFormat("en-US");

function isCommunityCaseCatalogItemAllowed(item) {
  const name = String(item?.name || "");
  return Number(item?.value) > 0
    && /\b(?:huge|titanic|gargantuan)\b/i.test(name)
    && !/\b(?:booth|enchant|hoverboard|egg|gems?)\s*$/i.test(name);
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

function priceToNumber(price) {
  return Number(String(price ?? 0).replaceAll(",", ""));
}

function getCaseMetric(item, keys) {
  for (const key of keys) {
    const value = Number(item?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
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
    image: row?.image_url || "",
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
  return <SortDirectionIcon ascending={ascending} />;
}

function hideMissingCaseArtwork(event) {
  event.currentTarget.style.display = "none";
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
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.name}
                  className={`case-preview-thumb-image-${getCaseArtworkSize(item)}`}
                  draggable={false}
                  onError={hideMissingCaseArtwork}
                />
              ) : null}
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

        {item.image ? (
          <img
            alt=""
            src={item.image}
            className="pointer-events-none absolute -inset-[30px] z-0 h-[calc(100%+60px)] w-[calc(100%+60px)] scale-[1.22] object-cover opacity-[.14] blur-[48px] saturate-[1.1] transition duration-200 group-hover:scale-[1.28] group-hover:opacity-20 group-hover:blur-[54px] group-hover:saturate-[1.25]"
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={hideMissingCaseArtwork}
          />
        ) : null}

        <div className="relative z-[2] flex w-full justify-center">
          <p className="m-0 max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-center text-sm font-medium text-white/90">
            {item.name}
          </p>
        </div>

        <div className="relative z-[2] my-3 flex max-h-[120px] min-h-[120px] min-w-[120px] max-w-[120px] items-center justify-center">
          <div className="relative h-[120px] w-[120px]">
            {item.image ? (
              <img
                src={item.image}
                alt={item.name}
                width="120"
                height="120"
                className={`h-[120px] w-[120px] object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,.45)] ${artworkSize === "catalog" ? "scale-[1.3]" : artworkSize === "inferno" ? "translate-y-[4px] scale-[1.105]" : artworkSize === "beach" ? "-translate-y-[4px] scale-[.95]" : ""}`}
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={hideMissingCaseArtwork}
              />
            ) : null}
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

function MyCaseCard({ item, onPreview, onOpen, onDelete, deleting }) {
  const artworkSize = getCaseArtworkSize(item);
  const opens = getCaseMetric(item, ["open_count", "opens", "total_opens", "times_opened"]);

  return (
    <div
      className="group your-case-card-outer"
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
      <div className="your-case-card">
        <ViewIcon caseName={item.name} onClick={() => onPreview(item)} />
        {item.image ? <img className="your-case-glow" src={item.image} alt="" loading="lazy" decoding="async" draggable={false} onError={hideMissingCaseArtwork} /> : null}
        <div className="your-case-delete-wrap">
          <button
            type="button"
            className="your-case-delete"
            aria-label={`${item.active ? "Deactivate" : "Delete"} ${item.name}`}
            title={item.active ? "Deactivate case" : "Delete case"}
            disabled={deleting}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(item);
            }}
          >
            {deleting ? <span className="your-case-delete-spinner" /> : "×"}
          </button>
        </div>
        <div className="your-case-title-wrap"><p className="your-case-title">{item.name}</p></div>
        <div className="your-case-image-wrap">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              width="120"
              height="120"
              className={artworkSize === "catalog" ? "your-case-image-catalog" : artworkSize === "inferno" ? "your-case-image-inferno" : artworkSize === "beach" ? "your-case-image-beach" : ""}
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={hideMissingCaseArtwork}
            />
          ) : null}
        </div>
        <p className="your-case-opens">Opened {formatPriceValue(opens, { compactNumbers: false })} times</p>
        <button type="button" className="your-case-price" title="Open case page" onClick={(event) => { event.stopPropagation(); onOpen(item); }}>
          <span><img src={COIN_ICON} alt="coin" width="16" height="16" draggable={false} /><span>{formatPriceValue(item.price, { compactNumbers: false })}</span></span>
        </button>
      </div>
    </div>
  );
}

function CaseCreateView({ onBack, onCreated, ownedCaseCount = 0 }) {
  const user = useAuth((state) => state.user);
  const [selectedArtworkId, setSelectedArtworkId] = useState("");
  const [caseName, setCaseName] = useState("");
  const [commission, setCommission] = useState(1.5);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerClosing, setPickerClosing] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerDescending, setPickerDescending] = useState(true);
  const [catalogItems, setCatalogItems] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(true);
  const [pickerError, setPickerError] = useState("");
  const [pickerVisibleCount, setPickerVisibleCount] = useState(120);
  const [selectedItems, setSelectedItems] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const deferredPickerSearch = useDeferredValue(pickerSearch);

  const pickerItems = useMemo(() => {
    const query = deferredPickerSearch.trim().toLowerCase();
    return catalogItems
      .filter((item) => !query || item.name.toLowerCase().includes(query))
      .slice()
      .sort((a, b) => pickerDescending
        ? b.price - a.price || a.name.localeCompare(b.name)
        : a.price - b.price || a.name.localeCompare(b.name));
  }, [catalogItems, deferredPickerSearch, pickerDescending]);

  const visiblePickerItems = useMemo(
    () => pickerItems.slice(0, pickerVisibleCount),
    [pickerItems, pickerVisibleCount],
  );

  useEffect(() => {
    setPickerVisibleCount(120);
  }, [deferredPickerSearch, pickerDescending, pickerOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadCatalogItems = async () => {
      setPickerLoading(true);
      setPickerError("");
      const pageSize = 1000;
      const rows = [];

      try {
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase
            .from("items")
            .select("id,name,value,image_url,type")
            .gt("value", 0)
            .or("name.ilike.%Huge%,name.ilike.%Titanic%,name.ilike.%Gargantuan%")
            .not("name", "ilike", "% Booth")
            .not("name", "ilike", "% Enchant")
            .not("name", "ilike", "% Hoverboard")
            .not("name", "ilike", "% Egg")
            .not("name", "ilike", "% Gems")
            .not("name", "ilike", "% Gem")
            .order("value", { ascending: false })
            .order("id", { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (error) throw error;
          const page = Array.isArray(data) ? data : [];
          rows.push(...page);
          if (page.length < pageSize) break;
        }

        if (cancelled) return;
        setCatalogItems(rows.filter(isCommunityCaseCatalogItemAllowed).map((item) => ({
          id: String(item.id),
          name: String(item.name || "Unknown item"),
          image: item.image_url || "",
          price: Number(item.value) || 0,
          type: item.type || null,
        })));
      } catch (error) {
        if (!cancelled) {
          setCatalogItems([]);
          setPickerError(error?.message || "Unable to load items from Supabase.");
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    };

    void loadCatalogItems();
    return () => {
      cancelled = true;
    };
  }, []);

  const closePicker = () => {
    if (!pickerOpen || pickerClosing) return;
    setPickerClosing(true);
    window.setTimeout(() => {
      setPickerOpen(false);
      setPickerClosing(false);
      setPickerSearch("");
    }, 200);
  };

  const addPickerItem = (item) => {
    setSelectedItems((current) => {
      if (current.some((selected) => selected.id === item.id)) return current;
      return [...current, { ...item, chance: "" }].sort((a, b) => b.price - a.price);
    });
    setPickerOpen(false);
    setPickerClosing(false);
    setPickerSearch("");
  };

  const removeSelectedItem = (itemId) => {
    setSelectedItems((current) => current.filter((item) => item.id !== itemId));
  };

  const updateItemChance = (itemId, value) => {
    const numericValue = value === "" ? "" : Math.min(100, Math.max(MIN_COMMUNITY_CASE_ITEM_CHANCE, Number(value)));
    setSelectedItems((current) => current.map((item) => item.id === itemId ? { ...item, chance: numericValue } : item));
  };

  const distributeChances = () => {
    if (!selectedItems.length) return;
    const base = Math.floor((100 / selectedItems.length) * 100) / 100;
    const remainder = Number((100 - base * selectedItems.length).toFixed(2));
    setSelectedItems((current) => current.map((item, index) => ({ ...item, chance: Number((base + (index === 0 ? remainder : 0)).toFixed(2)) })));
  };

  const totalChance = selectedItems.reduce((sum, item) => sum + (Number(item.chance) || 0), 0);
  const commissionBps = Math.round(commission * 100);
  const totalTickets = selectedItems.reduce((sum, item) => sum + Math.round((Number(item.chance) || 0) * 1000), 0);
  const expectedValue = totalTickets === 100000
    ? selectedItems.reduce((sum, item) => sum + item.price * Math.round((Number(item.chance) || 0) * 1000), 0) / 100000
    : 0;
  const casePrice = expectedValue > 0 ? Math.ceil(expectedValue / ((9500 - commissionBps) / 10000)) : 0;
  const commissionPerOpen = Math.floor(casePrice * commissionBps / 10000);
  const meetsPlayedRequirement = Number(user?.played || 0) >= MIN_COMMUNITY_CASE_CREATOR_PLAYED;
  const hasReachedCaseLimit = ownedCaseCount >= MAX_COMMUNITY_CASES_PER_USER;
  const canCreate = Boolean(
    selectedArtworkId
    && caseName.trim()
    && selectedItems.length >= 2
    && selectedItems.every((item) => Number(item.chance) >= MIN_COMMUNITY_CASE_ITEM_CHANCE)
    && Math.abs(totalChance - 100) < 0.000001
    && totalTickets === 100000
    && casePrice > 0
    && casePrice <= MAX_COMMUNITY_CASE_PRICE
    && meetsPlayedRequirement
    && !hasReachedCaseLimit
  );

  const createCase = async () => {
    if (!canCreate || creating) return;
    const artwork = CASE_IMAGE_OPTIONS.find((option) => option.id === selectedArtworkId);
    setCreating(true);
    setCreateError("");
    try {
      const response = await apiRequest("/api/cases/community", {
        method: "POST",
        body: JSON.stringify({
          name: caseName.trim(),
          image_url: artwork?.imageUrl || null,
          commission_bps: commissionBps,
          items: selectedItems.map((item) => ({ item_id: item.id, chance: Number(item.chance) })),
        }),
      });
      notifications.success("Community case created!");
      onCreated?.(response?.case || null);
    } catch (error) {
      const message = error?.message || "Unable to create this case.";
      setCreateError(message);
      notifications.error(message);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closePicker();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen, pickerClosing]);

  return (
    <div className="case-create-page">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap");
        .case-create-page{min-height:100vh;color:#e1e4f2;padding-bottom:60px;font-family:Poppins,sans-serif}.case-create-inner{max-width:965px;margin:0 auto;padding:24px 20px 40px;display:flex;flex-direction:column;gap:16px}.case-create-back{height:42px;width:fit-content;min-width:120px;box-sizing:border-box;padding:0 16px;border:0;border-radius:8px;background:#2a2e44;color:#e1e4f2;font-size:.9rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;transform-origin:center;transition:background .25s ease,transform .1s ease}.case-create-back:hover{background:#32385a}.case-create-back:active{transform:scale(.97)}.case-create-back:focus-visible{outline:2px solid #8079ff;outline-offset:2px}
        .case-create-step{width:100%;background:#131520;border-radius:7px;padding:24px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box}.case-create-step-row{flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap}.case-create-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.case-create-head-left{display:flex;align-items:center;gap:14px}.case-create-head-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.case-create-badge{position:relative;width:32px;height:32px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(108,99,255,.12);border:none;user-select:none;pointer-events:none}.case-create-badge span{font-size:14px;font-weight:700;color:#a79fff;line-height:1}.case-create-title{font-size:15px;font-weight:500;color:#b7bdd6;white-space:nowrap}
        .case-create-art-row{display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;scrollbar-width:thin;scrollbar-color:#6c63ff #1c1f2e}.case-create-art-row::-webkit-scrollbar{height:6px}.case-create-art-row::-webkit-scrollbar-track{background:#1c1f2e;border-radius:999px}.case-create-art-row::-webkit-scrollbar-thumb{background:rgba(108,99,255,.7);border-radius:999px}.case-create-art-row::-webkit-scrollbar-thumb:hover{background:rgba(108,99,255,.9)}.case-create-art{position:relative;min-width:130px;min-height:130px;width:130px;height:130px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:7px;border:2px solid #252839;background:#171925;cursor:pointer;transition:border-color .25s,background .25s,transform .13s ease;flex-shrink:0;padding:0}.case-create-art:hover{background:#20243a}.case-create-art:active{transform:scale(.98)}.case-create-art:focus-visible{outline:2px solid #8079ff;outline-offset:2px}.case-create-art.is-active{border-color:rgba(108,99,255,.9);background:rgba(108,99,255,.09);box-shadow:0 0 0 1px rgba(108,99,255,.18)}.case-create-art img{width:115px;height:115px;object-fit:contain;pointer-events:none}
        .case-create-name-field{position:relative;width:300px;max-width:100%}.case-create-input{width:100%;height:40px;padding:10px 18px;border:2px solid #323240;border-radius:5px;background:#1c1f2e;color:#fff;box-shadow:0 10px 7.8px rgba(0,0,0,.15);font-family:Poppins,sans-serif;font-size:.9rem;font-weight:500;opacity:.9;outline:none;box-sizing:border-box}.case-create-input::placeholder{color:#cbd5e1}.case-create-input:focus{border-color:#45455a}.case-create-count{position:absolute;right:12px;bottom:-18px;font-size:11px;color:#6c7399;font-weight:500}.case-create-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:212px;border-radius:7px;text-align:center;color:#6b7297}.case-create-empty span{font-size:14px;color:#6b7297;font-weight:500}
        .case-create-items-list{display:flex;flex-direction:column;gap:8px;min-height:212px}.case-create-item-row{display:flex;align-items:center;gap:8px;animation:case-create-item-in .18s ease-out both}.case-create-item-card{flex:1;min-width:0;display:flex;align-items:center;border:none;border-bottom:3px solid var(--inventory-border-bottom);border-radius:8px;padding:10px;box-sizing:border-box;cursor:pointer;transition:filter .15s;gap:10px;min-height:58px;position:relative}.case-create-item-card:hover{filter:brightness(1.08)}.case-create-item-image-wrap{position:relative;width:38px;height:38px;flex-shrink:0}.case-create-item-blur{width:100%;height:100%;filter:blur(9px);position:absolute;inset:0;z-index:0;opacity:.6;border-radius:8px;object-fit:contain}.case-create-item-image{width:100%;height:100%;position:relative;z-index:1;border-radius:8px;object-fit:contain}.case-create-item-details{display:flex;flex-direction:column;min-width:0;flex:1;overflow:hidden}.case-create-item-name{color:rgba(255,255,255,.85);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;min-width:0;max-width:100%;margin:0}.case-create-item-value{color:#fff;font-weight:600;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;font-size:12px}.case-create-item-value img{width:14px;height:14px;margin:0;flex:0 0 auto}.case-create-chance-wrap{position:relative;flex-shrink:0}.case-create-chance{width:76px;height:40px;padding:0 20px 0 10px;border:2px solid #323240;border-radius:5px;background:#1c1f2e;color:#fff;box-shadow:0 10px 7.8px rgba(0,0,0,.15);font-family:Poppins,sans-serif;font-size:13px;font-weight:600;outline:none;box-sizing:border-box;-moz-appearance:textfield}.case-create-chance:focus{border-color:#45455a}.case-create-chance::-webkit-outer-spin-button,.case-create-chance::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.case-create-chance-suffix{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:11px;color:#6b7297;font-weight:700;pointer-events:none}.case-create-remove{width:40px;height:40px;border-radius:6px;border:none;background:#20222f;color:#6c7399;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s;flex-shrink:0}.case-create-remove:hover{background:#2a2e44;color:#ef4444}.case-create-distribute{height:42px;min-width:120px;padding:0 16px;border:none;border-radius:8px;color:#e1e4f2;background:#2a2e44;font-family:Poppins,sans-serif;font-size:.9rem;font-weight:600;cursor:pointer;transform-origin:center;transition:background .25s ease,transform .1s ease}.case-create-distribute:hover{background:#32385a}.case-create-distribute:active{transform:scale(.97)}.case-create-distribute:focus-visible{outline:2px solid #8079ff;outline-offset:2px}.case-create-odds-total{color:#f59e0b;font-weight:700;font-size:13px}.case-create-odds-total.is-complete{color:#22c55e}@keyframes case-create-item-in{from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        .case-create-primary{position:relative;isolation:isolate;overflow:hidden;height:42px;min-width:120px;padding:0 16px;box-sizing:border-box;border:1px solid rgba(94,85,217,.4);border-radius:8px;background:linear-gradient(135deg,#5b52e2,#4038c0);box-shadow:0 2px 8px rgba(108,99,255,.2);color:#fff;font-family:Poppins,sans-serif;font-size:.9rem;font-weight:600;letter-spacing:.01em;display:flex;align-items:center;justify-content:center;cursor:pointer;transform-origin:center;transition:opacity .2s ease,transform .1s ease,background .25s ease}.case-create-primary:hover:not(:disabled){background:linear-gradient(135deg,#6c63ff,#5147d9);opacity:.95}.case-create-primary:active:not(:disabled){transform:scale(.97)}.case-create-primary:focus-visible{outline:2px solid #8079ff;outline-offset:2px}.case-create-primary:disabled{opacity:.6;cursor:not-allowed;transform:none}.case-create-add{gap:6px;min-width:120px;padding:0 16px;font-size:.9rem}
        .case-create-commission{display:flex;flex-direction:column;gap:10px;background:#1c1f2e;border-radius:10px;padding:16px 20px}.case-create-label{display:block;font-size:11px;font-weight:700;color:#8891b8;text-transform:uppercase;letter-spacing:.5px}.case-create-hint{font-weight:500;color:#4a5278;text-transform:none;letter-spacing:0}.case-create-commission-row{display:flex;align-items:center;gap:14px}.case-create-slider{flex:1;accent-color:#6c63ff;height:4px;cursor:pointer}.case-create-commission-value{font-size:18px;font-weight:800;color:#6c63ff;min-width:44px;text-align:right}.case-create-bars{display:flex;align-items:stretch;gap:10px;width:100%}.case-create-price-card,.case-create-earn-card{flex:1;display:flex;flex-direction:column;gap:8px;padding:16px 18px;border-radius:10px;background:#1c1f2e;position:relative;overflow:hidden}.case-create-price-card:before,.case-create-earn-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px}.case-create-price-card:before{background:#6c63ff}.case-create-earn-card:before{background:#22c55e}.case-create-price-label,.case-create-earn-label{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase}.case-create-price-label{color:#8b90ff}.case-create-earn-label{color:#22c55e}.case-create-per{color:#5f7a68;font-weight:600}.case-create-total{display:flex;align-items:center;gap:8px;font-size:24px;font-weight:800;color:#fff;line-height:1}.case-create-total img{width:20px;height:20px}.case-create-submit{width:100%;min-width:0}
        .case-picker-overlay{position:fixed;inset:0;background-color:rgba(0,0,0,.5);display:flex;justify-content:center;align-items:center;z-index:2147483000;animation:case-picker-fade-in .3s ease-out}.case-picker-modal{background-color:#131520;border:1px solid #181a28;border-radius:10px;padding:15px;width:90%;max-width:750px;max-height:75vh;color:#fff;overflow-y:auto;animation:case-picker-open .3s forwards;position:relative;display:flex;flex-direction:column;box-sizing:border-box;font-family:Poppins,sans-serif}.case-picker-modal.is-closing{animation:case-picker-close .2s forwards}.case-picker-close{position:absolute;top:5px;right:10px;background:none;border:none;color:#fff;font-family:Arial,sans-serif;font-size:24px;line-height:28px;padding:0;cursor:pointer;opacity:.8;transition:opacity .2s;z-index:10}.case-picker-close:hover{opacity:1}.case-picker-header{display:flex;justify-content:flex-start;align-items:center;gap:6px;width:100%;margin-bottom:10px;margin-top:5px;flex-wrap:wrap;padding-right:36px;box-sizing:border-box}.case-picker-search-container{display:flex;flex:1;min-width:0;max-width:340px}.case-picker-input-wrap{position:relative;display:flex;flex-grow:1}.case-picker-input{padding:10px 18px 10px 40px;width:100%;height:40px;box-sizing:border-box;border:2px solid #323240;border-radius:5px;background:#1c1f2e;box-shadow:0 10px 7.8px rgba(0,0,0,.15);color:#fff;font-family:Poppins,sans-serif;font-size:.9rem;opacity:.9;outline:none}.case-picker-input::placeholder{color:#cbd5e1}.case-picker-input:focus{border-color:#45455a}.case-picker-search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:#cbd5e1;pointer-events:none}.case-picker-filters{display:flex;gap:6px;align-items:center;flex-shrink:0}.case-picker-sort{width:40px;height:40px;min-width:40px;padding:0;border:none;border-radius:6px;color:#e1e4f2;background:#20222f;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s ease;flex-shrink:0}.case-picker-sort:hover{background:#2a2e44}.case-picker-sort:active{background:#32364d}.case-picker-sort:focus-visible{outline:2px solid #8079ff;outline-offset:2px}.case-picker-items-wrap{background-color:#1c1f2e;border-radius:6px;padding:12px;flex:1;overflow-y:auto;overflow-x:hidden;position:relative;min-height:300px;max-height:calc(85vh - 120px);scrollbar-width:thin;scrollbar-color:#34384f transparent}.case-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}.case-picker-item{border-radius:6px;padding:8px;cursor:pointer;transition:transform .2s ease;display:flex;flex-direction:column;justify-content:space-between;height:170px;position:relative;border:none;box-sizing:border-box}.case-picker-item:before{content:"";position:absolute;inset:0;border-radius:6px;padding:2px;background:linear-gradient(to bottom,transparent 0%,var(--inventory-border-side) 55%,var(--inventory-border-bottom) 100%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:0}.case-picker-item:hover{transform:scale(1.03)}.case-picker-image-wrap{position:relative;width:100%;height:125px;overflow:hidden;border-radius:8px;flex-shrink:0}.case-picker-image{width:100%;height:100%;object-fit:contain;border-radius:8px;position:absolute;inset:0;z-index:1}.case-picker-blur{position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);width:80%;height:80%;z-index:0;opacity:.35;filter:blur(18px);object-fit:contain;pointer-events:none}.case-picker-details{text-align:center;margin-top:5px}.case-picker-name{display:block;font-family:Poppins,sans-serif;font-weight:600;font-size:12px;color:#ccd9fa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0}.case-picker-price{font-family:Poppins,sans-serif;font-size:13px;font-weight:600;color:#fff;display:flex;align-items:center;justify-content:center;margin:0}.case-picker-price>span{display:inline-flex;align-items:center}.case-picker-price img{width:15px;height:15px;margin-right:5px;flex-shrink:0}.case-picker-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#aaa;font-size:14px}.case-picker-empty strong{font-size:20px;color:#ddd;margin-bottom:8px}.case-picker-overlay.is-closing{animation:case-picker-fade-out .2s forwards}@keyframes case-picker-fade-in{from{opacity:0}to{opacity:1}}@keyframes case-picker-fade-out{from{opacity:1}to{opacity:0}}@keyframes case-picker-open{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}@keyframes case-picker-close{from{transform:scale(1);opacity:1}to{transform:scale(.85);opacity:0}}
        .case-picker-item{box-sizing:content-box}.case-picker-item.is-selected:after{position:absolute;content:"";width:10px;height:10px;background-color:var(--inventory-dot-color);border-radius:30%;top:10px;right:10px;z-index:2}
        @media(max-width:768px){.case-create-step{padding:20px 16px}.case-create-name-field{width:100%}.case-create-bars{flex-direction:column}}
        @media(max-width:640px){.case-picker-overlay{align-items:flex-end}.case-picker-modal{width:100%;max-height:90vh;border-radius:10px 10px 0 0}.case-picker-filters{width:100%}.case-picker-grid{grid-template-columns:repeat(2,1fr);gap:6px}.case-picker-item{height:180px;padding:6px;overflow:hidden;justify-content:flex-start}.case-picker-image-wrap{height:130px}.case-picker-details{width:100%;overflow:hidden;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}.case-picker-name{width:100%;max-width:100%}}
      `}</style>
      <div className="case-create-inner">
        <button type="button" className="case-create-back" onClick={onBack}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Back to Cases</button>
        <section className="case-create-step"><div className="case-create-head"><div className="case-create-head-left"><div className="case-create-badge"><span>1</span></div><span className="case-create-title">Case Image</span></div></div><div className="case-create-art-row">{CASE_IMAGE_OPTIONS.map((option) => { const selected = selectedArtworkId === option.id; return <button type="button" className={`case-create-art${selected ? " is-active" : ""}`} aria-label={`Select ${option.label}`} aria-pressed={selected} onClick={() => setSelectedArtworkId(option.id)} key={option.id}>{option.imageUrl ? <img src={option.imageUrl} alt="" loading="lazy" decoding="async" /> : null}</button>; })}</div></section>
        <section className="case-create-step case-create-step-row"><div className="case-create-head"><div className="case-create-head-left"><div className="case-create-badge"><span>2</span></div><span className="case-create-title">Name Your Case</span></div></div><div className="case-create-name-field"><input type="text" className="case-create-input" placeholder="Enter case name..." maxLength={23} value={caseName} onChange={(event) => setCaseName(event.target.value)} /><span className="case-create-count">{caseName.length}/23</span></div></section>
        <section className="case-create-step"><div className="case-create-head"><div className="case-create-head-left"><div className="case-create-badge"><span>3</span></div><span className="case-create-title">Select item odds</span></div><div className="case-create-head-right">{selectedItems.length ? <><span className={`case-create-odds-total${Math.abs(totalChance - 100) < .001 ? " is-complete" : ""}`}>{totalChance.toFixed(2)}% / 100%</span><button type="button" className="case-create-distribute" onClick={distributeChances}>Auto-distribute</button></> : null}<button type="button" className="case-create-primary case-create-add" onClick={() => setPickerOpen(true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 3a1 1 0 10-2 0v8H3a1 1 0 100 2h8v8a1 1 0 102 0v-8h8a1 1 0 100-2h-8V3z" /></svg>Add Items</button></div></div>{selectedItems.length ? <div className="case-create-items-list">{selectedItems.map((item) => <div className="case-create-item-row" key={item.id}><div className="case-create-item-card" style={getInventoryItemCardStyle({ value: item.price })}><div className="case-create-item-image-wrap">{item.image ? <><img src={item.image} alt={item.name} className="case-create-item-image" loading="eager" /><img src={item.image} alt="" className="case-create-item-blur" loading="eager" /></> : null}</div><div className="case-create-item-details"><p className="case-create-item-name" title={item.name}>{item.name}</p><div className="case-create-item-value"><img src={COIN_ICON} alt="" /><span>{formatPriceValue(item.price, { compactNumbers: false })}</span></div></div></div><div className="case-create-chance-wrap"><input type="number" min="0.1" max="100" step="0.01" placeholder="0.10" className="case-create-chance" value={item.chance} onChange={(event) => updateItemChance(item.id, event.target.value)} /><span className="case-create-chance-suffix">%</span></div><button type="button" className="case-create-remove" aria-label={`Remove ${item.name}`} onClick={() => removeSelectedItem(item.id)}><svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button></div>)}</div> : <div className="case-create-empty"><span>No items selected</span></div>}</section>
        <section className="case-create-step"><div className="case-create-head"><div className="case-create-head-left"><div className="case-create-badge"><span>4</span></div><span className="case-create-title">Finish case creation</span></div></div><div className="case-create-commission"><label className="case-create-label">Commission<span className="case-create-hint"> (0–3%)</span></label><div className="case-create-commission-row"><input type="range" min="0" max="3" step="0.5" className="case-create-slider" value={commission} onChange={(event) => setCommission(Number(event.target.value))} /><div className="case-create-commission-value">{commission.toFixed(1)}%</div></div></div><div className="case-create-bars"><div className="case-create-price-card"><span className="case-create-price-label">CASE PRICE</span><div className="case-create-total"><img src={COIN_ICON} alt="" />{formatPriceValue(casePrice, { compactNumbers: false })}</div></div><div className="case-create-earn-card"><span className="case-create-earn-label">YOU EARN <span className="case-create-per">/ UNBOX</span></span><div className="case-create-total"><img src={COIN_ICON} alt="" />{formatPriceValue(commissionPerOpen, { compactNumbers: false })}</div></div></div>{hasReachedCaseLimit ? <div role="alert" style={{ color: "#ff7b87", fontSize: 13, fontWeight: 600 }}>You can create up to 5 community cases.</div> : !meetsPlayedRequirement ? <div role="alert" style={{ color: "#ff7b87", fontSize: 13, fontWeight: 600 }}>You need at least 5,000,000 Coins played to create a case.</div> : selectedItems.length === 1 ? <div role="alert" style={{ color: "#ff7b87", fontSize: 13, fontWeight: 600 }}>Select at least 2 items.</div> : casePrice > MAX_COMMUNITY_CASE_PRICE ? <div role="alert" style={{ color: "#ff7b87", fontSize: 13, fontWeight: 600 }}>Maximum case price is 1,000,000 Coins.</div> : createError ? <div role="alert" style={{ color: "#ff7b87", fontSize: 13, fontWeight: 600 }}>{createError}</div> : null}<button type="button" className="case-create-primary case-create-submit" disabled={!canCreate || creating} onClick={createCase}>{creating ? "Creating..." : "Create Case"}</button></section>
      </div>
      {pickerOpen && createPortal(
        <div className={`case-picker-overlay${pickerClosing ? " is-closing" : ""}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
          <div className={`case-picker-modal${pickerClosing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Add items">
            <button type="button" className="case-picker-close" aria-label="Close item picker" onClick={closePicker}>&times;</button>
            <div className="case-picker-header">
              <div className="case-picker-search-container"><div className="case-picker-input-wrap"><input autoFocus type="text" className="case-picker-input" placeholder="Search for an item..." value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} /><svg className="case-picker-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.4" /><path d="m16.2 16.2 4.1 4.1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></div></div>
              <div className="case-picker-filters"><button type="button" className="case-picker-sort" title={`Price ${pickerDescending ? "Descending" : "Ascending"}`} aria-label={`Sort by price ${pickerDescending ? "descending" : "ascending"}`} onClick={() => setPickerDescending((value) => !value)}><SortIcon ascending={!pickerDescending} /></button></div>
            </div>
            <div
              className="case-picker-items-wrap"
              onScroll={(event) => {
                const element = event.currentTarget;
                const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 320;
                if (nearBottom && pickerVisibleCount < pickerItems.length) {
                  setPickerVisibleCount((current) => Math.min(current + 120, pickerItems.length));
                }
              }}
            >
              {pickerLoading ? (
                <div className="case-picker-empty"><strong>Loading items...</strong></div>
              ) : pickerError ? (
                <div className="case-picker-empty"><strong>Unable to load items</strong><span>{pickerError}</span></div>
              ) : pickerItems.length ? (
                <div className="case-picker-grid">{visiblePickerItems.map((item) => { const isSelected = selectedItems.some((selected) => selected.id === item.id); return <button type="button" className={`case-picker-item${isSelected ? " is-selected" : ""}`} style={getInventoryItemCardStyle({ value: item.price }, isSelected)} key={item.id} title={item.name} aria-pressed={isSelected} onClick={(event) => { event.preventDefault(); event.stopPropagation(); addPickerItem(item); }}>{item.image ? <span className="case-picker-image-wrap"><img src={item.image} alt={item.name} className="case-picker-image" loading="lazy" decoding="async" /></span> : <span className="case-picker-image-wrap" aria-hidden="true" />}<span className="case-picker-details"><span className="case-picker-name">{item.name}</span><span className="case-picker-price"><span><img src={COIN_ICON} alt="" /><span>{formatPriceValue(item.price, { compactNumbers: false })}</span></span></span></span></button>; })}</div>
              ) : (
                <div className="case-picker-empty"><strong>No items found</strong><span>Try another search.</span></div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
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
  const [yourCasesStatus, setYourCasesStatus] = useState("active");
  const [deletingCaseId, setDeletingCaseId] = useState("");
  const [ownedCaseRows, setOwnedCaseRows] = useState([]);
  const [creatorSummary, setCreatorSummary] = useState({ opens: 0, earned: 0, claimable: 0 });
  const [claimingCommission, setClaimingCommission] = useState(false);
  const [ownedCasesRefresh, setOwnedCasesRefresh] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadCases = async () => {
      setCasesLoading(true);
      setCasesError("");

      const { data, error } = await supabase
        .from("cases")
        .select("*")
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

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setOwnedCaseRows([]);
      setCreatorSummary({ opens: 0, earned: 0, claimable: 0 });
      return undefined;
    }

    apiRequest("/api/cases/community/me")
      .then((response) => {
        if (cancelled) return;
        setOwnedCaseRows((response?.cases || []).map(normalizeCase));
        setCreatorSummary({
          opens: Number(response?.summary?.opens || 0),
          earned: Number(response?.summary?.earned || 0),
          claimable: Number(response?.summary?.claimable || 0),
        });
      })
      .catch((error) => {
        if (!cancelled) console.warn("[Cases] failed to load creator commissions", error);
      });

    return () => {
      cancelled = true;
    };
  }, [ownedCasesRefresh, user]);

  const allCases = useMemo(() => {
    const merged = new Map(cases.map((item) => [item.id, item]));
    ownedCaseRows.forEach((item) => merged.set(item.id, item));
    return [...merged.values()];
  }, [cases, ownedCaseRows]);

  const visibleCases = useMemo(() => {
    const currentUserId = String(user?.profile_id || user?.id || "");
    const tabCases = allCases.filter((item) => {
      if (activeTab === "Official") return item.active && !item.community;
      if (activeTab === "Community") return item.active && item.community;
      return item.community
        && currentUserId
        && String(item.owner_user_id || "") === currentUserId
        && Boolean(item.active) === (yourCasesStatus === "active");
    });

    return tabCases.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => {
      const diff = priceToNumber(a.price) - priceToNumber(b.price);
      return descending ? -diff : diff;
    });
  }, [activeTab, allCases, descending, search, user?.id, user?.profile_id, yourCasesStatus]);

  const ownedCases = useMemo(() => {
    const currentUserId = String(user?.profile_id || user?.id || "");
    return allCases.filter((item) => item.community && currentUserId && String(item.owner_user_id || "") === currentUserId);
  }, [allCases, user?.id, user?.profile_id]);

  const yourCasesStats = creatorSummary;

  const claimCommissions = async () => {
    if (!user || claimingCommission || creatorSummary.claimable <= 0) return;
    setClaimingCommission(true);
    try {
      const response = await apiRequest("/api/cases/community/claim", { method: "POST", body: "{}" });
      const amount = Number(response?.claim?.amount || 0);
      if (amount > 0) {
        notifications.success(`${formatPriceValue(amount, { compactNumbers: false })} Coins claimed!`);
        window.dispatchEvent(new CustomEvent("wallet:updated"));
      }
      setOwnedCasesRefresh((value) => value + 1);
    } catch (error) {
      notifications.error(error?.message || "Unable to claim case commissions.");
    } finally {
      setClaimingCommission(false);
    }
  };

  const deleteCase = async (item) => {
    if (!user || deletingCaseId) return;
    const isActive = Boolean(item.active);
    const confirmation = isActive
      ? `Deactivate ${item.name}? It will move to your inactive cases.`
      : `Delete ${item.name}? This cannot be undone.`;
    if (!window.confirm(confirmation)) return;
    setDeletingCaseId(item.id);
    try {
      const response = await apiRequest(`/api/cases/community/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (response?.deactivated && response?.case) {
        const deactivatedCase = normalizeCase(response.case);
        const applyDeactivatedCase = (current) => current.map((entry) => entry.id === item.id ? deactivatedCase : entry);
        setCases(applyDeactivatedCase);
        setOwnedCaseRows(applyDeactivatedCase);
        notifications.success("Case deactivated.");
      } else {
        setCases((current) => current.filter((entry) => entry.id !== item.id));
        setOwnedCaseRows((current) => current.filter((entry) => entry.id !== item.id));
        notifications.success("Case deleted.");
      }
    } catch (error) {
      notifications.error(error?.message || `Unable to ${isActive ? "deactivate" : "delete"} this case.`);
    } finally {
      setDeletingCaseId("");
    }
  };

  const activeCase = useMemo(
    () => {
      const requestedSlug = String(caseSlug || "").toLowerCase();
      return allCases.find((item) => item.active && item.slug === requestedSlug)
        || allCases.find((item) => item.slug === requestedSlug)
        || null;
    },
    [caseSlug, allCases],
  );

  if (activeCase) {
    return <CaseOpeningView item={activeCase} onBack={() => navigate("/cases")} />;
  }

  if (String(caseSlug || "").toLowerCase() === "create") {
    return <CaseCreateView ownedCaseCount={ownedCases.length} onBack={() => navigate("/cases")} onCreated={(createdCase) => {
      if (createdCase) setOwnedCaseRows((current) => [normalizeCase(createdCase), ...current]);
      setActiveTab("Your Cases");
      setOwnedCasesRefresh((value) => value + 1);
      navigate("/cases");
    }} />;
  }

  if (caseSlug) {
    return (
      <div className="flex min-h-full w-full items-center justify-center px-4 text-[#e1e4f2] [font-family:Poppins,sans-serif]">
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

        .your-cases-stats{display:flex;align-items:center;background:#131520;border-radius:10px;padding:14px 20px;margin-bottom:16px;flex-wrap:wrap;gap:4px}
        .your-cases-stat{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:80px}
        .your-cases-stat-label{font-size:10px;font-weight:700;color:#4a5278;text-transform:uppercase;letter-spacing:.6px}
        .your-cases-stat-value{font-size:16px;font-weight:700;color:#e1e4f2;display:flex;align-items:center;gap:5px}
        .your-cases-stat-value img{width:13px;height:13px;object-fit:contain}.your-cases-stat-value.is-claimable{color:#22c55e}.your-cases-divider{width:1px;height:32px;background:#1e2235;flex-shrink:0;margin:0 8px}
        .cases-category-tabs{display:flex;width:fit-content;flex-shrink:0;gap:4px;padding:4px;border-radius:8px;background:#131520}
        .cases-category-tab{height:34px;padding:0 16px;border:0;border-radius:6px;background:transparent;color:#6c7399;font-family:Poppins,sans-serif;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;transition:background .15s ease,color .15s ease,transform .1s ease}.cases-category-tab:hover{color:#c7cce2;background:#1c1f2e}.cases-category-tab:active{transform:scale(.97)}.cases-category-tab.is-active{background:#2a2e44;color:#e1e4f2}.cases-category-tab:focus-visible{outline:2px solid #8079ff;outline-offset:2px}
        .cases-search-wrap{position:relative;display:flex;min-width:0}.cases-search-input{width:300px;height:40px;box-sizing:border-box;padding:10px 18px 10px 40px;border:2px solid #323240;border-radius:5px;background:#1c1f2e;box-shadow:0 10px 7.8px rgba(0,0,0,.15);color:#fff;font-family:Poppins,sans-serif;font-size:.9rem;opacity:.9;outline:none}.cases-search-input::placeholder{color:#cbd5e1}.cases-search-input:focus{border-color:#45455a}.cases-sort-button{width:40px;height:40px;min-width:40px;padding:0;border:0;border-radius:6px;background:#20222f;color:#e1e4f2;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s ease;flex-shrink:0}.cases-sort-button:hover{background:#2a2e44}.cases-sort-button:active{background:#32364d}.cases-sort-button:focus-visible{outline:2px solid #8079ff;outline-offset:2px}
        .your-cases-create{position:relative;isolation:isolate;overflow:hidden;height:42px;min-width:120px;padding:0 16px;box-sizing:border-box;border:1px solid rgba(94,85,217,.4);border-radius:8px;background:linear-gradient(135deg,#5b52e2,#4038c0);box-shadow:0 2px 8px rgba(108,99,255,.2);color:#fff;font-family:Poppins,sans-serif;font-size:.9rem;font-weight:600;letter-spacing:.01em;display:flex;align-items:center;justify-content:center;cursor:pointer;transform-origin:center;transition:opacity .2s ease,transform .1s ease,background .25s ease;white-space:nowrap;flex-shrink:0}
        .your-cases-create:hover:not(:disabled){background:linear-gradient(135deg,#6c63ff,#5147d9);opacity:.95}.your-cases-create:active:not(:disabled){transform:scale(.97)}.your-cases-create:disabled{opacity:.45;cursor:not-allowed}.your-cases-create:focus-visible{outline:2px solid #8079ff;outline-offset:2px}
        .your-cases-status{display:flex;width:fit-content;gap:4px;background:#131520;border-radius:8px;padding:4px;margin:12px 0 8px}
        .your-cases-status button{height:34px;padding:0 16px;border-radius:6px;border:none;background:transparent;color:#6c7399;font-family:Poppins,sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s ease,color .15s ease,transform .1s ease;white-space:nowrap}.your-cases-status button:hover{color:#c7cce2;background:#1c1f2e}.your-cases-status button:active{transform:scale(.97)}.your-cases-status button.is-active{background:#2a2e44;color:#e1e4f2}.your-cases-status button:focus-visible{outline:2px solid #8079ff;outline-offset:2px}
        .your-case-card-outer{min-width:170px;cursor:pointer;user-select:none;border-radius:6px}.your-case-card-outer:focus-visible{outline:2px solid #6c63ff;outline-offset:2px}
        .your-case-card{border-radius:6px;padding:14px;display:flex;flex-direction:column;align-items:center;position:relative;overflow:hidden;background:#171925;box-shadow:none}.your-case-card:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 120% at 95% 95%,rgba(108,99,255,.16) 0%,rgba(108,99,255,.08) 22%,transparent 58%);opacity:.9}
        .your-case-glow{position:absolute;inset:-30px;width:calc(100% + 60px);height:calc(100% + 60px);object-fit:cover;z-index:0;pointer-events:none;opacity:.14;filter:blur(48px) saturate(110%);transform:scale(1.22);transition:opacity .18s ease,filter .22s ease,transform .22s ease}.your-case-card-outer:hover .your-case-glow{opacity:.2;filter:blur(54px) saturate(125%);transform:scale(1.28)}
        .your-case-delete-wrap{position:absolute;top:6px;right:6px;z-index:6;display:flex;align-items:center;justify-content:center}.your-case-delete{width:24px;height:24px;border-radius:6px;border:none;background:rgba(239,68,68,.12);color:#ef4444;font-size:20px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;transition:background .15s ease,transform .12s ease}.your-case-delete:hover:not(:disabled){background:rgba(239,68,68,.28);transform:scale(1.08)}.your-case-delete:active:not(:disabled){transform:scale(.95)}.your-case-delete:disabled{opacity:.5;cursor:not-allowed}
        .your-case-delete-spinner{width:12px;height:12px;border:2px solid rgba(239,68,68,.3);border-top-color:#ef4444;border-radius:50%;animation:your-case-spin .5s linear infinite}@keyframes your-case-spin{to{transform:rotate(360deg)}}
        .your-case-title-wrap{width:100%;display:flex;justify-content:center;align-items:center;position:relative;z-index:2}.your-case-title{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:14px;font-weight:500;color:rgba(255,255,255,.9)}
        .your-case-image-wrap{position:relative;z-index:2;display:flex;height:120px;width:120px;align-items:center;justify-content:center;margin:12px 0}.your-case-image-wrap img{width:120px;height:120px;object-fit:contain;filter:drop-shadow(0 10px 16px rgba(0,0,0,.45))}.your-case-image-wrap .your-case-image-catalog{transform:scale(1.3)}.your-case-image-wrap .your-case-image-inferno{transform:translateY(4px) scale(1.105)}.your-case-image-wrap .your-case-image-beach{transform:translateY(-4px) scale(.95)}
        .your-case-opens{font-size:11px;font-weight:600;color:#6c7399;text-align:center;margin:0 0 4px;white-space:nowrap;width:85%;background:#1c1f2e;border-radius:6px;padding:4px 8px;position:relative;z-index:2;box-sizing:border-box}
        .your-case-price{position:relative;z-index:2;height:40px;width:85%;border-radius:6px;background:#1c1f2e;border:none;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;user-select:none;box-sizing:border-box;transition:background-color .14s ease}.your-case-price:hover{background:#1f2335}.your-case-price>span{display:inline-flex;align-items:center;justify-content:center;gap:8px;color:rgba(225,228,242,.95);font-weight:600;font-size:14px}.your-case-price img{width:16px;height:16px}
        @media(max-width:840px){.your-cases-stats{flex-direction:column;align-items:stretch;gap:8px}.your-cases-divider{width:100%;height:1px;margin:0}.your-cases-stat{flex-direction:row;justify-content:space-between}.your-cases-create{width:100%;max-width:320px;align-self:center}.cases-category-tabs{max-width:100%;overflow-x:auto}.cases-search-wrap{flex:1}.cases-search-input{width:100%}}

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
        <div className="flex min-h-full w-full max-w-[1320px] flex-col items-center px-2 pb-4 pt-3 sm:px-4 sm:pt-4 xl:px-12 xl:pb-8 xl:pt-8">
          <div className="flex h-full w-full flex-col gap-4">
            <div className="h-full w-full">
              <div className="mx-auto box-border w-full px-[14px] pb-[22px] min-[1100px]:max-w-[1320px] min-[1100px]:px-[18px] min-[1100px]:pb-7 max-[840px]:px-3">
                <div className="mb-3 mt-2 box-border flex w-full flex-nowrap items-center justify-between gap-3 px-0.5 max-[840px]:flex-col max-[840px]:items-center">
                  <div className="cases-category-tabs" role="tablist" aria-label="Case categories">
                    {TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`cases-category-tab${activeTab === tab ? " is-active" : ""}`}
                        role="tab"
                        aria-selected={activeTab === tab}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {activeTab !== "Your Cases" && <div className="ml-auto flex shrink-0 items-center gap-2 max-[840px]:ml-0 max-[840px]:w-full max-[840px]:flex-nowrap max-[840px]:justify-center">
                    <div className="cases-search-wrap max-[840px]:flex-1">
                      <SearchIcon />
                      <input
                        type="text"
                        placeholder="Search for a case..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="cases-search-input"
                      />
                    </div>

              <button
                type="button"
                title={descending ? "Highest to Lowest" : "Lowest to Highest"}
                aria-label={descending ? "Sort lowest to highest" : "Sort highest to lowest"}
                onClick={() => setDescending((value) => !value)}
                className="cases-sort-button"
              >
                <SortIcon ascending={!descending} />
              </button>
                  </div>}

                </div>

                {activeTab === "Your Cases" && user ? (
                  <>
                    <div className="your-cases-stats">
                      <div className="your-cases-stat"><span className="your-cases-stat-label">Total Opens</span><span className="your-cases-stat-value">{formatPriceValue(yourCasesStats.opens, { compactNumbers: false })}</span></div>
                      <span className="your-cases-divider" aria-hidden="true" />
                      <div className="your-cases-stat"><span className="your-cases-stat-label">Total Earned</span><span className="your-cases-stat-value"><img src={COIN_ICON} alt="" />{formatPriceValue(yourCasesStats.earned, { compactNumbers: false })}</span></div>
                      <span className="your-cases-divider" aria-hidden="true" />
                      <div className="your-cases-stat"><span className="your-cases-stat-label">Claimable</span><span className="your-cases-stat-value is-claimable"><img src={COIN_ICON} alt="" />{formatPriceValue(yourCasesStats.claimable, { compactNumbers: false })}</span></div>
                      <span className="your-cases-divider" aria-hidden="true" />
                      {yourCasesStats.claimable > 0 ? <button type="button" className="your-cases-create" disabled={claimingCommission} onClick={claimCommissions}>{claimingCommission ? "Claiming..." : "Claim"}</button> : null}
                      <button type="button" className="your-cases-create" disabled={ownedCases.length >= MAX_COMMUNITY_CASES_PER_USER} title={ownedCases.length >= MAX_COMMUNITY_CASES_PER_USER ? "Maximum 5 community cases" : "Create a community case"} onClick={() => navigate("/cases/create")}>Create Case</button>
                    </div>
                    <div className="your-cases-status" role="tablist" aria-label="Your cases status">
                      <button type="button" className={yourCasesStatus === "active" ? "is-active" : ""} onClick={() => setYourCasesStatus("active")}>Active ({ownedCases.filter((item) => item.active).length})</button>
                      <button type="button" className={yourCasesStatus === "inactive" ? "is-active" : ""} onClick={() => setYourCasesStatus("inactive")}>Inactive ({ownedCases.filter((item) => !item.active).length})</button>
                    </div>
                  </>
                ) : null}

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
                    {visibleCases.map((item) => activeTab === "Your Cases" ? (
                      <MyCaseCard
                        key={item.id}
                        item={item}
                        onPreview={setPreviewCase}
                        onOpen={(selectedCase) => navigate(`/cases/${selectedCase.slug}`)}
                        onDelete={deleteCase}
                        deleting={deletingCaseId === item.id}
                      />
                    ) : (
                      <CaseCard key={item.id} item={item} onPreview={setPreviewCase} onOpen={(selectedCase) => navigate(`/cases/${selectedCase.slug}`)} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {previewCase ? <CasePreviewModal item={previewCase} onClose={() => setPreviewCase(null)} /> : null}
    </div>
  );
}
