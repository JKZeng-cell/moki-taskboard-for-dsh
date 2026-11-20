window.__ModuleLoader__.load({
  id:"dsh-moki-taskboard",
  factory(require) {
    const React=require("react"),h=React.createElement;
    const id="moki-taskboard";
    function Icon() {
      return h("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":true},
        h("path",{d:"M4 6h16M4 12h8m-8 6h5m3-3 3 3 5-7"}));
    }
    return { inject:["slots","uiWorkspace","locale"],apply(ctx) {
      const language=()=>ctx.locale.getSnapshot().active;
      const subscribe=fn=>ctx.locale.subscribe(fn);
      const label=(zh,en)=>/^zh(?:[-_]|$)/i.test(language())?zh:en;
      const title=()=>label("MOKI任务台 for DSH","MOKI Taskboard for DSH");
      function Panel() {
        React.useSyncExternalStore(subscribe,language);
        const frame=React.useRef(null),previewFrame=React.useRef(null);
        const [{tabs,active},setFiles]=React.useState({tabs:[],active:""});
        const selected=tabs.find(file=>file.path===active);
        const closePreview=()=>{
          setFiles(state=>{
            const index=state.tabs.findIndex(file=>file.path===state.active);
            const next=state.tabs.filter(file=>file.path!==state.active);
            return {tabs:next,active:next[Math.min(index,next.length-1)]?.path??""};
          });
          if(tabs.length===1)frame.current?.focus();
        };
        const [url,setUrl]=React.useState(""),[error,setError]=React.useState(""),[attempt,retry]=React.useReducer(x=>x+1,0);
        React.useEffect(()=>{
          let current=true;
          fetch("/moki-taskboard/open?parent="+encodeURIComponent(location.origin),{headers:{"x-moki-taskboard":"1"},cache:"no-store"})
            .then(async r=>{if(!r.ok) throw Error(label("DSH 未能打开任务台","DSH could not open Taskboard")+" ("+r.status+")");return r.json();})
            .then(v=>{if(current)setUrl(v.url);}).catch(e=>{if(current)setError(e.message);});
          return ()=>{current=false;};
        },[attempt]);
        React.useLayoutEffect(()=>{
          if (!url) return;
          const origin=new URL(url).origin;
          const send=(target,message)=>target?.postMessage({jsonrpc:"2.0",...message},origin);
          const query=matchMedia("(prefers-color-scheme: dark)");
          const theme=()=>{
            const el=document.documentElement;
            const style=getComputedStyle(el).colorScheme;
            return {locale:language(),theme:document.body.hasAttribute("data-ds-dark-theme") || el.dataset.colorScheme==="dark" ||
              style==="dark" || (style!=="light" && !el.dataset.colorScheme && query.matches) ? "dark":"light"};
          };
          const changed=()=>{for(const ref of [frame,previewFrame])send(ref.current?.contentWindow,{method:"ui/notifications/host-context-changed",params:theme()});};
          const observer=new MutationObserver(changed);
          for(const el of [document.documentElement,document.body]) observer.observe(el,{attributes:true,attributeFilter:["class","style","data-color-scheme","data-ds-dark-theme"]});
          query.addEventListener("change",changed);
          const unsubscribe=subscribe(changed);
          const onMessage=async event=>{
            if(event.origin!==origin || event.data?.jsonrpc!=="2.0")return;
            if(event.source!==frame.current?.contentWindow &&
              (event.source!==previewFrame.current?.contentWindow || event.data.method!=="ui/initialize"))return;
            const {id:rid,method,params}=event.data;
            const replyTarget=event.source;
            if(!Number.isSafeInteger(rid)) return;
            try {
              let result={};
              if(method==="ui/initialize") result={hostContext:theme(),hostCapabilities:{experimental:{"openai/files":{}}}};
              else if(method==="ui/open-link") {
                const dest=new URL(params.url);
                if (dest.protocol==="dsh:" && dest.hostname==="sessions" && /^\/[\w-][\w.:-]{0,199}$/.test(dest.pathname))
                  ctx.uiWorkspace.openSession(dest.pathname.slice(1));
                else if(["https:","http:","mailto:"].includes(dest.protocol)) window.open(dest.href,"_blank","noopener,noreferrer");
                else throw Error(label("不支持此链接。","Unsupported link."));
              } else if(method==="openai/files/open") {
                const path=String(params.path).replaceAll("\\","/");
                if(!/^(?:[a-z]:\/|\/)/i.test(path)) throw Error(label("文件路径无效。","Invalid file path."));
                const ticket=params.previewTicket;
                if(typeof ticket!=="string" || !/^[0-9a-f-]{36}$/.test(ticket))throw Error(label("文件预览已失效，请重新打开文件。","The preview expired. Reopen the file."));
                const file={ticket,path,name:path.split("/").pop()||path};
                setFiles(state=>{
                  const tabs=state.tabs.some(item=>item.path===path)?state.tabs.map(item=>item.path===path?file:item):[...state.tabs,file];
                  return {tabs,active:path};
                });
              } else throw Error(label("DSH 不支持此操作。","DSH does not support this action."));
              replyTarget?.postMessage({jsonrpc:"2.0",id:rid,result},origin);
            } catch(e) {send(replyTarget,{id:rid,error:{message:e.message}});}
          };
          window.addEventListener("message",onMessage);
          return ()=>{unsubscribe();window.removeEventListener("message",onMessage);observer.disconnect();query.removeEventListener("change",changed);};
        },[url]);
        if(error) return h("div",{role:"alert"},error," ",h("button",{onClick:()=>{setError("");retry();}},label("重试","Retry")));
        if(!url) return h("div",{role:"status"},label("正在打开任务台…","Opening Taskboard…"));
        return h("div",{className:"moki-dsh-workspace"},
          h("style",null,`
            .moki-dsh-workspace{display:flex;position:relative;flex:1 1 0;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;container-type:inline-size}
            .moki-dsh-workspace iframe{display:block;border:0;min-width:0;min-height:0}
            .moki-dsh-main{flex:1 1 0;width:0;height:100%}
            .moki-dsh-preview{box-sizing:border-box;min-width:0;display:flex;flex-direction:column;width:clamp(280px,40%,760px);height:100%;border-inline-start:1px solid color-mix(in srgb,currentColor 15%,transparent);color:inherit;background:var(--dsw-alias-bg-base,Canvas)}
            .moki-dsh-preview header{display:flex;align-items:center;gap:6px;min-height:38px;padding:3px 7px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
            .moki-dsh-preview [role=tablist]{display:flex;flex:1;gap:3px;min-width:0;overflow:auto;scrollbar-width:thin}
            .moki-dsh-preview button{border:0;border-radius:5px;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:4px 7px}
            .moki-dsh-preview [role=tab]{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;font-size:12px}
            .moki-dsh-preview button:hover,.moki-dsh-preview [aria-selected=true]{background:color-mix(in srgb,currentColor 10%,transparent)}
            .moki-dsh-preview iframe{width:100%;flex:1}
            @container(max-width:680px){.moki-dsh-preview{position:absolute;inset:0 0 0 auto;width:min(90%,440px);z-index:2;box-shadow:-4px 0 18px #0002}}
          `),
          h("iframe",{key:"board",className:"moki-dsh-main",ref:frame,src:url,title:title(),referrerPolicy:"no-referrer",sandbox:"allow-scripts allow-same-origin allow-forms allow-modals"}),
          selected&&h("aside",{className:"moki-dsh-preview","aria-label":label("文件预览工作区","File preview workspace")},
            h("header",null,h("div",{role:"tablist","aria-label":label("已打开文件","Open files")},tabs.map(file=>h("button",{type:"button",role:"tab",key:file.path,title:file.name,
              "aria-selected":file.path===active,onClick:()=>setFiles(state=>({...state,active:file.path}))},file.name))),
              h("button",{type:"button","aria-label":label("关闭当前预览","Close preview"),title:label("关闭当前预览","Close preview"),onClick:closePreview},"×")),
            h("iframe",{key:selected.ticket,ref:previewFrame,src:url+"#preview="+selected.ticket,title:label("文件预览：","File preview: ")+selected.name,
              referrerPolicy:"no-referrer",sandbox:"allow-scripts allow-same-origin"})));
      }
      ctx.slots.inject("sidebar.panellist",()=>ctx.slots.register({name:"sidebar.panellist",id,order:18,label:title},Icon));
      ctx.slots.inject("main",()=>ctx.slots.register({name:"main",key:id},Panel));
    }};
  }
});

