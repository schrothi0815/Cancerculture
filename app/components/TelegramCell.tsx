"use client";

import Image from "next/image";
import { useState } from "react";

export default function TelegramCell() {
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href="https://t.me/+ldoIPyhjtaw5NjM0"
      target="_blank"
      rel="noopener noreferrer"
      className="relative cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Image
        src="/cell-right-v2.png"
        alt="Join our Telegram"
        width={600}
        height={600}
        className="
          w-[clamp(180px,22vw,420px)]
          h-auto
          animate-float-delayed
          transition-transform
          hover:scale-[1.03]
        "
      />

      {hovered && (
        <div
          className="
            absolute
            -top-[clamp(55px,8vh,120px)]
            left-1/2
            -translate-x-1/2
            pointer-events-none
          "
        >
          <Image
            src="/icons/telegram-v1.png"
            alt="Telegram"
            width={48}
            height={48}
            className="
              w-12 h-12
              object-contain
              drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]
            "
          />
        </div>
      )}
    </a>
  );
}
