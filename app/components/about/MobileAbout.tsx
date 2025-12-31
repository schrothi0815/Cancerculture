"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

/* ================= CONTENT ================= */

const SECTIONS = [
  {
    title: "What is CancerCulture?",
    button: "About",
    text: `
CancerCulture was born out of a simple but uncomfortable truth:
The memecoin space sometimes feels like cancer.

The idea behind it is simple.
I wanted to create a community-driven charity coin,
where the community itself shows how selfless it can be,
especially when it comes to everybody’s own pocket.

There is an ongoing competition, as long as this project exists.
And it is up to the community, to keep it alive.

50% of the Creator rewards will go to the Community
across multiple rounds.

And just to be absolutely clear:

The name CancerCulture is not meant to make fun of sick people,
and it has nothing to do with cancer as a disease.

It refers only to a cancerous space,
and to everyone’s personal cancer.
`,
  },
  {
    title: "The name is the narrative.",
    button: "Narrative",
    text: `
Everyone is encouraged to upload a picture
of their personal cancer.

Your personal cancer does not mean an illness.
It means something unhealthy, irrational,
or unnecessary that you still keep doing,
buying, or spending money on.

This can be:

- a bad habit
- an addiction to something pointless
- something you know is stupid,
  but you do it anyway.

Before you upload, keep this in mind:

Step 1: Think.
Step 2: Be creative.
Step 3: Upload it.
Step 4: Vote on other submissions.
Step 5: Chill and shill.
`,
  },
  {
    title: "FAQ & Info.",
    button: "FAQ & Info.",
    text: `
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
  },
  {
    title: "Rules and Guidelines.",
    button: "Rules",
    text: `
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
located on the bottom of the submission page.

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
  },
];

/* ================= COMPONENT ================= */

export default function MobileAbout() {
  const [index, setIndex] = useState(0);

  const prev = () => index > 0 && setIndex(index - 1);
  const next = () => index < SECTIONS.length - 1 && setIndex(index + 1);

  return (
    <div className="relative w-screen h-screen bg-orange-background text-white flex flex-col">

      {/* ===== TOP NAV ===== */}
      <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold">
        <Link href="/wall/fame">Wall of Fame</Link>
        <Link href="/vote">Vote</Link>
        <Link href="/wall/shame">Wall of Shame</Link>
      </div>

      {/* ===== NAV BUTTONS ===== */}
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <button
          onClick={prev}
          disabled={index === 0}
          className="px-3 py-1 rounded-full bg-black/30 disabled:opacity-30"
        >
          ←
        </button>

        <span className="text-xs opacity-80">
          {SECTIONS[index].button}
        </span>

        <button
          onClick={next}
          disabled={index === SECTIONS.length - 1}
          className="px-3 py-1 rounded-full bg-black/30 disabled:opacity-30"
        >
          →
        </button>
      </div>

      {/* ===== CONTENT ===== */}
      <div className="flex-1 overflow-hidden px-4 pb-28">
        <div className="h-full overflow-y-auto rounded-2xl bg-yellow-star p-4">
          <h2 className="text-lg font-bold mb-4 text-center">
            {SECTIONS[index].title}
          </h2>

          <div className="whitespace-pre-line text-[15.5px] leading-relaxed">
            {SECTIONS[index].text}
          </div>
        </div>
      </div>

      {/* ===== UPLOAD CTA ===== */}
      <Link
        href="/upload"
        className="fixed bottom-4 right-4 z-50"
      >
        <Image
          src="/upload-cell-v2.png"
          alt="Upload your cancer"
          width={64}
          height={64}
          className="
            drop-shadow-[0_4px_0_rgba(0,0,0,0.35)]
            active:scale-[0.95]
          "
        />
      </Link>
    </div>
  );
}
