function UtilityIcon({ viewBox, path }) {
  return (
    <svg viewBox={viewBox} width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  )
}

const utilityItems = [
  {
    id: 'fairness',
    label: 'Provably Fair',
    viewBox: '0 0 640 512',
    path: 'M256 336h-.02c0-16.18 1.34-8.73-85.05-181.51-17.65-35.29-68.19-35.36-85.87 0C-2.06 328.75.02 320.33.02 336H0c0 44.18 57.31 80 128 80s128-35.82 128-80zM128 176l72 144H56l72-144zm511.98 160c0-16.18 1.34-8.73-85.05-181.51-17.65-35.29-68.19-35.36-85.87 0-87.12 174.26-85.04 165.84-85.04 181.51H384c0 44.18 57.31 80 128 80s128-35.82 128-80h-.02zM440 320l72-144 72 144H440zm88 128H352V153.25c23.51-10.29 41.16-31.48 46.39-57.25H528c8.84 0 16-7.16 16-16V48c0-8.84-7.16-16-16-16H383.64C369.04 12.68 346.09 0 320 0s-49.04 12.68-63.64 32H112c-8.84 0-16 7.16-16 16v32c0 8.84 7.16 16 16 16h129.61c5.23 25.76 22.87 46.96 46.39 57.25V448H112c-8.84 0-16 7.16-16 16v32c0 8.84 7.16 16 16 16h416c8.84 0 16-7.16 16-16v-32c0-8.84-7.16-16-16-16z',
  },
  {
    id: 'terms',
    label: 'Terms of Service',
    viewBox: '0 0 384 512',
    path: 'M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zM64 72c0-4.42 3.58-8 8-8h80c4.42 0 8 3.58 8 8v16c0 4.42-3.58 8-8 8H72c-4.42 0-8-3.58-8-8V72zm0 64c0-4.42 3.58-8 8-8h80c4.42 0 8 3.58 8 8v16c0 4.42-3.58 8-8 8H72c-4.42 0-8-3.58-8-8v-16zm192.81 248H304c8.84 0 16 7.16 16 16s-7.16 16-16 16h-47.19c-16.45 0-31.27-9.14-38.64-23.86-2.95-5.92-8.09-6.52-10.17-6.52s-7.22.59-10.02 6.19l-7.67 15.34a15.986 15.986 0 0 1-14.31 8.84c-.38 0-.75-.02-1.14-.05-6.45-.45-12-4.75-14.03-10.89L144 354.59l-10.61 31.88c-5.89 17.66-22.38 29.53-41 29.53H80c-8.84 0-16-7.16-16-16s7.16-16 16-16h12.39c4.83 0 9.11-3.08 10.64-7.66l18.19-54.64c3.3-9.81 12.44-16.41 22.78-16.41s19.48 6.59 22.77 16.41l13.88 41.64c19.77-16.19 54.05-9.7 66 14.16 2.02 4.06 5.96 6.5 10.16 6.5zM377 105L279.1 7c-4.5-4.5-10.6-7-17-7H256v128h128v-6.1c0-6.3-2.5-12.4-7-16.9z',
  },
  {
    id: 'faq',
    label: 'FAQ',
    viewBox: '0 0 512 512',
    path: 'M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zM262.655 90c-54.497 0-89.255 22.957-116.549 63.758-3.536 5.286-2.353 12.415 2.715 16.258l34.699 26.31c5.205 3.947 12.621 3.008 16.665-2.122 17.864-22.658 30.113-35.797 57.303-35.797 20.429 0 45.698 13.148 45.698 32.958 0 14.976-12.363 22.667-32.534 33.976C247.128 238.528 216 254.941 216 296v4c0 6.627 5.373 12 12 12h56c6.627 0 12-5.373 12-12v-1.333c0-28.462 83.186-29.647 83.186-106.667 0-58.002-60.165-102-116.531-102zM256 338c-25.365 0-46 20.635-46 46 0 25.364 20.635 46 46 46s46-20.636 46-46c0-25.365-20.635-46-46-46z',
  },
]

export default function HeaderUtilityBar({ onOpenFairness, onOpenTerms }) {
  const activate = (id) => {
    if (id === 'fairness') onOpenFairness?.()
    else if (id === 'terms') onOpenTerms?.()
    else window.dispatchEvent(new CustomEvent(`${id}:open`))
  }

  return (
    <nav className="header-utility-bar" aria-label="Site information">
      <div className="header-utility-bar-inner">
        {utilityItems.map((item) => (
          <button type="button" key={item.id} onClick={() => activate(item.id)}>
            <span className="header-utility-icon"><UtilityIcon viewBox={item.viewBox} path={item.path} /></span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <style>{`
        .header-utility-bar {
          position: relative;
          z-index: 30;
          display: flex;
          width: 100%;
          height: 48px;
          min-height: 48px;
          box-sizing: border-box;
          align-items: center;
          justify-content: flex-start;
          overflow: hidden;
          padding: 0 22px;
          border-bottom: 1px solid rgba(255, 255, 255, .07);
          background: #25263B;
          font-family: Poppins, sans-serif;
        }
        .header-utility-bar-inner { display: flex; height: 100%; align-items: center; justify-content: flex-start; gap: 0; }
        .header-utility-bar button {
          display: inline-flex;
          min-width: 32px;
          height: 32px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 12px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #747985;
          font: 600 11px/1.2 Poppins, sans-serif;
          white-space: nowrap;
          cursor: pointer;
          transition: color .15s ease;
        }
        .header-utility-bar button:hover { color: #fff; background: transparent; }
        .header-utility-bar button:focus-visible { outline: 2px solid #804AFF; outline-offset: -2px; color: #fff; }
        .header-utility-icon { display: inline-flex; width: 14px; height: 14px; flex: 0 0 14px; align-items: center; justify-content: center; }
        .header-utility-icon svg { display: block; width: 14px; height: 14px; }
        @media (max-width: 991px) {
          .header-utility-bar { overflow-x: auto; justify-content: center; padding-inline: 4px; scrollbar-width: none; }
          .header-utility-bar::-webkit-scrollbar { display: none; }
          .header-utility-bar-inner { width: 100%; min-width: max-content; justify-content: space-evenly; }
          .header-utility-bar button { padding-inline: 7px; font-size: 10px; }
        }
      `}</style>
    </nav>
  )
}
