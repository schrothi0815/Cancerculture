"use client";

import Image from "next/image";

export default function DiscordCell() {
  return (
    <a
      href="https://x.com/i/communities/1974188909858074899"
      target="_blank"
      rel="noopener noreferrer"
      className="relative cursor-pointer group"
    >
      {/* CELL IMAGE */}
      <Image
        src="/cell-left-v2.png"
        alt="Join our Discord"
        width={600}
        height={600}
        className="
          w-[clamp(180px,22vw,420px)]
          h-auto
          animate-float
          transition-transform
          hover:scale-[1.03]
        "
      />

      {/* DISCORD ICON */}
      <div
        className="
          absolute
          -top-[clamp(55px,7vh,110px)]
          left-1/2
          -translate-x-1/2
          pointer-events-none

          opacity-100
          md:opacity-0
          md:group-hover:opacity-100
          transition-opacity
        "
      >
        <Image
          src="/icons/x-v1.png"
          alt="Discord"
          width={48}
          height={48}
          className="
            w-7 h-7
            md:w-12 md:h-12
            object-contain
            drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]
          "
        />
      </div>
    </a>
  );
}
