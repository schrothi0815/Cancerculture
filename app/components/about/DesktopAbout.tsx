"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AboutAnimatedCell from "./AboutAnimatedCell";

const slides = [
  {
    id: 1,
    leftTitle: "What is CancerCulture?",
    rightTitle: "The name is the narrative.",
    left: `
CancerCulture was born out of a simple but uncomfortable truth:
The memecoin space sometimes feels like cancer.

The idea behind it is simple.
I wanted to create a community-driven charity coin, where the community itself shows how selfless it can be, especially when it comes to everybody’s own pocket.

There is an ongoing competition, as long as this project exists.
And it is up to the community, to keep it alive.
50% of the Creator rewards will go to the Community across multiple rounds.

And just to be absolutely clear:

The name CancerCulture is not meant to make fun of sick people,
and it has nothing to do with cancer as a disease.

It refers only to a cancerous space,
and to everyone’s personal cancer.

`,
  
    right: `
Everyone is encouraged to upload a picture of their personal cancer.

Your personal cancer does not mean an illness.
It means something unhealthy, irrational, or unnecessary
that you still keep doing, buying, or spending money on.

This can be:

    -a bad habit
    -an addiction to something pointless
    -or just something you know is stupid,
    but you do it anyway.

Before you upload, keep this in mind:

Step 1: Think.
Step 2: Be creative.
Step 3: Upload it.
Step 4: Vote on other submissions.
Step 5: Chill and shill.
`,
    image: "/cell-middle-v1.png",
  },
  {
    id: 2,
    leftTitle: "FAQ & Info.",
    rightTitle: "Rules and Guidelines.",
    left: `
-------------------------------------------------
HOW IT WORKS:    
-------------------------------------------------

CancerCulture runs as an ongoing competition in separate rounds.

In each round, everyone can:

-upload one picture of your personal \u00A0cancer

-take one vote

You are not allowed to vote for your own submission.

-------------------------------------------------
UPLOADS, VOTING & VERIFICATION:
-------------------------------------------------
To keep everything as fair and safe as possible,
there is no wallet connection required at any point.

However, to protect the platform from bot uploads and fake votes,
you must verify yourself via Discord
before you can upload a picture or take your vote.

If you submit a picture, you are asked to provide:

-your X (Twitter) @username

-a wallet address where a potential prize \u00A0should be sent

-a decision about what should happen if \u00A0you win

You can choose to:

-keep the full prize

-donate the full prize

-or split the prize and decide what   \u00A0percentage should be donated

-------------------------------------------------
PRIVACY & ANONYMITY:
-------------------------------------------------

All personal information stays hidden during the active round
and has no influence on voting.

There are:

-no user accounts

-no public profiles

-no visible identities during a round

Uploads and votes are anonymous.

Internally, participants are represented by a temporary user hash,
used only to prevent double votes and double uploads.

These hashes change between rounds
and cannot be used to track users over time.

-------------------------------------------------
ROUNDS, TIMING & REWARDS:
-------------------------------------------------
There are no fixed round durations.

Round length depends on:

-the performance of the coin

-how active the community is

Some rounds may be short, others longer.
Nothing is rushed or forced to match a schedule.

Before a round ends, early notifications are shared on:
X and Telegram.

When a round ends, 100% of the available rewards from that round
will be claimed immediately.
Exactly 50% of those rewards go to the winner(s).

Nothing is held back.
Nothing is reserved for future rounds.

Because of this, prize sizes can vary from round to round.
This is intentional.

We prioritize transparency over predictability.

-------------------------------------------------
WINNERS, TIES & OUTCOMES:
-------------------------------------------------
The submission with the most votes wins.

If multiple submissions share the highest vote count,
there can be multiple winners.

In that case, the prize is split evenly
between all winning submissions.

No manual intervention.
No hidden decisions.

Once a round is finished, the winner(s) are revealed.

Winners appear either on:

-the Wall of Fame, or

-the Wall of Shame

The Wall of Fame lists winners who share
at least 1% of their prize with a charity.

The Wall of Shame lists winners who kept the full prize.

This is not meant to publicly shame anyone.
It simply fits the CancerCulture narrative.

Every decision is valid,
and there is no reason to attack or harass anyone based on their choice.

-------------------------------------------------
CHARITY SELECTION:
-------------------------------------------------

For convenience, a small selection of well-known charity organizations
is available in the dropdown menu during submission.

If your preferred organization is not listed,
you can select “Other”
and enter your own charity of choice manually.

Please make sure that any charity selected via the “Other” option
is able to receive donations on the Solana blockchain.

We strongly recommend verifying this in advance,
for example by checking platforms such as The Giving Block
or similar crypto-friendly donation providers.

There is no restriction on which legitimate charity you choose,
as long as it aligns with the platform rules
and can technically receive the donation.

-------------------------------------------------
ABOUT THE REMAINING 50% OF CREATOR REWARDS:
-------------------------------------------------

A fair question.

Whatever the winning creator chooses, we mirror.

-If the winner keeps their share, we keep ours.

-If the winner donates, we donate the same amount.

-If the winner splits, we split the same way.

-If the winner donates, we donate to the same organization.

This applies per round, without exceptions.


`,
    right: `
-------------------------------------------------  
CONTENT & SUBMISSIONS:
-------------------------------------------------

All uploaded content must be original and created by the uploader.

Submissions that violate copyright, include illegal content,
or break applicable laws will be removed.

To protect the platform in case of abuse or illegal uploads,
the uploader’s IP address is temporarily stored for up to 24 hours
after an upload.

This data is used only for abuse prevention
and legal safety purposes,
IPs are automatically deleted after 24 hours.

-------------------------------------------------
SUPPORT, PAYOUT ISSUES & TIMING:
-------------------------------------------------

If you experience any issues related to your submission or payout,
for example:

– you no longer control the wallet you submitted
– there is an error in the information you provided
– or any other payout-related concern

you must submit a support request via the official
“Wallet / Participation Issue” form on the CancerCulture website.

You can access this form using the support button
located above the upload information on the submission page.

This is the only supported channel for payout-related issues.

Please provide all relevant and accurate information required
to verify ownership of your submission and wallet.

Only requests submitted before a round ends
can be considered for payout adjustments.

For this reason:

– do not contact team members via direct messages
– do not spam the X (Twitter) community
– support requests are not handled in real time
– not every submission will receive a direct response

Support requests are primarily reviewed at the end of a round,
to verify whether a potential winner has submitted an issue
that affects payout handling.

If a submission with an active support request
is selected as the winner,
a team member will reach out directly
to resolve the issue before payout.

If no issue exists for the winning submission,
the payout is processed automatically.

If an issue is submitted after a round has ended
and the payout has already been processed,
it may no longer be possible to change or recover the payout.

If you do not win a round,
your support request may not receive further follow-up.

This does not mean your request was ignored.

Support requests related to non-winning submissions
lose relevance automatically,
as all submission data can be corrected again
in the next round.

CancerCulture processes payouts immediately once a round is closed.
There is no waiting period after a round ends
to validate or correct user information.

-------------------------------------------------
BEHAVIOR & CONDUCT:
-------------------------------------------------

Harassment, hate speech, threats, or targeted attacks are not tolerated.

Public shaming, doxxing, or organized harassment of winners is prohibited.

Disagreeing with a payout decision is allowed.
Attacking or harassing a person because of their decision is not.

CancerCulture is built around self-irony, creativity, and shared culture.
Abuse of the narrative to harm others is not acceptable.

-------------------------------------------------
PAYOUT & DECISIONS:
-------------------------------------------------

All payout decisions are made by the winner.

All decisions (keep, donate, split) are final once submitted.

CancerCulture does not guarantee prize size or round duration.

Rewards depend entirely on the available creator rewards
at the time a round ends.

-------------------------------------------------
MODERATION & ENFORCEMENT:
-------------------------------------------------

CancerCulture reserves the right to remove content or participants
that violate these rules
or harm the integrity of the project or the community.

Severe or repeated violations may result in permanent exclusion
from participation.

Moderation actions are logged
and can be reviewed internally if necessary.

-------------------------------------------------
DISCLAIMER:
-------------------------------------------------

CancerCulture is an experimental, community-driven project.

Participation is voluntary and at your own responsibility.

Nothing on this platform constitutes financial advice.

There is no guarantee of profit, reward size, or outcome.

-------------------------------------------------

If you made it this far,
you already understand the culture.

But just in case:

The cell with the white clipboard
at the bottom of the screen
is the way in.

Do with that what you want.


`,
    image: "/cell-middle-v1.png",
  },
];

export default function DesktopAbout() {
  const [index, setIndex] = useState(0);
  const [cellHover, setCellHover] = useState(false);
  const [cellLookDown, setCellLookDown] = useState(false);
  
  const router = useRouter();
  const slide = slides[index];

  useEffect(() => {
    if (slide.id !== 2) {
      setCellLookDown(false);
      return;
    }

    const interval = setInterval(() => {
      setCellLookDown(true);

      setTimeout(() => {
        setCellLookDown(false);
      }, 1200);
    }, 5000);

    return () => clearInterval(interval);
  }, [slide.id]);

  return (
    <div className="relative w-full h-screen bg-orange-background overflow-hidden flex items-center justify-center">
      <div className="relative z-20 w-full max-w-6xl h-[520px]">

      {/* TOP LINKS (Page 2 Navigation) */}
<div className="absolute top-[clamp(-280px,-36vh,-400px)] left-0 right-0 flex items-center justify-between px-2 z-40">

  {/* Wall of Fame */}
  <div className="-translate-x-[64px]">
  <Link
    href="/wall/fame"
    className="flex items-center gap-2 text-black text-2xl font-bold hover:scale-105"
  >
    <AboutAnimatedCell
            alt="Wall of Fame cell"
      frames={[
        "/fame/fame-v1.png",
        "/fame/fame-v2.png",
        "/fame/fame-v3.png",
      ]}
    />
    <span>Wall of Fame</span>
  </Link>
</div>
  {/* Vote */}
  <Link
  href="/vote"
  className="
    text-black
    text-3xl
    font-bold
    hover:scale-105
    transition-transform
    -translate-x-[75px]
  "
>
  Vote
</Link>

  {/* Wall of Shame */}
<div className="-translate-x-[50px]">
  <Link
    href="/wall/shame"
    className="flex items-center gap-3 text-black text-2xl font-bold hover:scale-105"
  >
    <span>Wall of Shame</span>
    <AboutAnimatedCell
      
      alt="Wall of Shame cell"
      frames={[
        "/fame/fame-v1.png",
        "/fame/fame-v2.png",
        "/fame/fame-v4.png",
      ]}
    />
  </Link>
</div>

</div>


        {/* LEFT ARROW */}
        {index > 0 && (
  <button
    onClick={() => setIndex(index - 1)}
    className="
      absolute z-30
      left-[clamp(-200px,-18vw,-280px)]
      top-[45%]
      -translate-y-1/2
      text-black/60
      hover:text-black
      hover:scale-105
      transition-all
      text-xl
      font-bold
    "
  >
    {"Back"}
  </button>
)}

        {/* RIGHT ARROW */}
        {index < slides.length - 1 && (
  <button
    onClick={() => setIndex(index + 1)}
    className="
      absolute z-30
      right-[clamp(-120px,-10vw,-160px)]
      top-[45%]
      -translate-y-1/2
      text-black/60
      hover:text-black
      hover:scale-105
      transition-all
      text-xl
      font-bold
    "
  >
    {index === 0 && "FAQ →"}
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
      slide.id === 2
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
        <div
  className="
    absolute
    left-[clamp(-120px,-14vw,-200px)]
    top-[clamp(-176px,-16vh,-104px)]
    w-[34%]
    bg-yellow-star
    rounded-3xl
    p-8
    text-white
    h-[600px]
    overflow-hidden
  "
>
  <h2 className="text-lg font-bold mb-4 text-center">
    {slide.leftTitle}
  </h2>

  <div className="h-full overflow-y-auto pr-2">
    <div className="whitespace-pre-line text-[16.5px] leading-[1.65]">
      {slide.left}
    </div>
  </div>
</div>

        {/* RIGHT TEXT PANEL */}
        <div
  className="
    absolute
    right-[clamp(-24px,-2.5vw,-48px)]
    top-[clamp(-176px,-16vh,-104px)]
    w-[36%]
    bg-yellow-star
    rounded-3xl
    p-8
    text-white
    h-[640px]
    overflow-hidden
  "
>
  {slide.rightTitle && (
  <h2 className="text-lg font-bold mb-4 text-center">
    {slide.rightTitle}
  </h2>
)}

<div className="max-h-[calc(100%-3rem)] overflow-y-auto pr-2">
  <div className="whitespace-pre-line text-[16.5px] leading-[1.65]">
    {slide.right}
  </div>
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
