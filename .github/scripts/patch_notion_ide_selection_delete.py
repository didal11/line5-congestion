from pathlib import Path

UI = Path('notion-ide/worker/src/ui.js')
ui = UI.read_text(encoding='utf-8')
old = 'appendTerminal("[DELETE] "+d.count+" item(s) · commit "+d.commit_sha.slice(0,8));pruneDeletedTabs(d.paths||paths);selectedPaths.clear();selectionAnchorPath="";await refreshExplorer();syncSelectionUi()'
new = 'appendTerminal("[DELETE] "+d.count+" item(s) · commit "+d.commit_sha.slice(0,8));const deleted=d.paths||paths;pruneDeletedTabs(deleted);const removedTarget=deleted.find(root=>selectedFolder===root||selectedFolder.startsWith(root+"/"));if(removedTarget)selectedFolder=parentPath(removedTarget);selectedPaths.clear();selectionAnchorPath="";await refreshExplorer();syncSelectionUi()'
if old not in ui:
    raise SystemExit('delete target marker mismatch')
ui = ui.replace(old, new, 1)
UI.write_text(ui, encoding='utf-8')
print('fixed upload target after delete')
