import ContractAddress from "./components/ContractAddress";
import { getTeamMember } from "@/lib/auth/guards";
import Image from "next/image";
import Link from "next/link";
import DiscordCell from "./components/DiscordCell";
import TelegramCell from "./components/TelegramCell";
import { getContractAddress } from "@/lib/config/getContractAddress";

export default async function Home() {
  let isTeamMember = false;

  try {
    // 🔐 Mod oder Admin?
    await getTeamMember();
    isTeamMember = true;
  } catch { }

  const contractAddress = await getContractAddress();

  return (
    <div className="relative w-full h-screen bg-orange-background overflow-hidden">
      {/* HERO CONTENT */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
        {/* CELLS AREA */}
        <div className="translate-y-[-6%] sm:translate-y-[-6%]">
          <div
            className="
              flex items-center justify-center
              gap-[clamp(4rem,16vw,18rem)]
              xl:gap-[clamp(6rem,18vw,22rem)]
              translate-x-[-2%]
            "
          >
            {/* LEFT CELL – DISCORD */}
            <DiscordCell />

            {/* RIGHT CELL – TELEGRAM */}
            <TelegramCell />
          </div>
        </div>

        {/* LOGO */}
        <Link
          href="/about"
          className="
            translate-y-[clamp(20px,7vh,60px)]
            sm:-translate-y-[clamp(50px,7vh,110px)]
            transition-transform
            hover:scale-[1.04]
            active:scale-[0.98]
          "
        >
          <Image
            src="/logo/cancerculture-logo.png"
            alt="CancerCulture – What is it?"
            width={900}
            height={260}
            priority
            className="
              w-[clamp(360px,60vw,960px)]
              max-w-[92vw]
              cursor-pointer
              drop-shadow-[0_8px_0_rgba(0,0,0,0.35)]
            "
          />
        </Link>
      </div>

            {/* 🛡️ TEAM BUTTON (Mod + Admin only) */}
      {isTeamMember && (
        <div className="absolute top-6 left-6 z-30">
          <Link
            href="/admin"
            className="
              px-4 py-2
              rounded-md
              bg transparent
              text-white
              text-sm
              hover:bg-black
              transition
            "
          >
           🛡️ Moderation
          </Link>
        </div>
      )}

      {/* CONTRACT ADDRESS (desktop only, fixed) */}
      <ContractAddress address={contractAddress} />
    </div>
  );
}
