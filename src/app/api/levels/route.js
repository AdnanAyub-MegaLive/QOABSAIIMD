import { progressionRead, progressionOptions } from "@/lib/progression-api";
export const OPTIONS=progressionOptions;
export function GET(request){return progressionRead(request,"levels");}
