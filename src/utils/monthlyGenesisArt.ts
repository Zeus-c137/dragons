import eggOne from "@/src/assets/eggs/1egg.svg";
import eggFour from "@/src/assets/eggs/4egg.svg";
import eggFive from "@/src/assets/eggs/5egg.svg";
import eggSix from "@/src/assets/eggs/6.svg";
import eggSeven from "@/src/assets/eggs/7.svg";
import chickOne from "@/src/assets/chics/1chick.svg";
import chickTwo from "@/src/assets/chics/2chick.svg";
import chickThree from "@/src/assets/chics/3chick.svg";
import chickFour from "@/src/assets/chics/4.svg";
import chickFive from "@/src/assets/chics/5.svg";
import henOne from "@/src/assets/hens/1hen.svg";
import henTwo from "@/src/assets/hens/2hen.svg";
import henThree from "@/src/assets/hens/3hen.svg";
import henFour from "@/src/assets/hens/4.svg";
import henFive from "@/src/assets/hens/5.svg";
import { getPlatformDayParts } from "./runs";

// Artwork rotates by platform calendar month. Each row is one monthly egg,
// chick, and hen set; keep these together when the art collection changes.
const MONTHLY_ART = [
  { egg: eggOne, chick: chickOne, hen: henOne },
  { egg: eggFour, chick: chickTwo, hen: henTwo },
  { egg: eggFive, chick: chickThree, hen: henThree },
  { egg: eggSix, chick: chickFour, hen: henFour },
  { egg: eggSeven, chick: chickFive, hen: henFive },
] as const;

export function getMonthlyGenesisArt(date = new Date()) {
  const { y, m } = getPlatformDayParts(date);
  const monthNumber = y * 12 + m;
  return MONTHLY_ART[((monthNumber % MONTHLY_ART.length) + MONTHLY_ART.length) % MONTHLY_ART.length];
}
