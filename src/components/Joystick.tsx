/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { clamp } from '../theatre/math';

const SIZE = 128;
const MAX_RADIUS = 48;

interface JoystickProps {
  onChange: (x: number, y: number) => void;
}

export const Joystick: React.FC<JoystickProps> = ({ onChange }) => {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ id: -1, cx: 0, cy: 0 });

  useEffect(() => {
    return () => onChange(0, 0);
  }, [onChange]);

  const updateStick = (clientX: number, clientY: number) => {
    let dx = clientX - stateRef.current.cx;
    let dy = clientY - stateRef.current.cy;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_RADIUS) {
      dx *= MAX_RADIUS / dist;
      dy *= MAX_RADIUS / dist;
    }
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    onChange(dx / MAX_RADIUS, -dy / MAX_RADIUS);
  };

  const resetStick = () => {
    stateRef.current.id = -1;
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0px, 0px)';
    }
    const base = baseRef.current;
    if (base) {
      base.style.left = '';
      base.style.top = '';
      base.style.bottom = '';
      base.dataset.active = 'false';
    }
    onChange(0, 0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stateRef.current.id !== -1) return;
    e.preventDefault();
    e.stopPropagation();
    const zone = zoneRef.current;
    if (!zone) return;
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {}
    const rect = zone.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, SIZE / 2 + 6, rect.width - SIZE / 2 - 6);
    const y = clamp(e.clientY - rect.top, SIZE / 2 + 6, rect.height - SIZE / 2 - 6);
    stateRef.current = {
      id: e.pointerId,
      cx: x + rect.left,
      cy: y + rect.top,
    };
    const base = baseRef.current;
    if (base) {
      base.style.left = `${x - SIZE / 2}px`;
      base.style.top = `${y - SIZE / 2}px`;
      base.style.bottom = 'auto';
      base.dataset.active = 'true';
    }
    updateStick(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stateRef.current.id) {
      e.preventDefault();
      updateStick(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stateRef.current.id) {
      resetStick();
    }
  };

  return (
    <div
      ref={zoneRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
      className="pointer-events-auto absolute bottom-0 left-0 h-[55%] max-h-[360px] w-[48%] max-w-[380px] touch-none"
    >
      <div
        ref={baseRef}
        data-active="false"
        className="group absolute bottom-7 left-7 h-32 w-32 rounded-full border border-white/20 bg-black/30 shadow-[0_8px_40px_rgba(0,0,0,0.5),inset_0_0_30px_rgba(255,255,255,0.05)] backdrop-blur-md transition-[opacity,transform] duration-150 data-[active=false]:opacity-80 data-[active=true]:scale-105"
      >
        <div className="absolute inset-3 rounded-full border border-white/10" />
        {[0, 90, 180, 270].map((deg) => (
          <svg
            key={deg}
            viewBox="0 0 10 10"
            className="absolute top-1/2 left-1/2 h-2.5 w-2.5 text-white/40"
            style={{
              transform: `translate(-50%,-50%) rotate(${deg}deg) translateY(-${SIZE / 2 - 13}px)`,
            }}
          >
            <path
              d="M1 7 L5 3 L9 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ))}
        <div
          ref={knobRef}
          className="absolute top-1/2 left-1/2 -mt-7 -ml-7 h-14 w-14 rounded-full bg-gradient-to-b from-white/95 to-white/65 shadow-[0_6px_20px_rgba(0,0,0,0.45)] will-change-transform"
        >
          <div className="absolute inset-[18px] rounded-full bg-gradient-to-b from-amber-300 to-orange-500 opacity-90" />
        </div>
      </div>
    </div>
  );
};
