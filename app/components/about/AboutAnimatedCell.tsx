"use client";

import Image from "next/image";
import "./about-animated-cell.css";

type Props = {
  frames: string[];
  alt: string;
};

export default function AboutAnimatedCell({ frames, alt }: Props) {
  return (
    <div className="about-animated-cell-link">
      <div className="about-animated-cell">
        {frames.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt={alt}
            width={64}
            height={64}
            className={`about-cell-frame frame-${i + 1}`}
            priority={i === 0}
          />
        ))}
      </div>
    </div>
  );
}

