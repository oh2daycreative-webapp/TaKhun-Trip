"use strict";
(function createAdminReviews(global){
  const ROLE_ACTIONS=Object.freeze({super_admin:["approve","hide","reply","clearReply","delete"],editor:["approve","hide","reply","clearReply"],reviewer:["approve","hide"],viewer:[]});
  const API_METHODS=Object.freeze({approve:"approveReview",hide:"hideReview",reply:"replyReview",clearReply:"clearReviewReply",delete:"deleteReview"});
  const UNCERTAIN=Object.freeze(["OUTCOME_UNKNOWN","NETWORK_ERROR","TIMEOUT","HTTP_ERROR","MALFORMED_RESPONSE","REDIRECT_BOUNCE"]);
  function permissions(role){return (ROLE_ACTIONS[role]||[]).slice();}
  function codedError(code){const error=new Error(code.toLowerCase());error.code=code;return error;}
  function forbidden(){return codedError("FORBIDDEN");}
  function createController(token,role,api,view){
    let listGeneration=0,detailGeneration=0,selected=null,pendingMutation=null,blocked=false;
    const drafts=Object.create(null);
    const allowed=permissions(role);
    async function loadList(filters={}){const generation=++listGeneration;try{const result=await api.getReviews(token,filters);if(generation!==listGeneration)return null;view.list(result);return result;}catch(error){if(generation===listGeneration)view.status(error&&error.code||"SERVER_ERROR",true);throw error;}}
    function draftFor(reviewId,serverValue){if(!drafts[reviewId])drafts[reviewId]={value:String(serverValue||""),dirty:false};return drafts[reviewId];}
    function render(focus){if(!selected)return;const draft=draftFor(selected.review_id,selected.admin_reply);view.detail(selected,draft.value,{actions:allowed.slice(),blocked,pending:!!pendingMutation,focus:!!focus});}
    async function loadDetail(reviewId,options={}){
      if(pendingMutation)throw codedError("CONTENT_LOCK");
      const prior=selected&&selected.review_id;
      if(prior&&prior!==reviewId&&draftFor(prior,selected.admin_reply).dirty&&!options.discardDraft)throw codedError("UNSAVED_DRAFT");
      if(prior&&prior!==reviewId&&options.discardDraft)delete drafts[prior];
      const generation=++detailGeneration;
      try{
        const result=await api.getReviewDetail(token,{review_id:reviewId});
        if(generation!==detailGeneration)return null;
        const changed=!selected||selected.review_id!==reviewId;
        selected=result;
        blocked=false;
        const draft=draftFor(reviewId,result.admin_reply);
        if(!draft.dirty)draft.value=result.admin_reply;
        render(changed);
        return result;
      }catch(error){if(generation===detailGeneration)view.status(error&&error.code||"SERVER_ERROR",true);throw error;}
    }
    function setReplyDraft(value){if(!selected)return;const draft=draftFor(selected.review_id,selected.admin_reply);draft.value=String(value);draft.dirty=true;}
    function mutate(action,options={}){
      if(pendingMutation)return pendingMutation;
      if(blocked||!selected||!allowed.includes(action))return Promise.reject(forbidden());
      const method=API_METHODS[action];if(!method||typeof api[method]!=="function")return Promise.reject(forbidden());
      const target=selected,draft=draftFor(target.review_id,target.admin_reply),payload={review_id:target.review_id,expected_revision:target.revision};
      if(action==="delete"&&draft.dirty&&!options.discardDraft)return Promise.reject(codedError("UNSAVED_DRAFT"));
      if(action==="reply")payload.admin_reply=draft.value;
      let request;try{request=api[method](token,payload);}catch(error){request=Promise.reject(error);}
      pendingMutation=Promise.resolve(request).then(result=>{
        const preserveDraft=draft.dirty&&(action==="approve"||action==="hide");
        selected=result;blocked=false;drafts[result.review_id]=preserveDraft?{value:draft.value,dirty:true}:{value:result.admin_reply,dirty:false};
        view.status(result.audit_status==="unconfirmed"?"AUDIT_UNCONFIRMED":"SUCCESS",false);return result;
      },error=>{if(error&&(["CONFLICT"].concat(UNCERTAIN)).includes(error.code))blocked=true;view.status(error&&error.code||"SERVER_ERROR",true);throw error;}).finally(()=>{pendingMutation=null;render(false);});
      render(false);
      return pendingMutation;
    }
    function state(){const draft=selected?draftFor(selected.review_id,selected.admin_reply):{value:"",dirty:false};return{selected,replyDraft:draft.value,draftDirty:draft.dirty,blocked,pending:!!pendingMutation};}
    return Object.freeze({loadList,loadDetail,setReplyDraft,mutate,state});
  }
  // F-22: show timestamps as Thai local date/time ("yyyy-MM-dd HH:mm:ss" = Bangkok wall time; ISO = UTC instant).
  function thaiDateTime(value){if(value===undefined||value===null||value==="")return "-";const text=String(value);const local=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);const date=local?new Date(Date.UTC(+local[1],+local[2]-1,+local[3],+local[4]-7,+local[5],+local[6])):new Date(text);if(Number.isNaN(date.getTime()))return text;try{return new Intl.DateTimeFormat("th-TH",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Bangkok"}).format(date);}catch(_error){return text;}}
  function node(tag,text,className){const item=global.document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;}
  function safeMessage(code){return({LOADING:"กำลังโหลดข้อมูล",LOADED:"โหลดข้อมูลแล้ว",SUCCESS:"บันทึกสำเร็จ",AUDIT_UNCONFIRMED:"บันทึกสำเร็จ แต่ยังยืนยันบันทึกการตรวจสอบไม่ได้ กรุณาอย่าส่งซ้ำ",SKIPPED_INVALID_REVIEWS:"ข้ามรีวิวที่มีข้อมูลไม่สมบูรณ์หรือรหัสซ้ำอย่างปลอดภัย",UNAUTHORIZED:"กรุณาเข้าสู่ระบบอีกครั้ง",FORBIDDEN:"บัญชีนี้ไม่มีสิทธิ์ทำรายการ",VALIDATION_ERROR:"ข้อมูลไม่ถูกต้อง",NOT_FOUND:"ไม่พบรีวิว",CONFLICT:"รีวิวเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด",CONTENT_LOCK:"ข้อมูลกำลังถูกใช้งาน กรุณาลองใหม่",INVALID_TRANSITION:"ไม่สามารถทำรายการกับสถานะนี้ได้",OUTCOME_UNKNOWN:"ยังยืนยันผลไม่ได้ กรุณาโหลดข้อมูลเพื่อตรวจสอบและอย่าส่งซ้ำ",REDIRECT_BOUNCE:"ไม่แน่ใจผลการบันทึก กรุณาตรวจสอบรายการก่อนทำซ้ำ"})[code]||"ไม่สามารถทำรายการได้ในขณะนี้";}
  function initDom(token,role){
    const root=global.document.querySelector("[data-admin-reviews]");if(!root)return null;
    const e={filters:root.querySelector("[data-review-filters]"),status:root.querySelector("[data-review-status]"),list:root.querySelector("[data-review-list]"),detail:root.querySelector("[data-review-detail]"),currentReply:root.querySelector("[data-review-current-reply]"),replyEditor:root.querySelector("[data-review-reply-editor]"),reply:root.querySelector("[data-review-reply]"),actions:root.querySelector("[data-review-actions]"),back:root.querySelector("[data-review-back]"),prev:root.querySelector("[data-review-prev]"),next:root.querySelector("[data-review-next]"),page:root.querySelector("[data-review-page]")};
    let page=1,totalPages=0,lastListReviewId=null;
    const view={
      status(code,error){e.status.textContent=safeMessage(code);e.status.setAttribute("role",error?"alert":"status");},
      list(result){
        e.list.replaceChildren();totalPages=result.total_pages;page=result.page;e.page.textContent=`หน้า ${page} จาก ${totalPages||1}`;e.prev.disabled=page<=1;e.next.disabled=page>=totalPages;
        result.items.forEach(item=>{const button=node("button",`${item.rating} ดาว · ${item.reviewer_name} · ${item.status}\n${item.comment}`,"admin-review-card");button.type="button";button.setAttribute("data-review-id",item.review_id);button.addEventListener("click",()=>{const state=controller.state(),options={};if(state.selected&&state.selected.review_id!==item.review_id&&state.draftDirty){if(!global.confirm("ละทิ้งคำตอบที่ยังไม่ได้บันทึกหรือไม่?"))return;options.discardDraft=true;}lastListReviewId=item.review_id;controller.loadDetail(item.review_id,options).catch(()=>{});});e.list.appendChild(button);});
        if(!result.items.length)e.list.appendChild(node("p","ไม่พบรีวิว"));
        view.status(result.warning?result.warning.code:"LOADED",false);
      },
      detail(record,draft,options){
        e.detail.hidden=false;const title=e.detail.querySelector("[data-review-detail-title]");title.textContent=`${record.rating} ดาว · ${record.reviewer_name}`;e.detail.querySelector("[data-review-detail-meta]").textContent=`${record.place_id} · ${record.status} · ${thaiDateTime(record.created_at)}`;e.detail.querySelector("[data-review-comment]").textContent=record.comment;e.currentReply.textContent=record.admin_reply||"ยังไม่มีคำตอบ";e.reply.value=draft;e.reply.disabled=!!options.pending;e.actions.replaceChildren();
        const transitions={approve:["pending","hidden"],hide:["pending","approved"],reply:["pending","approved","hidden"],clearReply:["pending","approved","hidden"],delete:["pending","approved","hidden"]};const labels={approve:"อนุมัติ",hide:"ซ่อน",reply:"ตอบกลับ",clearReply:"ล้างคำตอบ",delete:"ลบแบบซอฟต์"};
        options.actions.forEach(action=>{if(!transitions[action].includes(record.status)||action==="clearReply"&&!record.admin_reply)return;const button=node("button",labels[action],action==="delete"?"button button--danger":"button");button.type="button";button.disabled=options.blocked||options.pending;button.addEventListener("click",()=>{const state=controller.state(),mutationOptions={};if(action==="delete"&&state.draftDirty){if(!global.confirm("ลบรีวิวนี้และละทิ้งคำตอบที่ยังไม่ได้บันทึกหรือไม่?"))return;mutationOptions.discardDraft=true;}else if(action==="hide"&&!global.confirm(`${labels[action]}รีวิวนี้หรือไม่?`))return;controller.mutate(action,mutationOptions).catch(()=>{});});e.actions.appendChild(button);});
        e.replyEditor.hidden=!options.actions.includes("reply");if(options.focus&&typeof title.focus==="function")title.focus();
      }
    };
    const controller=createController(token,role,global.TakhunAdminApi,view);
    function filters(){const data=new global.FormData(e.filters);return{keyword:String(data.get("keyword")||"").trim(),status:String(data.get("status")||""),place_id:String(data.get("place_id")||"").trim(),page,page_size:20};}
    function refresh(reset){if(reset)page=1;view.status("LOADING",false);return controller.loadList(filters()).catch(()=>{});}
    e.filters.addEventListener("submit",event=>{event.preventDefault();refresh(true);});e.prev.addEventListener("click",()=>{if(page>1){page--;refresh(false);}});e.next.addEventListener("click",()=>{if(page<totalPages){page++;refresh(false);}});e.reply.addEventListener("input",()=>controller.setReplyDraft(e.reply.value));e.back.addEventListener("click",()=>{e.detail.hidden=true;const reviewId=lastListReviewId;refresh(false).then(()=>{const trigger=reviewId&&e.list.querySelector(`[data-review-id="${reviewId}"]`);if(trigger&&typeof trigger.focus==="function")trigger.focus();});});refresh(true);return controller;
  }
  async function init(){const result=await global.TakhunAdminShell.init();if(!result||result.status!=="authenticated")return null;const session=global.TakhunAdminAuth.readSession();if(!session||!session.token)return null;return initDom(session.token,result.admin&&result.admin.role||session.role);}
  global.TakhunAdminReviews=Object.freeze({permissions,createController,init});
})(window);
