import ContractAddress from "./components/ContractAddress"
import Image from "next/image"
import Link from "next/link"
import DiscordCell from "./components/DiscordCell"
import TelegramCell from "./components/TelegramCell"

export default function Home() {
  return (
    <div className="relative w-full h-screen bg-orange-background overflow-hidden">

      {/* HERO CONTENT */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">

        {/* CELLS AREA */}
        <div className="translate-y-[-6%]">
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
            -translate-y-[clamp(50px,7vh,110px)]
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

      {/* CONTRACT ADDRESS (desktop only, fixed) */}
      <ContractAddress address="AHX--JUST-AN-EXAMPLE-CA--FNByc1MwZpump" />

    </div>
  )
}
