/* Figma 1897:4. Artwork is local; names, portraits and chase gaps are live. */
window.WeeklyStarDesign=(()=>{
const $=id=>document.getElementById(id),n=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const art=(file,cls)=>{const e=n('img',cls);e.src=`assets/${file}.png`;e.alt='';return e;};
function render(entries,h){
$('hero').replaceChildren();$('entries').replaceChildren();
const hall=n('section','weekly-hall');hall.append(art('f5da2','hall-ring'),art('c781d','hall-banner'),art('d61c0','hall-title'));const first=entries.find(e=>e.rank===1);if(first){const face=h.image(first.person?.profileImage,'hall-portrait',true);hall.prepend(face);}else hall.append(n('span','hall-empty','Be the next Weekly Star'));
$('hero').append(hall);const podium=n('div','weekly-podium');
for(const rank of [1,2,3]){const e=entries.find(e=>e.rank===rank),card=n('article',`weekly-card weekly-place-${rank}`);card.append(art('32391','weekly-base'),art('47dd6','weekly-plinth'));if(rank===1)card.append(art('b1825','weekly-top-frame'));const portrait=h.image(e?.person?.profileImage,'weekly-portrait',true);card.append(portrait);if(rank!==1)card.append(n('span','weekly-place',`TOP ${rank}`));card.append(n('strong','weekly-name',e?.name||'Awaiting a star'));if(e)card.append(h.gap(e));podium.append(card);}
$('hero').append(podium);
for(const e of entries.filter(e=>e.rank>3)){const row=n('article','row');row.append(n('span','rank',e.rank),h.rowAvatar(e.person),n('span','entry-name',e.name),h.gap(e));$('entries').append(row);}
$('weekly-banner').onclick=()=>$('rules-dialog').showModal();
}
function gifts(items){$('weekly-gifts').replaceChildren();for(const item of items){const slot=n('div','weekly-gift');const url=item.mimeType?.startsWith('image/')?item.url:item.posterUrl;if(url){const im=n('img','');im.src=url;im.alt=item.name;slot.append(im);}slot.append(n('span','',item.name));$('weekly-gifts').append(slot);}if(!items.length)$('weekly-gifts').append(n('p','','No Weekly Star gifts configured for this week.'));}
return {render,gifts};})();
