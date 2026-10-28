import{S as t}from"./chunks/logger-service-363ec0e9.js";window._storageServiceLoaded?console.warn("storage-service already loaded - skipping"):window._storageServiceLoaded=!0,window.invalidatePlaylistCache=()=>{s()};const e="yt_playlist_cache_v1",a="yph_local_playlists",i={list:null,accountList:null,single:new Map};async function o(t){const e=await async function(){const t=await window.getSettings();return-1===t.cacheDuration?1/0:60*t.cacheDuration*1e3}();return e===1/0||Date.now()-t<e}function s(){i.list=null,i.accountList=null,i.single.clear()}"undefined"!=typeof browser&&browser.storage.local.get(e).then(t=>{const a=t[e];a&&(a.list&&Array.isArray(a.list.data)&&(i.list=a.list),a.accountList&&Array.isArray(a.accountList.data)&&(i.accountList=a.accountList),(i.list||i.accountList)&&console.log("Cache restored from persistent storage"))}).catch(()=>{});const n="yph_video_metadata_cache",l="yph_meta_cache_migrated_v2";"undefined"!=typeof browser&&(async()=>{try{if((await browser.storage.local.get(l))[l])return;const t=(await browser.storage.local.get(n))[n]||{},e=Object.entries(t);if(0===e.length)return void await browser.storage.local.set({[l]:!0});console.log(`[STORAGE] Migrating ${e.length} legacy metadata entries to IndexedDB...`);const{dbPutMetadataBatch:a}=await import("./chunks/db-service-57716ce0.js").then(function(t){return t.k}),i={};for(const[t,a]of e)a&&"object"==typeof a&&(i[t]=a);Object.keys(i).length>0&&await a(i),await browser.storage.local.set({[l]:!0}),console.log(`[STORAGE] Metadata cache migration complete: ${Object.keys(i).length} entries migrated.`)}catch(t){console.warn("[STORAGE] Metadata cache migration failed:",t)}})(),window.getLocalPlaylists=async()=>{if("undefined"==typeof browser)return[];try{return(await browser.storage.local.get(a))[a]||[]}catch(e){return await t.error("StorageService","getLocalPlaylists",{error:e}),[]}};const r=window.getLocalPlaylists;let localPlaylistSaveQueue=Promise.resolve();
async function d(t){
  if("undefined"==typeof browser)return t.id;

  // Serialize local-playlist writes.  The editor can trigger saves from more
  // than one UI action (for example Lock + an already pending Save). Without
  // a queue, two calls can both read the same old storage state and then one
  // can recreate the playlist under a new id.
  const run=async()=>{
    const e=await r();
    const n=(t.title||"").trim();
    const l=n.toLocaleLowerCase();
    const requestedId=t.id;
    let i=requestedId;

    const byId=i?e.find(e=>e.id===i):null;
    const requestedIsLocal=!!t.isLocal || !!byId?.isLocal || (typeof i==="string"&&i.startsWith("local-"));

    // Local playlist titles must be unique. An existing playlist may be
    // updated only when the saved id belongs to that same playlist. Never
    // merge, replace, or delete another playlist merely because its title
    // matches: doing so could silently destroy its videos.
    const sameTitle=n?e.filter(e=>e.isLocal&&((e.title||"").trim().toLocaleLowerCase()===l)):[];
    let conflictingTitle=sameTitle.find(e=>e.id!==requestedId);

    // An already-saved local playlist can occasionally reach savePlaylist with
    // a stale/empty id after an import or another editor action. If there is
    // exactly one local playlist with the same title and the incoming object
    // is explicitly marked saved, treat it as an update to that playlist
    // instead of trying to create a duplicate. Truly new playlists (saved !==
    // true) still cannot use an existing title.
    if(conflictingTitle && !byId && t.saved===true && sameTitle.length===1){
      i=conflictingTitle.id;
      conflictingTitle=null;
    }

    if(conflictingTitle){
      throw new Error(`Lokalna playlista o nazwie "${n}" już istnieje.`);
    }

    if(requestedIsLocal){
      if(byId && (byId.isLocal || (typeof i==="string"&&i.startsWith("local-")))){
        // Normal update of the currently edited local playlist.
      }
    }

    if(!i || i==="new"){
      let candidate;
      do{
        const random=typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
        candidate=`local-${Date.now()}-${random}`;
      }while(e.some(e=>e.id===candidate));
      i=candidate;
    }

    const o={...t,id:i,title:n||t.title,saved:!0,isLocal:!0};
    // Keep every other playlist intact. At this point a matching title can
    // only belong to the playlist currently being edited, because conflicts
    // were rejected above.
    const cleaned=e.slice();
    const s=cleaned.findIndex(e=>e.id===i);
    if(s>=0)cleaned[s]=o;else cleaned.push(o);
    await browser.storage.local.set({[a]:cleaned});
    return i;
  };

  const result=localPlaylistSaveQueue.then(run,run);
  localPlaylistSaveQueue=result.catch(()=>{});
  return result;
}
async function c(t){if("undefined"==typeof browser)return;const e=(await r()).filter(e=>e.id!==t);await browser.storage.local.set({[a]:e})}window.ensureWatchLaterPlaylist=async(t=!1)=>{let e=(await window.getSettings()).watchLaterPlaylistId;const i=await window.isSignedIn(),o=async()=>{console.log("Recreating local favorite playlist 'Obejrzyj potem 🕓'...");const t=await d({id:"",title:"Obejrzyj potem 🕓",videos:[],timestamp:Date.now()});return await window.storeObject("watchLaterPlaylistId",t),v(),{id:t,recreated:!0}};if(i){if(e&&e.startsWith("local-")){if(-1!==(await r()).findIndex(t=>t.id===e))return{id:e,recreated:!1}}if(e&&!e.startsWith("local-"))try{if(await window.ytGetPlaylist(e))return{id:e,recreated:!1}}catch(t){console.warn("Favorite YouTube playlist not found, recreating...",t)}return await(async()=>{try{const t=(await window.getAccountPlaylists()).find(t=>"Watch Later [YPH]"===t.title||"Watch Later"===t.title);if(t)return console.log(`[STORAGE] Linking existing YouTube playlist "${t.title}" as favorite`),await window.storeObject("watchLaterPlaylistId",t.id),v(),{id:t.id,recreated:!1};console.log("[STORAGE] Creating new YouTube playlist 'Watch Later [YPH]' as favorite...");const e=await window.ytCreatePlaylist("Watch Later [YPH]","private");return await window.storeObject("watchLaterPlaylistId",e),v(),{id:e,recreated:!0}}catch(t){return console.error("[STORAGE] Failed to auto-configure YouTube favorite, falling back to local:",t),await o()}})()}if(e&&e.startsWith("local-")){const i=await r(),o=i.findIndex(t=>t.id===e);if(-1!==o)return t&&"Obejrzyj potem 🕓"!==i[o].title?(i[o].title="Obejrzyj potem 🕓",await browser.storage.local.set({[a]:i}),v(),{id:e,recreated:!0}):{id:e,recreated:!1}}return await o()};const w="yph_sync_snapshots";window._saveToLocalStorage=async t=>{if((t.isLocal||t.id.startsWith("local-"))&&"undefined"!=typeof browser){const e=a,i=(await browser.storage.local.get(e))[e]||[],o=i.findIndex(e=>e.id===t.id);o>=0?i[o]=t:i.push(t),await browser.storage.local.set({[e]:i})}i.single.set(t.id,{data:t,ts:Date.now()}),i.list=null},window.saveSyncSnapshot=async(t,e)=>{if("undefined"==typeof browser)return;const a=(await browser.storage.local.get(w))[w]||{};a[t]=e,await browser.storage.local.set({[w]:a})},window.getSyncSnapshot=async t=>{if("undefined"==typeof browser)return[];return((await browser.storage.local.get(w))[w]||{})[t]||[]};let u=!1;async function pruneRemovedArchiveVideos(previousVideos, nextVideos){
  try{
    const prev=new Set((previousVideos||[]).map(v=>typeof v==="string"?v:v?.videoId).filter(Boolean));
    const next=new Set((nextVideos||[]).map(v=>typeof v==="string"?v:v?.videoId).filter(Boolean));
    const removed=[...prev].filter(id=>!next.has(id));
    if(removed.length&&window.thumbnailArchive?.pruneVideosIfUnreferenced) await window.thumbnailArchive.pruneVideosIfUnreferenced(removed);
  }catch(e){console.warn("[STORAGE] Archive cleanup failed:",e)}
}
window.savePlaylist=async(e,a={})=>{var o,s;await t.info("StorageService","savePlaylist start",{playlistId:e.id,syncOption:a.syncToYoutube,hasResumeState:!!a.resumeFromState});let r=a.resumeFromState||null;const previousVideos=(i.single.get(e.id)?.data?.videos)||((e.id?.startsWith("local-")?(await window.getLocalPlaylists()).find(t=>t.id===e.id)?.videos:[])||[]);const n=await window.isSignedIn(),l=!1!==a.syncToYoutube&&n;if(l&&u)throw new Error("A synchronization is already in progress. Please wait.");l&&(u=!0);try{if(console.log("[STORAGE] savePlaylist triggered:",{id:e.id,syncOption:a.syncToYoutube,signedIn:n,shouldSync:l,resumeState:null==r?void 0:r.remotePlaylistId}),l){const t=await window.getSettings();if(e.isLocal||r){let a,n;r&&r.remotePlaylistId?(a=r.remotePlaylistId,n=r.remainingVideoIds,console.log(`[STORAGE] Resuming sync for playlist ${a}, ${n.length} videos remaining`)):(a=await window.ytCreatePlaylist(e.title,t.defaultPrivacy),n=e.videos,r=await window.initializeSyncState(e.id,e.title,e.videos,t.defaultPrivacy,a));const l=[];for(let i=0;i<n.length;i++){const d=n[i];try{await window.ytAddVideo(a,d),l.push(d),r&&await window.updateSyncProgress(e.id,[d])}catch(a){const i=a instanceof Error?a.message:String(a);if(i.toLowerCase().includes("quota")||i.toLowerCase().includes("ratelimitexceeded")){r&&(r.error=i,await window.saveSyncState(r));const a=await window.getSyncState(e.id),n=(null===(o=null==a?void 0:a.syncedVideoIds)||void 0===o?void 0:o.length)||l.length,d=(null==a?void 0:a.totalVideos)||e.videos.length,c=(null===(s=null==a?void 0:a.remainingVideoIds)||void 0===s?void 0:s.length)||d-n;"undefined"!=typeof browser&&browser.alarms&&t.autoRetryEnabled&&await window.scheduleAutoRetry(e.id);const w="undefined"!=typeof browser&&browser.alarms&&t.autoRetryEnabled?" Auto-retry scheduled for 24h.":"";throw new Error(`API quota exceeded (${n}/${d} videos synced). ${c} videos remaining. Progress saved - click Sync to resume.${w}`)}throw a}}r&&await window.clearSyncState(e.id);const d={...e,id:a,saved:!0,isLocal:!1,isTagged:!0};i.single.set(a,{data:d,ts:Date.now()}),await pruneRemovedArchiveVideos(previousVideos,e.videos),v(),window.dispatchEvent(new Event("update-saved-playlists"));return a}const a=e.id;await window.ytUpdatePlaylist(a,e.title);const n=await window.ytGetPlaylistItems(a),l=n.map(t=>t.videoId),d=n.filter(t=>!e.videos.includes(t.videoId));for(const t of d)await window.ytRemoveItem(t.itemId);const c=e.videos.filter(t=>!l.includes(t));for(const t of c){const i=e.videos.indexOf(t);await window.ytAddVideo(a,t,i)}const w=await window.ytGetPlaylistItems(a);for(let t=0;t<e.videos.length;t++){const i=e.videos[t],o=w[t];if(!o||o.videoId!==i){const e=w.findIndex(t=>t.videoId===i);if(-1!==e){const i=w[e];await window.ytMoveItem(i.itemId,a,i.videoId,t);const[o]=w.splice(e,1);w.splice(t,0,o)}}}const u={...e,saved:!0,isTagged:!0};i.single.set(a,{data:u,ts:Date.now()}),await pruneRemovedArchiveVideos(previousVideos,e.videos),v(),window.dispatchEvent(new Event("update-saved-playlists"));return a}{const t=await d(e),a={...e,id:t,saved:!0,isLocal:!0};i.single.set(t,{data:a,ts:Date.now()}),await pruneRemovedArchiveVideos(previousVideos,e.videos),v(),window.dispatchEvent(new Event("update-saved-playlists"));return t}}finally{l&&(u=!1),await t.info("StorageService","savePlaylist end",{playlistId:e.id,result:l?"synced":"local"})}},window.importPlaylists=async e=>{const a=(await window.getSettings()).watchLaterPlaylistId;let i=null;if(a&&a.startsWith("local-")){const t=(await r()).find(t=>t.id===a);t&&(i=t.title)}for(const t of e)if(t.metadata&&"object"==typeof t.metadata&&Object.values(t.metadata).forEach(m=>{m&&m.isRestricted&&(m.isPrivate=!0)}),t.thumbnails&&window.thumbnailArchive?.importThumbnails&&await window.thumbnailArchive.importThumbnails(t.thumbnails,t.metadata).catch(()=>0),await d({id:"",title:t.title,videos:t.videos,timestamp:t.timestamp||Date.now(),saved:!1}),t.metadata&&window.videoService){const e={};for(const[a,i]of Object.entries(t.metadata))i&&(i.title||i.durationISO||i.durationSeconds||i.isPrivate||i.isDeleted||i.isBroken)&&(e[a]=i);Object.keys(e).length>0&&await window.videoService.cacheMetadata(e);try{const un=Object.entries(t.metadata).filter(([,m])=>m&&m.isUnavailable).map(([id])=>id);un.length&&window.yphMarkUnavail&&await window.yphMarkUnavail(un);if(t.overrides&&"object"==typeof t.overrides&&window.yphSetOverride&&window.yphGetOverrides){const cur=await window.yphGetOverrides();for(const[id,o]of Object.entries(t.overrides))!cur[id]&&o&&await window.yphSetOverride(id,o)}}catch(err){console.warn("[IMPORT] Failed to restore unavailable/override flags",err)}}if(v(),a&&a.startsWith("local-")&&i){const e=await r();if(!e.some(t=>t.id===a)){const o=e.find(t=>t.title===i);o&&(await window.storeObject("watchLaterPlaylistId",o.id),v(),await t.info("StorageService","importPlaylists relinked favorite",{oldId:a,newId:o.id,title:i}))}}await window.isSignedIn()&&e.length>0&&window.success(`Imported ${e.length} playlist(s) locally. Open a playlist and click "Sync to YouTube" to upload to your account.`)},window.removePlaylist=async e=>{await t.info("StorageService","removePlaylist start",{playlistId:e.id});const n=e.videos||[];e.id.startsWith("local-")||e.isLocal?await c(e.id):e.saved&&await window.ytDeletePlaylist(e.id);v();try{window.thumbnailArchive?.pruneVideosIfUnreferenced&&await window.thumbnailArchive.pruneVideosIfUnreferenced(n)}catch(t){}window.dispatchEvent(new Event("update-saved-playlists")),await t.info("StorageService","removePlaylist end",{playlistId:e.id})},window.removePlaylists=async e=>{await t.info("StorageService","removePlaylists start",{count:e.length});const n=e.flatMap(t=>t.videos||[]);for(const t of e)t.id.startsWith("local-")||t.isLocal?await c(t.id):t.saved&&(await window.ytDeletePlaylist(t.id),await new Promise(t=>setTimeout(t,150)));v();try{window.thumbnailArchive?.pruneVideosIfUnreferenced&&await window.thumbnailArchive.pruneVideosIfUnreferenced(n)}catch(t){}window.dispatchEvent(new Event("update-saved-playlists")),await t.info("StorageService","removePlaylists batch end",{count:e.length})},window.removeSavedPlaylists=async()=>{if("undefined"!=typeof browser&&await browser.storage.local.remove(a),await window.isSignedIn()){const t=await window.ytListPlaylists();for(const e of t)await window.ytDeletePlaylist(e.id)}v()},window.getPlaylists=async()=>{await t.info("StorageService","getPlaylists start");const e=await r();if(!await window.isSignedIn())return e;if(i.list&&await o(i.list.ts)){const t=i.list.data.filter(t=>!t.id.startsWith("local-"));return[...e,...t]}const a=await window.ytListPlaylists(),s=await Promise.all(a.map(async t=>{const e=i.single.get(t.id);if(e&&e.data&&await o(e.ts))return e.data;const a=await window.ytGetPlaylistItems(t.id),s={id:t.id,title:t.title,videos:a.map(t=>t.videoId),timestamp:t.timestamp,saved:!0,isTagged:t.isTagged};return i.single.set(t.id,{data:s,ts:Date.now()}),s})),n=[...e,...s];return i.list={data:n,ts:Date.now()},h(),await t.info("StorageService","getPlaylists end",{total:n.length}),n},window.getPlaylist=async e=>{if(await t.info("StorageService","getPlaylist start",{id:e}),typeof e==="string"&&e.startsWith("local-")){return(await r()).find(t=>t.id===e)||null}const localPlaylists=await r();const localMatch=localPlaylists.find(t=>t.id===e&&t.isLocal);if(localMatch)return localMatch;const a=i.single.get(e);if(a&&await o(a.ts))return a.data;if(!await window.isSignedIn())return null;const s=await window.ytGetPlaylist(e);if(!s)return i.single.set(e,{data:null,ts:Date.now()}),null;const n=await window.ytGetPlaylistItems("WL"!==s.id?e:s.id),l={id:"WL"!==s.id?e:s.id,title:s.title,videos:n.map(t=>t.videoId),timestamp:s.timestamp,saved:!0,isTagged:s.isTagged};return i.single.set(e,{data:l,ts:Date.now()}),await t.info("StorageService","getPlaylist end",{id:e,found:!!l}),l},window.getAccountPlaylists=async()=>{var a;await t.info("StorageService","getAccountPlaylists start"),await window.ensureWatchLaterPlaylist();const s=await window.getSettings(),n=(await r()).map(t=>({id:t.id,title:t.title,timestamp:t.timestamp,videoCount:t.videos.length,isTagged:!1,isLocal:!0,thumbnailUrl:t.videos[0]?window.videoService.getVideoThumbnailUrl(t.videos[0]):void 0}));if(!await window.isSignedIn())return n;if(!await async function(t){return t.enableAccountPlaylists||t.enableLikedVideos||t.enableUploadedVideos||t.enableSubscriptions||t.enableActivities||t.enableSearch||t.enableComments||t.enableWatchLater}(s))return await t.info("StorageService","getAccountPlaylists",{message:"No YouTube features enabled, returning only local playlists"}),n;if(i.accountList&&await o(i.accountList.ts)){const t=i.accountList.data.filter(t=>!t.id.startsWith("local-"));return[...n,...t]}try{const e=[];if(s.enableAccountPlaylists){const t=await window.ytListAllPlaylists();e.push(...t)}else{const t=await window.ytListPlaylists();for(const a of t)e.push({...a,videoCount:0,isTagged:!0,thumbnailUrl:void 0})}if(s.watchLaterPlaylistId&&!String(s.watchLaterPlaylistId).startsWith("local-")){if(!e.some(t=>t.id===s.watchLaterPlaylistId)){console.log(`Favorite playlist ${s.watchLaterPlaylistId} missing from bulk list, fetching directly...`);try{const t=await window.ytGetPlaylist(s.watchLaterPlaylistId);t&&e.push({...t,videoCount:0,isTagged:!0,thumbnailUrl:void 0})}catch(t){console.warn("Failed to fetch favorite playlist directly",t)}}}try{if(s.enableLikedVideos){await window.ytGetLikedVideosPlaylistId()&&e.push({id:"LIKED",title:"Liked Videos",timestamp:Date.now(),videoCount:0,isTagged:!1,thumbnailUrl:void 0})}if(s.enableUploadedVideos){await window.ytGetUploadedVideosPlaylistId()&&e.push({id:"UPLOADS",title:"Uploaded Videos",timestamp:Date.now(),videoCount:0,isTagged:!1,thumbnailUrl:void 0})}if(s.enableWatchLater){e.some(t=>"WL"===t.id)||e.push({id:"WL",title:"Watch Later",timestamp:Date.now(),videoCount:0,isTagged:!1,thumbnailUrl:void 0})}}catch(t){console.warn("Failed to fetch virtual playlist IDs",t)}const a=[...n,...e];return i.accountList={data:a,ts:Date.now()},h(),await t.info("StorageService","getAccountPlaylists end",{total:a.length}),a}catch(t){if(console.warn("API call failed, returning cached playlists if available",t),i.accountList){const t=i.accountList.data.filter(t=>!t.id.startsWith("local-"));return[...n,...t]}if("undefined"!=typeof browser){const t=null===(a=(await browser.storage.local.get(e))[e])||void 0===a?void 0:a.accountList;if(t){i.accountList=t;const e=t.data.filter(t=>!t.id.startsWith("local-"));return[...n,...e]}}throw t}},window.getAccountSubscriptions=async()=>await window.isSignedIn()?window.ytListSubscriptions():[],window.getAccountActivities=async(t=20)=>await window.isSignedIn()?window.ytListActivities(t):[],window.getAccountComments=async(t=20)=>await window.isSignedIn()?window.ytListComments(t):[],window.youtubeSearch=async(t,e=20)=>await window.isSignedIn()?window.ytSearch(t,e):[],window.adoptPlaylist=async e=>{await t.info("StorageService","adoptPlaylist start",{ytId:e});const a=await window.ytGetPlaylist(e);if(!a)throw new Error("Playlist not found");await window.ytUpdatePlaylist(e,a.title),v(),await t.info("StorageService","adoptPlaylist end",{ytId:e})};let y=null,g=null;function f(){y=null}function h(){if("undefined"==typeof browser)return;const t={};i.list&&(t.list=i.list),i.accountList&&(t.accountList=i.accountList),Object.keys(t).length>0&&browser.storage.local.set({[e]:t}).catch(()=>{})}function v(){s(),h(),"undefined"!=typeof browser&&browser.runtime.sendMessage({cmd:"update-saved-playlists"}).catch(()=>{})}"undefined"!=typeof browser?(window.fetchObject=async(t,e)=>{if(y&&void 0!==y[t])return y[t];let a=await browser.storage.sync.get(t);return a&&null!=a[t]?"number"==typeof e?+a[t]:a[t]:(a=await browser.storage.local.get(t),a&&null!=a[t]?"number"==typeof e?+a[t]:a[t]:e)},window.fetchAllObjects=async()=>{const t=await browser.storage.sync.get(void 0);return{...await browser.storage.local.get(void 0),...t}},window.storeObject=async(t,e)=>{y=null;const a={};a[t]=e;try{return await browser.storage.sync.set(a)}catch(t){return console.warn("[STORAGE] sync.set failed, falling back to local:",t),await browser.storage.local.set(a)}},window.removeObject=async t=>{y=null;try{await browser.storage.sync.remove(t)}catch(t){console.warn("[STORAGE] sync.remove failed, falling back to local:",t)}await browser.storage.local.remove(t)}):window.location.protocol.startsWith("http")&&(window.fetchObject=async(t,e)=>{const a=localStorage.getItem(t);if(null!==a)try{const t=JSON.parse(a);return"number"==typeof e?+t:t}catch(t){return a}return e},window.fetchAllObjects=async()=>({...localStorage}),window.storeObject=async(t,e)=>{y=null,localStorage.setItem(t,"string"==typeof e?e:JSON.stringify(e))},window.removeObject=async t=>{y=null,localStorage.removeItem(t)}),window.generatePlaylistId=async()=>{const e=typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);return`local-${Date.now()}-${e}`},window.generatePlaylistIds=async t=>{const e=Date.now(),a=[];for(let i=0;i<t;i++){const s=typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);a.push(`local-${e+i}-${s}`)}return a},window.getSettings=async()=>y?{...y}:(g||(g=(async()=>{const t={openPlaylistEditorAfterCreation:!0,openPlaylistPage:!1,closeAddedTabs:!1,disableThumbnails:!1,openPlaylistBuilderAfterAdd:!1,openSavedPlaylistAfterAdd:!1,defaultEditorPage:"/saved",saveCreatedPlaylists:!1,disableContextBuilder:!1,disableContextSaved:!1,themeChoice:"dark",defaultPageSize:100,cacheDuration:-1,watchLaterPlaylistId:null,maxLogLines:500,defaultPrivacy:"private",autoRemoveDuplicates:!1,autoDeleteEmptyPlaylists:!1,addToLatestPosition:"top",defaultQuickAddTarget:"manual",defaultTabScope:"all-this-window-include",manageSortBy:"manual",deleteAfterMerge:!0,ruleEnabled:!0,ruleTrackPause:!0,ruleTrackUnload:!0,ruleAutoDelete:!1,ruleCompletionThreshold:99,ruleHistoryRetentionDays:30,ruleHistoryThrottleMs:5e3,ruleHistoryDebounceMs:1e3,ruleTrackDuringPlayback:!1,playAllChunkEnabled:!1,playAllChunkSize:50,enableLikedVideos:!1,enableUploadedVideos:!1,enableSubscriptions:!1,enableActivities:!1,enableSearch:!1,enableComments:!1,enableAccountPlaylists:!1,enableWatchLater:!1,enableOpenById:!1,enableMyChannel:!1,autoSaveEditor:!1,autoSaveInterval:2,autoRetryEnabled:!1,autoFetchMetadata:!1,metadataExecutionStrategy:"free_first",enableInnertubeScraping:!0,enableEmbedScraping:!0,enableOEmbedScraping:!0,enableInvidiousPiped:!0,customInvidiousInstances:"",customPipedInstances:""};if("undefined"==typeof browser||!browser.storage){if("undefined"!=typeof localStorage){const e={};for(const a of Object.keys(t)){const t=localStorage.getItem(a);if(null!==t)try{e[a]=JSON.parse(t)}catch{e[a]=t}}return y={...t,...e},{...y}}return y={...t},{...y}}try{const[e,a]=await Promise.all([browser.storage.sync.get(void 0).catch(()=>({})),browser.storage.local.get(void 0).catch(()=>({}))]),i={...t,...a,...e};return await async function(t){if("undefined"==typeof browser)return;"saved"===t.createdPlaylistStorage&&(t.saveCreatedPlaylists=!0,await browser.storage.sync.set({saveCreatedPlaylists:t.saveCreatedPlaylists}));"/recent"===t.defaultEditorPage&&(t.defaultEditorPage="/saved",await browser.storage.sync.set({defaultEditorPage:t.defaultEditorPage}))}(i),y=i,{...i}}catch(e){return console.warn("[STORAGE] Failed to fetch settings in batch, returning defaults:",e),y={...t},{...y}}finally{g=null}})()),await g),window.invalidateCacheAndNotify=()=>{v()},"undefined"!=typeof window&&window.addEventListener("yt-auth-changed",async()=>{try{console.log("[STORAGE] Auth change detected, ensuring favorite Watch Later playlist is updated..."),await window.ensureWatchLaterPlaylist()}catch(t){console.error("[STORAGE] Failed to ensure Watch Later playlist on auth change:",t)}});
// ---------------------------------------------------------------------------
// Shared playlist ordering. Used by BOTH the left sidebar and the "Zarządzaj"
// (Manage) screen so that they always show playlists in the same order.
//   mode "manual" (default): playlists that are not in the saved manual order
//     (i.e. newly created ones) go to the TOP, newest first, with the favorite
//     playlist first among them; playlists in the saved order follow.
//   other modes mirror the sort options of the Manage screen.
// ---------------------------------------------------------------------------
window.yphOrderPlaylists=(playlists,opts={})=>{
  const mode=opts.mode||"manual";
  const order=Array.isArray(opts.order)?opts.order:[];
  const favId=opts.favId||null;
  const list=[...playlists];
  const createdAt=p=>{
    const m=typeof p.id==="string"?p.id.match(/^local-(\d+)-/):null;
    return m?Number(m[1]):Number(p.timestamp)||0;
  };
  const count=p=>Number(p.videoCount!=null?p.videoCount:(p.videos?p.videos.length:0))||0;
  switch(mode){
    case"newest":return list.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
    case"oldest":return list.sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
    case"title_asc":return list.sort((a,b)=>(a.title||"").localeCompare(b.title||""));
    case"title_desc":return list.sort((a,b)=>(b.title||"").localeCompare(a.title||""));
    case"count_desc":return list.sort((a,b)=>count(b)-count(a));
  }
  const positions=new Map(order.map((id,index)=>[id,index]));
  const fresh=[],ordered=[];
  for(const p of list)(positions.has(p.id)?ordered:fresh).push(p);
  fresh.sort((a,b)=>{
    if(favId){
      if(a.id===favId&&b.id!==favId)return-1;
      if(b.id===favId&&a.id!==favId)return 1;
    }
    return createdAt(b)-createdAt(a);
  });
  ordered.sort((a,b)=>positions.get(a.id)-positions.get(b.id));
  return[...fresh,...ordered];
};
export{f as invalidateSettingsCache};

// ---------------------------------------------------------------------------
// Built-in "Watch later" playlist.
// Stored under its OWN key, so it never appears in getLocalPlaylists /
// getPlaylists / getAccountPlaylists (Wszystkie, Zarządzaj, popup lists,
// merge, export...). It cannot be deleted or renamed and is never synced to
// YouTube. The favorite/quick-add target always resolves to this playlist.
// ---------------------------------------------------------------------------
(()=>{
  const NP_ID="local-na-potem", NP_KEY="yph_na_potem", NP_TITLE="Watch later";
  window.NA_POTEM_ID=NP_ID;
  let memo=null; // fallback when extension storage is unavailable
  const hasStore=()=>"undefined"!=typeof browser&&browser.storage&&browser.storage.local;
  const normalize=(r)=>({
    ...(r||{}),
    id:NP_ID,
    title:NP_TITLE,
    videos:Array.isArray(r?.videos)?r.videos:[],
    timestamp:r?.timestamp||Date.now(),
    saved:true,isLocal:true,isTagged:false,isBuiltIn:true
  });
  async function npGet(){
    if(!hasStore())return normalize(memo);
    const rec=(await browser.storage.local.get(NP_KEY))[NP_KEY];
    if(!rec){
      // One-time, non-destructive carry-over of the videos from the previous
      // local favorite playlist (the old playlist itself is left untouched).
      let carried=null;
      try{
        const oldId=await window.fetchObject("watchLaterPlaylistId");
        if(typeof oldId==="string"&&oldId.startsWith("local-")&&oldId!==NP_ID){
          const old=(await r()).find(p=>p.id===oldId);
          if(old&&Array.isArray(old.videos))carried={videos:old.videos.slice(),timestamp:old.timestamp};
        }
      }catch{}
      const n=normalize(carried);
      await browser.storage.local.set({[NP_KEY]:n});
      return n;
    }
    return normalize(rec);
  }
  async function npSave(pl){
    const prev=await npGet();
    const n=normalize({...prev,videos:pl.videos||[],timestamp:pl.timestamp||Date.now()});
    if(hasStore())await browser.storage.local.set({[NP_KEY]:n});else memo=n;
    try{await pruneRemovedArchiveVideos(prev.videos,n.videos)}catch{}
    v();
    window.dispatchEvent(new Event("update-saved-playlists"));
    return NP_ID;
  }

  window.ensureWatchLaterPlaylist=async()=>{await npGet();return{id:NP_ID,recreated:false}};

  const _getPlaylist=window.getPlaylist;
  window.getPlaylist=async id=>id===NP_ID?await npGet():_getPlaylist(id);

  const _savePlaylist=window.savePlaylist;
  window.savePlaylist=async(e,a)=>e&&e.id===NP_ID?await npSave(e):_savePlaylist(e,a);

  const _removePlaylist=window.removePlaylist;
  window.removePlaylist=async e=>{if(e&&e.id===NP_ID)return;return _removePlaylist(e)};
  const _removePlaylists=window.removePlaylists;
  window.removePlaylists=async e=>_removePlaylists((e||[]).filter(x=>x&&x.id!==NP_ID));

  // The favorite target is always the built-in playlist.
  const _getSettings=window.getSettings;
  window.getSettings=async()=>({...(await _getSettings()),watchLaterPlaylistId:NP_ID});
})();
