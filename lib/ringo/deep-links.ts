import type {Product,Order} from './data';
export type DeepLink={id:string;productId:string;name:string;source:string;medium:string;campaign:string;destination:'product'|'checkout';language:'en'|'ko';expiresAt:string;status:'active'|'paused';createdAt:string};
export type LinkVisit={id:string;linkId:string;productId:string;at:string;source:string};
export const initialLinks:DeepLink[]=[
{id:'ringo-book-instagram',productId:'p1',name:'Make Good Work · Instagram',source:'instagram',medium:'social',campaign:'creative-start',destination:'product',language:'en',expiresAt:'',status:'active',createdAt:'2026-09-15'},
{id:'ringo-type-newsletter',productId:'p2',name:'Studio kit · Newsletter',source:'newsletter',medium:'email',campaign:'studio-edit',destination:'checkout',language:'en',expiresAt:'',status:'active',createdAt:'2026-09-15'},
{id:'ringo-coast-bio',productId:'p3',name:'Summer presets · Profile',source:'instagram',medium:'social',campaign:'slow-summer',destination:'product',language:'en',expiresAt:'',status:'active',createdAt:'2026-09-15'}
];
export const cleanTag=(v:string)=>v.trim().slice(0,80);
export function linkState(link:DeepLink,now=Date.now()):'active'|'paused'|'expired'{return link.status==='paused'?'paused':link.expiresAt&&Date.parse(link.expiresAt)<=now?'expired':'active'}
export function buildDeepLink(origin:string,product:Product,link:DeepLink):string{
 if(product.id!==link.productId)throw new Error('Product does not match this link');
 if(product.status!=='published')throw new Error('Publish the product before sharing');
 const u=new URL('/p/'+encodeURIComponent(product.slug),origin);
 u.searchParams.set('seller',product.sellerId);u.searchParams.set('dl',link.id);
 u.searchParams.set('utm_source',cleanTag(link.source)||'direct');u.searchParams.set('utm_medium',cleanTag(link.medium)||'link');
 if(cleanTag(link.campaign))u.searchParams.set('utm_campaign',cleanTag(link.campaign));
 u.searchParams.set('lang',link.language);
 if(link.destination==='checkout')u.searchParams.set('checkout','1');
 if(link.expiresAt)u.searchParams.set('expires',link.expiresAt);
 return u.toString();
}
export type ResolvedLink={error?:'seller'|'paused'|'expired'|'invalid';linkId?:string;source:string;medium:string;campaign:string;language?:'en'|'ko';checkout:boolean};
export function resolveDeepLink(url:string,product:Product,links:DeepLink[],now=Date.now()):ResolvedLink{
 const q=new URL(url,'https://ringo.invalid').searchParams;
 const base:ResolvedLink={source:cleanTag(q.get('utm_source')||'storefront'),medium:cleanTag(q.get('utm_medium')||''),campaign:cleanTag(q.get('utm_campaign')||''),checkout:q.get('checkout')==='1'};
 const language=q.get('lang');if(language==='en'||language==='ko')base.language=language;
 const seller=q.get('seller');if(seller&&seller!==product.sellerId)return {...base,error:'seller'};
 const id=q.get('dl');if(id){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))return {...base,error:'invalid'};base.linkId=id;const record=links.find(l=>l.id===id);if(record){if(record.productId!==product.id)return {...base,error:'invalid'};const state=linkState(record,now);if(state!=='active')return {...base,error:state};base.source=cleanTag(record.source)||'direct';base.medium=cleanTag(record.medium);base.campaign=cleanTag(record.campaign);base.language=record.language;base.checkout=record.destination==='checkout';}}
 const expires=q.get('expires');if(expires&&(!Number.isFinite(Date.parse(expires))))return {...base,error:'invalid'};
 if(expires&&Date.parse(expires)<=now)return {...base,error:'expired'};
 return base;
}
export function orderTotals(orders:Order[]){const paid=orders.filter(o=>o.status==='paid');const cents=paid.reduce((s,o)=>s+Math.round(o.amount*100),0);const fee=Math.round(cents*.1);return {paid:paid.length,gross:cents/100,fee:fee/100,net:(cents-fee)/100};}
export function csvCell(value:unknown){let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
