import { useMemo, useState } from "react";

const COIN_ICON = "/bobux.png";
const TABS = ["Official", "Community", "Your Cases"];

const CASES = [
    {
      name: "Prism",
      price: "521,778",
      image: "https://i.ibb.co/cKkWGyJq/aaa.png",
    },
    {
      name: "Nature",
      price: "503,112",
      image: "https://i.ibb.co/sJJ662Z9/nature.png",
    },
    {
      name: "Spooked",
      price: "488,667",
      image: "https://i.ibb.co/GQKDXNyb/case3.png",
    },
    {
      name: "Basket",
      price: "481,917",
      image: "https://i.ibb.co/1ftkTM40/case-iamge.png",
    },
    {
      name: "Hunted",
      price: "473,834",
      image: "https://i.ibb.co/BH0kbSch/case.png",
    },
    {
      name: "Crimson Rain",
      price: "470,834",
      image: "https://i.ibb.co/QjCygLWd/case2.png",
    },
    {
      name: "Easy",
      price: "467,778",
      image: "https://i.ibb.co/TqBsjBZG/case6.png",
    },
    {
      name: "Dementorr",
      price: "466,667",
      image: "https://i.ibb.co/Pzjk4sNK/dementor.png",
    },
    {
      name: "Catboy",
      price: "445,112",
      image: "https://i.ibb.co/yBXdj9Ny/case8.png",
    },
    {
      name: "Risky Pull",
      price: "408,612",
      image: "https://i.ibb.co/BKN66dHG/risky.png",
    },
    {
      name: "Nightmare",
      price: "407,778",
      image: "https://i.ibb.co/PsWvjP5v/case2.png",
    },
    {
      name: "Cycle",
      price: "398,889",
      image: "https://i.ibb.co/3YNRBmkc/case2.png",
    },
    {
      name: "Meow",
      price: "361,156",
      image: "https://i.ibb.co/jkZQ6rR6/Kitty.png",
    },
    {
      name: "Tophat Wish",
      price: "349,445",
      image: "https://i.ibb.co/PzjKnZPw/case-image.png",
    },
    {
      name: "Blessed",
      price: "348,750",
      image: "https://i.ibb.co/BYVmjKc/case-image.png",
    },
    {
      name: "Wormy",
      price: "344,445",
      image: "https://i.ibb.co/V0N80c4J/wormy.png",
    },
    {
      name: "Fofo",
      price: "325,556",
      image: "https://i.ibb.co/sJbv8zYk/fofo.png",
    },
    {
      name: "Luxury",
      price: "309,445",
      image: "https://i.ibb.co/whW3wVFy/case.png",
    },
    {
      name: "Sakura",
      price: "304,445",
      image: "https://i.ibb.co/jZ8kMb9y/case.png",
    },
    {
      name: "Water",
      price: "281,389",
      image: "https://i.ibb.co/bpLS11M/case.png",
    },
    {
      name: "Zeus",
      price: "275,084",
      image: "https://i.ibb.co/KpLvLGSX/Robotic.png",
    },
    {
      name: "Time",
      price: "263,167",
      image: "https://i.ibb.co/bRJcNHbH/case2.png",
    },
    {
      name: "Citadel",
      price: "251,723",
      image: "https://i.ibb.co/67kZb33v/citadel.png",
    },
    {
      name: "Gemstone",
      price: "245,000",
      image: "https://i.ibb.co/93tpn6Hz/case.png",
    },
    {
      name: "Pyramids",
      price: "244,706",
      image: "https://i.ibb.co/7tM01c6t/case7.png",
    },
    {
      name: "Aurantium",
      price: "240,345",
      image: "https://i.ibb.co/gFR178Tr/case-image.png",
    },
    {
      name: "In Rainbows",
      price: "236,075",
      image: "https://i.ibb.co/Wv9Y76W6/case-image.png",
    },
    {
      name: "Ego",
      price: "233,612",
      image: "https://i.ibb.co/Z6vFrdgG/case.png",
    },
    {
      name: "Bluey",
      price: "224,723",
      image: "https://i.ibb.co/b5gwdMks/blue.png",
    },
    {
      name: "Sea",
      price: "222,945",
      image: "https://i.ibb.co/mCjRhfTb/case.png",
    },
    {
      name: "Purple Rain",
      price: "219,806",
      image: "https://i.ibb.co/fVHhpjRY/purple.png",
    },
    {
      name: "Circus Mystery",
      price: "217,167",
      image: "https://i.ibb.co/QFfpGbxg/case-image.png",
    },
    {
      name: "Factory",
      price: "212,445",
      image: "https://i.ibb.co/zV1DkxYw/case3.png",
    },
    {
      name: "Banker",
      price: "207,676",
      image: "https://i.ibb.co/BKvRKwbM/content-2.png",
    },
    {
      name: "Abyssal",
      price: "205,750",
      image: "https://i.ibb.co/KJhnKVw/case3.png",
    },
    {
      name: "Green Giant",
      price: "174,056",
      image: "https://i.ibb.co/6cRJ48RB/case.png",
    },
    {
      name: "KFC Dealer",
      price: "171,725",
      image: "https://i.ibb.co/60XB5n2S/vsvs.png",
    },
    {
      name: "Heavenly One",
      price: "166,389",
      image: "https://i.ibb.co/kgZ9QDV9/case1.png",
    },
    {
      name: "Rika",
      price: "166,112",
      image: "https://i.ibb.co/Dh33WpH/case10.png",
    },
    {
      name: "Leviathan",
      price: "164,794",
      image: "https://i.ibb.co/V0qCb71T/content.png",
    },
    {
      name: "Glisten",
      price: "147,167",
      image: "https://i.ibb.co/YT8jG65m/content.png",
    },
    {
      name: "Dreams",
      price: "142,445",
      image: "https://i.ibb.co/93dxmnKR/case2.png",
    },
    {
      name: "Fuchsia",
      price: "127,667",
      image: "https://i.ibb.co/7dC9fTYQ/case4.png",
    },
    {
      name: "Pretty",
      price: "106,291",
      image: "https://i.ibb.co/hFVCxLk8/pretty.png",
    },
    {
      name: "Valentine's",
      price: "104,167",
      image: "https://i.ibb.co/kV0t4srM/content.png",
    },
    {
      name: "Shard",
      price: "102,228",
      image: "https://i.ibb.co/1fPf6Kt7/g-rsel-2026-03-16-204723081.png",
    },
    {
      name: "Void of Infinity",
      price: "91,889",
      image: "https://i.ibb.co/spbGws5T/voidofinfinity.png",
    },
    {
      name: "Jelly Flip",
      price: "89,723",
      image: "https://i.ibb.co/3y7NQ702/jelly.png",
    },
    {
      name: "The Missing One",
      price: "86,334",
      image: "https://i.ibb.co/MDfVpbT9/themissingone.png",
    },
    {
      name: "Galactic",
      price: "77,917",
      image: "https://i.ibb.co/35nbhWSm/case1.png",
    },
    {
      name: "Prophecy",
      price: "72,667",
      image: "https://i.ibb.co/DHq39bPf/case2.png",
    },
    {
      name: "God",
      price: "70,867",
      image: "https://i.ibb.co/4ZXY70nc/case-image.png",
    },
    {
      name: "Mecha",
      price: "62,500",
      image: "https://i.ibb.co/KzNghpBJ/mecha.png",
    },
    {
      name: "Cursed Pharaoh",
      price: "61,783",
      image: "https://i.ibb.co/4ZZ16z6v/cursedpharaoh.png",
    },
    {
      name: "Kitties",
      price: "61,286",
      image: "https://i.ibb.co/LXFDb3rj/case.png",
    },
    {
      name: "Lucky Star",
      price: "58,334",
      image: "https://i.ibb.co/6fm6yqw/case.png",
    },
    {
      name: "Monster Energy",
      price: "56,570",
      image: "https://i.ibb.co/dwsjb133/case2.png",
    },
    {
      name: "Star of The Night",
      price: "56,412",
      image: "https://i.ibb.co/ZzwmgbQd/star.png",
    },
    {
      name: "Turkey",
      price: "53,889",
      image: "https://i.ibb.co/PsdQCVD8/case0.png",
    },
    {
      name: "Kraken Seas",
      price: "52,000",
      image: "https://i.ibb.co/TMMKSNzj/kraken.png",
    },
    {
      name: "Lucky Break",
      price: "51,139",
      image: "https://i.ibb.co/m53ZYsGT/luckybreak.png",
    },
    {
      name: "Demonic Angel",
      price: "49,851",
      image: "https://i.ibb.co/848QSD4z/demonicangels.png",
    },
    {
      name: "Eclipse of Heart",
      price: "49,778",
      image: "https://i.ibb.co/N2DNHwDq/aero.png",
    },
    {
      name: "Glitcher",
      price: "49,748",
      image: "https://i.ibb.co/yx0X9zp/case-image.png",
    },
    {
      name: "Shiny Hunter",
      price: "45,781",
      image: "https://i.ibb.co/QFhdQ7f0/shiny.png",
    },
    {
      name: "Panda",
      price: "44,073",
      image: "https://i.ibb.co/HDbVr7xm/pandas.png",
    },
    {
      name: "Fishy Case",
      price: "42,500",
      image: "https://i.ibb.co/dJBZqxGL/Fishy.png",
    },
    {
      name: "Furry",
      price: "41,112",
      image: "https://i.ibb.co/rfmMmjts/case5.png",
    },
    {
      name: "Cucumber",
      price: "40,903",
      image: "https://i.ibb.co/ZpkWjCzP/case1.png",
    },
    {
      name: "Depression",
      price: "39,034",
      image: "https://i.ibb.co/sJkzt3J9/depression.png",
    },
    {
      name: "Lumi Fanta",
      price: "37,389",
      image: "https://i.ibb.co/zHNV9sLJ/Lumi-Fanta.png",
    },
    {
      name: "67 Case",
      price: "37,334",
      image: "https://i.ibb.co/chS1h2nx/67.png",
    },
    {
      name: "Frosty",
      price: "34,584",
      image: "https://i.ibb.co/QvYJ2RV3/frosty.png",
    },
    {
      name: "Giant",
      price: "32,778",
      image: "https://i.ibb.co/nNBRjzLp/giant.png",
    },
    {
      name: "Bunny",
      price: "31,806",
      image: "https://i.ibb.co/JR0TF46F/case5.png",
    },
    {
      name: "Patrick's Fantasy",
      price: "30,278",
      image: "https://i.ibb.co/hF4PHW0h/case1.png",
    },
    {
      name: "Heartcore",
      price: "30,139",
      image: "https://i.ibb.co/DgMYmHPB/content.png",
    },
    {
      name: "Galaxy",
      price: "26,800",
      image: "https://i.ibb.co/d42VJSdB/Galaxy.png",
    },
    {
      name: "Infinity Blossom",
      price: "25,824",
      image: "https://i.ibb.co/8gpz2xWR/content.png",
    },
    {
      name: "Crimson Claw",
      price: "25,056",
      image: "https://i.ibb.co/PvsRRqP8/crimsonclaw.png",
    },
    {
      name: "Sylently's Case",
      price: "24,445",
      image: "https://i.ibb.co/ynNJvwJj/sylentlyscase.png",
    },
    {
      name: "Computer Crash",
      price: "23,606",
      image: "https://i.ibb.co/9z7zh9J/computercrash.png",
    },
    {
      name: "Hell Case",
      price: "22,890",
      image: "https://i.ibb.co/Kk0GbZw/Hell-Case.png",
    },
    {
      name: "Area 51",
      price: "22,790",
      image: "https://i.ibb.co/9HFVD72B/area51.png",
    },
    {
      name: "Ghostly Fortune",
      price: "22,639",
      image: "https://i.ibb.co/9HQLhMmp/ghostly.png",
    },
    {
      name: "Surreal Seeker",
      price: "21,725",
      image: "https://i.ibb.co/PykTPpw/surrealseeker.png",
    },
    {
      name: "Black n White",
      price: "21,054",
      image: "https://i.ibb.co/HLzSXmCY/blaccc.png",
    },
    {
      name: "Doggy Vault",
      price: "19,528",
      image: "https://i.ibb.co/SwXyDLcr/doggyvault.png",
    },
    {
      name: "Snowdrop",
      price: "19,073",
      image: "https://i.ibb.co/zChzF4H/snowdrop.png",
    },
    {
      name: "Immortal",
      price: "17,580",
      image: "https://i.ibb.co/WNZw2Gdz/immortal.png",
    },
    {
      name: "Sticky Flames",
      price: "17,234",
      image: "https://i.ibb.co/PsNLLn4W/slime.png",
    },
    {
      name: "Festival",
      price: "15,228",
      image: "https://i.ibb.co/r12t1Ry/festival.png",
    },
    {
      name: "Juicy Fruits",
      price: "14,750",
      image: "https://i.ibb.co/GQy0Hb87/juicyfruits.png",
    },
    {
      name: "King Prince",
      price: "13,956",
      image: "https://i.ibb.co/gLWs5rQd/kingprince.png",
    },
    {
      name: "Super Silly",
      price: "13,778",
      image: "https://i.ibb.co/2YcjMZ9R/supersilly.png",
    },
    {
      name: "Solar Flip",
      price: "12,889",
      image: "https://i.ibb.co/prjskqtQ/case4.png",
    },
    {
      name: "E-Girl",
      price: "12,278",
      image: "https://i.ibb.co/cKbXBkGB/gem.png",
    },
    {
      name: "Ghostly",
      price: "11,667",
      image: "https://i.ibb.co/3mrXC1Rv/ghostly.png",
    },
    {
      name: "Dark Shadows",
      price: "11,187",
      image: "https://i.ibb.co/k6zRgtSB/dark-shadows.png",
    },
    {
      name: "Gold Party",
      price: "10,360",
      image: "https://i.ibb.co/9HNRcvQc/goldparty.png",
    },
    {
      name: "Gothic Case",
      price: "9,939",
      image: "https://i.ibb.co/cSHGH8Sr/gothic.png",
    },
    {
      name: "Snowstorm Spin",
      price: "8,889",
      image: "https://i.ibb.co/vxNzkWJF/snowstormspin.png",
    },
    {
      name: "Scarlet Case",
      price: "8,191",
      image: "https://i.ibb.co/dJcMzgRc/scarlet.png",
    },
    {
      name: "Queen’s Hive",
      price: "7,689",
      image: "https://i.ibb.co/PGcCd8Db/queenshive.png",
    },
    {
      name: "%5 Clown",
      price: "6,612",
      image: "https://i.ibb.co/FLfdHQnf/5clown.png",
    },
    {
      name: "Dreamer",
      price: "6,312",
      image: "https://i.ibb.co/DfwBT2Np/dreamer.png",
    },
    {
      name: "Leafy Season",
      price: "5,473",
      image: "https://i.ibb.co/7t26PW22/leafyseason.png",
    },
    {
      name: "Dray's Father",
      price: "5,373",
      image: "https://i.ibb.co/60FJ3Tx0/drayfather.png",
    },
    {
      name: "Rockstar",
      price: "2,612",
      image: "https://i.ibb.co/qMt0HRYt/rockstar.png",
    },
    {
      name: "Meme Madness",
      price: "1,889",
      image: "https://i.ibb.co/B5L0dC6M/memelords.png",
    },
    {
      name: "Overlords",
      price: "1,881",
      image: "https://i.ibb.co/xqxBFXXp/case3.png",
    },
    {
      name: "Pinky",
      price: "1,556",
      image: "https://i.ibb.co/211CN9gX/content.png",
    },
    {
      name: "%1 Robot",
      price: "1,552",
      image: "https://i.ibb.co/JWRHVQT6/1-robot.png",
    },
    {
      name: "Yes Or Yes",
      price: "1,540",
      image: "https://i.ibb.co/gZYr3Lgx/yesoryes.png",
    },
    {
      name: "%70 Christmas",
      price: "1,151",
      image: "https://i.ibb.co/6czCRcZ0/christmas.png",
    },
    {
      name: "Soul Spin",
      price: "553",
      image: "https://i.ibb.co/hxb9qTWF/Soul-Spin.png",
    },
    {
      name: "GPT",
      price: "413",
      image: "https://i.ibb.co/KcbW8nX8/case-robot.png",
    },
    {
      name: "Love",
      price: "326",
      image: "https://i.ibb.co/8gRzQwSz/love.png",
    },
    {
      name: "Golden",
      price: "220",
      image: "https://i.ibb.co/jkzyzKxd/gold.png",
    },
    {
      name: "Frozen Giftbox",
      price: "119",
      image: "https://i.ibb.co/PGr2W1dm/frozen.png",
    },
    {
      name: "Mike Wazowski",
      price: "99",
      image: "https://i.ibb.co/MLSSqsD/mikewazovski.png",
    },
    {
      name: "Hop & Win",
      price: "57",
      image: "https://i.ibb.co/B51fkL8L/content.png",
    },
    {
      name: "Farmer",
      price: "33",
      image: "https://i.ibb.co/chrtW3C8/farmer.png",
    },
    {
      name: "Pumpkins",
      price: "11",
      image: "https://i.ibb.co/ZpGk1mJ8/content.webp",
    },
  ];

function priceToNumber(price) {
  return Number(price.replaceAll(",", ""));
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pointer-events-none absolute left-[14px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 opacity-85"
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

function SortIcon({ descending }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      className={descending ? "" : "rotate-180"}
      aria-hidden="true"
    >
      <path
        d="M13 12.208V7h-2v5.137l-1.086-1.086L8.5 12.466 12.036 16l3.535-3.535-1.414-1.415L13 12.208zM8 6H0v2h8V6zm6-3H0v2h14V3zm2-3H0v2h16V0zM6 9H0v2h6V9zm-2 3H0v2h4v-2z"
        fillRule="evenodd"
      />
    </svg>
  );
}

function ViewIcon() {
  return (
    <div
      className="pointer-events-none absolute left-2 top-2 z-[3] flex h-8 w-8 translate-y-[-6px] scale-[.98] items-center justify-center rounded-[8px] opacity-0 transition duration-150 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100"
      aria-hidden="true"
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
    </div>
  );
}

function CaseCard({ item }) {
  return (
    <div className="group min-w-[170px] cursor-pointer select-none" role="button" tabIndex={0}>
      <div className="relative flex flex-col items-center overflow-hidden rounded-[6px] bg-[#171925] p-[14px]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(120% 120% at 95% 95%, rgba(108,99,255,.16) 0%, rgba(108,99,255,.08) 22%, transparent 58%)",
          }}
        />

        <ViewIcon />

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
              className="h-[120px] w-[120px] object-cover drop-shadow-[0_10px_16px_rgba(0,0,0,.45)]"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </div>
        </div>

        <button
          type="button"
          title="Open case page"
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
            <span className="leading-none">{item.price}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

export default function CasesPage() {
  const [activeTab, setActiveTab] = useState("Official");
  const [search, setSearch] = useState("");
  const [descending, setDescending] = useState(true);

  const visibleCases = useMemo(() => {
    if (activeTab !== "Official") return [];

    return CASES.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => {
      const diff = priceToNumber(a.price) - priceToNumber(b.price);
      return descending ? -diff : diff;
    });
  }, [activeTab, search, descending]);

  return (
    <div className="relative left-1/2 min-h-screen w-screen -translate-x-1/2 overflow-x-hidden bg-[#1d202f] text-[#e1e4f2] [font-family:Poppins,sans-serif]">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap");
      `}</style>

      <div className="relative z-10 flex h-full w-full flex-col items-center">
        <div className="flex min-h-screen w-full max-w-[1320px] flex-col items-center px-4 pb-4 pt-4 xl:px-12 xl:pb-8 xl:pt-8">
          <div className="flex h-full w-full flex-col gap-4">
            <div className="h-full w-full">
              <div className="mx-auto box-border w-full px-[14px] pb-[22px] min-[1100px]:max-w-[1320px] min-[1100px]:px-[18px] min-[1100px]:pb-7 max-[840px]:px-3">
                <div className="mb-3 mt-2 box-border flex w-full flex-nowrap items-center justify-between gap-3 px-0.5 max-[840px]:flex-col max-[840px]:items-center">
                  <div className="flex shrink-0 gap-1 rounded-[8px] bg-[#131520] p-1">
                    {TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`whitespace-nowrap rounded-[6px] border-0 px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                          activeTab === tab
                            ? "bg-[#20222f] text-[#e1e4f2]"
                            : "bg-transparent text-[#6c7399] hover:text-[#c7cce2]"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2.5 max-[840px]:w-full max-[840px]:flex-wrap max-[840px]:justify-center">
                    <div className="relative flex grow max-[840px]:w-full max-[840px]:justify-center">
                      <SearchIcon />
                      <input
                        type="text"
                        placeholder="Search for a case..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="box-border h-10 w-[300px] rounded-[6px] border-2 border-white/[.08] bg-[#1c1f2e] px-[18px] text-center text-[.95rem] text-white/90 opacity-100 shadow-none outline-none transition-colors placeholder:text-center placeholder:text-[#e1e4f28c] focus:border-[#6c63ff73] focus:bg-[#202235] max-[840px]:w-[calc(100%-30px)]"
                      />
                    </div>

                    <button
                      type="button"
                      title={descending ? "Price Descending" : "Price Ascending"}
                      onClick={() => setDescending((value) => !value)}
                      className="inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[6px] border-0 bg-[#20222f] px-[14px] text-[13px] font-bold text-[#e1e4f2] transition-colors hover:bg-[#2a2e44]"
                    >
                      <SortIcon descending={descending} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2.5 max-[840px]:w-full max-[840px]:justify-center" />
                </div>

                {activeTab === "Official" ? (
                  <div
                    className="grid w-full gap-3 px-0.5"
                    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}
                  >
                    {visibleCases.map((item) => (
                      <CaseCard key={`${item.name}-${item.price}`} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="flex w-full justify-center px-0.5 py-8">
                    {/* The uploaded inspected HTML only included the Official grid content. Community and Your Cases panel content was not present, so no cards are invented here. */}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}