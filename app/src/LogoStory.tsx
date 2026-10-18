import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from './i18n';

const story = {
  'zh-TW': {
    title: 'Time Audit 從看見時間開始',
    body: '我們把一天中原本容易悄悄流走的片段記錄下來，回頭看時間去了哪裡，再決定下一段時間要怎麼用。圓環代表持續的生活節奏，A 代表審視；藍色橫槓代表一段段如實留下的記錄，一步一腳印地累積，拼出完整的一天。那個小圓點提醒我們，改變可以從記錄眼前這一刻開始。',
    label: '了解 Time Audit 標誌的故事',
  },
  en: {
    title: 'Time Audit begins by making time visible',
    body: 'We record the moments that can quietly slip away during a day, look back at where our time went, and decide how to use the next stretch. The circle represents the ongoing rhythm of life; the A stands for Audit, a closer look at how we spend our time. The blue crossbar represents the stretches we record, one by one; together, those small steps reveal a whole day. The small dot reminds us that change can begin by recording this very moment.',
    label: 'Read the story behind the Time Audit logo',
  },
} as const;

export default function LogoStory({ locale, src, imageClassName }: { locale: Locale; src: string; imageClassName: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const copy = story[locale];

  const show = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(360, window.innerWidth - 24);
    const height = locale === 'en' ? 315 : 270;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: rect.bottom + height + 12 < window.innerHeight ? rect.bottom + 10 : Math.max(12, rect.top - height - 10),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setPinned(false); };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !popover.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return <>
    <button
      ref={trigger}
      type="button"
      className="logo-story-trigger"
      aria-label={copy.label}
      aria-haspopup="dialog"
      aria-expanded={open}
      onPointerEnter={event => { if (event.pointerType === 'mouse') show(); }}
      onPointerLeave={event => { if (event.pointerType === 'mouse' && !pinned) setOpen(false); }}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) show(); }}
      onBlur={() => { if (!pinned) setOpen(false); }}
      onClick={() => {
        if (pinned) { setPinned(false); setOpen(false); }
        else { show(); setPinned(true); }
      }}
    ><img className={imageClassName} src={src} alt="" /></button>
    {open && createPortal(<div ref={popover} className="logo-story-popover" style={position} role="dialog" aria-modal="false" aria-label={copy.title}>
      <strong>{copy.title}</strong>
      <p>{copy.body}</p>
    </div>, document.body)}
  </>;
}
