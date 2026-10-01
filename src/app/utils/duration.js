export function formatDurationMinutes(totalMinutes){
  const value=Number(totalMinutes);
  if(!Number.isFinite(value)||value<=0)return "";
  const whole=Math.floor(value);
  const units=[[518400,"year"],[43200,"month"],[1440,"day"],[60,"hour"],[1,"minute"]];
  let remaining=whole;
  const parts=[];
  for(const [size,label] of units){
    const count=Math.floor(remaining/size);
    if(count){parts.push(`${count} ${label}${count===1?"":"s"}`);remaining%=size;}
  }
  return parts.join(" ");
}

export function durationCalculation(totalMinutes){
  const value=Number(totalMinutes);
  if(!Number.isFinite(value)||value<=0)return "Enter a duration to see its calculated time.";
  return `${Math.floor(value).toLocaleString()} minutes = ${formatDurationMinutes(value)}`;
}
