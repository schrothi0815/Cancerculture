import Image from "next/image";
import Link from "next/link";
import "./animated-cell.css";

export default function AnimatedCell() {
  return (
    <Link
      href="/"
      aria-label="Go to homepage"
      className="animated-cell-link"
    >
      <div className="animated-cell">
        <Image
          src="/fame/fame-v1.png"
          alt="Cell mascot"
          width={64}
          height={64}
          className="cell-frame frame-1"
          priority
        />
        <Image
          src="/fame/fame-v2.png"
          alt="Cell mascot"
          width={64}
          height={64}
          className="cell-frame frame-2"
        />
        <Image
          src="/fame/fame-v3.png"
          alt="Cell mascot"
          width={64}
          height={64}
          className="cell-frame frame-3"
        />
      </div>
    </Link>
  );
}
