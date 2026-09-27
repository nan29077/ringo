/* eslint-disable @typescript-eslint/no-explicit-any */
// Isolated regression scenarios against an in-memory database. No live data or PG/SMTP calls.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, and } from 'drizzle-orm';
import { randomUUID, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as s from '../../db/schema';
import { createOrder, confirmPayment, refundOrder, cancelPendingOrder, expireStaleOrders, failPayment, getOrderForActor, createSettlement, markSettlementPaid, deliverOrder, eligibleSettlementOrders } from '../../lib/server/commerce';
import { testProvider } from '../../lib/server/payments/test-provider';
import { saveProduct } from '../../lib/server/catalog';

Object.assign(process.env, { NODE_ENV: 'production' }); // Suppress logging test email bodies; SMTP is unset in this process.
process.env.PAYMENT_TEST_MODE = 'true';
delete process.env.SMTP_HOST;
const client = new PGlite();
const db = drizzle(client, { schema: s });
await migrate(db, { migrationsFolder: './drizzle' });
const [buyer, sellerUser, admin, stranger] = await db.insert(s.users).values([
  { email:'audit-buyer@example.invalid', name:'Audit Buyer' },
  { email:'audit-seller@example.invalid', name:'Audit Seller', role:'seller' },
  { email:'audit-admin@example.invalid', name:'Audit Admin', role:'admin' },
  { email:'audit-other@example.invalid', name:'Audit Other' },
]).returning();
const [seller] = await db.insert(s.sellers).values({userId:sellerUser.id,slug:'audit',displayName:'Audit',status:'active'}).returning();
await db.insert(s.categories).values([{id:'audit-service', nameEn:'Service', nameKo:'제작', deliveryType:'service'}, {id:'audit-course',nameEn:'Course',nameKo:'강의',deliveryType:'course'}]);
const [product] = await db.insert(s.products).values({sellerId:seller.id,slug:'audit-product',categoryId:'audit-service',deliveryType:'service',titleEn:'Audit',titleKo:'점검',priceCents:10000,status:'published'}).returning();
const bv = {user:buyer,seller:null,sessionId:''};
const av = {user:admin,seller:null,sessionId:''};
const sv = {user:sellerUser,seller,sessionId:''};
const results: unknown[] = [];
function record(name:string, observed:unknown) { const row={name,observed}; results.push(row); console.log(JSON.stringify(row)); }
async function order(couponCode?:string) { return createOrder(db as any,bv,{productId:product.id,brief:'Audit only',idempotencyKey:randomUUID(),couponCode}); }
async function payment(o:any) { const [p]=await db.insert(s.payments).values({orderId:o.id,provider:'test',amountCents:o.totalCents,currency:o.currency}).returning();return p; }
async function state(id:string) { const [o]=await db.select().from(s.orders).where(eq(s.orders.id,id));const ps=await db.select().from(s.payments).where(eq(s.payments.orderId,id));return {order:o.status,payments:ps.map(p=>p.status),entitlements:(await db.select().from(s.entitlements).where(and(eq(s.entitlements.orderId,id),eq(s.entitlements.status,'active')))).length}; }

// Normal purchase and idempotent duplicate confirmation.
const normal=await order(); const np=await payment(normal);
await confirmPayment(db as any,np.id,{}); await confirmPayment(db as any,np.id,{});
record('normal payment + duplicate same payment confirmation',await state(normal.id));
try {await getOrderForActor(db as any,{user:stranger,seller:null,sessionId:''},normal.id);record('unrelated buyer management','UNEXPECTED ALLOWED');} catch(e:any){record('unrelated buyer management',e.code);}

// Natural parallel check-then-insert race, on a one-use coupon.
await db.insert(s.coupons).values({code:'AUDITONE',name:'One use',kind:'percent',value:10,usageLimit:1,perUserLimit:1});
const couponOrders=await Promise.allSettled([order('AUDITONE'),order('AUDITONE')]);
record('one-use coupon concurrent orders',couponOrders.map(x=>x.status==='fulfilled'?{status:x.status,discount:x.value.discountCents}:{status:x.status,error:x.reason.code}));

// Two independent operator requests reach the provider before either local transaction claims the order.
let calls=0;
const originalRefund=testProvider.refund;
testProvider.refund=async()=>{calls++;await Promise.resolve();return {providerRef:'audit-refund-'+calls};};
const rr=await Promise.allSettled([refundOrder(db as any,av,normal.id,'Audit'),refundOrder(db as any,av,normal.id,'Audit')]);
testProvider.refund=originalRefund;
record('concurrent refund', {providerCalls:calls,results:rr.map(x=>x.status==='fulfilled'?'fulfilled':x.reason.code),refundRows:(await db.select().from(s.refunds).where(eq(s.refunds.orderId,normal.id))).length});
await confirmPayment(db as any,np.id,{});
record('duplicate success callback after refund',await state(normal.id));

// A second checkout can succeed after the first paid this order. It must be refunded independently.
const double=await order();const dp1=await payment(double);const dp2=await payment(double);
await confirmPayment(db as any,dp1.id,{});await confirmPayment(db as any,dp2.id,{});
await deliverOrder(db as any,sv,double.id,'Audit deliverable');
await db.update(s.orders).set({paidAt:new Date(Date.now()-30*86400000)}).where(eq(s.orders.id,double.id));
const held=(await eligibleSettlementOrders(db as any,seller.id,new Date())).some(o=>o.id===double.id);
await refundOrder(db as any,av,double.id,'Extra payment');
const afterExtra=await state(double.id);
const released=(await eligibleSettlementOrders(db as any,seller.id,new Date())).some(o=>o.id===double.id);
await refundOrder(db as any,av,double.id,'Original payment');
const dp3=await payment(double);await confirmPayment(db as any,dp3.id,{});
await refundOrder(db as any,av,double.id,'Late payment after refund');
record('multiple successful receipts reconciled separately',{held,released,afterExtra,final:await state(double.id),refundRows:(await db.select().from(s.refunds).where(eq(s.refunds.orderId,double.id))).length});

// Pause after the first SELECT ... WHERE so a legitimate payment completes before the stale write.
function afterFirstWhereSelect(hook:()=>Promise<unknown>) {
  let fired=false;
  return new Proxy(db,{get(target,key){if(key!=='select'){const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}return (...args:any[])=>{
    function wrap(obj:any):any{return new Proxy(obj,{get(t,k){if(k==='where')return (...wa:any[])=>{const query=t.where(...wa);return new Proxy(query,{get(q,k2){if(k2==='then')return (ok:any,bad:any)=>Promise.resolve(q).then(async value=>{if(!fired){fired=true;await hook();}return value;}).then(ok,bad);const v=q[k2];return typeof v==='function'?v.bind(q):v;}});};const v=t[k];return typeof v==='function'?(...a:any[])=>wrap(v.apply(t,a)):v;}});}
    return wrap((target.select as any)(...args));
  };}});
}
const cancel=await order(); const cp=await payment(cancel);
try { await cancelPendingOrder(afterFirstWhereSelect(()=>confirmPayment(db as any,cp.id,{})) as any,bv,cancel.id); } catch (error:any) { assert.equal(error.code,'order_not_cancellable'); }
record('payment arrives between cancel read and write',await state(cancel.id));
const exp=await order();const ep=await payment(exp);
await db.update(s.orders).set({createdAt:new Date(Date.now()-7200000)}).where(eq(s.orders.id,exp.id));
await expireStaleOrders(afterFirstWhereSelect(()=>confirmPayment(db as any,ep.id,{})) as any);
record('payment arrives between expiry read and write',await state(exp.id));
const failed=await order();const fp=await payment(failed);
await confirmPayment(db as any,fp.id,{});
await failPayment(db as any,fp.id,'late failure event');
record('success arrives between failure read and write',await state(failed.id));

const late=await order();const lp=await payment(late);
await cancelPendingOrder(db as any,bv,late.id);await confirmPayment(db as any,lp.id,{});
let lateRefund='';try{await refundOrder(db as any,av,late.id,'Late receipt',{manual:true});lateRefund='accepted';}catch(e:any){lateRefund=e.code;}
record('late successful payment after cancellation',{...await state(late.id),manualRefund:lateRefund});

// Course title alone passes publication's deliverable validation.
const [course]=await db.insert(s.products).values({sellerId:seller.id,slug:'audit-course',categoryId:'audit-course',deliveryType:'course',titleEn:'Course',titleKo:'강의',priceCents:100,status:'published',lessons:[{title:'Lesson',body:'Original material'}]}).returning();
let emptyCourse='accepted';try{await saveProduct(db as any,sv,{titleEn:'Course',titleKo:'강의',categoryId:'audit-course',price:'1',lessons:JSON.stringify([{title:'Empty lesson'}])},{productId:course.id});}catch(error:any){emptyCourse=error.code;}
record('published course edited to title-only lesson',emptyCourse);
const courseA={title:'Lesson A',body:'Content A'},courseB={title:'Lesson B',body:'Content B'};
await db.update(s.products).set({lessons:[courseA,courseB]}).where(eq(s.products.id,course.id));
await db.insert(s.lessonProgress).values({userId:buyer.id,productId:course.id,lessonIndex:0});
const reordered=await saveProduct(db as any,sv,{titleEn:'Course',titleKo:'강의',categoryId:'audit-course',price:'1',lessons:JSON.stringify([courseB,courseA])},{productId:course.id});
const progress=await db.select().from(s.lessonProgress).where(eq(s.lessonProgress.productId,course.id));
record('course reorder preserves wrong completion index',{originalCompletedLesson:'Lesson A',completedAfterReorder:progress.map(x=>reordered.lessons[x.lessonIndex]?.title)});

// Re-run the idempotent data repair on a legacy blank published course and demo lesson JSON.
const [blankCourse]=await db.insert(s.products).values({sellerId:seller.id,slug:'legacy-empty-course',categoryId:'audit-course',deliveryType:'course',titleEn:'Empty',titleKo:'빈 강의',priceCents:100,status:'published',lessons:[{title:'Empty lesson'}]}).returning();
const [legacyDemo]=await db.insert(s.products).values({sellerId:seller.id,slug:'design-your-first-brand',categoryId:'audit-course',deliveryType:'course',titleEn:'Demo',titleKo:'데모',priceCents:100,status:'published',lessons:[{title:'Introduction / 시작하기'},{title:'Research & direction / 리서치와 방향'},{title:'Build the system / 시스템 만들기'},{title:'Launch checklist / 출시 체크리스트'}]}).returning();
for(const statement of readFileSync('drizzle/0004_course_content_repair.sql','utf8').split('--> statement-breakpoint')) await client.exec(statement);
const [[blankAfter],[demoAfter]]=await Promise.all([
  db.select().from(s.products).where(eq(s.products.id,blankCourse.id)),
  db.select().from(s.products).where(eq(s.products.id,legacyDemo.id)),
]);
record('legacy empty course removed from sale',blankAfter.status);
record('legacy demo course notes restored',{status:demoAfter.status,contents:demoAfter.lessons.map(lesson=>!!lesson.body)});

// Normal pending/paid settlement refund accounting.
async function settleable(){const o=await order();const p=await payment(o);await confirmPayment(db as any,p.id,{});await deliverOrder(db as any,sv,o.id,'Audit deliverable');await db.update(s.orders).set({paidAt:new Date(Date.now()-30*86400000)}).where(eq(s.orders.id,o.id));return o;}
const po=await settleable();const pendingBatch=await createSettlement(db as any,av,seller.id,new Date());
await refundOrder(db as any,av,po.id,'Audit pending batch');
const [pb]=await db.select().from(s.settlements).where(eq(s.settlements.id,pendingBatch.id));
record('normal refund of pending settlement',{status:pb.status,orderCount:pb.orderCount,net:pb.netCents});
const so=await settleable();const paidBatch=await createSettlement(db as any,av,seller.id,new Date());
await markSettlementPaid(db as any,av,paidBatch.id,'AUDIT-NO-REAL-TRANSFER');await refundOrder(db as any,av,so.id,'Audit paid batch');
const adjustments=await db.select().from(s.settlements).where(and(eq(s.settlements.status,'pending'),eq(s.settlements.orderCount,0)));
record('normal refund after settlement marked paid',{adjustments:adjustments.map(x=>x.netCents),expected:-so.sellerNetCents});

// Gateway contract is not yet implemented; exercise the current signed webhook mapping without networking.
(globalThis as any).__ringoDb={db};
process.env.PEARPAY_WEBHOOK_SECRET='audit-only-never-deployed';
const wh=await order();const wp=await payment(wh);await db.update(s.payments).set({provider:'nextpay'}).where(eq(s.payments.id,wp.id));
const raw=JSON.stringify({event_id:'audit-event',status:'paid',reference:wp.id,transaction_id:'audit-reference',amount:1,currency:'KRW'});
const {POST}=await import('../../app/api/payments/webhook/[provider]/route');
const response=await POST(new Request('http://audit.invalid/api/payments/webhook/pearpay',{method:'POST',headers:{'x-signature':createHmac('sha256',process.env.PEARPAY_WEBHOOK_SECRET).update(raw).digest('hex')},body:raw}),{params:Promise.resolve({provider:'pearpay'})});
record('signed webhook with different provider amount and currency',{httpStatus:response.status,...await state(wh.id),expectedPayment:{provider:'nextpay',amount:wh.totalCents,currency:wh.currency},received:{provider:'pearpay',amount:1,currency:'KRW'}});
const observed=(name:string)=> (results.find((r:any)=>r.name===name) as any)?.observed;
assert.deepEqual(observed('normal payment + duplicate same payment confirmation'),{order:'paid',payments:['succeeded'],entitlements:1});
assert.equal((observed('one-use coupon concurrent orders') as any[]).filter(x=>x.status==='fulfilled').length,1);
assert.equal(observed('concurrent refund').providerCalls,1);
assert.equal(observed('concurrent refund').refundRows,1);
assert.deepEqual(observed('duplicate success callback after refund'),{order:'refunded',payments:['refunded'],entitlements:0});
assert.equal(observed('multiple successful receipts reconciled separately').held,false);
assert.equal(observed('multiple successful receipts reconciled separately').released,true);
assert.deepEqual(observed('multiple successful receipts reconciled separately').afterExtra,{order:'paid',payments:['succeeded','refunded'],entitlements:1});
assert.deepEqual(observed('multiple successful receipts reconciled separately').final,{order:'refunded',payments:['refunded','refunded','refunded'],entitlements:0});
assert.equal(observed('multiple successful receipts reconciled separately').refundRows,3);
for(const name of ['payment arrives between cancel read and write','payment arrives between expiry read and write','success arrives between failure read and write']) {
  const state=observed(name);
  assert.equal(state.order,'paid');assert.deepEqual(state.payments,['succeeded']);assert.equal(state.entitlements,1);
}
assert.deepEqual(observed('late successful payment after cancellation'),{order:'refunded',payments:['refunded'],entitlements:0,manualRefund:'accepted'});
assert.equal(observed('published course edited to title-only lesson'),'lesson_content_required');
assert.deepEqual(observed('course reorder preserves wrong completion index').completedAfterReorder,['Lesson A']);
assert.equal(observed('legacy empty course removed from sale'),'draft');
assert.deepEqual(observed('legacy demo course notes restored'),{status:'published',contents:[true,true,true,true]});
assert.equal(observed('normal refund of pending settlement').status,'cancelled');
assert.deepEqual(observed('normal refund after settlement marked paid').adjustments,[-so.sellerNetCents]);
assert.equal(observed('signed webhook with different provider amount and currency').httpStatus,503);
console.log(`PASS ${results.length} isolated commerce regression scenarios`);
await client.close();
