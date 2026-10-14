import { createHash } from "node:crypto";
export const mediaVersion = bytes => bytes == null ? null : createHash("sha256").update(bytes).digest("hex").slice(0,16);
export function versionedUrl(value, version) {
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/.test(version??"")) return value;
  const url=new URL(value,"https://relative.invalid");url.searchParams.set("v",version);
  return value.startsWith("/")?`${url.pathname}${url.search}${url.hash}`:url.toString();
}
export function versionUploadData(data) {
  if(!data)return data;
  const next={...data};
  for(const [field,version] of [["fileData","mediaVersion"],["posterFileData","posterMediaVersion"]]){
    if(Object.hasOwn(data,field)) {
      const raw=data[field];
      const value=raw && !ArrayBuffer.isView(raw) && Object.hasOwn(raw,"set") ? raw.set : raw;
      next[version]=mediaVersion(value);
      // Never redirect newly replaced bytes to the old CDN object.
      next[field==="fileData"?"cdnUrl":"posterCdnUrl"]=null;
    }
  }
  return next;
}
export const mediaVersionExtension={query:{uploadAsset:{async $allOperations({operation,args,query}){
  if(["create","update","updateMany","updateManyAndReturn"].includes(operation))args.data=versionUploadData(args.data);
  if(["createMany","createManyAndReturn"].includes(operation))args.data=Array.isArray(args.data)?args.data.map(versionUploadData):versionUploadData(args.data);
  if(operation==="upsert"){args.create=versionUploadData(args.create);args.update=versionUploadData(args.update);}
  return query(args);
}}}};
