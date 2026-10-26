function parseStatsLine(系統) {
  if (!系統 || typeof 系統 !== "string") return null;
  const idx = 系統.indexOf("/");
  if (idx === -1) return { code: 系統, little: "" };
  return {
    code: 系統.slice(0, idx),
    little: 系統.slice(idx + 1),
  };
}

function lineFromMasterRecord(rec) {
  if (!rec) return null;
  const code = rec.SYSTEM_BIG || rec.code;
  const little = rec.SYSTEM_LITTELE || rec.little || "";
  if (!code) return null;
  return { code, little, display: little ? `${code} · ${little}` : code };
}

function buildHorseLineMap(masterData) {
  const map = {};
  for (const s of masterData.stallion || []) {
    const line = lineFromMasterRecord(s);
    if (line) map[s.NAME] = line;
  }
  for (const b of masterData.broodmare || []) {
    const line = lineFromMasterRecord(b);
    if (line) map[b.NAME] = line;
  }
  return map;
}

function enrichHorseLine(horse, lineMap) {
  let line = null;
  if (horse.系統) {
    line = parseStatsLine(horse.系統);
    if (line) {
      line.display = line.little ? `${line.code} · ${line.little}` : line.code;
    }
  }
  if (!line && lineMap[horse.名前]) {
    line = { ...lineMap[horse.名前] };
  }
  if (!line) {
    line = { code: "", little: "", display: "不明" };
  }
  return {
    ...horse,
    lineCode: line.code,
    lineLittle: line.little,
    lineDisplay: line.display,
  };
}

module.exports = {
  parseStatsLine,
  buildHorseLineMap,
  enrichHorseLine,
  lineFromMasterRecord,
};
