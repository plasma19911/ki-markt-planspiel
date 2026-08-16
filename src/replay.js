// Legacy-Kompatibilitaet fuer portfolio-v3.js.
// Der alte Replay-Endpunkt und die Replay-Oberflaeche sind entfernt.
export async function runReplay(){
  return {disabled:true,note:'Historischer Replay wurde durch die Vorwochen-Rueckschau ersetzt.'};
}
