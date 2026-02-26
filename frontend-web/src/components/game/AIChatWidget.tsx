'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, X, MessageCircle } from 'lucide-react';
import clsx from 'clsx';

interface Message {
  id: number;
  from: 'ai' | 'user';
  text: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    from: 'ai',
    text: 'Dacă îmi spui câte litere trebuie să aibă cuvântul, pot verifica dacă se potrivește perfect în diagramă.',
  },
];

const AI_RESPONSES = [
  (wordLen: number) => `Un cuvânt de ${wordLen} litere! Verifică indiciul și încearcă să identifici literele din mulțimea dată.`,
  () => 'Încearcă să te gândești la indiciu. Uneori primul și ultimul cuvânt din indiciu sunt cheia!',
  () => 'Atenție la literele comune din colloana principală violet – ele fac legătura cu celelalte cuvinte.',
  (_: number, word: string) => `Ai ${word.length} litere în cuvântul activ. Poți folosi tastarea de la tastatură sau tile-urile de jos.`,
];

interface Props {
  currentWordLength?: number;
  currentWord?: string;
}

export default function AIChatWidget({ currentWordLength, currentWord }: Props) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now(), from: 'user', text: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setAiTyping(true);

    setTimeout(() => {
      const respFn = AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)];
      const aiText = (respFn as any)(currentWordLength ?? 5, currentWord ?? '');
      setMessages((m) => [...m, { id: Date.now() + 1, from: 'ai', text: aiText }]);
      setAiTyping(false);
    }, 900 + Math.random() * 600);
  }

  return (
    <div className="fixed bottom-4 left-[96px] z-30">
      {/* Collapsed toggle */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="w-11 h-11 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-lg hover:bg-violet-700 transition"
        >
          <MessageCircle size={20} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-violet-600">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-white" />
              <span className="text-white text-sm font-semibold">Asistent AI</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition">
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-48">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={clsx(
                  'flex gap-2 items-end',
                  msg.from === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                {msg.from === 'ai' && (
                  <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <Bot size={12} className="text-violet-600" />
                  </div>
                )}
                <div
                  className={clsx(
                    'rounded-2xl px-3 py-2 text-xs max-w-[200px]',
                    msg.from === 'ai'
                      ? 'bg-gray-100 text-gray-800 rounded-bl-none'
                      : 'bg-violet-600 text-white rounded-br-none'
                  )}
                >
                  {msg.text}
                </div>
                {msg.from === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[9px] font-bold">Tu</span>
                  </div>
                )}
              </div>
            ))}
            {aiTyping && (
              <div className="flex gap-2 items-end">
                <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
                  <Bot size={12} className="text-violet-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-bl-none px-3 py-2">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            className="flex items-center gap-2 p-2 border-t border-gray-100"
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Scrie un mesaj..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 transition disabled:opacity-40"
            >
              <Send size={13} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
