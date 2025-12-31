"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { supabase } from "@/lib/db/client";

type Submission = {
  id: number;
  image_url: string;
  owner_hash: string;
  vote_count: number;
};

export default function VoteGrid({
  submissions,
  hasVoted,
  currentOwnerHash,
}: {
  submissions: Submission[];
  hasVoted: boolean;
  currentOwnerHash: string;
}) {
  const [hasVotedLocal, setHasVotedLocal] = useState(hasVoted);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<number | null>(null);
  const [confirmVote, setConfirmVote] = useState(false);

  // local counter for realtime / optimistic updates
  const [activeVoteCount, setActiveVoteCount] = useState<number>(0);

  const activeSubmission = activeSubmissionId
    ? submissions.find((s) => s.id === activeSubmissionId)
    : null;

  const isOwnSubmission =
    !!activeSubmission && activeSubmission.owner_hash === currentOwnerHash;

  // server truth first, realtime adds on top
  const displayedVoteCount =
  (activeSubmission?.vote_count ?? 0) + activeVoteCount;

  /* Lock body scroll when modal is open */
  useEffect(() => {
    document.body.style.overflow = activeImage ? "hidden" : "auto";
    setConfirmVote(false);

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [activeImage]);

  /* ESC closes modal */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveImage(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* 🔴 REALTIME: listen for new votes while modal is open */
  useEffect(() => {
  if (!activeSubmissionId) return;

  const channel = supabase
    .channel(`votes-${activeSubmissionId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "votes",
        filter: `submission_id=eq.${activeSubmissionId}`,
      },
      () => {
        setActiveVoteCount((v) => v + 1);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [activeSubmissionId]);

  return (
    <div className="min-h-screen bg-orange-background p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-center mb-6">
        Vote for your favorite
      </h1>

      {submissions.length === 0 && (
        <p className="text-center text-lg opacity-70">
          No submissions yet.
        </p>
      )}

      {/* GRID */}
      <div
        className="
          grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6
          lg:grid-cols-8 xl:grid-cols-10 gap-2
        "
      >
        {submissions.map((s) => (
          <div
            key={s.id}
            onClick={() => {
              setActiveImage(s.image_url);
              setActiveSubmissionId(s.id);
              setActiveVoteCount(0); // reset realtime delta
              setConfirmVote(false);
            }}
            className="
              relative aspect-square overflow-hidden rounded-lg
              bg-neutral-200 cursor-pointer
              transition-transform md:hover:scale-[1.03]
            "
          >
            <Image
              src={s.image_url}
              alt="Submission"
              fill
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {/* MODAL */}
      {activeImage && (
        <div
          className="
            fixed inset-0 z-50 bg-black/80
            flex items-center justify-center p-4
          "
          onClick={() => setActiveImage(null)}
        >
          <div
            className="
              relative max-w-5xl w-full h-[90vh]
              flex flex-col bg-black rounded-lg
            "
            onClick={(e) => e.stopPropagation()}
          >
            {/* CLOSE */}
            <button
              onClick={() => setActiveImage(null)}
              className="
                absolute top-3 right-3 z-10
                text-white text-3xl
                bg-black/50 hover:bg-black/70
                rounded-full w-10 h-10
                flex items-center justify-center
              "
              aria-label="Close"
            >
              ✕
            </button>

            {/* IMAGE */}
            <div className="relative flex-1 p-4 overflow-y-auto">
              <Image
                src={activeImage}
                alt="Selected submission"
                width={1200}
                height={1200}
                className="object-contain w-full h-full rounded-lg"
              />

              <div
                className="
                  absolute bottom-6 right-6
                  bg-black/70 text-white text-sm
                  px-4 py-2 rounded-full
                  backdrop-blur pointer-events-none
                "
              >
                {displayedVoteCount} vote
                {displayedVoteCount !== 1 && "s"}
              </div>
            </div>

            {/* ACTION */}
            <div className="border-t border-white/10 p-4 flex justify-center bg-black">
              <button
                disabled={hasVotedLocal || isOwnSubmission}
                onClick={
                  hasVotedLocal || isOwnSubmission
                    ? undefined
                    : async () => {
                        if (!confirmVote) {
                          setConfirmVote(true);
                          return;
                        }

                        if (!activeSubmissionId) return;

                        const res = await fetch("/api/vote", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            submissionId: activeSubmissionId,
                          }),
                        });

                        if (!res.ok) {
                          alert("Vote failed");
                          return;
                        }

                        setHasVotedLocal(true);
                        setConfirmVote(false);
                        setActiveImage(null);
                        setActiveSubmissionId(null);
                      }
                }
                className={`
                  px-6 py-3 text-base sm:text-lg font-semibold
                  rounded-full transition
                  ${
                    hasVotedLocal || isOwnSubmission
                      ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                      : confirmVote
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-orange-500 hover:bg-orange-600 text-white"
                  }
                `}
              >
                {hasVotedLocal
                  ? "You have already voted"
                  : isOwnSubmission
                  ? "You can’t vote for your own submission"
                  : confirmVote
                  ? "Confirm vote"
                  : "Vote for this image"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
