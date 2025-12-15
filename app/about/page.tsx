"use client";

"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const slides = [
  {
    id: 1,
    title: "What is CancerCulture?",
    left: `
CancerCulture was born out of a simple but uncomfortable thought:
the memecoin space sometimes feels like cancer.

The idea behind it is simple too.
1. People like Solana.
2. People like charity.
3. People like community.

So I tried to combine all of this into one concept.

The core idea is to split the creator rewards 50 / 50.

50% of the rewards go to the creator.
They are used for marketing, maybe buy & lock
`,
    right: `
and yes, also for personal profit.
I won’t lie and pretend I’m a saint.

The other 50% go to the community.

There will be a voting system where the community decides who wins.
And the winner decides what happens next:
keep everything, donate everything to charity
(I can help with suggestions),
or split it between personal profit and charity.

A more detailed explanation of how all this works
can be found on the next slides.
`,
    image: "/cell-middle-v1.png",
  },
  {
    id: 2,
    title: "The CancerCulture Narrative",
    left: `
CancerCulture is built around a simple narrative.

Your “cancer” doesn’t mean an illness.
It means something unhealthy, irrational or unnecessary
that you still keep doing, buying or spending money on.

This can be a bad habit,
an addiction to something pointless,
or just something you know is stupid,
but you do it anyway.

To express that,
CancerCulture works with visual submissions.
People show their personal cancer.
`,
    right: `
Creativity matters more than aesthetics.

The goal is not shock value or shame.

CancerCulture is about self-awareness,
irony and shared bad habits.

The community doesn’t reward perfection.
It reacts to what feels real,
funny or uncomfortably relatable.

How these submissions are shared
and how voting works
is explained step by step on the next slides.
`,
    image: "/cell-middle-v1.png",
  },
  {
    id: 3,
    title: "Participation & Uploads",
    left: `
Taking part in CancerCulture is simple.

If you want to participate,
you upload a picture that represents your personal “cancer”.

The picture must be real
and include a handwritten note with:
#CancerCulture

Don’t worry:
there is no wallet connection required.

To protect the platform from spam and bot uploads,
participation requires a simple Discord verification.
`,
    right: `
You can upload more than one picture
if you want to increase your presence.

But quantity does not guarantee anything.

There is no automated system
that increases your chances by spamming uploads.

Only creativity matters,
because the community decides what stands out.

To upload a picture,
you must accept the rules.
Without accepting them,
participation is not possible.
`,
    image: "/cell-middle-v1.png",
  },
  {
    id: 4,
    title: "Voting & Rewards",
    left: `
Voting is fully community-driven.

There is no automated winner
and no randomness involved.

When a voting phase starts,
all submitted pictures are visible
and the community decides what stands out.

The picture with the most votes wins.

Voting periods depend on how the coin performs.
They are not fixed to a strict schedule,
but they are always announced early enough
so nobody misses them.
`,
    right: `
There is no fixed prize pool.

Rewards depend on how much creator revenue
is available at the time of voting.

If more rewards are generated,
the winning reward will be higher.
If less is generated,
the reward will be smaller.

Nothing is held back
to artificially keep prize pools equal.

Transparency matters more than predictability.
`,
    image: "/cell-middle-v1.png",
  },
  {
    id: 5,
    title: "The Winner’s Choice",
    left: `
Winning does not come with conditions.

If your picture wins,
the reward belongs to you.

You decide what happens next.

There is no obligation to donate,
no pressure and no hidden rules.

It is your win
and your decision.
`,
    right: `
As a winner, you have three options:

You can keep the full prize.

You can donate the full prize to a charity.
Suggestions can be provided,
but the final choice is always yours.

Or you can split the prize
between personal profit and charity
in any percentage you want.
`,
    image: "/cell-middle-v1.png",
  },
  {
    id: 6,
    title: "Culture, Fame & Rules",
    left: `
CancerCulture is not meant to be toxic.

The idea is to create a shared culture
built on humor, self-irony
and creative expression.

To make outcomes visible,
CancerCulture features a
“Wall of Fame” and a “Wall of Shame”.

This is not meant to insult anyone.
It is part of the narrative and the joke.
`,
    right: `
The Wall of Fame highlights winners
who decided to give something back.

The Wall of Shame lists winners
who kept the full prize.

Both outcomes are valid choices.

However, mocking, harassment
or targeted attacks are not tolerated.

If someone uses these mechanics
to attack others,
they will be removed from the Community.
`,
    image: "/cell-middle-v1.png",
  },
  {
    id: 7,
    title: "Before You Upload",
    left: `
Before uploading a picture,
there are a few things to prepare.

During the upload process,
you will be asked to provide:

– your X (Twitter) username
– a wallet address where the prize should be sent

You will also be asked
to make a preliminary decision
about what should happen if you win.

This includes whether you want to:
keep everything,
donate everything,
or split the prize.
`,
    right: `
If you decide to donate a part of your win,
you can already choose
a charity or organization.

This makes it possible
to send donations directly
and share them publicly afterward.

Important:
None of this information is visible
during the voting process.

Votes are fully anonymous.
Only the pictures are shown.

Usernames, wallets and donation decisions
are hidden until a winner is selected,
so they have zero influence on voting.
`,
    image: "/cell-middle-v1.png",
  },
  {
    id: 8,
    title: "Still here?",
    left: `


    



    If you made it this far,
you already understand the culture.




`,
    right: `

    
    
    
    

    But just in case:

The cell with the white clipboard
at the bottom of the screen
is the way in.

Do with that what you want.



`,
    image: "/cell-middle-v1.png",
  },
];

export default function AboutPage() {
  const [index, setIndex] = useState(0);
  const [cellHover, setCellHover] = useState(false);
  const [cellLookDown, setCellLookDown] = useState(false);
  
  const router = useRouter();
  const slide = slides[index];

  useEffect(() => {
    if (slide.id !== 8) {
      setCellLookDown(false);
      return;
    }

    const interval = setInterval(() => {
      setCellLookDown(true);

      setTimeout(() => {
        setCellLookDown(false);
      }, 1200);
    }, 6000);

    return () => clearInterval(interval);
  }, [slide.id]);

  return (
    <div className="relative w-full h-screen bg-orange-background overflow-hidden flex items-center justify-center">
      <div className="relative z-20 w-full max-w-6xl h-[520px]">

        {/* LEFT ARROW */}
        {index > 0 && (
          <button
            onClick={() => setIndex(index - 1)}
            className="absolute z-30 left-[clamp(-200px,-18vw,-280px)] top-[45%] -translate-y-1/2 text-5xl text-black/60 hover:text-black hover:scale-105 transition-all"
          >
            ←
          </button>
        )}

        {/* RIGHT ARROW */}
        {index < slides.length - 1 && (
          <button
            onClick={() => setIndex(index + 1)}
            className="absolute z-30 right-[clamp(-120px,-10vw,-160px)] top-[45%] -translate-y-1/2 text-5xl text-black/60 hover:text-black hover:scale-105 transition-all"
          >
            →
          </button>
        )}

        {/* CENTER CELL */}
        <div className="absolute inset-0 flex items-center justify-center translate-y-[clamp(-96px,-11vh,-132px)] translate-x-[clamp(-96px,-10vw,-152px)]">
  <button
    onClick={() => router.push("/")}
    onMouseEnter={() => setCellHover(true)}
    onMouseLeave={() => setCellHover(false)}
    className="cursor-pointer"
  >
    <Image
      src={
      slide.id === 8
    ? cellLookDown
      ? "/cell-middle-v3.png"
      : "/cell-middle-v1.png"
    : cellHover
      ? "/cell-middle-v2.png"
      : "/cell-middle-v1.png"
      }
      alt="Cancer cell mascot"
      width={420}
      height={420}
      priority
      className="
        drop-shadow-[0_10px_0_rgba(0,0,0,0.45)]
        transition-all
        duration-200
        ease-out
      "
    />
  </button>
</div>

        {/* LEFT TEXT PANEL */}
        <div className="absolute left-[clamp(-120px,-14vw,-200px)] top-[clamp(-176px,-16vh,-104px)] w-[34%] bg-yellow-star rounded-3xl p-8 text-white">
          <h2 className="text-lg font-bold mb-4 text-center">{slide.title}</h2>
          <div className="whitespace-pre-line text-[16.5px] leading-[1.65]">
            {slide.left}
          </div>
        </div>

        {/* RIGHT TEXT PANEL */}
        <div className="absolute right-[clamp(-24px,-2.5vw,-48px)] top-[clamp(-176px,-16vh,-104px)] w-[36%] bg-yellow-star rounded-3xl p-8 text-white">
          <div className="whitespace-pre-line text-[16.5px] leading-[1.65]">
            {slide.right}
          </div>
        </div>
      </div>

      {/* UPLOAD CELL – persistent */}
      <Link
        href="/upload"
        className="
          fixed
          bottom-12
          left-1/2
          translate-x-[clamp(-144px,-16vw,-248px)]
          z-50
          group
        "
      >
        <div className="relative">
          <Image
            src="/upload-cell-v2.png"
            alt="Upload your cancer"
            width={180}
            height={180}
            className="
              drop-shadow-[0_8px_0_rgba(0,0,0,0.35)]
  transition-all
  duration-300
  ease-out
  group-hover:scale-110
  group-hover:rotate-[-4deg]
  group-hover:brightness-110
  active:scale-[0.96]
            "
          />

        </div>
      </Link>
    </div>
  );
}
