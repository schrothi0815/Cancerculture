"use client";

import { useState } from "react";
import Image from "next/image";
import WallCard from "./WallCard";

type Winner = {
  id: string;
  image_url: string;
  x_username: string | null;
  wallet_address: string;
  donation_percentage: number;
  donation_target: string | null;
};

export default function WallGrid({ winners }: { winners: Winner[] }) {
  const [activeImage, setActiveImage] = useState<Winner | null>(null);

  return (
    <>
      <div
        className="
          grid
          grid-cols-3
          sm:grid-cols-5
          md:grid-cols-6
          lg:grid-cols-8
          xl:grid-cols-10
          gap-2
        "
      >
        {winners.map((w) => (
          <div
            key={w.id}
            onClick={() => setActiveImage(w)}
            className="
              relative
              aspect-square
              overflow-hidden
              rounded-lg
              bg-neutral-200
              cursor-pointer
              transition-transform
              md:hover:scale-[1.03]
            "
          >
            <Image
              src={w.image_url}
              alt="Winner"
              fill
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {activeImage && (
        <WallCard
          winner={activeImage}
          onClose={() => setActiveImage(null)}
        />
      )}
    </>
  );
}
