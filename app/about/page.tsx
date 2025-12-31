import DesktopAbout from "../components/about/DesktopAbout";
import MobileAbout from "../components/about/MobileAbout";

export default function AboutPage() {
  return (
    <>
      <div className="hidden md:block">
        <DesktopAbout />
      </div>

      <div className="block md:hidden">
        <MobileAbout />
      </div>
    </>
  );
}
