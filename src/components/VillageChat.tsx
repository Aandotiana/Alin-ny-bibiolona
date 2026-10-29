import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { ChatMessage } from '../game/types.ts';

interface VillageChatProps {
  messages: ChatMessage[];
  onSendMessage: (msg: string) => void;
  myPlayerId: string;
  isAlive?: boolean;
  isLobby?: boolean;
  title?: string;
}

const QUICK_MESSAGES = [
  'Manao ahoana! 👋',
  'Tsy izaho mihitsy! 🌾',
  'Miahiahy aho! 🧐',
  'Arovy ny tanàna! 🛡️',
  'Vonona ve? ⚡',
];

export const VillageChat: React.FC<VillageChatProps> = ({
  messages,
  onSendMessage,
  myPlayerId,
  isAlive = true,
  title = 'Chat du Village',
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 flex flex-col h-[380px] sm:h-[420px]">
      {/* En-tête chat */}
      <div className="px-3.5 py-2.5 border-b border-stone-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-stone-300">
          <MessageSquare className="w-4 h-4 text-amber-400" />
          <span>{title}</span>
        </div>
        <span className="text-[10px] text-stone-500">{messages.length} msgs</span>
      </div>

      {/* Liste des messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-stone-500 text-xs italic">
            Aucun message pour le moment.
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId === myPlayerId;
            const isSystem = msg.isSystem;

            if (isSystem) {
              return (
                <div key={msg.id || idx} className="text-center py-1">
                  <span className="px-2 py-0.5 rounded bg-stone-800 text-[11px] text-amber-300">
                    {msg.message}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={msg.id || idx}
                className={`flex gap-2 items-start ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {!isMe && <span className="text-base select-none">{msg.senderAvatar || '👤'}</span>}
                <div
                  className={`max-w-[78%] rounded-xl px-3 py-1.5 ${
                    isMe
                      ? 'bg-amber-600 text-stone-950 font-medium'
                      : 'bg-stone-800 text-stone-200'
                  }`}
                >
                  {!isMe && (
                    <div className="text-[10px] font-bold text-stone-400 mb-0.5">
                      {msg.senderName}
                    </div>
                  )}
                  <p className="leading-snug break-words">{msg.message}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Messages rapides */}
      <div className="px-2 py-1.5 border-t border-stone-800 flex items-center gap-1 overflow-x-auto">
        {QUICK_MESSAGES.map((text, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSendMessage(text)}
            className="text-[10px] whitespace-nowrap px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer transition shrink-0"
          >
            {text}
          </button>
        ))}
      </div>

      {/* Formulaire d'envoi */}
      <form onSubmit={handleSubmit} className="p-2 border-t border-stone-800 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isAlive ? 'Écrire un message...' : 'Vous êtes éliminé...'}
          disabled={!isAlive}
          maxLength={200}
          className="flex-1 bg-stone-950 border border-stone-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={!isAlive || !inputText.trim()}
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-stone-950 rounded-lg text-xs font-bold transition flex items-center cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
