"use client";

import { useEffect, useState } from "react";
import DesktopAbout from "../components/about/DesktopAbout";
import MobileAbout from "../components/about/MobileAbout";
import AboutReading from "../components/about/AboutReading";

export default function AboutPage() {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const update = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (width < 768) return <MobileAbout />;
  if (height < 1000) return <AboutReading />;
  return <DesktopAbout />;
}
