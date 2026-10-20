import {postSocialRequest} from "@/lib/post-social-api";
import {mobileOptions} from "@/lib/mobile-api";
export function OPTIONS(){return mobileOptions();}
export function POST(request,{params}){return postSocialRequest(request,params,"comment-like");}
export function DELETE(request,{params}){return postSocialRequest(request,params,"comment-unlike");}
