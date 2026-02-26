import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';

const EMOJIS = ['👍', '🔥', '😅', '😂', '💪', '🎉'];

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number;
  fromMe: boolean;
}

interface Props {
  onSend: (emoji: string) => void;
  lastReceived?: { userId: string; emoji: string; fromMe: boolean } | null;
}

export default function EmojiReactions({ onSend, lastReceived }: Props) {
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);
  const nextId = useRef(0);

  // Arată emoji-ul primit/trimis ca float
  useEffect(() => {
    if (!lastReceived) return;
    const id = nextId.current++;
    const fe: FloatingEmoji = {
      id,
      emoji: lastReceived.emoji,
      x: 20 + Math.random() * 60, // % din lățimea containerului
      fromMe: lastReceived.fromMe,
    };
    setFloating((prev) => [...prev, fe]);
    setTimeout(() => {
      setFloating((prev) => prev.filter((f) => f.id !== id));
    }, 2000);
  }, [lastReceived]);

  function handleSend(emoji: string) {
    onSend(emoji);
    setOpen(false);
  }

  return (
    <div className="fixed bottom-28 right-4 z-40 flex flex-col items-end gap-2">
      {/* Floating emojis */}
      {floating.map((fe) => (
        <div
          key={fe.id}
          className="pointer-events-none absolute select-none animate-float-up text-3xl"
          style={{ right: `${fe.x}%`, bottom: 60 }}
        >
          {fe.emoji}
        </div>
      ))}

      {/* Emoji picker */}
      {open && (
        <div className="flex gap-1 bg-white border border-slate-200 shadow-xl rounded-2xl p-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => handleSend(e)}
              className="text-2xl w-10 h-10 flex items-center justify-center rounded-xl hover:bg-violet-50 transition-colors"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all',
          open ? 'bg-violet-500 rotate-12 scale-110' : 'bg-white border border-slate-200 hover:bg-violet-50'
        )}
      >
        😊
      </button>
    </div>
  );
}
