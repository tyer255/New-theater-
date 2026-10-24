/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';

interface PartyMember {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
}

export const PartyWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [relayUrl, setRelayUrl] = useState('wss://aetho-party.fly.dev/party/ws');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState(
    'Not connected. Relay: wss://aetho-party.fly.dev/party/ws'
  );
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [messages, setMessages] = useState<{ name: string; text: string }[]>([]);

  const handleStartRoom = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setRoomCode(code);
    setMembers([
      {
        id: 'self',
        name: 'You',
        color: '#ffd236',
        isHost: true,
      },
    ]);
    setStatusNote('you are driving · in sync · ±0ms');
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) return;
    setRoomCode(cleaned);
    setMembers([
      {
        id: 'host',
        name: 'Host',
        color: '#7ee787',
        isHost: true,
      },
      {
        id: 'self',
        name: 'You',
        color: '#ffd236',
        isHost: false,
      },
    ]);
    setStatusNote('Host driving · in sync · ±12ms');
  };

  const handleCopyInvite = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('party', roomCode || 'new');
    navigator.clipboard?.writeText(url.toString()).catch(() => {});
    setStatusNote('invite link copied');
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    setMessages((prev) => [...prev, { name: 'You', text: chatText.trim() }]);
    setChatText('');
  };

  return (
    <div className="fixed top-[66px] right-3 z-30 select-none sm:right-6">
      {/* Top Bar Pill */}
      <div className="flex max-w-[min(420px,calc(100vw-24px))] items-center justify-end gap-[7px] rounded-full border border-white/[0.14] bg-[#06070b]/[0.82] px-1.5 py-[5px] text-xs text-white shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-md">
        {roomCode && (
          <>
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#7ee787]" />
            <b className="tracking-[0.14em] font-semibold">{roomCode}</b>
            <span className="hidden max-w-[42vw] truncate opacity-70 sm:inline">
              {statusNote}
            </span>
          </>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className={`cursor-pointer rounded-full border px-[9px] py-1 text-xs whitespace-nowrap transition ${
            roomCode && !open
              ? 'border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.14]'
              : 'border-[#ffd236] bg-[#ffd236] font-bold text-[#111]'
          }`}
        >
          {open ? 'Close' : roomCode ? `Party · ${members.length}` : 'Party'}
        </button>
      </div>

      {/* Expandable Lobby / Room Panel */}
      {open && (
        <div className="absolute top-[52px] right-0 max-h-[calc(100vh-138px)] w-[min(430px,calc(100vw-24px))] overflow-auto rounded-[18px] border border-white/[0.14] bg-[#08090e]/[0.96] p-3.5 text-[13px] text-white shadow-[0_24px_70px_rgba(0,0,0,0.65)]">
          {!roomCode ? (
            <div>
              <div className="mb-1 text-[15px] font-bold tracking-[0.02em]">Watch together</div>
              <p className="mt-0.5 mb-3 leading-[1.45] opacity-70">
                One room, one playhead. Pick a film in the theatre and everyone lands on the same frame.
              </p>
              <button
                onClick={handleStartRoom}
                className="mb-2.5 w-full cursor-pointer rounded-[10px] bg-[#ffd236] px-3.5 py-[9px] font-bold text-[#12131a] transition hover:brightness-105"
              >
                Create a room
              </button>
              <form onSubmit={handleJoinRoom} className="mb-3 flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="ROOM CODE"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-[10px] border border-white/20 bg-white/[0.08] px-2.5 py-2 text-white outline-none focus:border-[#ffd236]"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-[10px] bg-[#ffd236] px-3 py-[9px] font-bold text-[#12131a] transition hover:brightness-105"
                >
                  Join
                </button>
              </form>
              <div className="flex items-center gap-1.5 text-[11px] opacity-90">
                <span className="shrink-0 opacity-60">sync server</span>
                <input
                  value={relayUrl}
                  onChange={(e) => setRelayUrl(e.target.value)}
                  placeholder="wss://server/party/ws"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-[10px] border border-white/20 bg-white/[0.08] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#ffd236]"
                />
                <button
                  type="button"
                  onClick={() => setStatusNote(`Relay set to ${relayUrl}`)}
                  className="cursor-pointer rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-white hover:bg-white/[0.14]"
                >
                  Use
                </button>
              </div>
              <p className="mt-2.5 text-[11px] leading-[1.5] break-words opacity-60">
                {statusNote}
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[15px] font-bold tracking-[0.02em]">
                  Room <b className="tracking-[0.18em]">{roomCode}</b>
                </div>
                <div className="flex items-center gap-1">
                  {members.map((m) => (
                    <span
                      key={m.id}
                      className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-black"
                      style={{ background: m.color }}
                    >
                      {m.name[0]}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-0.5 mb-3 leading-[1.45] opacity-70">
                Copy the invite link and send it to a friend. Pick a film in the theatre once they are in.
              </p>
              <div className="my-2.5 grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setChatOpen((v) => !v)}
                  className="cursor-pointer rounded-full border border-white/15 bg-white/[0.06] px-1.5 py-[7px] text-xs hover:bg-white/[0.14]"
                >
                  Live chat
                </button>
                <button
                  onClick={handleCopyInvite}
                  className="cursor-pointer rounded-full border border-white/15 bg-white/[0.06] px-1.5 py-[7px] text-xs hover:bg-white/[0.14]"
                >
                  Copy invite
                </button>
                <button
                  onClick={() => setRoomCode(null)}
                  className="cursor-pointer rounded-full border border-white/15 bg-white/[0.06] px-1.5 py-[7px] text-xs hover:bg-white/[0.14]"
                >
                  Leave room
                </button>
              </div>
              <div className="mt-3 mb-1.5 text-[10px] tracking-[0.14em] uppercase opacity-55">
                Live chat
              </div>
              <div className="flex h-28 flex-col gap-1.5 overflow-auto rounded-xl bg-white/[0.04] p-2">
                {messages.length > 0 ? (
                  messages.map((m, idx) => (
                    <div key={idx} className="text-xs leading-[1.35]">
                      <b className="mr-1.5 text-[#ffd236]">{m.name}</b>
                      {m.text}
                    </div>
                  ))
                ) : (
                  <div className="text-xs opacity-55">Messages appear here live.</div>
                )}
              </div>
              {chatOpen && (
                <form onSubmit={handleSendChat} className="mt-2 flex gap-1.5">
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Message the room…"
                    maxLength={500}
                    className="w-full rounded-full border border-white/20 bg-white/[0.08] px-3 py-2 text-[13px] text-white outline-none focus:border-[#ffd236]"
                  />
                </form>
              )}
              <div className="mt-3 mb-1.5 text-[10px] tracking-[0.14em] uppercase opacity-55">
                People
              </div>
              <div className="flex flex-col gap-1.5">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-[10px] bg-white/[0.04] px-2 py-1.5"
                  >
                    <span
                      className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-black"
                      style={{ background: m.color }}
                    >
                      {m.name[0]}
                    </span>
                    <span className="flex-1 truncate text-xs">
                      {m.name}
                      {m.isHost ? ' · host' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
