import RoomManagementShell from "../components/room-management-shell";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import LiveVideoManager from "./live-video-manager";

export default async function LiveVideoManagementPage(){const session=await auth();if(!session?.user)redirect("/");return <RoomManagementShell title="Live Video Management"><LiveVideoManager/></RoomManagementShell>}
