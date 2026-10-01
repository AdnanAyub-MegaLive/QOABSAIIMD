import { portalPermissionError } from "@/lib/portal-admin";
import { auth } from "../../../../../../../../auth";
import { prisma } from "../../../../../../../lib/prisma";

export async function GET(_request,{params}) {
  const permissionDenied = await portalPermissionError("agencies.view");
  if (permissionDenied) return permissionDenied;

  const session=await auth();
  if(!session?.user)return Response.json({success:false,error:{code:"UNAUTHORIZED",message:"Administrator authentication is required."}},{status:401});
  const {applicationId,side}=await params;
  if(side!=="front"&&side!=="back")return Response.json({success:false,error:{code:"INVALID_SIDE",message:"CNIC side must be front or back."}},{status:404});
  const application=await prisma.agencyApplication.findUnique({
    where:{publicId:applicationId},
    select:{cnicFrontData:true,cnicFrontMime:true,cnicBackData:true,cnicBackMime:true},
  });
  if(!application)return Response.json({success:false,error:{code:"APPLICATION_NOT_FOUND",message:"Agency application not found."}},{status:404});
  const data=side==="front"?application.cnicFrontData:application.cnicBackData;
  const mime=side==="front"?application.cnicFrontMime:application.cnicBackMime;
  if(!data||!mime)return Response.json({success:false,error:{code:"DOCUMENT_NOT_PROVIDED",message:"This application does not include that identity document."}},{status:404});
  return new Response(data,{headers:{"Content-Type":mime,"Content-Length":String(data.byteLength),"Content-Disposition":`inline; filename="${applicationId}-cnic-${side}.${mime==="image/png"?"png":"jpg"}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
