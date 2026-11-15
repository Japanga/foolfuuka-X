const KEY="ghostFilterHiddenPosts";
const KEYWORDS_KEY="ghostFilterKeywords";
const USERNAMES_KEY="ghostFilterUsernames";
const count=document.getElementById("count");
const status=document.getElementById("status");
const editor=document.getElementById("keywords");
const usernamesEditor=document.getElementById("usernames");
function refresh(){
  chrome.storage.local.get({[KEY]:[],[KEYWORDS_KEY]:[],[USERNAMES_KEY]:[]},d=>{
    count.textContent=(d[KEY]||[]).length;
    editor.value=(d[KEYWORDS_KEY]||[]).join("\n");
    usernamesEditor.value=(d[USERNAMES_KEY]||[]).join("\n");
  });
}
function saveList(editor,key,label){
  const entries=[...new Set(editor.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean))];
  chrome.storage.local.set({[key]:entries},()=>{
    editor.value=entries.join("\n");
    status.textContent=`Saved ${entries.length} ${label}${entries.length===1?"":"s"}. Refresh or revisit the archive to scan existing posts.`;
  });
}
document.getElementById("save-keywords").addEventListener("click",()=>saveList(editor,KEYWORDS_KEY,"keyword"));
document.getElementById("save-usernames").addEventListener("click",()=>saveList(usernamesEditor,USERNAMES_KEY,"username"));
document.getElementById("clear").addEventListener("click",()=>{
  chrome.storage.local.set({[KEY]:[]},()=>{
    status.textContent="Manual hidden-post list cleared. Refresh the archive tab to restore posts.";
    refresh();
  });
});
refresh();
