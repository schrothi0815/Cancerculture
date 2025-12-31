import Image from "next/image";

export default function WallCard({
  winner,
  onClose,
}: {
  winner: any;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full h-[90vh] bg-black rounded-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white text-3xl"
        >
          ✕
        </button>

        <div className="flex-1 p-4">
          <Image
            src={winner.image_url}
            alt="Winner"
            width={1200}
            height={1200}
            className="object-contain w-full h-full rounded-lg"
          />
        </div>

        <div className="border-t border-white/10 p-4 text-white text-sm sm:text-base">
          <p>
  <strong>Votes:</strong>{" "}
  {winner.vote_count ?? 0}
</p>
          <p>
            <strong>Donation:</strong>{" "}
            {winner.donation_percentage}%{" "}
            {winner.donation_target && `→ ${winner.donation_target}`}
          </p>
          <p>
            <strong>Wallet:</strong> {winner.wallet_address}
          </p>
          {winner.x_username && (
            <p>
              <strong>X:</strong> @{winner.x_username}
            </p>
            
          )}
        </div>
      </div>
    </div>
  );
}
