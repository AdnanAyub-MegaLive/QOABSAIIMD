import { GET as listResellers, OPTIONS } from "@/app/api/v1/wallet/resellers/route";
import { resellerDirectoryResponse } from "@/lib/reseller-directory-response";
export { OPTIONS };
export async function GET(request) { return resellerDirectoryResponse(await listResellers(request), "agents"); }
