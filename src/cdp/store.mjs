/**
 * Data Store Access — reads all notes from _cwStore.__CW__allNotes
 * This bypasses the SproutCore view hierarchy (swap path) entirely.
 *
 * Key discovery: every note object has a .store (= ._cwStore) property
 * that points to the central CloudKit data store. That store has:
 *   - __CW__allNotes: Array of ALL notes (across all folders + trash)
 *   - __CW__allFolders: Array of all folder records
 *   - _allNotesSet: Set with .size for quick count
 *
 * To get folder info for each note: note.get('_Folder') returns the folder record.
 * Trash folder recordName is "TrashFolder-CloudKit".
 */

/**
 * Click a folder in the sidebar to trigger data loading, then grab the store.
 * We only need ONE folder click to get the store reference — after that,
 * __CW__allNotes has everything.
 */
export const CLICK_FOLDER_JS = `(function() {
  var candidates = ['所有 iCloud 备忘录', '备忘录'];
  var t = null;
  for (var ci = 0; ci < candidates.length; ci++) {
    t = Array.from(document.querySelectorAll('.folder-title'))
      .find(function(el) { return (el.textContent||'').trim() === candidates[ci]; });
    if (t) break;
  }
  if (!t) return 'NOT_FOUND';
  var row = t.closest('.folder-list-item-container,[role="treeitem"]') || t.parentElement;
  var btn = row.querySelector('button.folder-title-select-button') || row.querySelector('button') || t;
  var r = btn.getBoundingClientRect();
  var opts = {bubbles:true,cancelable:true,view:window,clientX:r.left+r.width/2,clientY:r.top+r.height/2};
  btn.dispatchEvent(new MouseEvent('mousedown', opts));
  btn.dispatchEvent(new MouseEvent('mouseup', opts));
  btn.dispatchEvent(new MouseEvent('click', opts));
  return 'CLICKED';
})()`;

/**
 * Wait for the view-layer array to stabilize (needed to get store reference).
 * Returns the array length once 2 consecutive reads match.
 */
export const CHECK_ARRAY_STABLE_JS = `(function() {
  var swap = NotesApp.rootResponder._previousViewAncestorsSwap || [];
  for (var si = 0; si < swap.length; si++) {
    var vc = swap[si] ? swap[si].viewController : null;
    if (!vc) continue;
    var refs = [vc.__CW__filteredSortedNotes];
    var nlvc = vc.__CW__noteListViewController;
    if (nlvc) { refs.push(nlvc.__CW__filteredSortedNotes); var nlcvc = nlvc._noteListContentViewController; if (nlcvc) refs.push(nlcvc.__CW__filteredSortedNotes); }
    for (var ri = 0; ri < refs.length; ri++) {
      var ref = refs[ri];
      if (!ref || !ref.path || !ref.rootObject) continue;
      try {
        var col = String(ref.path).split(".").reduce(function(o,p){return o&&o[p]}, ref.rootObject);
        var arr = col && col.items && col.items._array;
        if (arr && arr.length > 0) return arr.length;
      } catch(e) {}
    }
  }
  return 0;
})()`;

/**
 * Once the view array is loaded, grab the store from the first note
 * and return info about __CW__allNotes and __CW__allFolders.
 */
export const GRAB_STORE_JS = `(function() {
  var store = null;
  // Find any loaded note to get its store
  var swap = NotesApp.rootResponder._previousViewAncestorsSwap || [];
  for (var si = 0; si < swap.length && !store; si++) {
    var vc = swap[si] ? swap[si].viewController : null;
    if (!vc) continue;
    var refs = [vc.__CW__filteredSortedNotes];
    var nlvc = vc.__CW__noteListViewController;
    if (nlvc) { refs.push(nlvc.__CW__filteredSortedNotes); var nlcvc = nlvc._noteListContentViewController; if (nlcvc) refs.push(nlcvc.__CW__filteredSortedNotes); }
    for (var ri = 0; ri < refs.length; ri++) {
      var ref = refs[ri];
      if (!ref || !ref.path || !ref.rootObject) continue;
      try {
        var col = String(ref.path).split(".").reduce(function(o,p){return o&&o[p]}, ref.rootObject);
        if (col && col.items && col.items._array && col.items._array[0]) {
          store = col.items._array[0].store;
          break;
        }
      } catch(e) {}
    }
  }
  if (!store) {
    try {
      var v = NotesApp.rootResponder && NotesApp.rootResponder._previousPointerMoveView;
      var n = v && v.viewController && v.viewController.lastNoteCheckedForInitialScroll;
      if (n && n._cwStore && n._cwStore.__CW__allNotes) store = n._cwStore;
      else if (n && n.store && n.store.__CW__allNotes) store = n.store;
    } catch(e) {}
  }  if (!store) return JSON.stringify({error: 'no store found — folder not loaded yet'});

  // Cache store globally for subsequent calls
  window.__noteStore = store;

  var allNotes = store.__CW__allNotes;
  var allFolders = store.__CW__allFolders;
  return JSON.stringify({
    allNotesCount: allNotes ? allNotes.length : 0,
    allFoldersCount: allFolders ? allFolders.length : 0,
    allNotesSetSize: store._allNotesSet ? store._allNotesSet.size : -1
  });
})()`;

/**
 * Get all notes from the cached store, grouped by folder.
 * Filters out trash (TrashFolder-CloudKit).
 * Returns array of {recordName, title, folderRN, isLocked, isPinnedByUser, index}.
 */
export const GET_ALL_NOTES_JS = `(function() {
  var store = window.__noteStore;
  if (!store) return JSON.stringify({error: 'store not cached'});
  var allNotes = store.__CW__allNotes;
  if (!allNotes || allNotes.length === 0) return JSON.stringify({error: 'allNotes empty'});

  function readField(obj, keys) {
    for (var ki = 0; ki < keys.length; ki++) {
      var key = keys[ki];
      try {
        var direct = obj[key];
        if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim();
      } catch(e) {}
      try {
        if (obj.get) {
          var got = obj.get(key);
          if (got !== undefined && got !== null && String(got).trim()) return String(got).trim();
        }
      } catch(e) {}
    }
    return '';
  }

  var folderMap = {};
  var allFolders = store.__CW__allFolders || [];
  for (var fi = 0; fi < allFolders.length; fi++) {
    var folder = allFolders[fi];
    if (!folder) continue;
    var rn = String(folder.recordName || '');
    if (!rn) continue;
    var name = readField(folder, ['Title', 'Name', 'name', 'displayName', 'localizedTitle']);
    folderMap[rn] = name || rn;
  }
  folderMap['DefaultFolder-CloudKit'] = folderMap['DefaultFolder-CloudKit'] || '备忘录';
  folderMap['TrashFolder-CloudKit'] = folderMap['TrashFolder-CloudKit'] || '最近删除';

  var notes = [];
  var trashCount = 0;
  for (var i = 0; i < allNotes.length; i++) {
    var n = allNotes[i];
    if (!n) continue;

    // Get folder
    var folderRN = '';
    var folderName = '';
    try {
      var f = n.get('_Folder');
      if (f) {
        folderRN = String(f.recordName || '');
        folderName = readField(f, ['Title', 'Name', 'name', 'displayName', 'localizedTitle']);
      }
    } catch(e) {}
    if (!folderName) folderName = folderMap[folderRN] || folderRN || 'Unknown';

    // Skip trash
    if (folderRN === 'TrashFolder-CloudKit') { trashCount++; continue; }

    notes.push({
      i: i,
      rn: String(n.recordName || ''),
      title: String(n.Title || '').substring(0, 80),
      folderRN: folderRN,
      folderName: folderName,
      locked: !!n.isLocked,
      pinned: !!n.isPinnedByUser
    });
  }
  return JSON.stringify({notes: notes, folders: folderMap, total: allNotes.length, trashCount: trashCount});
})()`;

/**
 * Load a single note's content and return it.
 * Must be called via evalAsync (awaitPromise: true).
 */
export function loadNoteContentJS(index) {
  return `(async function() {
    var store = window.__noteStore;
    var allNotes = store.__CW__allNotes;
    var n = allNotes[${index}];
    if (!n) return JSON.stringify({error: 'no note at index ${index}'});

    var title = '';
    try { title = String(n.Title || (n.get ? n.get('Title') : '')); } catch(e) {}

    var content = '';
    // Try TopoTextString directly
    try {
      var t = n.TopoTextString;
      if (t) { var s = String(t); if (s.length > 0) content = s; }
    } catch(e) {}

    // If empty, load from server
    if (!content) {
      try {
        await Promise.race([
          n.load(),
          new Promise(function(_,rej){setTimeout(function(){rej(new Error('load timeout'))},30000)})
        ]);
        var t2 = n.TopoTextString;
        if (t2) { var s2 = String(t2); if (s2.length > 0) content = s2; }
      } catch(e) {
        return JSON.stringify({error: e.message, title: title, locked: !!n.isLocked});
      }
    }

    // Fallback: loadSearchableText
    if (!content) {
      try {
        await Promise.race([
          n.loadSearchableText(),
          new Promise(function(_,rej){setTimeout(function(){rej(new Error('searchableText timeout'))},15000)})
        ]);
        var t3 = n.TopoTextString;
        if (t3) { var s3 = String(t3); if (s3.length > 0) content = s3; }
      } catch(e) {}
    }

    var created = null;
    try {
      var cd = n.CreationDate || (n.get ? n.get('CreationDate') : null);
      if (cd) created = new Date(Number(cd)).toISOString();
    } catch(e) {}

    if (!title) title = content.split('\\n')[0] || 'untitled';
    return JSON.stringify({
      title: (title||'').substring(0, 100),
      content: content,
      created: created,
      cl: content.length,
      locked: !!n.isLocked
    });
  })()`;
}
